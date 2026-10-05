import { findNewlyCompletedQuarter, getCelebratedQuarter, weekInQuarter } from '../sidebar-stats'
import type { Week, WeekStatus } from '../types'

function makeWeek(weekNum: number, date: string, status: WeekStatus): Week {
  const played = status === 'played'
  return {
    season: '2026',
    week: weekNum,
    date,
    status,
    teamA: played ? ['Dave', 'Ali'] : [],
    teamB: played ? ['Steve', 'Sam'] : [],
    winner: played ? 'teamA' : null,
  }
}

// Five Fridays per quarter: the fewest played games that crown a champion.
const Q1_FRIDAYS = ['9 Jan 2026', '16 Jan 2026', '23 Jan 2026', '30 Jan 2026', '6 Feb 2026']
const Q2_FRIDAYS = ['3 Apr 2026', '10 Apr 2026', '17 Apr 2026', '24 Apr 2026', '1 May 2026']

function playedWeeks(dates: string[], firstWeek = 1): Week[] {
  return dates.map((d, i) => makeWeek(firstWeek + i, d, 'played'))
}

describe('findNewlyCompletedQuarter', () => {
  // Fixed "now" in Q3 2026 so Q2 2026 is calendar-past.
  const now = new Date(2026, 6, 8)

  it('returns the quarter when recording its last outstanding week completes it', () => {
    const before: Week[] = [
      ...playedWeeks(Q2_FRIDAYS.slice(0, 4)),
      makeWeek(5, '1 May 2026', 'scheduled'), // outstanding → Q2 not yet completed
    ]
    const after: Week[] = playedWeeks(Q2_FRIDAYS) // now settled → Q2 completes
    const result = findNewlyCompletedQuarter(before, after, now)
    expect(result).not.toBeNull()
    expect(result!.q).toBe(2)
    expect(result!.year).toBe(2026)
    expect(result!.champion).toBeTruthy()
  })

  it('returns null when the quarter completes with fewer than 5 games', () => {
    const before: Week[] = [
      ...playedWeeks(Q2_FRIDAYS.slice(0, 3)),
      makeWeek(4, '24 Apr 2026', 'scheduled'),
    ]
    const after: Week[] = playedWeeks(Q2_FRIDAYS.slice(0, 4))
    expect(findNewlyCompletedQuarter(before, after, now)).toBeNull()
  })

  it('returns null when the recorded game is in the current (in-progress) quarter', () => {
    const before: Week[] = [makeWeek(1, '3 Jul 2026', 'scheduled')]
    const after: Week[] = [makeWeek(1, '3 Jul 2026', 'played')]
    expect(findNewlyCompletedQuarter(before, after, now)).toBeNull()
  })

  it('returns null when no quarter status changed', () => {
    const before: Week[] = playedWeeks(Q2_FRIDAYS)
    const after: Week[] = [...playedWeeks(Q2_FRIDAYS), makeWeek(6, '8 May 2026', 'played')]
    // Q2 was already completed in `before` (all settled, five played) → not newly completed
    expect(findNewlyCompletedQuarter(before, after, now)).toBeNull()
  })
})

describe('getCelebratedQuarter', () => {
  const now = new Date(2026, 6, 15) // Wed 15 Jul 2026, Q3

  it('returns the most recently completed quarter', () => {
    const weeks: Week[] = playedWeeks(Q2_FRIDAYS)
    const result = getCelebratedQuarter(weeks, now)
    expect(result).not.toBeNull()
    expect(result!.q).toBe(2)
    expect(result!.year).toBe(2026)
    expect(result!.champion).toBeTruthy()
  })

  it('does not expire as results come in for the next quarter', () => {
    const weeks: Week[] = [
      ...playedWeeks(Q2_FRIDAYS),
      makeWeek(6, '3 Jul 2026', 'played'),
      makeWeek(7, '10 Jul 2026', 'played'),
    ]
    const result = getCelebratedQuarter(weeks, now)
    expect(result).not.toBeNull()
    expect(result!.q).toBe(2)
  })

  it('returns the current calendar quarter as soon as its final game day is settled', () => {
    // Monday league: every Monday in Q3 2026 (6 Jul → 28 Sep) is played.
    // On Wed 30 Sep the quarter is complete even though the calendar has not rolled over.
    const mondays = [
      '6 Jul 2026', '13 Jul 2026', '20 Jul 2026', '27 Jul 2026',
      '3 Aug 2026', '10 Aug 2026', '17 Aug 2026', '24 Aug 2026', '31 Aug 2026',
      '7 Sep 2026', '14 Sep 2026', '21 Sep 2026', '28 Sep 2026',
    ]
    const weeks: Week[] = mondays.map((d, i) => makeWeek(27 + i, d, 'played'))
    const result = getCelebratedQuarter(weeks, new Date(2026, 8, 30))
    expect(result).not.toBeNull()
    expect(result!.q).toBe(3)
    expect(result!.year).toBe(2026)
    expect(result!.champion).toBeTruthy()
  })

  it('prefers the newest completed quarter when several are complete', () => {
    const weeks: Week[] = [...playedWeeks(Q1_FRIDAYS), ...playedWeeks(Q2_FRIDAYS, 6)]
    expect(getCelebratedQuarter(weeks, now)!.q).toBe(2)
  })

  it('still returns an older quarter for a dormant league', () => {
    const weeks: Week[] = playedWeeks(Q1_FRIDAYS)
    const result = getCelebratedQuarter(weeks, now)
    expect(result).not.toBeNull()
    expect(result!.q).toBe(1)
  })

  it('skips a newer quarter that finished with fewer than 5 games', () => {
    const weeks: Week[] = [...playedWeeks(Q1_FRIDAYS), ...playedWeeks(Q2_FRIDAYS.slice(0, 4), 6)]
    expect(getCelebratedQuarter(weeks, now)!.q).toBe(1)
  })

  it('returns null while the only quarter with games is still in progress', () => {
    const weeks: Week[] = [
      makeWeek(27, '6 Jul 2026', 'played'),
      makeWeek(28, '13 Jul 2026', 'played'),
    ]
    expect(getCelebratedQuarter(weeks, now)).toBeNull()
  })

  it('returns null when no completed quarter has a champion', () => {
    const weeks: Week[] = [makeWeek(1, '17 Apr 2026', 'cancelled')]
    expect(getCelebratedQuarter(weeks, now)).toBeNull()
  })
})

describe('weekInQuarter', () => {
  it('matches a week to its calendar quarter', () => {
    const week = makeWeek(39, '28 Sep 2026', 'played')
    expect(weekInQuarter(week, 3, 2026)).toBe(true)
    expect(weekInQuarter(week, 4, 2026)).toBe(false)
    expect(weekInQuarter(makeWeek(40, '5 Oct 2026', 'scheduled'), 4, 2026)).toBe(true)
  })
})
