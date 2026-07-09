import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

import { application } from '@application'
import { loggerService } from '@logger'
import { isWin } from '@main/core/platform'
import { relocationWindowManager } from '@main/core/preboot/relocation/RelocationWindowManager'
import { commitRelocation } from '@main/core/preboot/userDataLocation'
import { bootConfigService } from '@main/data/bootConfig'
import type { BootConfigSchema } from '@shared/data/bootConfig/bootConfigSchemas'
import { RelocationIpcChannels, type RelocationProgress } from '@shared/types/relocation'
import { app, dialog, ipcMain } from 'electron'

const logger = loggerService.withContext('RelocationGate')

type PendingRelocation = Extract<NonNullable<BootConfigSchema['temp.user_data_relocation']>, { status: 'pending' }>
type FailedRelocation = Extract<NonNullable<BootConfigSchema['temp.user_data_relocation']>, { status: 'failed' }>

export type RelocationGateResult = 'handled' | 'skipped'

let currentProgress: RelocationProgress | null = null
let handlersRegistered = false

export async function runUserDataRelocationGate(): Promise<RelocationGateResult> {
  if (!app.isPackaged) return 'skipped'

  const relocation = bootConfigService.get('temp.user_data_relocation')
  if (!relocation) return 'skipped'
  if (relocation.status === 'failed') {
    await app.whenReady()
    showFailedRelocationDialog(relocation)
    bootConfigService.set('temp.user_data_relocation', null)
    bootConfigService.flush()
    return 'skipped'
  }

  await app.whenReady()
  registerRelocationIpcHandlers()

  try {
    relocationWindowManager.create()
    await relocationWindowManager.waitForReady()

    publish(makeProgress('preparing', relocation, 0, 0))
    await executeRelocation(relocation)

    publish(makeProgress('committing', relocation, 0, 0))
    commitRelocation(relocation.to)
    logger.info('userData relocation completed; restarting', {
      from: relocation.from,
      to: relocation.to,
      copy: relocation.copy
    })
    await relocationWindowManager.restartApp()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error('userData relocation failed; staying on previous location', {
      from: relocation.from,
      to: relocation.to,
      error: message
    })
    bootConfigService.set('temp.user_data_relocation', {
      status: 'failed',
      from: relocation.from,
      to: relocation.to,
      error: message,
      failedAt: new Date().toISOString()
    })
    bootConfigService.flush()
    publish(makeProgress('failed', relocation, 0, 0, message))

    if (relocationWindowManager.shouldRestartAfterTerminalFailure() || !relocationWindowManager.hasWindow()) {
      await relocationWindowManager.restartApp()
    }
  }

  return 'handled'
}

async function executeRelocation(pending: PendingRelocation): Promise<void> {
  preflight(pending)

  if (!pending.copy) return

  const total = await calculateTotalBytes(pending.from)
  publish(makeProgress('copying', pending, 0, total))

  if (fs.existsSync(pending.to)) {
    await fsp.rm(pending.to, { recursive: true, force: true })
  }

  let copied = 0
  let lastPercent = -1
  await copyTree(pending.from, pending.to, (bytes) => {
    copied += bytes
    const percent = total > 0 ? Math.floor((copied / total) * 100) : 100
    if (percent === lastPercent) return
    lastPercent = percent
    publish(makeProgress('copying', pending, copied, total))
  })
}

function registerRelocationIpcHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true
  ipcMain.handle(RelocationIpcChannels.GetProgress, () => currentProgress)
  ipcMain.handle(RelocationIpcChannels.Restart, () => {
    void relocationWindowManager.restartApp()
    return true
  })
}

function publish(progress: RelocationProgress): void {
  currentProgress = progress
  relocationWindowManager.sendProgress(progress)
}

function makeProgress(
  stage: RelocationProgress['stage'],
  pending: PendingRelocation,
  bytesCopied: number,
  bytesTotal: number,
  error?: string
): RelocationProgress {
  return {
    stage,
    from: pending.from,
    to: pending.to,
    copy: pending.copy,
    bytesCopied,
    bytesTotal,
    ...(error ? { error } : {})
  }
}

function preflight(pending: PendingRelocation): void {
  const from = normalizeForCompare(pending.from)
  const to = normalizeForCompare(pending.to)

  if (!path.isAbsolute(pending.from)) throw new Error(`source must be an absolute path: ${pending.from}`)
  if (!path.isAbsolute(pending.to)) throw new Error(`target must be an absolute path: ${pending.to}`)
  if (from === to) throw new Error(`source and target are the same path: ${pending.to}`)
  if (isRootOrTopLevel(to)) throw new Error(`target must not be a root or top-level path: ${pending.to}`)
  if (isPathInside(to, from)) throw new Error(`target is inside source: ${pending.to}`)
  if (isPathInside(from, to)) throw new Error(`target contains source: ${pending.to}`)

  const targetParent = path.dirname(pending.to)
  if (!fs.existsSync(targetParent)) throw new Error(`target parent directory does not exist: ${targetParent}`)
  fs.accessSync(targetParent, fs.constants.W_OK)

  const installPath = normalizeForCompare(application.getPath('app.install'))
  if (to === installPath || isPathInside(to, installPath)) {
    throw new Error(`target must not be inside the app install path: ${pending.to}`)
  }

  if (pending.copy) {
    assertDirectory(pending.from, 'source')
    fs.accessSync(pending.from, fs.constants.R_OK)
  }

  if (!fs.existsSync(pending.to)) {
    if (!pending.copy) throw new Error(`target directory does not exist: ${pending.to}`)
    return
  }

  assertDirectory(pending.to, 'target')
  fs.accessSync(pending.to, fs.constants.W_OK)

  if (!pending.copy) return

  const entries = fs.readdirSync(pending.to)
  if (entries.length > 0 && !pending.overwrite) {
    throw new Error(`target directory is not empty: ${pending.to}`)
  }

  const fromReal = normalizeForCompare(fs.realpathSync.native?.(pending.from) ?? fs.realpathSync(pending.from))
  const toReal = normalizeForCompare(fs.realpathSync.native?.(pending.to) ?? fs.realpathSync(pending.to))
  if (fromReal === toReal) throw new Error(`source and target resolve to the same path: ${pending.to}`)
  if (isPathInside(toReal, fromReal)) throw new Error(`target real path is inside source: ${pending.to}`)
  if (isPathInside(fromReal, toReal)) throw new Error(`target real path contains source: ${pending.to}`)
}

function assertDirectory(value: string, label: string): void {
  if (!fs.existsSync(value)) throw new Error(`${label} directory does not exist: ${value}`)
  if (!fs.statSync(value).isDirectory()) throw new Error(`${label} is not a directory: ${value}`)
}

function normalizeForCompare(value: string): string {
  const resolved = path.resolve(value)
  return isWin ? resolved.toLowerCase() : resolved
}

function isPathInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child)
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
}

function isRootOrTopLevel(value: string): boolean {
  const parsed = path.parse(value)
  if (value === parsed.root) return true
  const relative = path.relative(parsed.root, value)
  return relative.split(path.sep).filter(Boolean).length <= 1
}

async function calculateTotalBytes(root: string): Promise<number> {
  const stat = await fsp.lstat(root)
  if (stat.isFile()) return stat.size
  if (stat.isSymbolicLink()) return 0
  if (!stat.isDirectory()) return 0

  const entries = await fsp.readdir(root, { withFileTypes: true })
  const sizes = await Promise.all(entries.map((entry) => calculateTotalBytes(path.join(root, entry.name))))
  return sizes.reduce((sum, size) => sum + size, 0)
}

async function copyTree(source: string, target: string, onCopied: (bytes: number) => void): Promise<void> {
  const stat = await fsp.lstat(source)

  if (stat.isDirectory()) {
    await fsp.mkdir(target, { recursive: true })
    const entries = await fsp.readdir(source, { withFileTypes: true })
    for (const entry of entries) {
      await copyTree(path.join(source, entry.name), path.join(target, entry.name), onCopied)
    }
    return
  }

  if (stat.isSymbolicLink()) {
    const linkTarget = await fsp.readlink(source)
    await fsp.symlink(linkTarget, target)
    return
  }

  if (stat.isFile()) {
    await fsp.copyFile(source, target)
    onCopied(stat.size)
    return
  }

  logger.warn('Skipping unsupported file system entry during userData relocation', { source })
}

function showFailedRelocationDialog(relocation: FailedRelocation): void {
  dialog.showMessageBoxSync({
    type: 'error',
    buttons: ['OK'],
    title: 'Data directory relocation failed',
    message: 'Cherry Studio could not relocate the data directory.',
    detail:
      `The app will continue using the previous data directory.\n\n` +
      `From: ${relocation.from}\nTo: ${relocation.to}\n\nError: ${relocation.error}`
  })
}
