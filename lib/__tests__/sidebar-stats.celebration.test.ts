import { findNewlyCompletedQuarter, getCelebratedQuarter } from '../sidebar-stats'
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

describe('findNewlyCompletedQuarter', () => {
  // Fixed "now" in Q3 2026 so Q2 2026 is calendar-past.
  const now = new Date(2026, 6, 8)

  it('returns the quarter when recording its last outstanding week completes it', () => {
    const before: Week[] = [
      makeWeek(1, '10 Apr 2026', 'played'),
      makeWeek(2, '17 Apr 2026', 'scheduled'), // outstanding → Q2 not yet completed
    ]
    const after: Week[] = [
      makeWeek(1, '10 Apr 2026', 'played'),
      makeWeek(2, '17 Apr 2026', 'played'),  // now settled → Q2 completes
    ]
    const result = findNewlyCompletedQuarter(before, after, now)
    expect(result).not.toBeNull()
    expect(result!.q).toBe(2)
    expect(result!.year).toBe(2026)
    expect(result!.champion).toBeTruthy()
  })

  it('returns null when the recorded game is in the current (in-progress) quarter', () => {
    const before: Week[] = [makeWeek(1, '3 Jul 2026', 'scheduled')]
    const after: Week[] = [makeWeek(1, '3 Jul 2026', 'played')]
    expect(findNewlyCompletedQuarter(before, after, now)).toBeNull()
  })

  it('returns null when no quarter status changed', () => {
    const before: Week[] = [makeWeek(1, '10 Apr 2026', 'played')]
    const after: Week[] = [
      makeWeek(1, '10 Apr 2026', 'played'),
      makeWeek(2, '17 Apr 2026', 'played'),
    ]
    // Q2 was already completed in `before` (all settled, one played) → not newly completed
    expect(findNewlyCompletedQuarter(before, after, now)).toBeNull()
  })
})
