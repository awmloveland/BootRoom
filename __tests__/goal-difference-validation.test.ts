import { PATCH as editWeek } from '@/app/api/league/[id]/weeks/[weekId]/edit/route'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/server')

// goal_difference is an unsigned win margin (the winner is stored separately),
// so the edit route must reject negative or fractional values.

function jsonRequest(method: string, body: unknown): Request {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/league/[id]/weeks/[weekId]/edit — goalDifference', () => {
  const rpc = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
    rpc.mockImplementation((name: string) =>
      Promise.resolve(name === 'is_game_admin' ? { data: true } : { error: null })
    )
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: mockAuthNamespace({ id: 'u1' }),
      rpc,
    })
  })

  async function patch(goalDifference: unknown) {
    return editWeek(
      jsonRequest('PATCH', { date: '10 Apr 2026', status: 'played', winner: 'teamA', goalDifference }),
      { params: Promise.resolve({ id: 'g1', weekId: 'w1' }) }
    )
  }

  it('rejects a negative margin without calling edit_week', async () => {
    const res = await patch(-3)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'goalDifference must be a non-negative integer' })
    expect(rpc).not.toHaveBeenCalledWith('edit_week', expect.anything())
  })

  it('rejects a fractional margin', async () => {
    const res = await patch(2.5)
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalledWith('edit_week', expect.anything())
  })

  it('accepts a positive margin', async () => {
    const res = await patch(3)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('edit_week', expect.objectContaining({ p_goal_difference: 3 }))
  })

  it('accepts 0 for a draw', async () => {
    const res = await patch(0)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('edit_week', expect.objectContaining({ p_goal_difference: 0 }))
  })
})
