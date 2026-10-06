import { getAuthAndRole, getFeatures, getGameBySlug, getPendingBadgeCount, getWeeks } from '@/lib/fetchers'
import { loadSharedLeague, loadSharedLineup, loadSharedQuarter, loadSharedResult } from '@/lib/shareLinksServer'
import type { SharedLeague, SharedLineup, SharedQuarter, SharedResult } from '@/lib/types'

jest.mock('@/lib/fetchers', () => ({
  getGameBySlug: jest.fn(),
  getAuthAndRole: jest.fn(),
  getFeatures: jest.fn(),
  getWeeks: jest.fn(),
  getPendingBadgeCount: jest.fn(),
}))
jest.mock('@/lib/shareLinksServer', () => ({ loadSharedLineup: jest.fn(), loadSharedResult: jest.fn(), loadSharedQuarter: jest.fn(), loadSharedLeague: jest.fn() }))

import { leaguePageMetadata } from '@/lib/metadata'

const LINEUP: SharedLineup = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  week: 13,
  date: '06 Oct 2026',
  format: '6-a-side',
  teamA: ['Marcus Reid'],
  teamB: ['Callum Shaw'],
  location: null,
  kickoffTime: '19:00',
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(getGameBySlug as jest.Mock).mockResolvedValue({ id: 'game-1', name: 'The Boot Room', slug: 'the-boot-room', day: null })
  ;(getAuthAndRole as jest.Mock).mockResolvedValue({ user: null, userRole: null, isAuthenticated: false })
  ;(getFeatures as jest.Mock).mockResolvedValue([])
  ;(getWeeks as jest.Mock).mockResolvedValue([])
  ;(getPendingBadgeCount as jest.Mock).mockResolvedValue(0)
})

describe('leaguePageMetadata with a lineup token', () => {
  it('is unchanged without a token', async () => {
    const meta = await leaguePageMetadata('the-boot-room', 'results')
    expect(meta.openGraph).toBeUndefined()
    expect(meta.title).toBeDefined()
    expect(loadSharedLineup).not.toHaveBeenCalled()
  })

  it('adds the preview tags for a valid token', async () => {
    const plain = await leaguePageMetadata('the-boot-room', 'results')
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(LINEUP)
    const meta = await leaguePageMetadata('the-boot-room', 'results', { lineup: 'tok.sig' })
    expect(loadSharedLineup).toHaveBeenCalledWith('tok.sig')
    expect(meta.title).toEqual(plain.title)
    expect(meta.openGraph?.title).toBe('Week 13 lineups · The Boot Room')
    expect(meta.openGraph?.description).toBe('Tue 06 Oct · 19:00')
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/lineup?t=tok.sig' })])
    expect(meta.twitter).toEqual(expect.objectContaining({ card: 'summary_large_image' }))
  })

  it('works on the Overview tab too', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(LINEUP)
    const meta = await leaguePageMetadata('the-boot-room', 'overview', { lineup: 'tok.sig' })
    expect(meta.openGraph?.title).toBe('Week 13 lineups · The Boot Room')
  })

  it('ignores a token that does not resolve', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(null)
    const meta = await leaguePageMetadata('the-boot-room', 'results', { lineup: 'bad' })
    expect(meta.openGraph).toBeUndefined()
  })

  it('ignores a token for another league', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue({ ...LINEUP, slug: 'other-league' })
    const meta = await leaguePageMetadata('the-boot-room', 'results', { lineup: 'tok.sig' })
    expect(meta.openGraph).toBeUndefined()
  })

  it('ignores tokens on other tabs', async () => {
    const meta = await leaguePageMetadata('the-boot-room', 'players', { lineup: 'tok.sig' })
    expect(meta.openGraph).toBeUndefined()
    expect(loadSharedLineup).not.toHaveBeenCalled()
  })
})

const RESULT: SharedResult = {
  leagueName: 'The Boot Room', slug: 'the-boot-room', week: 41, date: '06 Oct 2026',
  winner: 'teamB', goalDifference: 2, teamA: [], teamB: [], highlights: [],
}
const QUARTER: SharedQuarter = {
  leagueName: 'The Boot Room', slug: 'the-boot-room', year: 2026, q: 3, seasonName: 'Summer',
  dateRange: { from: '07 Jul 2026', to: '29 Sep 2026' }, gamesPlayed: 12,
  podium: [{ name: 'Jordan Hale', points: 24, won: 8, drew: 0 }],
}
const LEAGUE: SharedLeague = { leagueName: 'The Boot Room', slug: 'the-boot-room', gamesPlayed: 142, playerCount: 38, nextGame: null }

describe('leaguePageMetadata with other share tokens', () => {
  it('adds a result preview on Results and Overview', async () => {
    ;(loadSharedResult as jest.Mock).mockResolvedValue(RESULT)
    for (const page of ['results', 'overview'] as const) {
      const meta = await leaguePageMetadata('the-boot-room', page, { result: 'r.tok' })
      expect(meta.openGraph?.title).toBe('Week 41 result · The Boot Room')
      expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/result?t=r.tok' })])
    }
  })

  it('adds a quarter preview on Seasons only', async () => {
    ;(loadSharedQuarter as jest.Mock).mockResolvedValue(QUARTER)
    const honours = await leaguePageMetadata('the-boot-room', 'honours', { quarter: 'q.tok' })
    expect(honours.openGraph?.title).toBe('Q3 2026 champion · The Boot Room')
    const results = await leaguePageMetadata('the-boot-room', 'results', { quarter: 'q.tok' })
    expect(results.openGraph).toBeUndefined()
  })

  it('adds a league preview on any tab', async () => {
    ;(loadSharedLeague as jest.Mock).mockResolvedValue(LEAGUE)
    const meta = await leaguePageMetadata('the-boot-room', 'players', { league: 'l.tok' })
    expect(meta.openGraph?.description).toBe('142 games played')
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/league?t=l.tok' })])
  })

  it('prefers a lineup over a result over a league', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(LINEUP)
    ;(loadSharedResult as jest.Mock).mockResolvedValue(RESULT)
    ;(loadSharedLeague as jest.Mock).mockResolvedValue(LEAGUE)
    const all = await leaguePageMetadata('the-boot-room', 'results', { lineup: 'a', result: 'b', league: 'c' })
    expect(all.openGraph?.title).toBe('Week 13 lineups · The Boot Room')
    const noLineup = await leaguePageMetadata('the-boot-room', 'results', { result: 'b', league: 'c' })
    expect(noLineup.openGraph?.title).toBe('Week 41 result · The Boot Room')
  })

  it('ignores tokens for another league and array params', async () => {
    ;(loadSharedLeague as jest.Mock).mockResolvedValue({ ...LEAGUE, slug: 'other' })
    expect((await leaguePageMetadata('the-boot-room', 'players', { league: 'c' })).openGraph).toBeUndefined()
    expect((await leaguePageMetadata('the-boot-room', 'players', { league: ['c', 'd'] })).openGraph).toBeUndefined()
  })
})
