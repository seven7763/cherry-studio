import { join } from 'node:path'

import { application } from '@application'
import { loggerService } from '@logger'
import { isMac } from '@main/core/platform'
import { RelocationIpcChannels, type RelocationProgress, type RelocationStage } from '@shared/types/relocation'
import { app, BrowserWindow } from 'electron'

const logger = loggerService.withContext('RelocationWindowManager')
const NON_CLOSABLE_STAGES: ReadonlySet<RelocationStage> = new Set(['preparing', 'copying', 'committing'])
const READY_TIMEOUT_MS = 30_000

function isClosable(stage: RelocationStage): boolean {
  return !NON_CLOSABLE_STAGES.has(stage)
}

export class RelocationWindowManager {
  private window: BrowserWindow | null = null
  private readyPromise: Promise<void> | null = null
  private stage: RelocationStage = 'preparing'
  private programmaticClose = false
  private criticalWindowUnavailable = false

  hasWindow(): boolean {
    return this.window !== null && !this.window.isDestroyed()
  }

  create(): BrowserWindow {
    if (this.hasWindow()) {
      this.window!.show()
      return this.window!
    }

    this.stage = 'preparing'
    this.programmaticClose = false
    this.criticalWindowUnavailable = false

    this.window = new BrowserWindow({
      width: 560,
      height: 360,
      resizable: false,
      maximizable: false,
      minimizable: true,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/simplest.js'),
        partition: 'relocation-window',
        sandbox: false,
        contextIsolation: true
      },
      ...(isMac ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 12, y: 14 } } : { frame: false })
    })

    this.window.on('close', (event) => {
      if (this.programmaticClose) return
      if (!isClosable(this.stage)) {
        event.preventDefault()
        return
      }
      void this.restartApp()
    })

    this.window.webContents.on('render-process-gone', (_event, details) => {
      this.handleRendererUnavailable('gone', details.reason)
    })
    this.window.webContents.on('unresponsive', () => {
      this.handleRendererUnavailable('unresponsive')
    })

    this.readyPromise = this.createReadyPromise(this.window)

    if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
      void this.window.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/windows/relocation/index.html`)
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/windows/relocation/index.html'))
    }

    this.window.once('ready-to-show', () => {
      this.window?.show()
    })
    this.window.on('closed', () => {
      this.window = null
    })

    logger.info('Relocation window created')
    return this.window
  }

  async waitForReady(): Promise<void> {
    await this.readyPromise
  }

  sendProgress(progress: RelocationProgress): void {
    this.stage = progress.stage
    if (this.hasWindow() && !this.criticalWindowUnavailable) {
      this.window!.webContents.send(RelocationIpcChannels.Progress, progress)
    }
  }

  shouldRestartAfterTerminalFailure(): boolean {
    return this.criticalWindowUnavailable
  }

  async restartApp(): Promise<void> {
    logger.info('Relaunching application after relocation')
    this.close()
    application.relaunch()
  }

  close(): void {
    if (!this.hasWindow()) return
    this.programmaticClose = true
    this.window!.close()
    this.window = null
  }

  private handleRendererUnavailable(kind: 'gone' | 'unresponsive', reason?: string): void {
    if (!isClosable(this.stage)) {
      this.criticalWindowUnavailable = true
      logger.error('Relocation renderer unavailable during critical stage; continuing headlessly', {
        kind,
        reason,
        stage: this.stage
      })
      return
    }

    logger.error('Relocation renderer unavailable; relaunching', { kind, reason, stage: this.stage })
    void this.restartApp()
  }

  private createReadyPromise(window: BrowserWindow): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const webContents = window.webContents
      const timeout = setTimeout(() => {
        fail(new Error(`Relocation window did not become ready within ${READY_TIMEOUT_MS}ms`))
      }, READY_TIMEOUT_MS)
      timeout.unref?.()

      const cleanup = () => {
        clearTimeout(timeout)
        webContents.removeListener('did-finish-load', finish)
        webContents.removeListener('did-fail-load', failLoad)
        webContents.removeListener('render-process-gone', gone)
        window.removeListener('closed', closed)
      }
      const done = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        this.criticalWindowUnavailable = true
        cleanup()
        reject(error)
      }
      const finish = () => done()
      const failLoad = (_event: unknown, code: number, description: string, url: string, isMainFrame?: boolean) => {
        if (isMainFrame === false) return
        logger.error('Relocation window failed to load', { code, description, url })
        fail(new Error(`Relocation window failed to load: ${description || code}`))
      }
      const gone = (_event: unknown, details: { reason?: string }) => {
        fail(new Error(`Relocation renderer exited before ready: ${details.reason ?? 'unknown'}`))
      }
      const closed = () => {
        fail(new Error('Relocation window closed before ready'))
      }

      webContents.once('did-finish-load', finish)
      webContents.once('did-fail-load', failLoad)
      webContents.once('render-process-gone', gone)
      window.once('closed', closed)
    })
  }
}

export const relocationWindowManager = new RelocationWindowManager()
