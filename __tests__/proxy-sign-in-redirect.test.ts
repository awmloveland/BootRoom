import { NextRequest } from 'next/server'

let claims: { sub: string } | null = null

jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: claims ? { claims } : null, error: null }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
  }),
}))

import { proxy } from '@/proxy'

beforeEach(() => {
  claims = null
})

describe('proxy', () => {
  it('sends signed-out visitors to /sign-in with the full path to return to', async () => {
    const res = await proxy(new NextRequest('https://craft-football.com/craft-football/settings?tab=members'))
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/sign-in')
    expect([...location.searchParams]).toEqual([['redirect', '/craft-football/settings?tab=members']])
  })

  it('sends signed-in users with no profile to /profile-required', async () => {
    claims = { sub: 'u1' }
    const res = await proxy(new NextRequest('https://craft-football.com/settings?tab=leagues'))
    expect(res.headers.get('location')).toBe('https://craft-football.com/profile-required')
  })

  it('leaves public league pages alone', async () => {
    const res = await proxy(new NextRequest('https://craft-football.com/craft-football/results'))
    expect(res.headers.get('location')).toBeNull()
  })
})
