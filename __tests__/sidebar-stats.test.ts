import { computeInForm, computeQuarterlyTable, computeTeamAB, computeAllCompletedQuarters } from '@/lib/sidebar-stats'
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
  // Fixed reference date used across all recency-aware calls
  const NOW = new Date(2026, 2, 31) // 31 Mar 2026

  it('excludes players with played < 5', () => {
    const players = [
      makePlayer({ name: 'Alice', played: 4, recentForm: 'WWWW' }),
      makePlayer({ name: 'Bob',   played: 5, recentForm: 'WWWWW' }),
    ]
    const weeks = [
      makeWeek({ week: 1, date: '17 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const result = computeInForm(players, weeks, NOW)
    expect(result.map(r => r.name)).toEqual(['Bob'])
  })

  it('computes PPG correctly: W=3 D=1 L=0', () => {
    const players = [
      makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' }), // 15/5 = 3.0
      makePlayer({ name: 'Bob',   played: 5, recentForm: 'WDDLL' }), // 5/5  = 1.0
    ]
    const weeks = [
      makeWeek({ week: 1, date: '17 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const result = computeInForm(players, weeks, NOW)
    expect(result[0].name).toBe('Alice')
    expect(result[0].ppg).toBeCloseTo(3.0)
    expect(result[1].ppg).toBeCloseTo(1.0)
  })

  it('uses count of non-dash chars as denominator, not 5', () => {
    const players = [makePlayer({ name: 'Alice', played: 5, recentForm: '--WLW' })]
    const weeks = [
      makeWeek({ week: 1, date: '17 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const result = computeInForm(players, weeks, NOW)
    expect(result[0].ppg).toBeCloseTo(2.0)
  })

  it('returns at most 5 players sorted descending by PPG', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      makePlayer({ name: `P${i}`, played: 5, recentForm: 'W'.repeat(Math.max(0, 5 - i)) + 'L'.repeat(Math.min(i, 5)) })
    )
    const weeks = [
      makeWeek({
        week: 1,
        date: '17 Mar 2026',
        teamA: ['P0', 'P1', 'P2', 'P3'],
        teamB: ['P4', 'P5', 'P6', 'P7'],
        winner: 'teamA',
      }),
    ]
    const result = computeInForm(players, weeks, NOW)
    expect(result).toHaveLength(5)
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].ppg).toBeGreaterThanOrEqual(result[i].ppg)
    }
  })

  it('returns empty array when no qualifying players', () => {
    const players = [makePlayer({ name: 'Alice', played: 3 })]
    const weeks = [
      makeWeek({ week: 1, date: '17 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    expect(computeInForm(players, weeks, NOW)).toEqual([])
  })

  describe('recency cutoff (8 weeks)', () => {
    // now = 31 Mar 2026; cutoff = 3 Feb 2026 (56 days earlier)
    const NOW = new Date(2026, 2, 31)

    it('includes a player whose last game was 4 weeks ago', () => {
      // 3 Mar 2026 — within 8 weeks
      const players = [makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' })]
      const weeks = [
        makeWeek({ week: 1, date: '03 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const result = computeInForm(players, weeks, NOW)
      expect(result.map(r => r.name)).toContain('Alice')
    })

    it('includes a player whose last game was exactly 8 weeks ago (boundary inclusive)', () => {
      // 3 Feb 2026 — exactly on the cutoff
      const players = [makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' })]
      const weeks = [
        makeWeek({ week: 1, date: '03 Feb 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const result = computeInForm(players, weeks, NOW)
      expect(result.map(r => r.name)).toContain('Alice')
    })

    it('excludes a player whose last game was 9 weeks ago', () => {
      // 27 Jan 2026 — just outside the cutoff
      const players = [makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' })]
      const weeks = [
        makeWeek({ week: 1, date: '27 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const result = computeInForm(players, weeks, NOW)
      expect(result.map(r => r.name)).not.toContain('Alice')
    })

    it('excludes a player with no week entry', () => {
      // Player exists in the players array but never appears in any week
      const players = [makePlayer({ name: 'Ghost', played: 5, recentForm: 'WWWWW' })]
      const weeks: Week[] = []
      const result = computeInForm(players, weeks, NOW)
      expect(result).toHaveLength(0)
    })

    it('uses the most recent week when a player appears in multiple weeks', () => {
      // Old game: 10 Jan 2026 (> 8 weeks ago). Recent game: 17 Mar 2026 (2 weeks ago).
      // Should be included because the most recent game is within the window.
      const players = [makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' })]
      const weeks = [
        makeWeek({ week: 1, date: '10 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
        makeWeek({ week: 2, date: '17 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const result = computeInForm(players, weeks, NOW)
      expect(result.map(r => r.name)).toContain('Alice')
    })
  })
}) // closes describe('computeInForm')

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
    // A Q1 played week is needed so holdover does not trigger
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const now = new Date(2026, 0, 15) // Q1 2026
    const result = computeQuarterlyTable(weeks, now)
    expect(result.lastQuarterLabel).toBeNull() // no Q4 2025 data
    expect(result.quarterLabel).toBe('Q1 26')
    expect(result.isHoldover).toBe(false)
  })

  // ─── gamesLeft (calendar-based) ───────────────────────────────────────────────

  describe('gamesLeft — calendar-based', () => {
    // Test 1: explicit gameDay, mid-quarter, now is the game day (today excluded)
    it('excludes today and counts remaining Wednesdays when now is a Wednesday', () => {
      // now = 7 Jan 2026 (Wednesday). Cursor starts 8 Jan.
      // Wednesdays 8 Jan→31 Mar: Jan 14,21,28, Feb 4,11,18,25, Mar 4,11,18,25 = 11
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 0, 7)
      const result = computeQuarterlyTable(weeks, now, 3) // gameDay 3 = Wednesday
      expect(result.gamesLeft).toBe(11)
    })

    // Test 2: first day of quarter
    it('counts correctly when now is the first day of the quarter', () => {
      // now = 1 Jan 2026 (Thursday). Cursor starts 2 Jan.
      // Wednesdays 2 Jan→31 Mar: Jan 7,14,21,28, Feb 4,11,18,25, Mar 4,11,18,25 = 12
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 0, 1)
      const result = computeQuarterlyTable(weeks, now, 3)
      expect(result.gamesLeft).toBe(12)
    })

    // Test 3: now is the last day of the quarter (also the game day)
    it('returns 0 when now is the last day of the quarter even if it is the game day', () => {
      // now = 31 Mar 2026 (Tuesday = gameDay 2). Cursor starts 1 Apr = Q2.
      // Loop never executes → 0. Works regardless of whether 31 Mar is the game day.
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '31 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 2, 31)
      const result = computeQuarterlyTable(weeks, now, 2) // gameDay 2 = Tuesday = 31 Mar
      expect(result.gamesLeft).toBe(0)
    })

    // Test 4: now is day before a game day (tomorrow counted)
    it('includes tomorrow when now is the day before the game day', () => {
      // now = 6 Jan 2026 (Tuesday). Cursor starts 7 Jan (Wednesday).
      // Wednesdays 7 Jan→31 Mar: Jan 7,14,21,28, Feb 4,11,18,25, Mar 4,11,18,25 = 12
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 0, 6)
      const result = computeQuarterlyTable(weeks, now, 3)
      expect(result.gamesLeft).toBe(12)
    })

    // Test 5: now = Jan 1 vs now = Jan 6 produce different counts (off-by-one guard)
    it('produces one more count when now is Jan 1 than when now is Jan 6', () => {
      // Jan 1 → cursor Jan 2 → 12 Wednesdays
      // Jan 6 → cursor Jan 7 → 12 Wednesdays
      // These are equal — both start before the first Wednesday (Jan 7)
      // Shift: Jan 7 (Wednesday) → cursor Jan 8 → 11. Confirms today IS excluded.
      const weeksWithGame = [
        makeWeek({ week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const fromJan1 = computeQuarterlyTable(weeksWithGame, new Date(2026, 0, 1), 3).gamesLeft
      const fromJan7 = computeQuarterlyTable(weeksWithGame, new Date(2026, 0, 7), 3).gamesLeft
      expect(fromJan1).toBe(12)
      expect(fromJan7).toBe(11) // one fewer: Jan 7 itself excluded
    })

    // Test 6: gameDay = 0 (Sunday boundary value)
    it('handles gameDay = 0 (Sunday) correctly', () => {
      // now = 1 Jan 2026 (Thursday). Cursor starts 2 Jan.
      // Sundays 2 Jan→31 Mar: Jan 4,11,18,25, Feb 1,8,15,22, Mar 1,8,15,22,29 = 13
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 0, 1)
      const result = computeQuarterlyTable(weeks, now, 0)
      expect(result.gamesLeft).toBe(13)
    })

    // Test 7: no weeks, no gameDay — fallback to 0
    it('returns 0 when no weeks exist and gameDay is not provided', () => {
      const result = computeQuarterlyTable([], new Date(2026, 0, 22))
      expect(result.gamesLeft).toBe(0)
    })

    // Test 8: gameDay inferred from played weeks in current quarter
    it('infers gameDay from played weeks in the current quarter', () => {
      // Played week on 7 Jan 2026 (Wednesday = gameDay 3)
      // now = 22 Jan 2026 (Thursday). Cursor starts 23 Jan.
      // Wednesdays 23 Jan→31 Mar: Jan 28, Feb 4,11,18,25, Mar 4,11,18,25 = 9
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 0, 22)
      const result = computeQuarterlyTable(weeks, now) // no explicit gameDay
      expect(result.gamesLeft).toBe(9)
    })

    // Test 9: gameDay inferred from prior-quarter history (current quarter has only cancelled weeks)
    it('infers gameDay from prior-quarter history when current quarter has only cancelled weeks', () => {
      // Played week in Q4 2025 on 17 Dec (Wednesday = gameDay 3)
      // Played week in Q1 2026 — needed to prevent holdover
      // Cancelled week in Q1 2026
      // now = 22 Jan 2026. Cursor starts 23 Jan.
      // Wednesdays 23 Jan→31 Mar: Jan 28, Feb 4,11,18,25, Mar 4,11,18,25 = 9
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '17 Dec 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
        makeWeek({ week: 2, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q1 played → prevents holdover
        makeWeek({ week: 3, date: '14 Jan 2026', status: 'cancelled', teamA: [], teamB: [], winner: null }),
      ]
      const now = new Date(2026, 0, 22)
      const result = computeQuarterlyTable(weeks, now) // no explicit gameDay
      expect(result.gamesLeft).toBe(9)
    })

    // Test 10: explicit gameDay overrides inference
    it('uses explicit gameDay even when played weeks exist with a different day', () => {
      // Played week on Wednesday, but we explicitly pass gameDay = 1 (Monday)
      // now = 1 Jan 2026. Mondays in Q1 from Jan 2: Jan 5,12,19,26, Feb 2,9,16,23, Mar 2,9,16,23,30 = 13
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 0, 1)
      const result = computeQuarterlyTable(weeks, now, 1) // explicit Monday
      expect(result.gamesLeft).toBe(13)
    })
  })

  describe('holdover — shows previous quarter when current quarter has no played games', () => {
    it('returns previous quarter data and isHoldover=true when current quarter is empty', () => {
      // now = 1 Apr 2026 (Q2). Q1 has played data, Q2 has none.
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '15 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q1
        makeWeek({ week: 2, date: '22 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q1
      ]
      const now = new Date(2026, 3, 1) // 1 Apr 2026 = Q2
      const result = computeQuarterlyTable(weeks, now)
      expect(result.isHoldover).toBe(true)
      expect(result.quarterLabel).toBe('Q1 26')
      expect(result.entries.find(e => e.name === 'Alice')?.won).toBe(2)
      expect(result.gamesLeft).toBe(0)
    })

    it('returns current quarter data and isHoldover=false once first Q2 game is played', () => {
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '15 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q1
        makeWeek({ week: 2, date: '02 Apr 2026', teamA: ['Charlie'], teamB: ['Dave'], winner: 'teamA' }), // Q2
      ]
      const now = new Date(2026, 3, 3) // 3 Apr 2026 = Q2
      const result = computeQuarterlyTable(weeks, now)
      expect(result.isHoldover).toBe(false)
      expect(result.quarterLabel).toBe('Q2 26')
      expect(result.entries.find(e => e.name === 'Charlie')).toBeDefined()
    })

    it('steps back to Q4 of prior year when Q1 has no played games', () => {
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '10 Dec 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q4 2025
      ]
      const now = new Date(2026, 0, 5) // 5 Jan 2026 = Q1 (no Q1 games yet)
      const result = computeQuarterlyTable(weeks, now)
      expect(result.isHoldover).toBe(true)
      expect(result.quarterLabel).toBe('Q4 25')
      expect(result.entries.find(e => e.name === 'Alice')).toBeDefined()
    })
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

// ─── computeAllCompletedQuarters ─────────────────────────────────────────────

describe('computeAllCompletedQuarters', () => {
  it('returns empty array when there are no weeks', () => {
    expect(computeAllCompletedQuarters([])).toEqual([])
  })

  it('returns a completed quarter when all weeks are played or cancelled and at least one is played', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '13 Jan 2025', status: 'cancelled', teamA: [], teamB: [], winner: null }),
    ]
    const result = computeAllCompletedQuarters(weeks)
    expect(result).toHaveLength(1)
    expect(result[0].year).toBe(2025)
    expect(result[0].quarters).toHaveLength(1)
    expect(result[0].quarters[0].quarterLabel).toBe('Q1 25')
    expect(result[0].quarters[0].champion).toBe('Alice')
  })

  it('excludes a quarter that has an unrecorded week', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '13 Jan 2025', status: 'unrecorded', teamA: [], teamB: [], winner: null }),
    ]
    expect(computeAllCompletedQuarters(weeks)).toEqual([])
  })

  it('excludes a quarter that has a scheduled week', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '13 Jan 2025', status: 'scheduled', teamA: [], teamB: [], winner: null }),
    ]
    expect(computeAllCompletedQuarters(weeks)).toEqual([])
  })

  it('excludes a quarter where all weeks are cancelled (no played weeks)', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', status: 'cancelled', teamA: [], teamB: [], winner: null }),
    ]
    expect(computeAllCompletedQuarters(weeks)).toEqual([])
  })

  it('returns the full player table, not capped at 5', () => {
    const players = ['A','B','C','D','E','F','G']
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: players.slice(0, 4), teamB: players.slice(4), winner: 'teamA' }),
    ]
    const result = computeAllCompletedQuarters(weeks)
    expect(result[0].quarters[0].entries).toHaveLength(7)
  })

  it('champion is the highest-points player', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '13 Jan 2025', teamA: ['Bob'], teamB: ['Alice'], winner: 'teamA' }),
      makeWeek({ week: 3, date: '20 Jan 2025', teamA: ['Bob'], teamB: ['Alice'], winner: 'teamA' }),
    ]
    // Bob: 2 wins = 6 pts. Alice: 1 win = 3 pts.
    const result = computeAllCompletedQuarters(weeks)
    expect(result[0].quarters[0].champion).toBe('Bob')
  })

  it('groups quarters by year, newest year first', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2024', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '06 Jan 2025', teamA: ['Bob'], teamB: ['Alice'], winner: 'teamA' }),
    ]
    const result = computeAllCompletedQuarters(weeks)
    expect(result[0].year).toBe(2025)
    expect(result[1].year).toBe(2024)
  })

  it('sorts quarters within a year newest-first (Q4 before Q3)', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q1
      makeWeek({ week: 2, date: '06 Apr 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q2
      makeWeek({ week: 3, date: '06 Jul 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q3
      makeWeek({ week: 4, date: '06 Oct 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q4
    ]
    const result = computeAllCompletedQuarters(weeks)
    expect(result[0].year).toBe(2025)
    const qs = result[0].quarters.map(q => q.q)
    expect(qs).toEqual([4, 3, 2, 1])
  })

  it('handles multiple quarters across multiple years', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Oct 2024', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q4 2024
      makeWeek({ week: 2, date: '06 Jan 2025', teamA: ['Bob'], teamB: ['Alice'], winner: 'teamA' }), // Q1 2025
    ]
    const result = computeAllCompletedQuarters(weeks)
    expect(result).toHaveLength(2)
    expect(result[0].year).toBe(2025)
    expect(result[0].quarters[0].quarterLabel).toBe('Q1 25')
    expect(result[1].year).toBe(2024)
    expect(result[1].quarters[0].quarterLabel).toBe('Q4 24')
  })
})
