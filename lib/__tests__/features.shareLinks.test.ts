import { canSeeQuarterChampion, canSeeResults } from '../features'
import type { FeatureKey, LeagueFeature } from '../types'

function f(feature: FeatureKey, enabled: boolean, publicEnabled: boolean): LeagueFeature {
  return { feature, enabled, public_enabled: publicEnabled, config: null, public_config: null } as LeagueFeature
}

describe('canSeeResults', () => {
  it('follows match history, admins always', () => {
    const features = [f('match_history', true, false)]
    expect(canSeeResults(features, 'admin')).toBe(true)
    expect(canSeeResults(features, 'member')).toBe(true)
    expect(canSeeResults(features, 'public')).toBe(false)
    expect(canSeeResults([], 'member')).toBe(false)
  })
})

describe('canSeeQuarterChampion', () => {
  it('lets members in via Seasons and the public via Results champion cards', () => {
    expect(canSeeQuarterChampion([], 'member')).toBe(true)
    expect(canSeeQuarterChampion([], 'public')).toBe(false)
    expect(canSeeQuarterChampion([f('match_history', true, true)], 'public')).toBe(false)
    expect(canSeeQuarterChampion([f('match_history', true, true), f('quarter_celebration', true, true)], 'public')).toBe(true)
  })
})
