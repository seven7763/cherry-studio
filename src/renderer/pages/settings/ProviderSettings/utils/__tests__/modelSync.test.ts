import { ENDPOINT_TYPE, type Model, MODEL_CAPABILITY, type UniqueModelId } from '@shared/data/types/model'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchResolvedProviderModels, toCreateModelDto } from '../modelSync'

vi.mock('@data/DataApiService', () => ({
  dataApiService: {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn()
  }
}))

// listModels goes through ipcApi.request('ai.list_models', …) now (Main IPC).
const { listModelsMock } = vi.hoisted(() => ({ listModelsMock: vi.fn() }))
vi.mock('@renderer/ipc', () => ({
  ipcApi: { request: (_route: string, input: unknown) => listModelsMock(input) }
}))

beforeEach(() => {
  vi.clearAllMocks()
  listModelsMock.mockResolvedValue([])
})

describe('fetchResolvedProviderModels', () => {
  it('throws when upstream model listing fails instead of returning an empty list', async () => {
    listModelsMock.mockRejectedValueOnce(new Error('upstream failed'))

    await expect(fetchResolvedProviderModels('openai')).rejects.toThrow('upstream failed')

    expect(listModelsMock).toHaveBeenCalledWith({
      providerId: 'openai',
      throwOnError: true
    })
  })

  it('infers rerank capability for upstream rerank model ids when registry metadata is absent', async () => {
    listModelsMock.mockResolvedValueOnce([
      {
        id: 'voyageai::rerank-2' as UniqueModelId,
        providerId: 'voyageai',
        apiModelId: 'rerank-2',
        name: 'rerank-2',
        capabilities: [],
        supportsStreaming: true,
        isEnabled: true,
        isHidden: false
      }
    ])

    const [model] = await fetchResolvedProviderModels('voyageai')

    expect(model.capabilities).toEqual([MODEL_CAPABILITY.RERANK])
  })
})

describe('toCreateModelDto', () => {
  it('persists only the rerank capability in the create DTO', () => {
    const dto = toCreateModelDto('ppio', {
      id: 'ppio::bge-reranker-v2-m3' as UniqueModelId,
      providerId: 'ppio',
      apiModelId: 'bge-reranker-v2-m3',
      name: 'BGE Reranker',
      group: 'rerankers',
      capabilities: [MODEL_CAPABILITY.RERANK, MODEL_CAPABILITY.FUNCTION_CALL, MODEL_CAPABILITY.IMAGE_GENERATION],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
      supportsStreaming: true,
      isEnabled: true,
      isHidden: false
    } as Model)

    expect(dto).toMatchObject({
      providerId: 'ppio',
      modelId: 'bge-reranker-v2-m3',
      name: 'BGE Reranker',
      group: 'rerankers',
      capabilities: [MODEL_CAPABILITY.RERANK],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]
    })
  })

  it('infers rerank capability in the create DTO when the upstream list omits capabilities', () => {
    const dto = toCreateModelDto('voyageai', {
      id: 'voyageai::rerank-2' as UniqueModelId,
      providerId: 'voyageai',
      apiModelId: 'rerank-2',
      name: 'rerank-2',
      group: 'Voyage AI',
      capabilities: [],
      endpointTypes: [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS],
      supportsStreaming: true,
      isEnabled: true,
      isHidden: false
    } as Model)

    expect(dto).toMatchObject({
      providerId: 'voyageai',
      modelId: 'rerank-2',
      capabilities: [MODEL_CAPABILITY.RERANK]
    })
  })
})
