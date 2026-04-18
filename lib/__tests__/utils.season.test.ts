import { deriveSeason, getNextWeekNumber, computeYearStats, sortWeeks } from '@/lib/utils'
import type { Week } from '@/lib/types'

function makeWeek(overrides: Partial<Week>): Week {
  return {
    season: '2026',
    week: 1,
    date: '01 Jan 2026',
    status: 'played',
    teamA: [],
    teamB: [],
    winner: null,
    ...overrides,
  }
}

describe('sortWeeks', () => {
  it('orders weeks by date descending', () => {
    const weeks = [
      makeWeek({ season: '2026', week: 1, date: '01 Jan 2026' }),
      makeWeek({ season: '2026', week: 3, date: '15 Jan 2026' }),
      makeWeek({ season: '2025', week: 50, date: '05 Dec 2025' }),
    ]
    const sorted = sortWeeks(weeks)
    expect(sorted.map((w) => w.date)).toEqual([
      '15 Jan 2026',
      '01 Jan 2026',
      '05 Dec 2025',
    ])
  })

  it('orders by date even when week numbers are non-chronological within a year', () => {
    // Regression: a retroactive entry with a higher week number but earlier date.
    // Before the fix, sortWeeks used (season DESC, week DESC) so week 6 would
    // appear above week 5 despite being earlier. After the fix, date wins.
    const weeks = [
      makeWeek({ season: '2026', week: 5, date: '10 Mar 2026' }),
      makeWeek({ season: '2026', week: 6, date: '03 Mar 2026' }),
    ]
    const sorted = sortWeeks(weeks)
    expect(sorted.map((w) => w.date)).toEqual(['10 Mar 2026', '03 Mar 2026'])
  })

  it('places a later-dated year above an earlier-dated year regardless of week numbers', () => {
    const weeks = [
      makeWeek({ season: '2026', week: 1, date: '02 Jan 2026' }),
      makeWeek({ season: '2025', week: 99, date: '31 Dec 2025' }),
    ]
    const sorted = sortWeeks(weeks)
    expect(sorted[0].season).toBe('2026')
    expect(sorted[1].season).toBe('2025')
  })

  it('does not mutate its input', () => {
    const weeks = [
      makeWeek({ date: '01 Jan 2026' }),
      makeWeek({ date: '15 Jan 2026' }),
    ]
    const snapshot = weeks.map((w) => w.date)
    sortWeeks(weeks)
    expect(weeks.map((w) => w.date)).toEqual(snapshot)
  })
})

describe('deriveSeason', () => {
  it('returns the season of the most recently played week', () => {
    const weeks = [
      makeWeek({ season: '2025', week: 50, date: '05 Dec 2025', status: 'played' }),
      makeWeek({ season: '2026', week: 3,  date: '15 Jan 2026', status: 'played' }),
    ]
    expect(deriveSeason(weeks)).toBe('2026')
  })

  it('falls back to current calendar year when no played weeks exist', () => {
    const year = String(new Date().getFullYear())
    expect(deriveSeason([])).toBe(year)
    expect(deriveSeason([makeWeek({ status: 'cancelled' })])).toBe(year)
  })
})

describe('getNextWeekNumber', () => {
  it('returns 1 when no weeks exist in the current year', () => {
    const currentYear = String(new Date().getFullYear())
    const pastYear = String(Number(currentYear) - 1)
    const weeks = [makeWeek({ season: pastYear, week: 52 })]
    expect(getNextWeekNumber(weeks)).toBe(1)
  })

  it('returns max week + 1 within the current year', () => {
    const currentYear = String(new Date().getFullYear())
    const weeks = [
      makeWeek({ season: currentYear, week: 5 }),
      makeWeek({ season: currentYear, week: 3 }),
    ]
    expect(getNextWeekNumber(weeks)).toBe(6)
  })
})

describe('computeYearStats', () => {
  const weeks: Week[] = [
    // 2026 games — player is on teamA for all
    makeWeek({ season: '2026', week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 2, date: '08 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
    makeWeek({ season: '2026', week: 3, date: '15 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
    makeWeek({ season: '2026', week: 4, date: '22 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 5, date: '29 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 6, date: '05 Feb 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    // 2025 game — should be excluded when year='2026'
    makeWeek({ season: '2025', week: 50, date: '01 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
  ]

  it('counts only games in the given year', () => {
    const stats = computeYearStats('Alice', weeks, '2026')
    expect(stats.played).toBe(6)
    expect(stats.won).toBe(4)
    expect(stats.drew).toBe(1)
    expect(stats.lost).toBe(1)
  })

  it('computes win rate correctly', () => {
    const stats = computeYearStats('Alice', weeks, '2026')
    expect(stats.winRate).toBe(66.7)
  })

  it('computes points as W=3 D=1 L=0', () => {
    const stats = computeYearStats('Alice', weeks, '2026')
    expect(stats.points).toBe(13) // 4×3 + 1×1 + 1×0
  })

  it('builds recentForm newest-first from last 5 games in that year', () => {
    const stats = computeYearStats('Alice', weeks, '2026')
    // Weeks 6,5,4,3,2 → W,W,W,D,L
    expect(stats.recentForm).toBe('WWWDL')
  })

  it('marks qualified=true when played >= 5', () => {
    expect(computeYearStats('Alice', weeks, '2026').qualified).toBe(true)
  })

  it('marks qualified=false when played < 5', () => {
    const stats = computeYearStats('Alice', weeks, '2025')
    expect(stats.played).toBe(1)
    expect(stats.qualified).toBe(false)
  })

  it('returns zero stats for a player not in any weeks of that year', () => {
    const stats = computeYearStats('Nobody', weeks, '2026')
    expect(stats.played).toBe(0)
    expect(stats.recentForm).toBe('-----')
  })

  it('excludes cancelled weeks', () => {
    const withCancelled = [
      ...weeks,
      makeWeek({ season: '2026', week: 7, status: 'cancelled', teamA: ['Alice'], teamB: ['Bob'], winner: null }),
    ]
    expect(computeYearStats('Alice', withCancelled, '2026').played).toBe(6)
  })

  it('builds recentForm by date even when week numbers are non-chronological', () => {
    // Regression: week 6 is dated earlier than week 5. Recent form must follow date order, not week number.
    const weeksOutOfOrder: Week[] = [
      makeWeek({ season: '2026', week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ season: '2026', week: 2, date: '08 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
      makeWeek({ season: '2026', week: 3, date: '15 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
      makeWeek({ season: '2026', week: 4, date: '22 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ season: '2026', week: 6, date: '03 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
      makeWeek({ season: '2026', week: 5, date: '10 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const stats = computeYearStats('Alice', weeksOutOfOrder, '2026')
    // Newest-first by date: 10 Mar (W), 03 Mar (L), 22 Jan (W), 15 Jan (D), 08 Jan (L)
    expect(stats.recentForm).toBe('WLWDL')
  })
})
