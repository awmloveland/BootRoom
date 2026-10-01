/**
 * @jest-environment jsdom
 */
import { getSeasons, resolveSelectedYear, getLatestResultWeek, writeYearParam } from '@/lib/utils'
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

describe('getSeasons', () => {
  it('returns distinct seasons newest first', () => {
    const weeks = [
      makeWeek({ season: '2025' }),
      makeWeek({ season: '2026' }),
      makeWeek({ season: '2024' }),
      makeWeek({ season: '2026' }),
    ]
    expect(getSeasons(weeks)).toEqual(['2026', '2025', '2024'])
  })

  it('counts weeks of every status', () => {
    const weeks = [
      makeWeek({ season: '2027', status: 'scheduled' }),
      makeWeek({ season: '2026', status: 'cancelled' }),
      makeWeek({ season: '2025', status: 'unrecorded' }),
    ]
    expect(getSeasons(weeks)).toEqual(['2027', '2026', '2025'])
  })

  it('returns an empty list when there are no weeks', () => {
    expect(getSeasons([])).toEqual([])
  })
})

describe('resolveSelectedYear', () => {
  const seasons = ['2026', '2025', '2024']

  it('uses the param when it is one of the seasons', () => {
    expect(resolveSelectedYear(seasons, '2025')).toBe('2025')
  })

  it('falls back to the newest season for a year the league has no games in', () => {
    expect(resolveSelectedYear(seasons, '2019')).toBe('2026')
  })

  it('falls back to the newest season for a malformed param', () => {
    expect(resolveSelectedYear(seasons, 'abc')).toBe('2026')
  })

  it('falls back to the newest season when the param is missing', () => {
    expect(resolveSelectedYear(seasons, undefined)).toBe('2026')
    expect(resolveSelectedYear(seasons, null)).toBe('2026')
  })

  it('uses the current calendar year when the league has no seasons', () => {
    expect(resolveSelectedYear([], '2025')).toBe(String(new Date().getFullYear()))
  })
})

describe('getLatestResultWeek', () => {
  it('returns the latest played or DNF week by date', () => {
    const weeks = [
      makeWeek({ week: 3, date: '15 Jan 2026', status: 'dnf' }),
      makeWeek({ week: 2, date: '08 Jan 2026', status: 'played' }),
    ]
    expect(getLatestResultWeek(weeks)?.week).toBe(3)
  })

  it('ignores scheduled, cancelled and unrecorded weeks', () => {
    const weeks = [
      makeWeek({ week: 5, date: '29 Jan 2026', status: 'scheduled' }),
      makeWeek({ week: 4, date: '22 Jan 2026', status: 'cancelled' }),
      makeWeek({ week: 3, date: '15 Jan 2026', status: 'unrecorded' }),
      makeWeek({ week: 2, date: '08 Jan 2026', status: 'played' }),
    ]
    expect(getLatestResultWeek(weeks)?.week).toBe(2)
  })

  it('returns null when there is no result', () => {
    expect(getLatestResultWeek([makeWeek({ status: 'scheduled' })])).toBeNull()
  })
})

describe('writeYearParam', () => {
  it('sets ?year for a past year', () => {
    window.history.replaceState(null, '', '/craft-football/results')
    writeYearParam('2025', '2026')
    expect(window.location.pathname).toBe('/craft-football/results')
    expect(window.location.search).toBe('?year=2025')
  })

  it('removes ?year for the default year', () => {
    window.history.replaceState(null, '', '/craft-football/results?year=2025')
    writeYearParam('2026', '2026')
    expect(window.location.search).toBe('')
  })

  it('keeps other query params', () => {
    window.history.replaceState(null, '', '/craft-football/results?foo=1')
    writeYearParam('2025', '2026')
    const params = new URLSearchParams(window.location.search)
    expect(params.get('foo')).toBe('1')
    expect(params.get('year')).toBe('2025')
  })
})
