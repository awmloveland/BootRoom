// The setup steps after creation are for a league that has not played yet.
// Once it has, the roster and results steps send an admin to the tools built
// for a running league, before they read or render anything else.
import { redirect } from 'next/navigation'
import { getAuthAndRole, getGameBySlug, getWeeks } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { RosterScreen } from '@/components/new-league/RosterScreen'
import { ResultsScreen } from '@/components/new-league/ResultsScreen'

jest.mock('next/navigation', () => ({ redirect: jest.fn(), notFound: jest.fn() }))
jest.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => ({ get: () => null }),
}))
jest.mock('@/lib/fetchers', () => ({ getAuthAndRole: jest.fn(), getGameBySlug: jest.fn(), getWeeks: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

const GAME = { id: 'g1', slug: 'hackney-k7x', name: 'Hackney', day: 'Thursday', kickoff_time: '20:00', created_at: '2026-11-09T19:30:00Z' }
const played = (date: string) => ({ id: date, season: '2026', week: 1, date, status: 'played', teamA: ['A'], teamB: ['B'], winner: 'teamA' })

beforeEach(() => {
  jest.resetAllMocks()
  // Like Next's own redirect, stop the render where it is called.
  ;(redirect as unknown as jest.Mock).mockImplementation((path: string) => { throw new Error(`REDIRECT ${path}`) })
  ;(getGameBySlug as jest.Mock).mockResolvedValue(GAME)
  ;(getAuthAndRole as jest.Mock).mockResolvedValue({ user: { id: 'u1' }, userRole: 'creator' })
})

describe('setup screens on a league that has played', () => {
  beforeEach(() => (getWeeks as jest.Mock).mockResolvedValue([played('05 Nov 2026'), played('12 Nov 2026')]))

  it('sends the roster steps to Settings, Players', async () => {
    await expect(RosterScreen({ slug: GAME.slug })).rejects.toThrow('REDIRECT /hackney-k7x/settings?tab=players')
    expect(createServiceClient).not.toHaveBeenCalled()
  })

  it('sends the results step to the league', async () => {
    await expect(ResultsScreen({ slug: GAME.slug })).rejects.toThrow('REDIRECT /hackney-k7x/results')
    expect(createServiceClient).not.toHaveBeenCalled()
  })
})

describe('setup screens on a league with only imported history', () => {
  it('keeps the results step open', async () => {
    ;(getWeeks as jest.Mock).mockResolvedValue([played('05 Nov 2026')])
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [{ name: 'Will L' }] }) }) }) }),
    })
    await expect(ResultsScreen({ slug: GAME.slug })).resolves.toBeTruthy()
    expect(redirect).not.toHaveBeenCalled()
  })
})
