import { redirect } from 'next/navigation'
import { getUser } from '@/lib/fetchers'

jest.mock('next/navigation', () => ({
  redirect: jest.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`)
  }),
}))
jest.mock('@/lib/fetchers', () => ({ getUser: jest.fn() }))

import SignInPage from '@/app/sign-in/page'
import { SignInPrompt } from '@/components/SignInPrompt'

const render = (params: Record<string, string>) =>
  SignInPage({ searchParams: Promise.resolve(params) }) as Promise<React.ReactElement<{ redirect: string; error: string | null }>>

beforeEach(() => jest.clearAllMocks())

describe('/sign-in', () => {
  it('shows the sign-in prompt, returning to the requested page', async () => {
    ;(getUser as jest.Mock).mockResolvedValue(null)
    const page = await render({ redirect: '/craft-football/settings?tab=members' })
    expect(page.type).toBe(SignInPrompt)
    expect(page.props).toEqual({ redirect: '/craft-football/settings?tab=members', error: null })
  })

  it('sends someone already signed in straight on', async () => {
    ;(getUser as jest.Mock).mockResolvedValue({ id: 'u1' })
    await expect(render({ redirect: '/craft-football/settings' })).rejects.toThrow('NEXT_REDIRECT /craft-football/settings')
    expect(redirect).toHaveBeenCalledWith('/craft-football/settings')
  })

  it('never redirects off the site', async () => {
    ;(getUser as jest.Mock).mockResolvedValue(null)
    expect((await render({ redirect: '//evil.example' })).props.redirect).toBe('/')
  })

  it('explains a failed sign-in link', async () => {
    ;(getUser as jest.Mock).mockResolvedValue(null)
    const page = await render({ error: 'auth_callback' })
    expect(page.props.error).toMatch(/sign-in link did not work/)
    expect((await render({ error: 'whatever' })).props.error).toBeNull()
  })
})
