import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getWeeks } from '@/lib/fetchers'
import type { Week } from '@/lib/types'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/fetchers', () => ({ getWeeks: jest.fn() }))

import { GET as getFees, PATCH as patchFees } from '@/app/api/league/[id]/fees/route'
import { PUT as putFee, DELETE as deleteFee } from '@/app/api/league/[id]/weeks/[weekId]/fee/route'
import { PUT as putPayment } from '@/app/api/league/[id]/weeks/[weekId]/payments/route'
import { POST as settle } from '@/app/api/league/[id]/payments/settle/route'

const GAME_ID = 'game-1'

const WEEKS: Week[] = [
  { id: 'w1', season: '2026', week: 40, date: '01 Oct 2026', status: 'played', teamA: ['Alice', 'Alice +1'], teamB: ['Bob'], winner: 'teamA' },
  { id: 'w2', season: '2026', week: 39, date: '24 Sep 2026', status: 'played', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' },
  { id: 'w3', season: '2026', week: 38, date: '17 Sep 2026', status: 'played', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' },
]

/** A chainable Supabase query stub that resolves to `result` when awaited. */
function query(result: { data?: unknown; error?: unknown } = {}) {
  const chain: Record<string, jest.Mock> & { then?: unknown } = {}
  for (const m of ['select', 'eq', 'in', 'order', 'range', 'update', 'upsert', 'delete']) {
    chain[m] = jest.fn(() => chain)
  }
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null, ...result })
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null, ...result })
  return chain
}

function setup({ user = true, admin = true, tables = {} as Record<string, ReturnType<typeof query>> } = {}) {
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: user ? { id: 'admin-user' } : null } }) },
    rpc: jest.fn().mockResolvedValue({ data: admin }),
  })
  const from = jest.fn((table: string) => tables[table] ?? query())
  ;(createServiceClient as jest.Mock).mockReturnValue({ from })
  ;(getWeeks as jest.Mock).mockResolvedValue(WEEKS)
  return { from }
}

function json(method: string, body: unknown) {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const league = { params: Promise.resolve({ id: GAME_ID }) }
const leagueWeek = (weekId: string) => ({ params: Promise.resolve({ id: GAME_ID, weekId }) })

beforeEach(() => jest.resetAllMocks())

describe('fee routes refuse non-admins', () => {
  const calls: [string, () => Promise<Response>][] = [
    ['GET fees', () => getFees(new Request('http://localhost/api?range=30'), league)],
    ['PATCH fees', () => patchFees(json('PATCH', { defaultFee: 6 }), league)],
    ['PUT week fee', () => putFee(json('PUT', { fee: 5 }), leagueWeek('w1'))],
    ['DELETE week fee', () => deleteFee(json('DELETE', {}), leagueWeek('w1'))],
    ['PUT payment', () => putPayment(json('PUT', { payer: 'Alice', paid: true }), leagueWeek('w1'))],
    ['POST settle', () => settle(json('POST', { player: 'Alice', weekIds: ['w1'] }), league)],
  ]

  it.each(calls)('%s returns 403 for a member', async (_name, call) => {
    const { from } = setup({ admin: false })
    const res = await call()
    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it.each(calls)('%s returns 401 when signed out', async (_name, call) => {
    setup({ user: false })
    expect((await call()).status).toBe(401)
  })
})

describe('GET /api/league/[id]/fees', () => {
  it('returns AdminMoneyData for the requested range', async () => {
    setup({
      tables: {
        games: query({ data: { fee_per_player: '6.00' } }),
        week_fees: query({ data: [{ week_id: 'w2', fee_per_player: '4.50' }] }),
        week_payments: query({ data: [{ week_id: 'w1', payer: 'Bob', paid: true }] }),
      },
    })
    const res = await getFees(new Request('http://localhost/api?range=all'), league)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.range.preset).toBe('all')
    expect(data.defaultFee).toBe(6)
    expect(data.totals).toEqual({ owed: 33, collected: 6, expected: 39, playedGames: 3 })
  })
})

describe('PATCH /api/league/[id]/fees', () => {
  it('saves the default fee rounded to pence', async () => {
    const games = query()
    setup({ tables: { games } })
    const res = await patchFees(json('PATCH', { defaultFee: 6.505 }), league)
    expect(res.status).toBe(200)
    expect(games.update).toHaveBeenCalledWith({ fee_per_player: 6.51 })
  })

  it('rejects a negative fee', async () => {
    setup()
    expect((await patchFees(json('PATCH', { defaultFee: -1 }), league)).status).toBe(400)
  })
})

describe('PUT /api/league/[id]/weeks/[weekId]/fee', () => {
  it('upserts the override for a played week', async () => {
    const weekFees = query()
    setup({ tables: { weeks: query({ data: { id: 'w1', status: 'played' } }), week_fees: weekFees } })
    const res = await putFee(json('PUT', { fee: 5 }), leagueWeek('w1'))
    expect(res.status).toBe(200)
    expect(weekFees.upsert).toHaveBeenCalledWith(
      { week_id: 'w1', game_id: GAME_ID, fee_per_player: 5 },
      { onConflict: 'week_id' }
    )
  })

  it('accepts a DNF week and refuses a cancelled one', async () => {
    setup({ tables: { weeks: query({ data: { id: 'w1', status: 'dnf' } }) } })
    expect((await putFee(json('PUT', { fee: 5 }), leagueWeek('w1'))).status).toBe(200)
    setup({ tables: { weeks: query({ data: { id: 'w1', status: 'cancelled' } }) } })
    expect((await putFee(json('PUT', { fee: 5 }), leagueWeek('w1'))).status).toBe(400)
  })

  it('404s for a week outside the league', async () => {
    setup({ tables: { weeks: query({ data: null }) } })
    expect((await putFee(json('PUT', { fee: 5 }), leagueWeek('other'))).status).toBe(404)
  })
})

describe('PUT /api/league/[id]/weeks/[weekId]/payments', () => {
  it('ticks a guest by their guest name', async () => {
    const payments = query()
    setup({ tables: { week_payments: payments } })
    const res = await putPayment(json('PUT', { payer: 'Alice +1', paid: true }), leagueWeek('w1'))
    expect(res.status).toBe(200)
    expect(payments.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ week_id: 'w1', game_id: GAME_ID, payer: 'Alice +1', paid: true, marked_by: 'admin-user' }),
      { onConflict: 'week_id,payer' }
    )
  })

  it('rejects a payer who was not in the line-up', async () => {
    setup()
    expect((await putPayment(json('PUT', { payer: 'Zed', paid: true }), leagueWeek('w1'))).status).toBe(400)
  })
})

describe('POST /api/league/[id]/payments/settle', () => {
  it("marks the player's own and guest entries in the given weeks, skipping ones already paid", async () => {
    const payments = query({ data: [{ week_id: 'w2', payer: 'Alice' }] })
    setup({ tables: { week_payments: payments } })
    const res = await settle(json('POST', { player: 'Alice', weekIds: ['w1', 'w2'] }), league)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, settled: 2 })
    const rows = payments.upsert.mock.calls[0][0] as { week_id: string; payer: string }[]
    expect(rows.map((r) => [r.week_id, r.payer])).toEqual([
      ['w1', 'Alice'],
      ['w1', 'Alice +1'],
    ])
  })

  it('requires a player and week ids', async () => {
    setup()
    expect((await settle(json('POST', { player: 'Alice' }), league)).status).toBe(400)
  })
})
