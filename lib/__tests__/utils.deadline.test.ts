import { isPastDeadline, isAwaitingWindowOver, parseKickoffTime, getMostRecentExpectedGameDate, formatWeekDate } from '@/lib/utils'
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

// ─── parseKickoffTime ─────────────────────────────────────────────────────────

describe('parseKickoffTime', () => {
  it.each([
    ['18:30', { hours: 18, minutes: 30 }],
    ['09:00', { hours: 9, minutes: 0 }],
    ['6:30pm', { hours: 18, minutes: 30 }],
    ['7pm', { hours: 19, minutes: 0 }],
    ['7PM', { hours: 19, minutes: 0 }],
    ['12pm', { hours: 12, minutes: 0 }],
    ['12:15am', { hours: 0, minutes: 15 }],
    [' 18:30 ', { hours: 18, minutes: 30 }],
  ])('reads %p', (value, expected) => {
    expect(parseKickoffTime(value)).toEqual(expected)
  })

  it.each([null, undefined, '', 'evening', '25:00', '18:75', '13pm'])('returns null for %p', (value) => {
    expect(parseKickoffTime(value)).toBeNull()
  })
})

// ─── isPastDeadline with a kick-off time ──────────────────────────────────────

describe('isPastDeadline with a kick-off time', () => {
  // Thursday 9 Apr 2026 game day.
  afterEach(() => { jest.useRealTimers() })
  const at = (h: number, m: number) => jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, h, m))

  it('is false just before kick-off and true just after', () => {
    at(18, 29)
    expect(isPastDeadline('09 Apr 2026', '18:30')).toBe(false)
    at(18, 31)
    expect(isPastDeadline('09 Apr 2026', '18:30')).toBe(true)
  })

  it('accepts the older 12-hour form', () => {
    at(18, 31)
    expect(isPastDeadline('09 Apr 2026', '6:30pm')).toBe(true)
  })

  it('falls back to 20:00 without a kick-off time', () => {
    at(19, 0)
    expect(isPastDeadline('09 Apr 2026')).toBe(false)
    expect(isPastDeadline('09 Apr 2026', null)).toBe(false)
    at(20, 1)
    expect(isPastDeadline('09 Apr 2026', null)).toBe(true)
  })

  it('falls back to 20:00 when the kick-off time cannot be read', () => {
    at(19, 0)
    expect(isPastDeadline('09 Apr 2026', 'evening')).toBe(false)
    at(20, 1)
    expect(isPastDeadline('09 Apr 2026', 'evening')).toBe(true)
  })
})

// ─── isAwaitingWindowOver ─────────────────────────────────────────────────────

describe('isAwaitingWindowOver', () => {
  afterEach(() => { jest.useRealTimers() })

  it('stays open on game day and the day after', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, 23, 59))
    expect(isAwaitingWindowOver('09 Apr 2026')).toBe(false)
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 23, 59))
    expect(isAwaitingWindowOver('09 Apr 2026')).toBe(false)
  })

  it('closes at midnight two days after the game', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 11, 0, 0))
    expect(isAwaitingWindowOver('09 Apr 2026')).toBe(true)
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
