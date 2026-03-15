import type { GameRole } from './types'

// The three visibility tiers used to gate feature access.
// This is distinct from GameRole — it maps a user's league membership
// (or lack thereof) to what they're allowed to see.
export type VisibilityTier = 'admin' | 'member' | 'public'

/**
 * Convert a per-league GameRole (or null for unauthenticated / non-members)
 * into a VisibilityTier for use with isFeatureEnabled().
 */
export function resolveVisibilityTier(role: GameRole | null): VisibilityTier {
  if (role === 'creator' || role === 'admin') return 'admin'
  if (role === 'member') return 'member'
  return 'public'
}
