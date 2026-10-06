import { getAuthAndRole, getFeatures, getGameBySlug, getPendingBadgeCount, getWeeks } from '@/lib/fetchers'
import { loadSharedLineup } from '@/lib/shareLinksServer'
import type { SharedLineup } from '@/lib/types'

jest.mock('@/lib/fetchers', () => ({
  getGameBySlug: jest.fn(),
  getAuthAndRole: jest.fn(),
  getFeatures: jest.fn(),
  getWeeks: jest.fn(),
  getPendingBadgeCount: jest.fn(),
}))
jest.mock('@/lib/shareLinksServer', () => ({ loadSharedLineup: jest.fn() }))

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
    const meta = await leaguePageMetadata('the-boot-room', 'results', 'tok.sig')
    expect(loadSharedLineup).toHaveBeenCalledWith('tok.sig')
    expect(meta.title).toEqual(plain.title)
    expect(meta.openGraph?.title).toBe('Week 13 lineups · The Boot Room')
    expect(meta.openGraph?.description).toBe('Tue 06 Oct · 19:00')
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/lineup?t=tok.sig' })])
    expect(meta.twitter).toEqual(expect.objectContaining({ card: 'summary_large_image' }))
  })

  it('works on the Overview tab too', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(LINEUP)
    const meta = await leaguePageMetadata('the-boot-room', 'overview', 'tok.sig')
    expect(meta.openGraph?.title).toBe('Week 13 lineups · The Boot Room')
  })

  it('ignores a token that does not resolve', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(null)
    const meta = await leaguePageMetadata('the-boot-room', 'results', 'bad')
    expect(meta.openGraph).toBeUndefined()
  })

  it('ignores a token for another league', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue({ ...LINEUP, slug: 'other-league' })
    const meta = await leaguePageMetadata('the-boot-room', 'results', 'tok.sig')
    expect(meta.openGraph).toBeUndefined()
  })

  it('ignores tokens on other tabs', async () => {
    const meta = await leaguePageMetadata('the-boot-room', 'players', 'tok.sig')
    expect(meta.openGraph).toBeUndefined()
    expect(loadSharedLineup).not.toHaveBeenCalled()
  })
})
