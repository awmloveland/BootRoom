// __tests__/api-auth.test.ts
import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

import { requireUser, requireLeagueAdmin } from '@/lib/apiAuth'

const rpc = jest.fn()

function setup(user: { id: string; email?: string } | null, isAdmin = false) {
  rpc.mockResolvedValue({ data: isAdmin, error: null })
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: mockAuthNamespace(user),
    rpc,
  })
}

beforeEach(() => rpc.mockReset())

function responseOf(gate: Awaited<ReturnType<typeof requireUser>>) {
  if (!('response' in gate)) throw new Error('expected a response')
  return gate.response
}

describe('requireUser', () => {
  it('returns the user id and email when signed in', async () => {
    setup({ id: 'u1', email: 'a@example.com' })
    await expect(requireUser()).resolves.toEqual({ user: { id: 'u1', email: 'a@example.com' } })
  })

  it('returns a 401 response when signed out', async () => {
    setup(null)
    const res = responseOf(await requireUser())
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
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
    const res = responseOf(await requireLeagueAdmin('g1'))
    expect(res.status).toBe(403)
    await expect(res.json()).resolves.toEqual({ error: 'Forbidden' })
  })

  it('fails closed when the admin RPC errors', async () => {
    setup({ id: 'u1' })
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = responseOf(await requireLeagueAdmin('g1'))
    spy.mockRestore()
    expect(res.status).toBe(403)
  })

  it('returns a null email when the user has none', async () => {
    setup({ id: 'u1' }, true)
    await expect(requireLeagueAdmin('g1')).resolves.toEqual({ user: { id: 'u1', email: null } })
  })

  it('returns a 401 response when signed out without calling the RPC', async () => {
    setup(null)
    const res = responseOf(await requireLeagueAdmin('g1'))
    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
