import {
  buildQuarterShareText,
  fetchShareLink,
  fitFontSize,
  leagueShareHref,
  nextLeagueGame,
  quarterRangeLabel,
  quarterShareKey,
  withShareLink,
} from '../utils'
import type { Week } from '../types'

describe('withShareLink', () => {
  const TEXT = '⚽ Test FC\n\n🔗 https://craft-football.com/test-fc'

  it('swaps the final link line', () => {
    expect(withShareLink(TEXT, 'https://craft-football.com/test-fc?result=abc')).toBe(
      '⚽ Test FC\n\n🔗 https://craft-football.com/test-fc?result=abc'
    )
  })

  it('leaves the text alone without a URL', () => {
    expect(withShareLink(TEXT, null)).toBe(TEXT)
    expect(withShareLink(TEXT, undefined)).toBe(TEXT)
  })

  it('leaves text without a link line alone', () => {
    expect(withShareLink('no link', 'https://x')).toBe('no link')
  })
})

describe('leagueShareHref', () => {
  it('adds the token to the current page and drops other share params', () => {
    expect(leagueShareHref('https://craft-football.com/test-fc/results?year=2025&lineup=x#week-2025-3', 'tok.sig'))
      .toBe('https://craft-football.com/test-fc/results?year=2025&league=tok.sig')
  })
})

describe('fitFontSize', () => {
  it('uses the max when the text fits', () => {
    expect(fitFontSize(10, 1000, 104, 64)).toBe(104)
  })

  it('shrinks long text and stops at the floor', () => {
    expect(fitFontSize(20, 1000, 104, 64)).toBe(83)
    expect(fitFontSize(60, 1000, 104, 64)).toBe(64)
  })
})

describe('quarterShareKey and quarterRangeLabel', () => {
  it('keys a quarter by year and number', () => {
    expect(quarterShareKey({ year: 2026, q: 3 })).toBe('2026-3')
  })

  it('labels the dates without the year', () => {
    expect(quarterRangeLabel({ from: '07 Jul 2026', to: '29 Sep 2026' }, 12)).toBe('07 Jul – 29 Sep · 12 games')
    expect(quarterRangeLabel({ from: '07 Jul 2026', to: '07 Jul 2026' }, 1)).toBe('07 Jul – 07 Jul · 1 game')
  })

  it('keeps the quarter share text unchanged', () => {
    const text = buildQuarterShareText({
      leagueName: 'Test FC',
      leagueSlug: 'test-fc',
      quarter: {
        q: 3, year: 2026, quarterLabel: 'Q3 26', seasonName: 'Summer', status: 'completed',
        weekRange: { from: 1, to: 12 }, dateRange: { from: '07 Jul 2026', to: '29 Sep 2026' }, gamesPlayed: 12,
      },
    })
    expect(text.split('\n')[2]).toBe('📅 07 Jul – 29 Sep · 12 games')
  })
})

describe('nextLeagueGame', () => {
  const LEAGUE = { day: null, kickoff_time: '19:00', location: 'Powerleague Shoreditch' }

  it('uses the scheduled week when there is one', () => {
    const scheduled: Week = { id: 's', season: '2099', week: 1, date: '05 Jan 2099', status: 'scheduled', teamA: [], teamB: [], winner: null }
    expect(nextLeagueGame([scheduled], LEAGUE)).toEqual({ date: '05 Jan 2099', kickoffTime: '19:00', location: 'Powerleague Shoreditch' })
  })

  it('is null with no scheduled week and no game day', () => {
    expect(nextLeagueGame([], LEAGUE)).toBeNull()
  })

  it('falls back to the next game day', () => {
    const next = nextLeagueGame([], { ...LEAGUE, day: 'Tuesday' })
    expect(next?.date).toMatch(/^\d{2} \w{3} \d{4}$/)
  })
})

describe('fetchShareLink', () => {
  afterEach(() => {
    ;(global as { fetch?: unknown }).fetch = undefined
  })

  it('posts the request and returns the url', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://x?result=a' }) })
    ;(global as { fetch?: unknown }).fetch = fetchMock
    await expect(fetchShareLink('game-1', { kind: 'result', weekId: 'w' })).resolves.toBe('https://x?result=a')
    expect(fetchMock).toHaveBeenCalledWith('/api/league/game-1/share-link', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ kind: 'result', weekId: 'w' }),
    }))
  })

  it('returns null when the server declines or the request fails', async () => {
    ;(global as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: null }) })
    await expect(fetchShareLink('game-1', { kind: 'quarter', year: 2026, q: 3 })).resolves.toBeNull()
    ;(global as { fetch?: unknown }).fetch = jest.fn().mockRejectedValue(new Error('offline'))
    await expect(fetchShareLink('game-1', { kind: 'quarter', year: 2026, q: 3 })).resolves.toBeNull()
  })
})
