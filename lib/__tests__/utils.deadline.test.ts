import { isPastDeadline, getMostRecentExpectedGameDate, formatWeekDate } from '@/lib/utils'
import type { Week } from '@/lib/types'

// ─── isPastDeadline ───────────────────────────────────────────────────────────

describe('isPastDeadline', () => {
  it('returns true for a date clearly in the past', () => {
    expect(isPastDeadline('01 Jan 2020')).toBe(true)
  })

  it('returns false for a date clearly in the future', () => {
    expect(isPastDeadline('01 Jan 2099')).toBe(false)
  })

  it('returns false for today before 20:00 (mocked)', () => {
    const today = new Date()
    today.setHours(10, 0, 0, 0) // 10am
    const spy = jest.spyOn(Date, 'now').mockReturnValue(today.getTime())
    const todayStr = formatWeekDate(new Date())
    expect(isPastDeadline(todayStr)).toBe(false)
    spy.mockRestore()
  })

  it('returns true for today after 20:00 (mocked)', () => {
    const today = new Date()
    today.setHours(21, 0, 0, 0) // 9pm
    const spy = jest.spyOn(Date, 'now').mockReturnValue(today.getTime())
    const todayStr = formatWeekDate(new Date())
    expect(isPastDeadline(todayStr)).toBe(true)
    spy.mockRestore()
  })
})

// ─── getMostRecentExpectedGameDate ────────────────────────────────────────────

function makeWeek(overrides: Partial<Week> & { date: string }): Week {
  return {
    season: '2026',
    week: 1,
    status: 'played',
    teamA: [],
    teamB: [],
    winner: null,
    ...overrides,
  }
}

describe('getMostRecentExpectedGameDate', () => {
  it('returns null when no leagueDayIndex and no played weeks', () => {
    expect(getMostRecentExpectedGameDate([], undefined)).toBeNull()
  })

  it('uses leagueDayIndex to find the most recent past occurrence', () => {
    // With explicit leagueDayIndex=4 (Thursday), result should be a Thursday in the past or today
    const result = getMostRecentExpectedGameDate([], 4)
    expect(result).not.toBeNull()
    const parts = result!.split(' ')
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const date = new Date(parseInt(parts[2]), MONTHS.indexOf(parts[1]), parseInt(parts[0]))
    expect(date.getDay()).toBe(4) // Thursday
    // Result is today or in the past (today is included when today is the game day)
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0)
    expect(date.getTime()).toBeLessThanOrEqual(todayMidnight.getTime())
  })

  it('returns the date in DD MMM YYYY format', () => {
    const result = getMostRecentExpectedGameDate([], 3) // Wednesday
    expect(result).not.toBeNull()
    expect(result!).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/)
  })

  it('infers day-of-week from most recent played week when no leagueDayIndex', () => {
    // Thursday played week
    const weeks = [makeWeek({ date: '19 Mar 2026', week: 1 })] // Thursday
    const result = getMostRecentExpectedGameDate(weeks, undefined)
    expect(result).not.toBeNull()
    const parts = result!.split(' ')
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const date = new Date(parseInt(parts[2]), MONTHS.indexOf(parts[1]), parseInt(parts[0]))
    expect(date.getDay()).toBe(4) // Thursday
  })
})
