import { computeAllQuarters } from '../sidebar-stats'
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

describe('computeAllQuarters gamesPlayed', () => {
  // Fixed "now" in Q3 2026 so Q1 2026 is a completed quarter.
  const now = new Date(2026, 6, 8)

  it('sets gamesPlayed to the played-week count on completed quarters', () => {
    const weeks: Week[] = [
      makeWeek(1, '10 Jan 2026', 'played'),
      makeWeek(2, '17 Jan 2026', 'played'),
      makeWeek(3, '24 Jan 2026', 'cancelled'),
    ]
    const years = computeAllQuarters(weeks, now)
    const q1 = years
      .find(y => y.year === 2026)!
      .quarters.find(q => q.q === 1)!

    expect(q1.status).toBe('completed')
    expect(q1.gamesPlayed).toBe(2)
  })

  it('leaves gamesPlayed unset on non-completed quarters', () => {
    const years = computeAllQuarters([makeWeek(1, '10 Jan 2026', 'played')], now)
    const q3 = years
      .find(y => y.year === 2026)!
      .quarters.find(q => q.q === 3)!

    expect(q3.status).toBe('in_progress')
    expect(q3.gamesPlayed).toBeUndefined()
  })
})
