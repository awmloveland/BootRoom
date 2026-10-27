import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { revalidateTag } from 'next/cache'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))

import { PUT } from '@/app/api/league/[id]/roster/route'

const LEAGUE = 'g1'
const USER = { id: 'u1', email: 'a@example.com' }
const rpc = jest.fn()

function setup(user: typeof USER | null, isAdmin = true) {
  rpc.mockImplementation((name: string) =>
    Promise.resolve(name === 'is_game_admin' ? { data: isAdmin, error: null } : { data: null, error: null }),
  )
  ;(createClient as jest.Mock).mockResolvedValue({ auth: mockAuthNamespace(user), rpc })
}

function put(body: unknown) {
  return PUT(
    new Request('http://localhost/api', { method: 'PUT', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: LEAGUE }) },
  )
}

const ALICE = { name: 'Alice', strength: 'above', mentality: 'attacking' }
const BOB = { name: ' Bob ', strength: 'average', mentality: 'goalkeeper' }

beforeEach(() => jest.resetAllMocks())

describe('PUT /api/league/[id]/roster', () => {
  it('returns 401 when signed out', async () => {
    setup(null)
    expect((await put({ players: [ALICE] })).status).toBe(401)
  })

  it('returns 403 for a non-admin', async () => {
    setup(USER, false)
    expect((await put({ players: [ALICE] })).status).toBe(403)
    expect(rpc).not.toHaveBeenCalledWith('promote_roster', expect.anything())
  })

  it.each([
    ['no list', {}],
    ['an empty list', { players: [] }],
    ['a bad entry', { players: [{ name: 'X', strength: 'huge', mentality: 'balanced' }] }],
    ['a duplicate name', { players: [ALICE, { ...ALICE, name: 'alice' }] }],
  ])('returns 400 for %s', async (_label, body) => {
    setup(USER)
    expect((await put(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalledWith('promote_roster', expect.anything())
  })

  it('upserts the batch in one promote_roster call and revalidates', async () => {
    setup(USER)
    const res = await put({ players: [ALICE, BOB] })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, count: 2 })
    expect(rpc).toHaveBeenCalledWith('promote_roster', {
      p_game_id: LEAGUE,
      p_entries: [
        { name: 'Alice', rating: 3, mentality: 'attacking', goalkeeper: false },
        { name: 'Bob', rating: 2, mentality: 'goalkeeper', goalkeeper: true },
      ],
    })
    expect(revalidateTag).toHaveBeenCalledWith('league:g1', expect.anything())
  })

  it('maps an RPC error through rpcErrorStatus', async () => {
    setup(USER)
    rpc.mockImplementation((name: string) =>
      Promise.resolve(name === 'is_game_admin' ? { data: true, error: null } : { data: null, error: { message: 'Access denied' } }),
    )
    expect((await put({ players: [ALICE] })).status).toBe(403)
  })
})
