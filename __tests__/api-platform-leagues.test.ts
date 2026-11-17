// __tests__/api-platform-leagues.test.ts
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { revalidateTag } from 'next/cache'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))

import { DELETE } from '@/app/api/platform/leagues/[id]/route'

const ADMIN = { id: 'admin-1', email: 'admin@example.com' }
const OTHER = { id: 'user-2', email: 'other@example.com' }
const SLUG = 'thursday-night-fives-k7x'
const rpc = jest.fn()

/** Signs `user` in and makes the games look-up return `game`. */
function setup(user: typeof ADMIN | null, game: { slug: string } | null = { slug: SLUG }) {
  ;(createClient as jest.Mock).mockResolvedValue({ auth: mockAuthNamespace(user) })
  const query: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq']) query[m] = jest.fn(() => query)
  query.maybeSingle = jest.fn().mockResolvedValue({ data: game, error: null })
  ;(createServiceClient as jest.Mock).mockReturnValue({ from: jest.fn(() => query), rpc })
}

function del(body: unknown) {
  return DELETE(
    new Request('http://localhost/api/platform/leagues/g1', { method: 'DELETE', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: 'g1' }) },
  )
}

const saved = process.env.PLATFORM_ADMIN_IDS
beforeEach(() => {
  jest.resetAllMocks()
  process.env.PLATFORM_ADMIN_IDS = ADMIN.id
})
afterAll(() => {
  if (saved === undefined) delete process.env.PLATFORM_ADMIN_IDS
  else process.env.PLATFORM_ADMIN_IDS = saved
})

describe('DELETE /api/platform/leagues/[id]', () => {
  it.each([
    ['a signed-out caller', null],
    ['a signed-in user who is not a platform admin', OTHER],
  ])('answers 404 to %s without touching the database', async (_label, user) => {
    setup(user)
    const res = await del({ confirm: SLUG })
    expect(res.status).toBe(404)
    expect(createServiceClient).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 404 to everyone while the variable is unset', async () => {
    delete process.env.PLATFORM_ADMIN_IDS
    setup(ADMIN)
    const res = await del({ confirm: SLUG })
    expect(res.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('answers 404 for a league that does not exist', async () => {
    setup(ADMIN, null)
    const res = await del({ confirm: SLUG })
    expect(res.status).toBe(404)
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    ['the wrong address', { confirm: 'thursday-night-fives' }],
    ['no address', {}],
    ['no body', null],
  ])('answers 400 for %s and deletes nothing', async (_label, body) => {
    setup(ADMIN)
    const res = await del(body)
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('deletes through the database function once and revalidates the league', async () => {
    setup(ADMIN)
    rpc.mockResolvedValue({ data: null, error: null })
    const res = await del({ confirm: SLUG })
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('platform_delete_league', { p_game_id: 'g1', p_actor: ADMIN.id })
    expect(revalidateTag).toHaveBeenCalledWith('league:g1', { expire: 0 })
    expect(revalidateTag).toHaveBeenCalledWith(`league-slug:${SLUG}`, { expire: 0 })
  })

  it('keeps database detail out of a failure and does not revalidate', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    setup(ADMIN)
    rpc.mockResolvedValue({ data: null, error: { message: 'relation "platform_audit_log" does not exist' } })
    const res = await del({ confirm: SLUG })
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Could not delete the league. Try again.' })
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
