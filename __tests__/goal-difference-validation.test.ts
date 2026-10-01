import { POST as recordPublicResult } from '@/app/api/public/league/[id]/result/route'
import { PATCH as editWeek } from '@/app/api/league/[id]/weeks/[weekId]/edit/route'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

jest.mock('@/lib/supabase/service')
jest.mock('@/lib/supabase/server')

// goal_difference is an unsigned win margin (the winner is stored separately),
// so both write routes must reject negative or fractional values.

function jsonRequest(method: string, body: unknown): Request {
  return new Request('http://localhost/api', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/public/league/[id]/result — goalDifference', () => {
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

  async function post(goalDifference: unknown) {
    return recordPublicResult(
      jsonRequest('POST', { weekId: 'w1', winner: 'teamA', goalDifference, teamARating: null, teamBRating: null }),
      { params: Promise.resolve({ id: 'g1' }) }
    )
  }

  it('rejects a negative margin without touching the week', async () => {
    const res = await post(-2)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'goalDifference must be a non-negative integer' })
    expect(from).not.toHaveBeenCalledWith('weeks')
  })

  it('rejects a fractional margin', async () => {
    const res = await post(1.5)
    expect(res.status).toBe(400)
    expect(from).not.toHaveBeenCalledWith('weeks')
  })
})

describe('PATCH /api/league/[id]/weeks/[weekId]/edit — goalDifference', () => {
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
