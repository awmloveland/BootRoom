import { notFound } from 'next/navigation'
import { getAuthAndRole, getGameBySlug, getWeeks } from '@/lib/fetchers'
import { getFeeRows } from '@/lib/feesServer'
import type { GameRole } from '@/lib/types'

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))
jest.mock('@/lib/fetchers', () => ({ getGameBySlug: jest.fn(), getAuthAndRole: jest.fn(), getWeeks: jest.fn() }))
jest.mock('@/lib/feesServer', () => ({ getFeeRows: jest.fn() }))
jest.mock('@/lib/metadata', () => ({ leaguePageMetadata: jest.fn() }))

import AdminPage from '@/app/[slug]/(tabs)/admin/page'

function setup(role: GameRole | null) {
  ;(getGameBySlug as jest.Mock).mockResolvedValue({ id: 'game-1', name: 'The Boot Room', slug: 'the-boot-room' })
  ;(getAuthAndRole as jest.Mock).mockResolvedValue({ user: null, userRole: role, isAuthenticated: role !== null })
  ;(getWeeks as jest.Mock).mockResolvedValue([])
  ;(getFeeRows as jest.Mock).mockResolvedValue({ defaultFee: 6, fees: {}, payments: {} })
}

const render = () =>
  AdminPage({ params: Promise.resolve({ slug: 'the-boot-room' }), searchParams: Promise.resolve({}) })

beforeEach(() => jest.clearAllMocks())

describe('/[slug]/admin', () => {
  it.each([['member' as const], [null]])('404s for %s viewers without reading any fees', async (role) => {
    setup(role)
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
    expect(getFeeRows).not.toHaveBeenCalled()
  })

  it.each([['admin' as const], ['creator' as const]])('renders for a league %s', async (role) => {
    setup(role)
    await render()
    expect(notFound).not.toHaveBeenCalled()
    expect(getFeeRows).toHaveBeenCalledWith('game-1')
  })
})
