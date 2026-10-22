import {
  wprScore,
  ewptScore,
  gamesMissedByPlayer,
  enrichPlayersForRating,
} from '@/lib/utils'
import type { Player, Strength, Week } from '@/lib/types'
import { makePlayer, ratedPlayer } from './helpers/players'

function withRecord(played: number, points: number, strength: Strength | null = 'average', overrides?: Partial<Player>): Player {
  return makePlayer('Test', { played, points, strength, gamesMissed: 0, ...overrides })
}

describe('wprScore v2 — acceptance values', () => {
  it.each([
    ['below', 29.75],
    ['average', 36.125],
    ['above', 42.5],
    [null, 36.125],
  ] as const)('0 games, %s strength → %d', (strength, expected) => {
    expect(wprScore(withRecord(0, 0, strength))).toBeCloseTo(expected, 3)
  })

  it.each([
    ['win', 3, 38.904],
    ['draw', 1, 35.199],
    ['loss', 0, 33.346],
  ])('average strength, 1 game, %s', (_label, points, expected) => {
    expect(wprScore(withRecord(1, points))).toBeCloseTo(expected, 3)
  })

  it.each([
    [2, 43.714, 32.786],
    [3, 48.45, 32.3],
    [4, 53.125, 31.875],
  ])('average strength, %d games: all wins / all losses', (played, allWins, allLosses) => {
    expect(wprScore(withRecord(played, played * 3))).toBeCloseTo(allWins, 3)
    expect(wprScore(withRecord(played, 0))).toBeCloseTo(allLosses, 3)
  })

  it.each([
    ['below', 38.75],
    ['average', 42.5],
    ['above', 46.25],
  ] as const)('5 games, 7.5 points, %s strength', (strength, expected) => {
    expect(wprScore(withRecord(5, 7.5, strength))).toBeCloseTo(expected, 3)
  })

  it.each(['below', 'average', 'above'] as const)('10 games, 15 points, %s strength → label fully faded', (strength) => {
    expect(wprScore(withRecord(10, 15, strength))).toBeCloseTo(42.5, 3)
  })

  it('25 games, 36 points, above', () => {
    expect(wprScore(withRecord(25, 36, 'above'))).toBeCloseTo(41.351, 3)
  })

  it('25 games, 45 points, below', () => {
    expect(wprScore(withRecord(25, 45, 'below'))).toBeCloseTo(48.243, 3)
  })

  it('30 games: one loss flipped to a win moves the score by about 2 points', () => {
    expect(wprScore(withRecord(30, 45))).toBeCloseTo(42.5, 3)
    expect(wprScore(withRecord(30, 48))).toBeCloseTo(44.524, 3)
  })

  it('ignores recentForm', () => {
    const hot = withRecord(20, 30, 'average', { recentForm: 'WWWWW' })
    const cold = withRecord(20, 30, 'average', { recentForm: 'LLLLL' })
    const empty = withRecord(20, 30, 'average', { recentForm: '' })
    expect(wprScore(hot)).toBe(wprScore(cold))
    expect(wprScore(hot)).toBe(wprScore(empty))
  })
})

describe('wprScore v2 — rust by missed games', () => {
  it.each([
    [0, 42.5],
    [1, 42.5],
    [2, 42.5],
    [3, 40.8],
    [4, 39.1],
    [5, 37.4],
    [6, 37.4],
  ])('20 games, 30 points, %d missed → %d', (gamesMissed, expected) => {
    expect(wprScore(withRecord(20, 30, 'average', { gamesMissed }))).toBeCloseTo(expected, 3)
  })

  it('treats a missing gamesMissed as 0', () => {
    const player = withRecord(20, 30)
    delete player.gamesMissed
    expect(wprScore(player)).toBeCloseTo(42.5, 3)
  })

  it('gives the same value whatever the system clock reads', () => {
    const player = withRecord(20, 30, 'average', { gamesMissed: 4 })
    jest.useFakeTimers()
    try {
      jest.setSystemTime(new Date(2026, 3, 15))
      const before = wprScore(player)
      jest.setSystemTime(new Date(2027, 3, 15))
      expect(wprScore(player)).toBe(before)
    } finally {
      jest.useRealTimers()
    }
  })
})

describe('wprScore v2 — zero-game players share one scale', () => {
  const zeroGame = (playerId: string, strength: Strength | null, mentality: Player['mentality'] = 'balanced'): Player =>
    makePlayer('Sam', { playerId, strength, mentality })

  it.each(['below', 'average', 'above'] as const)('a guest, a new player and a zero-game roster player with %s strength score the same', (strength) => {
    const guest = wprScore(zeroGame('guest|Sam +1', strength))
    const newPlayer = wprScore(zeroGame('new|Sam', strength))
    const roster = wprScore(zeroGame('roster|Sam', strength))
    expect(newPlayer).toBe(guest)
    expect(roster).toBe(guest)
  })

  it('orders above > average > below for zero-game players', () => {
    const above = wprScore(zeroGame('new|A', 'above'))
    const average = wprScore(zeroGame('new|B', 'average'))
    const below = wprScore(zeroGame('new|C', 'below'))
    expect(above).toBeGreaterThan(average)
    expect(average).toBeGreaterThan(below)
  })
})

describe('gamesMissedByPlayer', () => {
  function week(date: string, status: Week['status'], teamA: string[] = [], teamB: string[] = []): Week {
    return { season: '2026', week: 1, date, status, teamA, teamB, winner: status === 'played' ? 'teamA' : null }
  }

  it('counts played and dnf weeks after the last appearance, ignoring cancelled ones', () => {
    const weeks = [
      week('05 Jan 2026', 'played', ['Alice', 'Bob'], ['Carol']),
      week('12 Jan 2026', 'played', ['Bob'], ['Carol']),
      week('19 Jan 2026', 'cancelled'),
      week('26 Jan 2026', 'played', ['Bob'], ['Carol']),
    ]
    expect(gamesMissedByPlayer(weeks).get('Alice')).toBe(2)
  })

  it('counts a dnf week as an appearance', () => {
    const weeks = [
      week('05 Jan 2026', 'played', ['Alice'], ['Bob']),
      week('12 Jan 2026', 'dnf', ['Bob'], ['Alice']),
    ]
    expect(gamesMissedByPlayer(weeks).get('Alice')).toBe(0)
  })

  it('ignores scheduled and unrecorded weeks', () => {
    const weeks = [
      week('05 Jan 2026', 'played', ['Alice'], ['Bob']),
      week('12 Jan 2026', 'unrecorded'),
      week('19 Jan 2026', 'scheduled', ['Bob'], ['Carol']),
    ]
    expect(gamesMissedByPlayer(weeks).get('Alice')).toBe(0)
  })

  it('orders weeks by date, not by array order', () => {
    const weeks = [
      week('26 Jan 2026', 'played', ['Bob'], ['Carol']),
      week('05 Jan 2026', 'played', ['Alice'], ['Bob']),
      week('12 Jan 2026', 'played', ['Bob'], ['Carol']),
    ]
    expect(gamesMissedByPlayer(weeks).get('Alice')).toBe(2)
  })

  it('leaves out a player who never appeared', () => {
    const weeks = [week('05 Jan 2026', 'played', ['Alice'], ['Bob'])]
    expect(gamesMissedByPlayer(weeks).has('Dave')).toBe(false)
  })
})

describe('enrichPlayersForRating', () => {
  it('returns copies with gamesMissed set, 0 for players never seen', () => {
    const weeks: Week[] = [
      { season: '2026', week: 1, date: '05 Jan 2026', status: 'played', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' },
      { season: '2026', week: 2, date: '12 Jan 2026', status: 'played', teamA: ['Bob'], teamB: ['Carol'], winner: 'teamA' },
    ]
    const players = [makePlayer('Alice'), makePlayer('Bob'), makePlayer('Dave')]
    const enriched = enrichPlayersForRating(players, weeks)
    expect(enriched.map((p) => p.gamesMissed)).toEqual([1, 0, 0])
    expect(players[0].gamesMissed).toBeUndefined()
  })
})

describe('ratedPlayer helper', () => {
  it.each([10, 25, 42.5, 60, 80])('produces a player whose wprScore is %d', (rating) => {
    expect(wprScore(ratedPlayer('P', rating))).toBeCloseTo(rating, 9)
  })
})

describe('ewptScore — goalkeeper modifier (halved for v2 ratings)', () => {
  const team = (keepers: number) =>
    Array.from({ length: 5 }, (_, i) =>
      ratedPlayer(`P${i}`, 40, { mentality: i < keepers ? 'goalkeeper' : 'balanced' }),
    )

  it('no keeper: 40.000 - 0.75', () => {
    expect(ewptScore(team(0))).toBeCloseTo(39.25, 9)
  })

  it('one keeper rated 40: 40.000 + 0.25 + 0.4', () => {
    expect(ewptScore(team(1))).toBeCloseTo(40.65, 9)
  })

  it('two keepers: 40.000 - 0.5', () => {
    expect(ewptScore(team(2))).toBeCloseTo(39.5, 9)
  })

  it('a stronger keeper scores higher than a weaker one', () => {
    const withKeeper = (gk: number) => [
      ratedPlayer('GK', gk, { mentality: 'goalkeeper' }),
      ...Array.from({ length: 4 }, (_, i) => ratedPlayer(`P${i}`, 40)),
    ]
    expect(ewptScore(withKeeper(50))).toBeGreaterThan(ewptScore(withKeeper(30)))
  })
})

describe('ewptScore — no variety bonus', () => {
  const team = (mentalities: Array<Player['mentality']>) =>
    mentalities.map((m, i) => ratedPlayer(`P${i}`, 40, { mentality: m }))

  it('teams with identical ratings and keeper status score the same whatever their outfield mentalities', () => {
    const varied = team(['goalkeeper', 'balanced', 'attacking', 'defensive', 'balanced'])
    const uniform = team(['goalkeeper', 'balanced', 'balanced', 'balanced', 'balanced'])
    expect(ewptScore(varied)).toBe(ewptScore(uniform))
  })

  it('also holds with no keeper', () => {
    const varied = team(['balanced', 'attacking', 'defensive', 'balanced', 'attacking'])
    const uniform = team(['balanced', 'balanced', 'balanced', 'balanced', 'balanced'])
    expect(ewptScore(varied)).toBe(ewptScore(uniform))
  })
})

describe('ewptScore — team quality', () => {
  it('a balanced team outscores one star with weak teammates at a lower average', () => {
    const starTeam = [ratedPlayer('Star', 85), ...Array.from({ length: 4 }, (_, i) => ratedPlayer(`W${i}`, 30))]
    const balancedTeam = Array.from({ length: 5 }, (_, i) => ratedPlayer(`B${i}`, 51))
    expect(ewptScore(balancedTeam)).toBeGreaterThan(ewptScore(starTeam))
  })

  it('adds the depth bonus for each player beyond five', () => {
    const five = Array.from({ length: 5 }, (_, i) => ratedPlayer(`P${i}`, 40))
    const six = Array.from({ length: 6 }, (_, i) => ratedPlayer(`P${i}`, 40))
    expect(ewptScore(six) - ewptScore(five)).toBeCloseTo(0.5, 9)
  })
})
