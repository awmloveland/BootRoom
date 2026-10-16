import { PATCH as editWeek } from '@/app/api/league/[id]/weeks/[weekId]/edit/route'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server')

// A played week must always have a winner (teamA, teamB or draw); the match card
// has no way to show a played result without one. The edit route enforces it.

function jsonRequest(method: string, body: unknown): Request {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

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
