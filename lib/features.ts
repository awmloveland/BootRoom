import type { LeagueFeature, FeatureKey } from './types'
import type { VisibilityTier } from './roles'

/**
 * Check whether a feature is accessible for a given visibility tier.
 *
 * - Admins always have full access regardless of enabled state.
 * - Members see a feature when `enabled` is true.
 * - Public visitors see a feature when `public_enabled` is true.
 *
 * Falls back to false if the feature is not found in the list.
 */
export function isFeatureEnabled(
  features: LeagueFeature[],
  key: FeatureKey,
  tier: VisibilityTier
): boolean {
  const feature = features.find((f) => f.feature === key)
  if (!feature) return false
  if (tier === 'admin') return true
  if (tier === 'member') return feature.enabled
  if (tier === 'public') return feature.public_enabled
  return false
}

/**
 * True when a visitor at this tier can see none of the league's tab content,
 * so the league renders as private (no header, no stats sidebar).
 */
export function isLeagueHidden(features: LeagueFeature[], tier: VisibilityTier): boolean {
  if (tier !== 'public') return false
  return (
    !isFeatureEnabled(features, 'match_history', tier) &&
    !isFeatureEnabled(features, 'match_entry', tier) &&
    !isFeatureEnabled(features, 'player_stats', tier)
  )
}

/**
 * Whether a viewer at this tier can see the next match lineup card on the
 * Results tab. Mirrors the page: the public see the read-only lineup unless
 * the league is hidden; members need match entry or match history.
 */
export function canSeeNextLineup(features: LeagueFeature[], tier: VisibilityTier): boolean {
  if (tier === 'admin') return true
  if (tier === 'public') return !isLeagueHidden(features, tier)
  return (
    isFeatureEnabled(features, 'match_entry', tier) ||
    isFeatureEnabled(features, 'match_history', tier)
  )
}
