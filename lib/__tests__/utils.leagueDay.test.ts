import { dayNameToIndex, getNextMatchDate, nextOccurrenceAfterToday, formatWeekDate } from '@/lib/utils'
import type { Week } from '@/lib/types'

// ─── dayNameToIndex ───────────────────────────────────────────────────────────

describe('dayNameToIndex', () => {
  it('maps all seven day names to correct indices', () => {
    expect(dayNameToIndex('Sunday')).toBe(0)
    expect(dayNameToIndex('Monday')).toBe(1)
    expect(dayNameToIndex('Tuesday')).toBe(2)
    expect(dayNameToIndex('Wednesday')).toBe(3)
    expect(dayNameToIndex('Thursday')).toBe(4)
    expect(dayNameToIndex('Friday')).toBe(5)
    expect(dayNameToIndex('Saturday')).toBe(6)
  })

  it('returns null for null input', () => {
    expect(dayNameToIndex(null)).toBeNull()
  })

  it('returns null for unrecognised string', () => {
    expect(dayNameToIndex('Blursday')).toBeNull()
  })
})

// ─── getNextMatchDate with leagueDayIndex ─────────────────────────────────────

describe('getNextMatchDate — with leagueDayIndex', () => {
  function makePlayedWeek(date: string): Week {
    return { season: '2026', week: 1, date, status: 'played', teamA: [], teamB: [], winner: null }
  }

  it('uses leagueDayIndex (Thursday=4) to find next Thursday', () => {
    const weeks = [makePlayedWeek('07 Jan 2026')] // Wednesday
    const result = getNextMatchDate(weeks, 4)
    const parts = result.split(' ')
    const date = new Date(parseInt(parts[2]), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[1]), parseInt(parts[0]))
    expect(date.getDay()).toBe(4) // Thursday
  })

  it('uses leagueDayIndex=0 (Sunday) correctly — falsy guard test', () => {
    // Sunday = 0, which is falsy — must use !== undefined guard, not truthiness check
    const weeks: Week[] = []
    const result = getNextMatchDate(weeks, 0)
    const parts = result.split(' ')
    const date = new Date(parseInt(parts[2]), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[1]), parseInt(parts[0]))
    expect(date.getDay()).toBe(0) // Sunday
  })

  it('falls back to inference when leagueDayIndex is undefined', () => {
    // Wednesday played week — should infer Wednesday
    const weeks = [makePlayedWeek('07 Jan 2026')] // Wednesday
    const result = getNextMatchDate(weeks, undefined)
    const parts = result.split(' ')
    const date = new Date(parseInt(parts[2]), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[1]), parseInt(parts[0]))
    expect(date.getDay()).toBe(3) // Wednesday
  })
})

// ─── nextOccurrenceAfterToday ─────────────────────────────────────────────────

describe('nextOccurrenceAfterToday', () => {
  it('returns a date string in DD MMM YYYY format', () => {
    const result = nextOccurrenceAfterToday(3) // Wednesday
    expect(result).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/)
  })

  it('returns a date whose day-of-week matches dayIndex', () => {
    for (let i = 0; i < 7; i++) {
      const result = nextOccurrenceAfterToday(i)
      const parts = result.split(' ')
      const date = new Date(parseInt(parts[2]), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[1]), parseInt(parts[0]))
      expect(date.getDay()).toBe(i)
    }
  })

  it('never returns today — always at least tomorrow', () => {
    const today = new Date()
    const todayDow = today.getDay()
    const result = nextOccurrenceAfterToday(todayDow)
    const parts = result.split(' ')
    const date = new Date(parseInt(parts[2]), ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(parts[1]), parseInt(parts[0]))
    today.setHours(0, 0, 0, 0)
    expect(date.getTime()).toBeGreaterThan(today.getTime())
  })
})
