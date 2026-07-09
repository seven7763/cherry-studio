import fs from 'node:fs'
import path from 'node:path'

import { loggerService } from '@logger'
import { isLinux, isPortable, isWin } from '@main/core/platform'
import { bootConfigService } from '@main/data/bootConfig'
import { app } from 'electron'

const logger = loggerService.withContext('Preboot')
const DEFAULT_DEV_USER_DATA_SUFFIX = 'Dev'

/**
 * Terminology — read this before editing
 * --------------------------------------
 *
 * "userData" in this file always refers to Electron's
 * `app.getPath('userData')` directory tree — the OS-level directory where
 * Chromium and Electron persist their state alongside whatever the
 * application chooses to put there.
 *
 * It does NOT mean "user data" in the colloquial Chinese sense (用户数据).
 * The Electron userData directory contains BOTH:
 *
 *   - User content    (cherrystudio.sqlite, Data/Files, Data/KnowledgeBase,
 *                      Data/Notes, Cookies, etc.)
 *   - Chromium runtime state  (Network/, Partitions/webview/Network/,
 *                              IndexedDB, Local Storage, Service Worker, ...)
 *   - Application logs   (logs/, written by winston)
 *
 * When this file says "copy the userData directory" or "the userData has
 * been relocated", it means **the entire OS directory** is being moved as
 * a single opaque tree — not a curated subset of "user content".
 *
 * v2's relocation gate copies the entire directory at startup, when the
 * previous process has fully exited and no file is locked.
 */

/**
 * Normalize app.getPath('exe') for use as a BootConfig `app.user_data_path`
 * key.
 *
 * Rationale: AppImage and Windows portable builds write a "stable"
 * executable path that survives relocation, so the lookup key is stable
 * across runs. Must match v1 init.ts:51-60 / 93-101 behavior so migrated
 * data resolves.
 *
 * Exported because the relocation request/commit flow must write into
 * BootConfig under the same key that startup reads.
 */
export function getNormalizedExecutablePath(): string {
  if (isLinux && process.env.APPIMAGE) {
    return path.join(path.dirname(process.env.APPIMAGE), 'cherry-studio.appimage')
  }
  if (isWin && isPortable) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR || '', 'cherry-studio-portable.exe')
  }
  return app.getPath('exe')
}

/**
 * Record a pending userData relocation request. The live Electron path is
 * not changed here; the next launch's preboot relocation gate owns the copy
 * or switch, commits the new path, and relaunches.
 */
export function requestRelocation(from: string, to: string, copy: boolean, overwrite: boolean): void {
  const canonicalFrom = canonicalizeUserDataPath(from)
  const canonicalTo = canonicalizeUserDataPath(to)

  bootConfigService.set('temp.user_data_relocation', {
    status: 'pending',
    from: canonicalFrom,
    to: canonicalTo,
    copy,
    overwrite
  })
  bootConfigService.flush()

  logger.info('userData relocation requested; relaunch required', {
    from: canonicalFrom,
    to: canonicalTo,
    copy,
    overwrite
  })
}

/**
 * Commit a successful relocation to BootConfig so future launches resolve
 * userData from the new directory.
 */
export function commitRelocation(targetPath: string): void {
  const canonicalTargetPath = canonicalizeUserDataPath(targetPath)
  const exe = getNormalizedExecutablePath()
  const current = bootConfigService.get('app.user_data_path') ?? {}

  bootConfigService.set('app.user_data_path', { ...current, [exe]: canonicalTargetPath })
  bootConfigService.set('temp.user_data_relocation', null)
  bootConfigService.flush()

  logger.info('userData relocation committed', { exe, targetPath: canonicalTargetPath })
}

export function canonicalizeUserDataPath(userDataPath: string): string {
  if (!path.isAbsolute(userDataPath)) {
    throw new Error(`userData path must be absolute: ${userDataPath}`)
  }
  return path.normalize(userDataPath)
}

/**
 * Resolve where the Electron userData directory should live and call
 * app.setPath('userData', ...).
 *
 * Timing constraint: MUST run before `application.bootstrap()` is called.
 * The constraint is documented in Application.ts:119-126 — bootstrap()
 * invokes buildPathRegistry() at its entry, which freezes the path
 * registry by reading app.getPath('userData'). All app.setPath() calls
 * must have completed before that point.
 *
 * Logic order:
 *
 *   1. Resolve the userData location from `app.user_data_path[exe]`.
 *      If valid, setPath. Otherwise fall through.
 *
 *   2. Portable fallback for Windows portable builds.
 *
 *   3. Fall through to Electron default.
 *
 * Normal-flow path: BootConfig is the single source of truth. The v1→v2
 * migration handles its own userData detection inside the migration
 * system — do NOT add fallbacks to v1 config.json here.
 *
 * Dev (unpackaged) runs take a separate, much simpler branch: append a
 * 'Dev' suffix to Electron's default userData so the dev process can't
 * pollute production data. BootConfig and pending relocations do not
 * apply in dev — they're packaged-only concerns.
 */
export function resolveUserDataLocation(): void {
  if (!app.isPackaged) {
    // Dev mode: isolate dev data from production by appending 'Dev'.
    // Capture into a local before setPath so we log the value we wrote
    // (matches the local-variable pattern used by the portable branch).
    const devPath = app.getPath('userData') + resolveDevUserDataSuffix()
    app.setPath('userData', devPath)
    logger.info('userData set with dev suffix', { devPath })
    return
  }

  // Step 1: BootConfig as single source of truth.
  const exe = getNormalizedExecutablePath()
  const resolved = bootConfigService.get('app.user_data_path')?.[exe]
  if (resolved && isValidDataDir(resolved)) {
    app.setPath('userData', resolved)
    logger.info('userData set from BootConfig', { exe, resolved })
    return
  }

  // Step 2: portable fallback.
  if (isPortable) {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR
    const portablePath = path.join(portableDir || app.getPath('exe'), 'data')
    app.setPath('userData', portablePath)
    logger.info('userData set for portable build', { portablePath })
    return
  }

  // Step 3: Electron default.
}

function resolveDevUserDataSuffix(): string {
  return process.env.CS_DEV_USER_DATA_SUFFIX?.trim() || DEFAULT_DEV_USER_DATA_SUFFIX
}

/**
 * Synchronous validation: directory exists and is writable.
 * Intentionally inline — we cannot use the async hasWritePermission from
 * src/main/utils/file.ts during the synchronous preboot chain.
 */
function isValidDataDir(p: string): boolean {
  try {
    if (!fs.existsSync(p)) return false
    fs.accessSync(p, fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}
