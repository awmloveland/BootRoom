import { notFound } from 'next/navigation'
import { getGameBySlug, getAuthAndRole } from '@/lib/fetchers'

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirect: jest.fn(),
}))
jest.mock('next/headers', () => ({ headers: jest.fn() }))
jest.mock('@/lib/fetchers', () => ({ getGameBySlug: jest.fn(), getGame: jest.fn(), getAuthAndRole: jest.fn() }))

import LeagueLayout from '@/app/[slug]/layout'

const render = () => LeagueLayout({ children: 'page', params: Promise.resolve({ slug: 'the-boot-room' }) })

beforeEach(() => jest.clearAllMocks())

describe('/[slug] layout', () => {
  it('404s when no league has the slug', async () => {
    ;(getGameBySlug as jest.Mock).mockResolvedValue(null)
    await expect(render()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  // error.tsx only wraps what this layout renders, so a read that fails here
  // has to be rethrown by the page for visitors to see "Could not load the league".
  it('renders the page when the league read fails, so the page shows the error', async () => {
    ;(getGameBySlug as jest.Mock).mockRejectedValue(new Error('game read failed: upstream timeout'))
    const layout = (await render()) as React.ReactElement<{ children: React.ReactNode }>
    expect(layout.props.children).toBe('page')
    expect(notFound).not.toHaveBeenCalled()
    expect(getAuthAndRole).not.toHaveBeenCalled()
  })
})
