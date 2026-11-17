import { daysAwayLabel, formatKickoffTime, lastGameResult } from '@/lib/utils'
import type { Week } from '@/lib/types'

function played(date: string, winner: Week['winner'], goal_difference: number | null = null): Week {
  return { season: date.slice(-4), week: 1, date, status: 'played', teamA: ['Alice'], teamB: ['Bob'], winner, goal_difference }
}

describe('formatKickoffTime', () => {
  it('formats both stored forms', () => {
    expect(formatKickoffTime('18:30')).toBe('6:30pm')
    expect(formatKickoffTime('19:00')).toBe('7pm')
    expect(formatKickoffTime('10:00')).toBe('10am')
    expect(formatKickoffTime('6:30pm')).toBe('6:30pm')
    expect(formatKickoffTime(null)).toBeNull()
  })
})

describe('daysAwayLabel', () => {
  const now = new Date(2026, 10, 17, 15, 0) // 17 Nov 2026, mid-afternoon

  it('counts whole days from today', () => {
    expect(daysAwayLabel('17 Nov 2026', now)).toBe('Today')
    expect(daysAwayLabel('18 Nov 2026', now)).toBe('Tomorrow')
    expect(daysAwayLabel('22 Nov 2026', now)).toBe('In 5 days')
    expect(daysAwayLabel('16 Nov 2026', now)).toBeNull()
  })
})

describe('lastGameResult', () => {
  it('reads the latest played game from the player\'s side', () => {
    const weeks = [played('05 Nov 2026', 'teamB', 3), played('12 Nov 2026', 'teamA', 2)]
    expect(lastGameResult(weeks, 'Alice')).toEqual({ result: 'W', label: 'Won by 2' })
    expect(lastGameResult(weeks, 'Bob')).toEqual({ result: 'L', label: 'Lost by 2' })
  })

  it('handles draws, missing margins and players with no games', () => {
    expect(lastGameResult([played('12 Nov 2026', 'draw', 0)], 'Alice')).toEqual({ result: 'D', label: 'Drew' })
    expect(lastGameResult([played('12 Nov 2026', 'teamB')], 'Bob')).toEqual({ result: 'W', label: 'Won' })
    expect(lastGameResult([played('12 Nov 2026', 'teamA', 1)], 'Carol')).toBeNull()
  })
})
