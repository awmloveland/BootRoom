// lib/__tests__/utils.resolveTeamRatingForResult.test.ts
import { resolveTeamRatingForResult } from '@/lib/utils'
import type { Player } from '@/lib/types'

// A synthetic player whose recomputed ewptScore would NOT round to 42.000.
// We don't care about the exact number — we only assert which branch ran.
const RECOMPUTE_PLAYERS: Player[] = [
  {
    playerId: 'roster|alice',
    name: 'Alice',
    played: 10, won: 5, drew: 2, lost: 3,
    timesTeamA: 5, timesTeamB: 5,
    winRate: 50, qualified: true, points: 17,
    recentForm: 'WWDLL',
    mentality: 'balanced',
    rating: 2,
  },
]

describe('resolveTeamRatingForResult', () => {
  it('returns the snapshot when it is a number', () => {
    expect(resolveTeamRatingForResult(42.0, RECOMPUTE_PLAYERS)).toBe(42.0)
  })

  it('returns the snapshot even when it is 0', () => {
    expect(resolveTeamRatingForResult(0, RECOMPUTE_PLAYERS)).toBe(0)
  })

  it('falls back to recomputed ewptScore when snapshot is null', () => {
    const result = resolveTeamRatingForResult(null, RECOMPUTE_PLAYERS)
    expect(result).not.toBe(42.0)
    expect(typeof result).toBe('number')
    expect(Number.isFinite(result)).toBe(true)
    // Rounded to 3 decimal places (matches existing parseFloat(...toFixed(3)) behavior)
    expect(result).toBe(parseFloat(result.toFixed(3)))
  })

  it('falls back to recomputed ewptScore when snapshot is undefined', () => {
    const result = resolveTeamRatingForResult(undefined, RECOMPUTE_PLAYERS)
    expect(typeof result).toBe('number')
    expect(Number.isFinite(result)).toBe(true)
  })

  it('rounds the recomputed fallback to 3 decimal places', () => {
    const result = resolveTeamRatingForResult(null, RECOMPUTE_PLAYERS)
    // The string representation should have at most 3 fractional digits.
    const fractional = String(result).split('.')[1] ?? ''
    expect(fractional.length).toBeLessThanOrEqual(3)
  })
})
