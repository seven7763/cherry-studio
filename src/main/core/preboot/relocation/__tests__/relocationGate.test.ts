import { beforeEach, describe, expect, it, vi } from 'vitest'

const whenReady = vi.fn().mockResolvedValue(undefined)
const ipcHandle = vi.fn()
const showMessageBoxSync = vi.fn()

const windowManager = {
  create: vi.fn(),
  waitForReady: vi.fn().mockResolvedValue(undefined),
  sendProgress: vi.fn(),
  restartApp: vi.fn().mockResolvedValue(undefined),
  shouldRestartAfterTerminalFailure: vi.fn(() => false),
  hasWindow: vi.fn(() => true)
}

const bootConfigGet = vi.fn()
const bootConfigSet = vi.fn()
const bootConfigFlush = vi.fn()
const commitRelocation = vi.fn()
const applicationGetPath = vi.fn(() => '/Applications/Cherry Studio.app')

type RelocationState =
  | { status: 'pending'; from: string; to: string; copy: boolean; overwrite: boolean }
  | { status: 'failed'; from: string; to: string; error: string; failedAt: string }
  | null

function stubElectron(isPackaged = true) {
  vi.doMock('electron', () => ({
    app: { isPackaged, whenReady },
    ipcMain: { handle: ipcHandle },
    dialog: { showMessageBoxSync }
  }))
}

function stubBootConfig(relocation: RelocationState) {
  const store: Record<string, unknown> = { 'temp.user_data_relocation': relocation }
  bootConfigGet.mockImplementation((key: string) => store[key])
  bootConfigSet.mockImplementation((key: string, value: unknown) => {
    store[key] = value
  })
  vi.doMock('@main/data/bootConfig', () => ({
    bootConfigService: {
      get: bootConfigGet,
      set: bootConfigSet,
      flush: bootConfigFlush
    }
  }))
  return store
}

function stubFs(options: { targetEntries?: string[]; copyFails?: boolean } = {}) {
  const targetEntries = options.targetEntries ?? []
  const dirs = new Set(['/old/data', '/old/data/nested', '/new', '/new/data', '/Applications/Cherry Studio.app'])
  const files = new Map<string, number>([
    ['/old/data/a.txt', 2],
    ['/old/data/nested/b.txt', 3]
  ])

  vi.doMock('node:fs', () => {
    const realpathSync = vi.fn((p: string) => p)
    ;(realpathSync as typeof realpathSync & { native?: typeof realpathSync }).native = realpathSync
    const statSync = vi.fn((p: string) => ({
      isDirectory: () => dirs.has(p),
      isFile: () => files.has(p)
    }))
    const mock = {
      existsSync: vi.fn((p: string) => dirs.has(p) || files.has(p)),
      accessSync: vi.fn(),
      statSync,
      readdirSync: vi.fn((p: string) => (p === '/new/data' ? targetEntries : [])),
      realpathSync,
      constants: { W_OK: 2, R_OK: 4 }
    }
    return { ...mock, default: mock }
  })

  vi.doMock('node:fs/promises', () => ({
    default: {
      lstat: vi.fn(async (p: string) => ({
        size: files.get(p) ?? 0,
        isFile: () => files.has(p),
        isDirectory: () => dirs.has(p),
        isSymbolicLink: () => false
      })),
      readdir: vi.fn(async (p: string) => {
        if (p === '/old/data') return [{ name: 'a.txt' }, { name: 'nested' }]
        if (p === '/old/data/nested') return [{ name: 'b.txt' }]
        return []
      }),
      mkdir: vi.fn(async () => undefined),
      copyFile: vi.fn(async () => {
        if (options.copyFails) throw new Error('ENOSPC')
      }),
      rm: vi.fn(async () => undefined),
      readlink: vi.fn(async () => ''),
      symlink: vi.fn(async () => undefined)
    }
  }))
}

function stubDeps() {
  vi.doMock('@application', () => ({ application: { getPath: applicationGetPath } }))
  vi.doMock('@main/core/platform', () => ({ isWin: false }))
  vi.doMock('@main/core/preboot/relocation/RelocationWindowManager', () => ({
    relocationWindowManager: windowManager
  }))
  vi.doMock('@main/core/preboot/userDataLocation', () => ({ commitRelocation }))
}

async function loadGate() {
  return import('../relocationGate')
}

beforeEach(() => {
  vi.resetModules()
  whenReady.mockReset().mockResolvedValue(undefined)
  ipcHandle.mockReset()
  showMessageBoxSync.mockReset()
  windowManager.create.mockReset()
  windowManager.waitForReady.mockReset().mockResolvedValue(undefined)
  windowManager.sendProgress.mockReset()
  windowManager.restartApp.mockReset().mockResolvedValue(undefined)
  windowManager.shouldRestartAfterTerminalFailure.mockReset().mockReturnValue(false)
  windowManager.hasWindow.mockReset().mockReturnValue(true)
  bootConfigGet.mockReset()
  bootConfigSet.mockReset()
  bootConfigFlush.mockReset()
  commitRelocation.mockReset()
  applicationGetPath.mockReset().mockReturnValue('/Applications/Cherry Studio.app')
})

describe('runUserDataRelocationGate', () => {
  it('skips in dev mode even when a pending request exists', async () => {
    stubElectron(false)
    stubBootConfig({ status: 'pending', from: '/old/data', to: '/new/data', copy: true, overwrite: false })
    stubFs()
    stubDeps()

    const { runUserDataRelocationGate } = await loadGate()

    await expect(runUserDataRelocationGate()).resolves.toBe('skipped')
    expect(windowManager.create).not.toHaveBeenCalled()
  })

  it('clears a previous failed state after showing a blocking dialog', async () => {
    stubElectron(true)
    const store = stubBootConfig({
      status: 'failed',
      from: '/old/data',
      to: '/new/data',
      error: 'boom',
      failedAt: '2026-07-09T00:00:00.000Z'
    })
    stubFs()
    stubDeps()

    const { runUserDataRelocationGate } = await loadGate()

    await expect(runUserDataRelocationGate()).resolves.toBe('skipped')
    expect(showMessageBoxSync).toHaveBeenCalled()
    expect(store['temp.user_data_relocation']).toBeNull()
    expect(bootConfigFlush).toHaveBeenCalled()
  })

  it('commits and restarts for switch-only relocation', async () => {
    stubElectron(true)
    stubBootConfig({ status: 'pending', from: '/old/data', to: '/new/data', copy: false, overwrite: false })
    stubFs()
    stubDeps()

    const { runUserDataRelocationGate } = await loadGate()

    await expect(runUserDataRelocationGate()).resolves.toBe('handled')
    expect(commitRelocation).toHaveBeenCalledWith('/new/data')
    expect(windowManager.restartApp).toHaveBeenCalled()
  })

  it('copies, commits, and restarts for copy relocation', async () => {
    stubElectron(true)
    stubBootConfig({ status: 'pending', from: '/old/data', to: '/new/data', copy: true, overwrite: false })
    stubFs()
    stubDeps()

    const { runUserDataRelocationGate } = await loadGate()

    await expect(runUserDataRelocationGate()).resolves.toBe('handled')
    expect(windowManager.sendProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'copying' }))
    expect(commitRelocation).toHaveBeenCalledWith('/new/data')
    expect(windowManager.restartApp).toHaveBeenCalled()
  })

  it('fails before copying when target is non-empty without overwrite confirmation', async () => {
    stubElectron(true)
    const store = stubBootConfig({
      status: 'pending',
      from: '/old/data',
      to: '/new/data',
      copy: true,
      overwrite: false
    })
    stubFs({ targetEntries: ['stale.txt'] })
    stubDeps()

    const { runUserDataRelocationGate } = await loadGate()

    await expect(runUserDataRelocationGate()).resolves.toBe('handled')
    expect(commitRelocation).not.toHaveBeenCalled()
    expect(store['temp.user_data_relocation']).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('not empty')
    })
    expect(windowManager.sendProgress).toHaveBeenCalledWith(expect.objectContaining({ stage: 'failed' }))
  })
})
