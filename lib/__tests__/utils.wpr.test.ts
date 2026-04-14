import { wprScore, leagueMedianWpr } from '@/lib/utils'
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

describe('leagueMedianWpr', () => {
  function makeQualifiedPlayer(wprTarget: number): Player {
    // A player with played=10, points adjusted to produce approximately the desired WPR
    // We use wprOverride to precisely control the WPR for test predictability
    return {
      name: 'Player',
      played: 10, won: 5, drew: 2, lost: 3,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0.5, qualified: true, points: 17,
      goalkeeper: false, mentality: 'balanced', rating: 2,
      recentForm: 'WWDLL',
      wprOverride: wprTarget,
    }
  }

  function makeUnqualifiedPlayer(): Player {
    return {
      name: 'Newbie',
      played: 2, won: 1, drew: 0, lost: 1,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0.5, qualified: false, points: 3,
      goalkeeper: false, mentality: 'balanced', rating: 2,
      recentForm: 'WL',
    }
  }

  it('returns 50 when fewer than 3 players have played >= 5 games', () => {
    const players = [
      makeQualifiedPlayer(60),
      makeQualifiedPlayer(70),
      makeUnqualifiedPlayer(),
      makeUnqualifiedPlayer(),
    ]
    expect(leagueMedianWpr(players)).toBe(50)
  })

  it('returns the median of qualified player WPR scores (odd count)', () => {
    const players = [
      makeQualifiedPlayer(40),
      makeQualifiedPlayer(60),
      makeQualifiedPlayer(80),
    ]
    // Median of [40, 60, 80] = 60
    expect(leagueMedianWpr(players)).toBe(60)
  })

  it('returns the mean of the two middle values for even count', () => {
    const players = [
      makeQualifiedPlayer(40),
      makeQualifiedPlayer(60),
      makeQualifiedPlayer(70),
      makeQualifiedPlayer(80),
    ]
    // Sorted: [40, 60, 70, 80], median = (60 + 70) / 2 = 65
    expect(leagueMedianWpr(players)).toBe(65)
  })

  it('excludes players with fewer than 5 games from the median calculation', () => {
    const players = [
      makeQualifiedPlayer(60),
      makeQualifiedPlayer(70),
      makeQualifiedPlayer(80),
      makeUnqualifiedPlayer(), // played: 2 — should be excluded
    ]
    // Only 3 qualified: [60, 70, 80], median = 70
    expect(leagueMedianWpr(players)).toBe(70)
  })

  it('returns 50 when the player list is empty', () => {
    expect(leagueMedianWpr([])).toBe(50)
  })
})
