import type { Player } from '@/lib/types'

/** A plain player with no results. Override any field. */
export function makePlayer(name: string, overrides?: Partial<Player>): Player {
  return {
    playerId: `known|${name}`,
    name,
    played: 0, won: 0, drew: 0, lost: 0,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: false, points: 0,
    mentality: 'balanced',
    strength: 'average',
    recentForm: '',
    ...overrides,
  }
}

/**
 * A 40-game veteran whose `wprScore` equals `rating` exactly. With
 * PRIOR_GAMES = 12 the shrunk points per game is (points + 18) / 52, so
 * points = rating * 52 * 3 / 85 - 18 cancels the results weight. Fractional
 * points are fine in tests.
 */
export function ratedPlayer(name: string, rating: number, overrides?: Partial<Player>): Player {
  return makePlayer(name, {
    played: 40,
    qualified: true,
    strength: null,
    points: (rating * 52 * 3) / 85 - 18,
    ...overrides,
  })
}
