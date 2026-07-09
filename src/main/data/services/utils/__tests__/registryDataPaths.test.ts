import { beforeEach, describe, expect, it, vi } from 'vitest'

// Only the override manifest's existence decides override-vs-bundled (all-or-nothing).
const { existsSyncMock } = vi.hoisted(() => ({ existsSyncMock: vi.fn() }))
vi.mock('node:fs', () => ({ existsSync: existsSyncMock }))

// Unified application mock: getPath returns `/mock/${key}/${filename}`.
vi.mock('@application', async () => {
  const { mockApplicationFactory } = await import('@test-mocks/main/application')
  return mockApplicationFactory()
})

import { resolveRegistryPaths } from '../registryDataPaths'

const OVERRIDE = '/mock/feature.provider_registry.override'
const BUNDLED = '/mock/feature.provider_registry.data'
const MANIFEST = `${OVERRIDE}/manifest.json`

describe('registryDataPaths.resolveRegistryPaths', () => {
  beforeEach(() => existsSyncMock.mockReset())

  it('resolves all three files to the override when its manifest exists', () => {
    existsSyncMock.mockImplementation((p: string) => p === MANIFEST)
    expect(resolveRegistryPaths()).toEqual({
      models: `${OVERRIDE}/models.json`,
      providers: `${OVERRIDE}/providers.json`,
      providerModels: `${OVERRIDE}/provider-models.json`
    })
  })

  it('resolves all three files to bundled data when no override manifest exists', () => {
    existsSyncMock.mockReturnValue(false)
    expect(resolveRegistryPaths()).toEqual({
      models: `${BUNDLED}/models.json`,
      providers: `${BUNDLED}/providers.json`,
      providerModels: `${BUNDLED}/provider-models.json`
    })
  })

  it('ignores a half-written override (data present, manifest absent) — all-or-nothing', () => {
    // Override has a data file but NOT the manifest → the whole set falls back to bundled.
    existsSyncMock.mockImplementation((p: string) => p === `${OVERRIDE}/models.json`)
    expect(resolveRegistryPaths()).toEqual({
      models: `${BUNDLED}/models.json`,
      providers: `${BUNDLED}/providers.json`,
      providerModels: `${BUNDLED}/provider-models.json`
    })
  })
})
