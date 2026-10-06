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
import { HonoursLoginPrompt } from '@/components/HonoursLoginPrompt'
import { NoAccessState } from '@/components/NoAccessState'

function setup(role: GameRole | null, isAuthenticated = role !== null) {
  ;(getGameBySlug as jest.Mock).mockResolvedValue({ id: 'game-1', name: 'The Boot Room', slug: 'the-boot-room' })
  ;(getAuthAndRole as jest.Mock).mockResolvedValue({ user: null, userRole: role, isAuthenticated })
  ;(getWeeks as jest.Mock).mockResolvedValue([])
  ;(getFeeRows as jest.Mock).mockResolvedValue({ defaultFee: 6, fees: {}, payments: {} })
}

const render = () =>
  AdminPage({ params: Promise.resolve({ slug: 'the-boot-room' }), searchParams: Promise.resolve({}) })

beforeEach(() => jest.clearAllMocks())

describe('/[slug]/admin', () => {
  it('asks signed-out visitors to sign in, without reading any fees', async () => {
    setup(null, false)
    const page = (await render()) as React.ReactElement<{ tab: string }>
    expect(page.type).toBe(HonoursLoginPrompt)
    expect(page.props.tab).toBe('admin')
    expect(notFound).not.toHaveBeenCalled()
    expect(getFeeRows).not.toHaveBeenCalled()
  })

  it.each([['member' as const], [null]])('tells signed-in %s viewers they have no access, without reading any fees', async (role) => {
    setup(role, true)
    const page = (await render()) as React.ReactElement<{ leagueSlug: string; page: string }>
    expect(page.type).toBe(NoAccessState)
    expect(page.props).toMatchObject({ leagueSlug: 'the-boot-room', page: 'Admin' })
    expect(notFound).not.toHaveBeenCalled()
    expect(getFeeRows).not.toHaveBeenCalled()
  })

  it('404s for a league that does not exist', async () => {
    setup('admin')
    ;(getGameBySlug as jest.Mock).mockResolvedValue(null)
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it.each([['admin' as const], ['creator' as const]])('renders for a league %s', async (role) => {
    setup(role)
    await render()
    expect(notFound).not.toHaveBeenCalled()
    expect(getFeeRows).toHaveBeenCalledWith('game-1')
  })
})
