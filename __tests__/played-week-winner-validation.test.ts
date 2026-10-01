import { POST as recordPublicResult } from '@/app/api/public/league/[id]/result/route'
import { PATCH as editWeek } from '@/app/api/league/[id]/weeks/[weekId]/edit/route'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/service')
jest.mock('@/lib/supabase/server')

// A played week must always have a winner (teamA, teamB or draw); the match card
// has no way to show a played result without one. Both write routes enforce it.

function jsonRequest(method: string, body: unknown): Request {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/public/league/[id]/result — winner', () => {
  const from = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    // Only the match_entry feature lookup should run before validation fails
    const featureQuery = {
      select: jest.fn(() => featureQuery),
      eq: jest.fn(() => featureQuery),
      maybeSingle: jest.fn().mockResolvedValue({ data: { public_enabled: true } }),
    }
    from.mockImplementation(() => featureQuery)
    ;(createServiceClient as jest.Mock).mockReturnValue({ from })
  })

  async function post(winner: unknown) {
    return recordPublicResult(
      jsonRequest('POST', { weekId: 'w1', winner, goalDifference: 1, teamARating: null, teamBRating: null }),
      { params: Promise.resolve({ id: 'g1' }) }
    )
  }

  it('rejects a played result with no winner without touching the week', async () => {
    const res = await post(null)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'winner must be teamA, teamB, or draw' })
    expect(from).not.toHaveBeenCalledWith('weeks')
  })

  it('rejects an unknown winner value', async () => {
    const res = await post('teamC')
    expect(res.status).toBe(400)
    expect(from).not.toHaveBeenCalledWith('weeks')
  })
})

describe('PATCH /api/league/[id]/weeks/[weekId]/edit — winner', () => {
  const rpc = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    rpc.mockImplementation((name: string) =>
      Promise.resolve(name === 'is_game_admin' ? { data: true } : { error: null })
    )
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      rpc,
    })
  })

  async function patch(status: string, winner: unknown) {
    return editWeek(
      jsonRequest('PATCH', { date: '10 Apr 2026', status, winner, goalDifference: 0 }),
      { params: Promise.resolve({ id: 'g1', weekId: 'w1' }) }
    )
  }

  it('rejects a played week with no winner without calling edit_week', async () => {
    const res = await patch('played', undefined)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'winner must be teamA, teamB, or draw for a played week' })
    expect(rpc).not.toHaveBeenCalledWith('edit_week', expect.anything())
  })

  it('rejects a played week with an unknown winner value', async () => {
    const res = await patch('played', 'teamC')
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalledWith('edit_week', expect.anything())
  })

  it('accepts a played draw', async () => {
    const res = await patch('played', 'draw')
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('edit_week', expect.objectContaining({ p_winner: 'draw' }))
  })

  it('still allows other statuses without a winner', async () => {
    const res = await patch('cancelled', undefined)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('edit_week', expect.objectContaining({ p_status: 'cancelled', p_winner: null }))
  })
})
