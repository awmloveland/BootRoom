import { NextRequest } from 'next/server'

type CookieMethods = {
  getAll: () => { name: string; value: string }[]
  setAll: (cookies: { name: string; value: string; options: Record<string, unknown> }[], headers: Record<string, string>) => void
}

let claims: { sub: string } | null = null
// Set to simulate an expired access token: getClaims refreshes it and hands
// the new session to setAll before resolving, as @supabase/ssr does.
let refreshedSession: string | null = null

const createServerClient = jest.fn((_url: string, _key: string, { cookies }: { cookies: CookieMethods }) => ({
  auth: {
    getClaims: async () => {
      if (refreshedSession) {
        cookies.setAll(
          [{ name: 'sb-ref-auth-token', value: refreshedSession, options: { path: '/' } }],
          { 'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0', Expires: '0', Pragma: 'no-cache' },
        )
      }
      return { data: claims ? { claims } : null, error: null }
    },
  },
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
}))

jest.mock('@supabase/ssr', () => ({
  createServerClient: (...args: Parameters<typeof createServerClient>) => createServerClient(...args),
}))

import { proxy } from '@/proxy'

function signedInRequest(url: string) {
  return new NextRequest(url, { headers: { cookie: 'sb-ref-auth-token=expired' } })
}

beforeEach(() => {
  claims = null
  refreshedSession = null
  createServerClient.mockClear()
})

describe('proxy', () => {
  it('sends signed-out visitors to /sign-in with the full path to return to', async () => {
    const res = await proxy(new NextRequest('https://craft-football.com/craft-football/settings?tab=members'))
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/sign-in')
    expect([...location.searchParams]).toEqual([['redirect', '/craft-football/settings?tab=members']])
  })

  it('sends signed-out visitors on /new to /sign-in', async () => {
    const res = await proxy(new NextRequest('https://craft-football.com/new'))
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/sign-in')
    expect([...location.searchParams]).toEqual([['redirect', '/new']])
  })

  it('does not guard a league slug that merely starts with "new"', async () => {
    const res = await proxy(new NextRequest('https://craft-football.com/newcastle-fives'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('sends signed-in users with no profile to /profile-required', async () => {
    claims = { sub: 'u1' }
    const res = await proxy(signedInRequest('https://craft-football.com/settings?tab=leagues'))
    expect(res.headers.get('location')).toBe('https://craft-football.com/profile-required')
  })

  it('keeps a refreshed session on the redirect to /profile-required', async () => {
    claims = { sub: 'u1' }
    refreshedSession = 'fresh'
    const res = await proxy(signedInRequest('https://craft-football.com/settings'))
    expect(res.headers.get('location')).toBe('https://craft-football.com/profile-required')
    expect(res.cookies.get('sb-ref-auth-token')?.value).toBe('fresh')
  })

  it('leaves public league pages alone', async () => {
    const res = await proxy(new NextRequest('https://craft-football.com/craft-football/results'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('does not build a Supabase client for visitors with no session cookie', async () => {
    await proxy(new NextRequest('https://craft-football.com/craft-football/results'))
    expect(createServerClient).not.toHaveBeenCalled()
  })

  // Server components cannot write cookies, so a session they refresh is lost
  // and every request, prefetches included, refreshes the same token again.
  // The proxy refreshes it once, returns it to the browser and hands it to
  // this request's render.
  it('refreshes an expired session on league pages and passes it on', async () => {
    claims = { sub: 'u1' }
    refreshedSession = 'fresh'
    const res = await proxy(signedInRequest('https://craft-football.com/craft-football/results'))

    expect(res.headers.get('location')).toBeNull()
    expect(res.cookies.get('sb-ref-auth-token')?.value).toBe('fresh')
    expect(res.headers.get('cache-control')).toContain('no-store')
    // Forwarded request headers for the render.
    expect(res.headers.get('x-middleware-request-cookie')).toContain('sb-ref-auth-token=fresh')
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/craft-football/results')
  })

  it('passes a still-valid session through untouched', async () => {
    claims = { sub: 'u1' }
    const res = await proxy(signedInRequest('https://craft-football.com/craft-football/results'))
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('x-middleware-request-x-pathname')).toBe('/craft-football/results')
  })
})
