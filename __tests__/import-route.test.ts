import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { revalidateTag } from 'next/cache'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))

import { POST } from '@/app/api/league/[id]/weeks/import/route'

const LEAGUE = 'g1'
const USER = { id: 'u1', email: 'a@example.com' }
const rpc = jest.fn()

function setup(user: typeof USER | null, isAdmin = true, result: { data: unknown; error: { message: string } | null } = { data: 2, error: null }) {
  rpc.mockImplementation((name: string) => Promise.resolve(name === 'is_game_admin' ? { data: isAdmin, error: null } : result))
  ;(createClient as jest.Mock).mockResolvedValue({ auth: mockAuthNamespace(user), rpc })
}

function post(body: unknown) {
  return POST(new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id: LEAGUE }) })
}

const GAME = { date: '08 Oct 2026', teamA: ['Alice', 'Bob'], teamB: ['Carl', 'Dan'], winner: 'teamA', goalDifference: 2 }
const DRAW = { ...GAME, date: '01 Oct 2026', winner: 'draw', goalDifference: 0 }

beforeEach(() => jest.resetAllMocks())

describe('POST /api/league/[id]/weeks/import', () => {
  it('returns 401 signed out', async () => {
    setup(null)
    expect((await post({ games: [GAME] })).status).toBe(401)
  })

  it('returns 403 for a non-admin', async () => {
    setup(USER, false)
    expect((await post({ games: [GAME] })).status).toBe(403)
  })

  it.each([
    ['no list', {}],
    ['an empty list', { games: [] }],
    ['a bad date', { games: [{ ...GAME, date: '2026-10-08' }] }],
    ['an empty side', { games: [{ ...GAME, teamB: [] }] }],
    ['a blank name', { games: [{ ...GAME, teamA: ['Alice', ' '] }] }],
    ['a name twice on one side', { games: [{ ...GAME, teamA: ['Alice', 'Alice'] }] }],
    ['an unknown winner', { games: [{ ...GAME, winner: 'A' }] }],
    ['a fractional margin', { games: [{ ...GAME, goalDifference: 1.5 }] }],
  ])('returns 400 for %s', async (_label, body) => {
    setup(USER)
    expect((await post(body)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalledWith('import_weeks', expect.anything())
  })

  it('imports the batch in one RPC call and revalidates', async () => {
    setup(USER)
    const res = await post({ games: [GAME, DRAW] })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, count: 2 })
    expect(rpc).toHaveBeenCalledWith('import_weeks', {
      p_game_id: LEAGUE,
      p_weeks: [
        { date: '08 Oct 2026', team_a: ['Alice', 'Bob'], team_b: ['Carl', 'Dan'], winner: 'teamA', goal_difference: 2 },
        { date: '01 Oct 2026', team_a: ['Alice', 'Bob'], team_b: ['Carl', 'Dan'], winner: 'draw', goal_difference: 0 },
      ],
    })
    expect(revalidateTag).toHaveBeenCalledWith('league:g1', expect.anything())
  })

  it('maps already_exists to 409 and invalid_* to 400', async () => {
    setup(USER, true, { data: null, error: { message: 'already_exists' } })
    const dup = await post({ games: [GAME] })
    expect(dup.status).toBe(409)
    await expect(dup.json()).resolves.toEqual({ error: 'You already have a game on one of those dates' })
    setup(USER, true, { data: null, error: { message: 'invalid_margin' } })
    expect((await post({ games: [GAME] })).status).toBe(400)
  })
})
