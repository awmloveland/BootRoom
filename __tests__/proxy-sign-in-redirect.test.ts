import { NextRequest } from 'next/server'

jest.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }),
}))

import { proxy } from '@/proxy'

describe('proxy', () => {
  it('sends signed-out visitors to /sign-in with the full path to return to', async () => {
    const res = await proxy(new NextRequest('https://craft-football.com/craft-football/settings?tab=members'))
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/sign-in')
    expect([...location.searchParams]).toEqual([['redirect', '/craft-football/settings?tab=members']])
  })

  it('leaves public league pages alone', async () => {
    const res = await proxy(new NextRequest('https://craft-football.com/craft-football/results'))
    expect(res.headers.get('location')).toBeNull()
  })
})
