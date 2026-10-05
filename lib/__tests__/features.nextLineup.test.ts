import { canSeeNextLineup } from '../features'
import type { FeatureKey, LeagueFeature } from '../types'

function feature(key: FeatureKey, enabled: boolean, publicEnabled: boolean): LeagueFeature {
  return { feature: key, available: true, enabled, config: null, public_enabled: publicEnabled, public_config: null }
}

const ALL_OFF = [
  feature('match_history', false, false),
  feature('match_entry', false, false),
  feature('player_stats', false, false),
]

describe('canSeeNextLineup', () => {
  it('always lets admins see it', () => {
    expect(canSeeNextLineup(ALL_OFF, 'admin')).toBe(true)
  })

  it('lets members see it with match entry or match history on', () => {
    expect(canSeeNextLineup([feature('match_entry', true, false)], 'member')).toBe(true)
    expect(canSeeNextLineup([feature('match_history', true, false)], 'member')).toBe(true)
  })

  it('hides it from members when both are off', () => {
    expect(canSeeNextLineup(ALL_OFF, 'member')).toBe(false)
  })

  it('shows it to the public whenever the league is not hidden', () => {
    expect(canSeeNextLineup([feature('player_stats', true, true)], 'public')).toBe(true)
  })

  it('hides it from the public when the league is hidden', () => {
    expect(canSeeNextLineup(ALL_OFF, 'public')).toBe(false)
  })
})
