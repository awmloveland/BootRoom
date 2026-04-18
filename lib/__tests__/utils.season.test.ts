import { deriveSeason, getNextWeekNumber, computeYearStats } from '@/lib/utils'
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
    makeWeek({ season: '2026', week: 1, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 2, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
    makeWeek({ season: '2026', week: 3, teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
    makeWeek({ season: '2026', week: 4, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 5, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 6, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    // 2025 game — should be excluded when year='2026'
    makeWeek({ season: '2025', week: 50, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
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
})
