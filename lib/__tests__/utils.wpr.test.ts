import { wprScore } from '@/lib/utils'
import type { Player } from '@/lib/types'

function makePlayer(overrides?: Partial<Player>): Player {
  return {
    name: 'Test',
    played: 10, won: 5, drew: 2, lost: 3,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0.5, qualified: true, points: 17,
    goalkeeper: false, mentality: 'balanced', rating: 2,
    recentForm: 'WWDLL',
    ...overrides,
  }
}

describe('wprScore — wprOverride short-circuit', () => {
  it('returns wprOverride directly when set, ignoring all other stats', () => {
    const player = makePlayer({ wprOverride: 42 })
    expect(wprScore(player)).toBe(42)
  })

  it('returns wprOverride of 0 correctly (does not fall through)', () => {
    const player = makePlayer({ wprOverride: 0 })
    expect(wprScore(player)).toBe(0)
  })

  it('computes normally when wprOverride is undefined', () => {
    const player = makePlayer() // no wprOverride
    const score = wprScore(player)
    expect(score).toBeGreaterThan(0)
    expect(score).not.toBe(42)
  })
})
