import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

import { POST as createInvite } from '@/app/api/invites/route'

const rpc = jest.fn()

function setup(user: { id: string; email?: string } | null, isAdmin = false) {
  rpc.mockImplementation(async (name: string) => {
    if (name === 'is_game_admin') return { data: isAdmin, error: null }
    return { data: null, error: null }
  })
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: mockAuthNamespace(user),
    rpc,
    from: jest.fn(),
  })
}

function post(body: unknown) {
  return new Request('http://localhost/api/invites', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => rpc.mockReset())

describe('POST /api/invites', () => {
  it('answers 401 to a signed-out caller before validating the body', async () => {
    setup(null)
    const res = await createInvite(post({}))
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 400 to a signed-in caller who omits gameId', async () => {
    setup({ id: 'u1', email: 'a@example.com' })
    const res = await createInvite(post({}))
    expect(res.status).toBe(400)
  })

  it('answers 403 to a member who is not an admin', async () => {
    setup({ id: 'u1', email: 'a@example.com' }, false)
    const res = await createInvite(post({ gameId: 'g1', role: 'member' }))
    expect(res.status).toBe(403)
    expect(rpc).toHaveBeenCalledWith('is_game_admin', { p_game_id: 'g1' })
  })
})
