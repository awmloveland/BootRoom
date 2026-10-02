import { seasonOfDate, getNextWeekNumber, computeYearStats, sortWeeks, getSeasonPlayedWeekCount, getHeaderSeason } from '@/lib/utils'
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

describe('seasonOfDate', () => {
  it('returns the calendar year of a match date', () => {
    expect(seasonOfDate('04 Jan 2027')).toBe('2027')
    expect(seasonOfDate('31 Dec 2026')).toBe('2026')
  })
})

describe('getNextWeekNumber', () => {
  const season2026 = Array.from({ length: 39 }, (_, i) =>
    makeWeek({ season: '2026', week: i + 1, date: '01 Jan 2026' })
  )

  it('returns 1 when the season has no weeks yet', () => {
    expect(getNextWeekNumber(season2026, '2027')).toBe(1)
  })

  it('returns max week + 1 within the given season', () => {
    expect(getNextWeekNumber(season2026, '2026')).toBe(40)
  })

  it('ignores week numbers from other seasons', () => {
    const weeks = [
      makeWeek({ season: '2025', week: 52 }),
      makeWeek({ season: '2026', week: 5 }),
      makeWeek({ season: '2026', week: 3 }),
    ]
    expect(getNextWeekNumber(weeks, '2026')).toBe(6)
  })
})

describe('next week key at the year boundary', () => {
  const season2026 = Array.from({ length: 39 }, (_, i) =>
    makeWeek({ season: '2026', week: i + 1, date: '01 Jan 2026' })
  )

  function resolveKey(nextDate: string, weeks: Week[]): [string, number] {
    const season = seasonOfDate(nextDate)
    return [season, getNextWeekNumber(weeks, season)]
  }

  afterEach(() => {
    jest.useRealTimers()
  })

  it('resolves a January match to week 1 of the new season without reusing a played key', () => {
    const [season, week] = resolveKey('04 Jan 2027', season2026)
    expect([season, week]).toEqual(['2027', 1])
    expect(season2026.some((w) => w.season === season && w.week === week)).toBe(false)
  })

  // The old getNextWeekNumber read the clock, which is what put a January game
  // under last season's week numbers. The card-level check is in
  // __tests__/next-match-card-season.test.tsx.
  it('resolves the same key when the lineup is built in late December', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(2026, 11, 30))
    expect(resolveKey('04 Jan 2027', season2026)).toEqual(['2027', 1])
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

describe('getSeasonPlayedWeekCount', () => {
  const currentYear = String(new Date().getFullYear())
  const prevYear = String(new Date().getFullYear() - 1)

  it('returns max week number from current year played weeks', () => {
    const weeks = [
      makeWeek({ season: currentYear, week: 3, status: 'played' }),
      makeWeek({ season: currentYear, week: 5, status: 'played' }),
    ]
    expect(getSeasonPlayedWeekCount(weeks)).toBe(5)
  })

  it('includes cancelled weeks in the count', () => {
    const weeks = [
      makeWeek({ season: currentYear, week: 3, status: 'played' }),
      makeWeek({ season: currentYear, week: 4, status: 'cancelled' }),
    ]
    expect(getSeasonPlayedWeekCount(weeks)).toBe(4)
  })

  it('includes dnf weeks in the count', () => {
    const weeks = [
      makeWeek({ season: currentYear, week: 3, status: 'played' }),
      makeWeek({ season: currentYear, week: 4, status: 'dnf' }),
    ]
    expect(getSeasonPlayedWeekCount(weeks)).toBe(4)
  })

  it('excludes unrecorded and scheduled weeks from the count', () => {
    const weeks = [
      makeWeek({ season: currentYear, week: 3, status: 'played' }),
      makeWeek({ season: currentYear, week: 5, status: 'unrecorded' }),
      makeWeek({ season: currentYear, week: 6, status: 'scheduled' }),
    ]
    expect(getSeasonPlayedWeekCount(weeks)).toBe(3)
  })

  it('falls back to previous year when current year has no relevant weeks', () => {
    const weeks = [
      makeWeek({ season: prevYear, week: 40, status: 'played' }),
    ]
    expect(getSeasonPlayedWeekCount(weeks)).toBe(40)
  })

  it('returns 0 when no relevant weeks exist at all', () => {
    expect(getSeasonPlayedWeekCount([])).toBe(0)
  })
})

describe('getHeaderSeason', () => {
  const currentYear = String(new Date().getFullYear())
  const prevYear = String(new Date().getFullYear() - 1)

  it('returns the current year when it has played weeks', () => {
    const weeks = [
      makeWeek({ season: prevYear, week: 50, status: 'played' }),
      makeWeek({ season: currentYear, week: 2, status: 'played' }),
    ]
    expect(getHeaderSeason(weeks)).toBe(currentYear)
  })

  it('falls back to the previous year when the current year has no results yet', () => {
    const weeks = [
      makeWeek({ season: prevYear, week: 50, status: 'played' }),
      makeWeek({ season: currentYear, week: 1, status: 'scheduled' }),
    ]
    expect(getHeaderSeason(weeks)).toBe(prevYear)
  })

  it('returns the current year when there are no weeks at all', () => {
    expect(getHeaderSeason([])).toBe(currentYear)
  })
})
