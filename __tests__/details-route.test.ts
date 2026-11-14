import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))
const update = jest.fn()
jest.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { slug: 'old-slug' }, error: null }) }) }),
      update: (...args: unknown[]) => { update(...args); return { eq: () => Promise.resolve({ error: null }) } },
    }),
  }),
}))

import { PATCH } from '@/app/api/league/[id]/details/route'

function patch(body: unknown) {
  return new Request('http://localhost/api', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

describe('PATCH /api/league/[id]/details', () => {
  it('keeps the existing slug when the league is renamed', async () => {
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: mockAuthNamespace({ id: 'u1' }),
      rpc: jest.fn().mockResolvedValue({ data: true, error: null }),
    })
    const res = await PATCH(patch({ name: 'Sunday Kickabout' }), { params: Promise.resolve({ id: 'g1' }) })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ ok: true, slug: 'old-slug' })
    expect(update).toHaveBeenCalledWith({ name: 'Sunday Kickabout', location: null, day: null, kickoff_time: null, bio: null })
    expect(update.mock.calls[0][0]).not.toHaveProperty('slug')
  })
})
