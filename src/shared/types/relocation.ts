export const RelocationIpcChannels = {
  GetProgress: 'relocation:get-progress',
  Progress: 'relocation:progress',
  Restart: 'relocation:restart'
} as const

export type RelocationStage = 'preparing' | 'copying' | 'committing' | 'failed'

export interface RelocationProgress {
  stage: RelocationStage
  from: string
  to: string
  copy: boolean
  bytesCopied: number
  bytesTotal: number
  error?: string
}
