import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'

jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }))
jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))

import { POST as saveLineup } from '@/app/api/league/[id]/lineup/route'
import { DELETE as cancelLineup } from '@/app/api/league/[id]/lineup/[weekId]/route'
import { POST as cancelWeek } from '@/app/api/league/[id]/weeks/cancel/route'
import { POST as recordResult } from '@/app/api/league/[id]/weeks/[weekId]/result/route'

const rpc = jest.fn()
const eq = jest.fn()

/** `existingStatus` is the status of the row already stored under the posted (season, week), if any. */
function setup({ user = true, admin = true, existingStatus = null as string | null, lookupError = null as { message: string } | null } = {}) {
  rpc.mockImplementation(async (name: string) => {
    if (name === 'is_game_admin') return { data: admin, error: null }
    if (name === 'save_lineup' || name === 'cancel_week') return { data: 'w-new', error: null }
    return { data: null, error: null }
  })
  const query = {
    select: jest.fn(() => query),
    eq: eq.mockImplementation(() => query),
    maybeSingle: jest.fn().mockResolvedValue({ data: existingStatus ? { status: existingStatus } : null, error: lookupError }),
  }
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: mockAuthNamespace(user ? { id: 'u1', email: 'a@example.com' } : null),
    rpc,
    from: jest.fn(() => query),
  })
}

function json(body: unknown, method = 'POST') {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const league = { params: Promise.resolve({ id: 'g1' }) }
const week = { params: Promise.resolve({ id: 'g1', weekId: 'w1' }) }

const LINEUP = { season: '2026', week: 3, date: '22 Oct 2026', format: '7-a-side', teamA: ['A'], teamB: ['B'], lineupMetadata: { guests: [], new_players: [] }, teamARating: 50, teamBRating: 49 }

beforeEach(() => {
  rpc.mockReset()
  eq.mockReset()
  ;(revalidateTag as jest.Mock).mockClear()
})

describe('POST lineup', () => {
  it('calls save_lineup and returns the week id', async () => {
    setup()
    const res = await saveLineup(json(LINEUP), league)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ weekId: 'w-new' })
    expect(rpc).toHaveBeenCalledWith('save_lineup', {
      p_game_id: 'g1', p_season: '2026', p_week: 3, p_date: '22 Oct 2026', p_format: '7-a-side',
      p_team_a: ['A'], p_team_b: ['B'], p_lineup_metadata: { guests: [], new_players: [] },
      p_team_a_rating: 50, p_team_b_rating: 49,
    })
    expect(revalidateTag).toHaveBeenCalledWith('league:g1', { expire: 0 })
  })

  it('rejects non-admins', async () => {
    setup({ admin: false })
    expect((await saveLineup(json(LINEUP), league)).status).toBe(403)
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('rejects a body without teams', async () => {
    setup()
    expect((await saveLineup(json({ ...LINEUP, teamA: 'nope' }), league)).status).toBe(400)
  })
})

describe('DELETE lineup/[weekId]', () => {
  it('calls cancel_lineup', async () => {
    setup()
    const res = await cancelLineup(new Request('http://localhost/api', { method: 'DELETE' }), week)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('cancel_lineup', { p_week_id: 'w1' })
  })

  it('rejects signed-out callers without calling the RPC', async () => {
    setup({ user: false })
    const res = await cancelLineup(new Request('http://localhost/api', { method: 'DELETE' }), week)
    expect(res.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('POST weeks/cancel', () => {
  it('calls cancel_week and returns the week id', async () => {
    setup()
    const res = await cancelWeek(json({ season: '2026', week: 3, date: '22 Oct 2026' }), league)
    await expect(res.json()).resolves.toEqual({ weekId: 'w-new' })
    expect(rpc).toHaveBeenCalledWith('cancel_week', { p_game_id: 'g1', p_season: '2026', p_week: 3, p_date: '22 Oct 2026' })
  })
})

// Both writes upsert on (game_id, season, week), so a wrong key would replace a
// played game. They refuse to touch a week that already has a result.
describe.each([
  ['lineup', saveLineup, LINEUP, 'save_lineup'],
  ['weeks/cancel', cancelWeek, { season: '2026', week: 3, date: '22 Oct 2026' }, 'cancel_week'],
] as const)('POST %s: recorded week guard', (_route, handler, body, rpcName) => {
  it.each(['played', 'dnf'])('returns 409 without writing when the week is %s', async (status) => {
    setup({ existingStatus: status })
    const res = await handler(json(body), league)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'This week already has a result' })
    expect(eq).toHaveBeenCalledWith('game_id', 'g1')
    expect(eq).toHaveBeenCalledWith('season', '2026')
    expect(eq).toHaveBeenCalledWith('week', 3)
    expect(rpc).not.toHaveBeenCalledWith(rpcName, expect.anything())
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it.each([null, 'scheduled', 'cancelled', 'unrecorded'])('writes when the stored week is %s', async (status) => {
    setup({ existingStatus: status })
    expect((await handler(json(body), league)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith(rpcName, expect.anything())
  })

  it('refuses to write when the week lookup fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
    setup({ lookupError: { message: 'connection reset' } })
    expect((await handler(json(body), league)).status).toBe(500)
    expect(rpc).not.toHaveBeenCalledWith(rpcName, expect.anything())
  })

  it('maps the database guard to 409 when the RPC raises it', async () => {
    setup()
    rpc.mockImplementation(async (name: string) => {
      if (name === 'is_game_admin') return { data: true, error: null }
      return { data: null, error: { message: 'Week 3 of season 2026 already has a result' } }
    })
    expect((await handler(json(body), league)).status).toBe(409)
  })
})

describe('POST weeks/[weekId]/result', () => {
  const RESULT = { dnf: false, winner: 'teamA', notes: 'Tight', goalDifference: 1, teamARating: 50, teamBRating: 49, guests: [], newPlayers: [] }

  it('records the result and skips roster RPCs when there is nothing to add', async () => {
    setup()
    expect((await recordResult(json(RESULT), week)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('record_result', {
      p_week_id: 'w1', p_dnf: false, p_winner: 'teamA', p_notes: 'Tight', p_goal_difference: 1, p_team_a_rating: 50, p_team_b_rating: 49,
    })
    expect(rpc).not.toHaveBeenCalledWith('name_guests', expect.anything())
    expect(rpc).not.toHaveBeenCalledWith('promote_roster', expect.anything())
  })

  it('names guests and promotes new players after the result', async () => {
    setup()
    await recordResult(json({
      ...RESULT,
      guests: [{ oldName: 'Jaff +1', newName: 'Sam', rating: 2, goalkeeper: false }],
      newPlayers: [{ name: 'Kit', rating: 2, mentality: 'balanced', goalkeeper: false }],
    }), week)
    const names = rpc.mock.calls.map((c) => c[0])
    expect(names).toEqual(['is_game_admin', 'record_result', 'name_guests', 'promote_roster'])
    expect(rpc).toHaveBeenCalledWith('name_guests', { p_week_id: 'w1', p_guests: [{ old_name: 'Jaff +1', new_name: 'Sam', rating: 2, goalkeeper: false }] })
    expect(rpc).toHaveBeenCalledWith('promote_roster', { p_game_id: 'g1', p_entries: [{ name: 'Kit', rating: 2, mentality: 'balanced', goalkeeper: false }] })
  })

  it('maps a duplicate guest name to 409', async () => {
    setup()
    rpc.mockImplementation(async (name: string) => {
      if (name === 'is_game_admin') return { data: true, error: null }
      if (name === 'name_guests') return { data: null, error: { message: 'name_already_exists' } }
      return { data: null, error: null }
    })
    const res = await recordResult(json({ ...RESULT, guests: [{ oldName: 'G', newName: 'Dup', rating: 2, goalkeeper: false }] }), week)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'name_already_exists' })
    // record_result already committed, so the cache must still be invalidated
    expect(revalidateTag).toHaveBeenCalledWith('league:g1', { expire: 0 })
  })

  it('rejects a played result without a winner', async () => {
    setup()
    expect((await recordResult(json({ ...RESULT, winner: null }), week)).status).toBe(400)
  })

  it('ignores winner and ratings on a DNF', async () => {
    setup()
    expect((await recordResult(json({ ...RESULT, dnf: true }), week)).status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('record_result', {
      p_week_id: 'w1', p_dnf: true, p_winner: null, p_notes: 'Tight', p_goal_difference: null, p_team_a_rating: null, p_team_b_rating: null,
    })
  })

  it('rejects a malformed guest before writing', async () => {
    setup()
    expect((await recordResult(json({ ...RESULT, guests: [null] }), week)).status).toBe(400)
    expect(rpc).not.toHaveBeenCalledWith('record_result', expect.anything())
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
