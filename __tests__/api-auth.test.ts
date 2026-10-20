// __tests__/api-auth.test.ts
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

import { requireUser, requireLeagueAdmin } from '@/lib/apiAuth'

const rpc = jest.fn()

function setup(user: { id: string; email?: string } | null, isAdmin = false) {
  rpc.mockResolvedValue({ data: isAdmin, error: null })
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user }, error: null }) },
    rpc,
  })
}

beforeEach(() => rpc.mockReset())

describe('requireUser', () => {
  it('returns the user id and email when signed in', async () => {
    setup({ id: 'u1', email: 'a@example.com' })
    await expect(requireUser()).resolves.toEqual({ user: { id: 'u1', email: 'a@example.com' } })
  })

  it('returns a 401 response when signed out', async () => {
    setup(null)
    const result = await requireUser()
    expect('response' in result && result.response.status).toBe(401)
  })
})

describe('requireLeagueAdmin', () => {
  it('returns the user for a league admin', async () => {
    setup({ id: 'u1', email: 'a@example.com' }, true)
    await expect(requireLeagueAdmin('g1')).resolves.toEqual({ user: { id: 'u1', email: 'a@example.com' } })
    expect(rpc).toHaveBeenCalledWith('is_game_admin', { p_game_id: 'g1' })
  })

  it('returns a 403 response for a member', async () => {
    setup({ id: 'u1' }, false)
    const result = await requireLeagueAdmin('g1')
    expect('response' in result && result.response.status).toBe(403)
  })

  it('returns a 401 response when signed out without calling the RPC', async () => {
    setup(null)
    const result = await requireLeagueAdmin('g1')
    expect('response' in result && result.response.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
})
