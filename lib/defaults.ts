// lib/defaults.ts
import type { FeatureKey } from './types'

/**
 * Starting state for every flagged feature: off for members and the public,
 * so only admins see it until it is promoted in Settings → Features. Nothing
 * is flagged right now; see docs/FEATURE_FLAGS.md before adding an entry.
 */
export const DEFAULT_FEATURES: {
  feature: FeatureKey
  enabled: boolean
  config: object | null
  public_enabled: boolean
  public_config: object | null
}[] = []
