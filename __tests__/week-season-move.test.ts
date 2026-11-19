import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'

jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

import { PATCH as reschedule } from '@/app/api/league/[id]/weeks/[weekId]/route'
import { PATCH as editWeek } from '@/app/api/league/[id]/weeks/[weekId]/edit/route'

type Row = { id: string; game_id: string; season: string; week: number; date: string; status: string }

let rows: Row[]

/** A tiny in-memory `weeks` table: eq filters, highest week first, update on await. */
function weeksTable() {
  const filters: [keyof Row, unknown][] = []
  let patch: Partial<Row> | null = null
  const matching = () => rows.filter((r) => filters.every(([k, v]) => r[k] === v))
  const query = {
    select: () => query,
    order: () => query,
    limit: () => query,
    eq: (k: keyof Row, v: unknown) => (filters.push([k, v]), query),
    update: (p: Partial<Row>) => ((patch = p), query),
    maybeSingle: async () => ({ data: matching().sort((a, b) => b.week - a.week)[0] ?? null, error: null }),
    then: (resolve: (r: { error: null }) => void) => {
      matching().forEach((r) => Object.assign(r, patch))
      resolve({ error: null })
    },
  }
  return query
}

function json(body: unknown) {
  return new Request('http://localhost/api', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

const week = { params: Promise.resolve({ id: 'g1', weekId: 'w1' }) }

beforeEach(() => {
  rows = [{ id: 'w1', game_id: 'g1', season: '2026', week: 52, date: '30 Dec 2026', status: 'scheduled' }]
  ;(createServiceClient as jest.Mock).mockReturnValue({ from: weeksTable })
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: mockAuthNamespace({ id: 'u1', email: 'a@example.com' }),
    rpc: jest.fn(async (name: string, args: { p_date?: string; p_status?: string }) => {
      if (name === 'is_game_admin') return { data: true, error: null }
      if (name === 'edit_week') Object.assign(rows[0], { date: args.p_date, status: args.p_status })
      return { data: null, error: null }
    }),
  })
})

describe('a week whose date moves into another year', () => {
  it('takes the new year as its season and starts that season at week 1', async () => {
    const res = await reschedule(json({ date: '04 Jan 2027' }), week)
    expect(res.status).toBe(200)
    expect(rows[0]).toMatchObject({ date: '04 Jan 2027', season: '2027', week: 1 })
  })

  it('is numbered after the weeks that season already has', async () => {
    rows.push({ id: 'w2', game_id: 'g1', season: '2027', week: 1, date: '11 Jan 2027', status: 'scheduled' })
    await reschedule(json({ date: '04 Jan 2027' }), week)
    expect(rows[0]).toMatchObject({ season: '2027', week: 2 })
  })

  it('keeps its season and number when the date stays in the same year', async () => {
    await reschedule(json({ date: '28 Dec 2026' }), week)
    expect(rows[0]).toMatchObject({ date: '28 Dec 2026', season: '2026', week: 52 })
  })

  it('leaves a played week alone when the reschedule did not apply to it', async () => {
    rows[0].status = 'played'
    await reschedule(json({ date: '04 Jan 2027' }), week)
    expect(rows[0]).toMatchObject({ date: '30 Dec 2026', season: '2026', week: 52 })
  })

  it('moves season when a result is edited onto a date in another year', async () => {
    rows[0].status = 'played'
    const res = await editWeek(json({ date: '04 Jan 2027', status: 'played', winner: 'draw', teamA: ['A'], teamB: ['B'] }), week)
    expect(res.status).toBe(200)
    expect(rows[0]).toMatchObject({ date: '04 Jan 2027', season: '2027', week: 1 })
  })
})
