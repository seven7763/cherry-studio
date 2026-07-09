import { existsSync } from 'node:fs'

import { application } from '@application'
import type { RegistryPaths } from '@cherrystudio/provider-registry/node'

/**
 * Completion marker written LAST into the override dir once all catalog files are
 * in place (see `ProviderRegistryService.applyOverride`). Its presence is the
 * single signal that the override set is complete and safe to use.
 */
export const OVERRIDE_MANIFEST = 'manifest.json'

/** Whether a complete remote-updated override set is present (its manifest exists). */
function isOverrideActive(): boolean {
  return existsSync(application.getPath('feature.provider_registry.override', OVERRIDE_MANIFEST))
}

/**
 * Resolve the three registry files to their on-disk paths — **all-or-nothing**:
 * when a complete override set is present (its manifest exists) all three resolve
 * to the user-writable override copy; otherwise all three resolve to the bundled
 * data. Never mixes the two, so a half-written override (no manifest yet) or a
 * partially-updated set is ignored in favour of the consistent bundled data.
 */
export function resolveRegistryPaths(): RegistryPaths {
  const key = isOverrideActive() ? 'feature.provider_registry.override' : 'feature.provider_registry.data'
  return {
    models: application.getPath(key, 'models.json'),
    providers: application.getPath(key, 'providers.json'),
    providerModels: application.getPath(key, 'provider-models.json')
  }
}
