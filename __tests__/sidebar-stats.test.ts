import { computeInForm, computeQuarterlyTable, computeTeamAB } from '@/lib/sidebar-stats'
import type { Player, Week } from '@/lib/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> & { name: string }): Player {
  return {
    played: 10,
    won: 5, drew: 2, lost: 3,
    timesTeamA: 5, timesTeamB: 5,
    winRate: 50,
    qualified: true,
    points: 17,
    goalkeeper: false,
    mentality: 'balanced',
    rating: 2,
    recentForm: 'WWWWW',
    ...overrides,
  }
}

function makeWeek(overrides: Partial<Week> & { week: number }): Week {
  return {
    date: '01 Jan 2026',
    status: 'played',
    teamA: ['Alice', 'Bob'],
    teamB: ['Charlie', 'Dave'],
    winner: 'teamA',
    ...overrides,
  }
}

// ─── computeInForm ────────────────────────────────────────────────────────────

describe('computeInForm', () => {
  it('excludes players with played < 5', () => {
    const players = [
      makePlayer({ name: 'Alice', played: 4, recentForm: 'WWWW' }),
      makePlayer({ name: 'Bob',   played: 5, recentForm: 'WWWWW' }),
    ]
    const result = computeInForm(players)
    expect(result.map(r => r.name)).toEqual(['Bob'])
  })

  it('computes PPG correctly: W=3 D=1 L=0', () => {
    const players = [
      makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' }), // 15/5 = 3.0
      makePlayer({ name: 'Bob',   played: 5, recentForm: 'WDDLL' }), // 5/5  = 1.0
    ]
    const result = computeInForm(players)
    expect(result[0].name).toBe('Alice')
    expect(result[0].ppg).toBeCloseTo(3.0)
    expect(result[1].ppg).toBeCloseTo(1.0)
  })

  it('uses count of non-dash chars as denominator, not 5', () => {
    // '--WLW': 3 games played, points = 3+0+3 = 6, PPG = 6/3 = 2.0
    const players = [makePlayer({ name: 'Alice', played: 5, recentForm: '--WLW' })]
    const result = computeInForm(players)
    expect(result[0].ppg).toBeCloseTo(2.0)
  })

  it('returns at most 5 players sorted descending by PPG', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      makePlayer({ name: `P${i}`, played: 5, recentForm: 'W'.repeat(Math.max(0, 5 - i)) + 'L'.repeat(Math.min(i, 5)) })
    )
    const result = computeInForm(players)
    expect(result).toHaveLength(5)
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].ppg).toBeGreaterThanOrEqual(result[i].ppg)
    }
  })

  it('returns empty array when no qualifying players', () => {
    const players = [makePlayer({ name: 'Alice', played: 3 })]
    expect(computeInForm(players)).toEqual([])
  })
})

// ─── computeQuarterlyTable ────────────────────────────────────────────────────

describe('computeQuarterlyTable', () => {
  it('includes only played weeks in the current quarter', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '15 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '15 Apr 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }), // Q2 — excluded
      makeWeek({ week: 3, date: '20 Jan 2026', status: 'cancelled', teamA: [], teamB: [], winner: null }), // excluded
    ]
    const now = new Date(2026, 0, 22) // Jan = Q1
    const result = computeQuarterlyTable(weeks, now)
    expect(result.quarterLabel).toBe('Q1 26')
    expect(result.entries.map(e => e.name)).toContain('Alice')
    expect(result.entries.find(e => e.name === 'Bob')?.won).toBe(0)
  })

  it('accumulates W/D/L and points correctly', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice', 'Bob'], teamB: ['Charlie'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '12 Jan 2026', teamA: ['Alice'], teamB: ['Charlie', 'Bob'], winner: 'draw' }),
    ]
    const now = new Date(2026, 0, 22)
    const result = computeQuarterlyTable(weeks, now)
    const alice = result.entries.find(e => e.name === 'Alice')!
    expect(alice.won).toBe(1)
    expect(alice.drew).toBe(1)
    expect(alice.points).toBe(4) // 3 + 1
  })

  it('returns at most 5 entries sorted by points desc', () => {
    const players = ['A','B','C','D','E','F']
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: players.slice(0,3), teamB: players.slice(3), winner: 'teamA' }),
    ]
    const result = computeQuarterlyTable(weeks, new Date(2026, 0, 22))
    expect(result.entries.length).toBeLessThanOrEqual(5)
    for (let i = 1; i < result.entries.length; i++) {
      expect(result.entries[i-1].points).toBeGreaterThanOrEqual(result.entries[i].points)
    }
  })

  it('identifies last quarter champion', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '10 Dec 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q4 2025
    ]
    const now = new Date(2026, 0, 22) // Q1 2026 — prev is Q4 2025
    const result = computeQuarterlyTable(weeks, now)
    expect(result.lastChampion).toBe('Alice')
    expect(result.lastQuarterLabel).toBe('Q4 25')
  })

  it('returns null lastChampion when no previous quarter data', () => {
    const result = computeQuarterlyTable([], new Date(2026, 0, 22))
    expect(result.lastChampion).toBeNull()
    expect(result.entries).toHaveLength(0)
  })

  it('handles Q1 rollover correctly (prev = Q4 of prior year)', () => {
    const now = new Date(2026, 0, 15) // Q1 2026
    const result = computeQuarterlyTable([], now)
    expect(result.lastQuarterLabel).toBeNull() // no data
    expect(result.quarterLabel).toBe('Q1 26')
  })

  it('returns gamesLeft as QUARTER_GAME_COUNT minus maxPlayed', () => {
    // Two weeks played in Q1 2026, max played by any player = 2
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '12 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
    ]
    const result = computeQuarterlyTable(weeks, new Date(2026, 0, 22))
    // QUARTER_GAME_COUNT is 16; maxPlayed = 2 → gamesLeft = 14
    expect(result.gamesLeft).toBe(14)
  })

  it('returns QUARTER_GAME_COUNT as gamesLeft when entries is empty', () => {
    const result = computeQuarterlyTable([], new Date(2026, 0, 22))
    expect(result.gamesLeft).toBe(16)
  })

  it('clamps gamesLeft to 0 when maxPlayed exceeds QUARTER_GAME_COUNT', () => {
    // Artificially create 20 weeks to exceed the constant
    const weeks: Week[] = Array.from({ length: 20 }, (_, i) =>
      makeWeek({ week: i + 1, date: '05 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' })
    )
    const result = computeQuarterlyTable(weeks, new Date(2026, 0, 22))
    expect(result.gamesLeft).toBe(0)
  })
})

// ─── computeTeamAB ────────────────────────────────────────────────────────────

describe('computeTeamAB', () => {
  it('counts wins and draws correctly', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, winner: 'teamA' }),
      makeWeek({ week: 2, winner: 'teamA' }),
      makeWeek({ week: 3, winner: 'teamB' }),
      makeWeek({ week: 4, winner: 'draw'  }),
    ]
    const r = computeTeamAB(weeks)
    expect(r.teamAWins).toBe(2)
    expect(r.teamBWins).toBe(1)
    expect(r.draws).toBe(1)
    expect(r.total).toBe(4)
  })

  it('ignores cancelled weeks', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, winner: 'teamA' }),
      makeWeek({ week: 2, status: 'cancelled', winner: null }),
    ]
    const r = computeTeamAB(weeks)
    expect(r.total).toBe(1)
  })

  it('computes current streak correctly', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, winner: 'teamB' }),
      makeWeek({ week: 2, winner: 'teamA' }),
      makeWeek({ week: 3, winner: 'teamA' }),
      makeWeek({ week: 4, winner: 'teamA' }), // newest
    ]
    const r = computeTeamAB(weeks)
    expect(r.streakTeam).toBe('teamA')
    expect(r.streakLength).toBe(3)
  })

  it('streak of 1 when last two differ', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, winner: 'teamA' }),
      makeWeek({ week: 2, winner: 'teamB' }), // newest
    ]
    const r = computeTeamAB(weeks)
    expect(r.streakTeam).toBe('teamB')
    expect(r.streakLength).toBe(1)
  })

  it('returns zero totals and null streak for empty input', () => {
    const r = computeTeamAB([])
    expect(r.total).toBe(0)
    expect(r.streakTeam).toBeNull()
    expect(r.streakLength).toBe(0)
  })
})
