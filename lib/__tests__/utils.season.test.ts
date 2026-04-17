import { deriveSeason, getNextWeekNumber } from '@/lib/utils'
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
