// __tests__/api-games.test.ts
import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { resolveUniqueSlug } from '@/lib/slug'
import { revalidateTag } from 'next/cache'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/slug', () => ({ resolveUniqueSlug: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))

import { POST } from '@/app/api/games/route'

const USER = { id: 'u1', email: 'a@example.com' }
const VALID = { name: 'Hackney Thursdays', day: 'Thursday', kickoff_time: '20:00', location: ' Mabley Green ', bio: '' }
const rpc = jest.fn()

function setup(user: typeof USER | null) {
  ;(createClient as jest.Mock).mockResolvedValue({ auth: mockAuthNamespace(user), rpc })
}

function post(body: unknown) {
  return POST(new Request('http://localhost/api/games', { method: 'POST', body: JSON.stringify(body) }))
}

beforeEach(() => {
  jest.resetAllMocks()
  ;(resolveUniqueSlug as jest.Mock).mockResolvedValue('hackney-thursdays')
})

describe('POST /api/games', () => {
  it('returns 401 when signed out and never calls the RPC', async () => {
    setup(null)
    const res = await post(VALID)
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['a blank name', { ...VALID, name: '  ' }],
    ['a name with no letters or digits', { ...VALID, name: '!!!' }],
    ['a name over 80 characters', { ...VALID, name: 'x'.repeat(81) }],
    ['an unknown day', { ...VALID, day: 'Thu' }],
    ['a 12-hour time', { ...VALID, kickoff_time: '8pm' }],
    ['a missing time', { ...VALID, kickoff_time: undefined }],
  ])('returns 400 for %s', async (_label, body) => {
    setup(USER)
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('creates the league with the resolved slug and returns id and slug', async () => {
    setup(USER)
    rpc.mockResolvedValue({ data: 'game-1', error: null })
    const res = await post(VALID)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ id: 'game-1', slug: 'hackney-thursdays' })
    expect(resolveUniqueSlug).toHaveBeenCalledWith('Hackney Thursdays')
    expect(rpc).toHaveBeenCalledWith('create_game', {
      p_name: 'Hackney Thursdays',
      p_slug: 'hackney-thursdays',
      p_location: 'Mabley Green',
      p_day: 'Thursday',
      p_kickoff_time: '20:00',
      p_bio: null,
    })
    expect(revalidateTag).toHaveBeenCalledWith('league:game-1', expect.anything())
    expect(revalidateTag).toHaveBeenCalledWith('league-slug:hackney-thursdays', expect.anything())
  })

  it('returns 409 slug_taken on a unique violation', async () => {
    setup(USER)
    rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "games_slug_unique"' } })
    const res = await post(VALID)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'slug_taken' })
  })

  it('maps other RPC errors through rpcErrorStatus', async () => {
    setup(USER)
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'profile_not_found' } })
    const res = await post(VALID)
    expect(res.status).toBe(404)
  })
})
