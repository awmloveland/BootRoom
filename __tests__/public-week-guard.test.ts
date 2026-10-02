import { POST as saveLineup } from '@/app/api/public/league/[id]/lineup/route'
import { POST as cancelWeek } from '@/app/api/public/league/[id]/cancel/route'
import { createServiceClient } from '@/lib/supabase/service'

jest.mock('@/lib/supabase/service')

// Both public write routes upsert on (game_id, season, week). They must refuse
// to overwrite a week that already has a result.

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function mockService(existingStatus: string | null) {
  const upsert = jest.fn(() => ({
    select: () => ({ single: jest.fn().mockResolvedValue({ data: { id: 'new-id' }, error: null }) }),
  }))
  const featureQuery = {
    select: jest.fn(() => featureQuery),
    eq: jest.fn(() => featureQuery),
    maybeSingle: jest.fn().mockResolvedValue({ data: { public_enabled: true } }),
  }
  const weekQuery = {
    select: jest.fn(() => weekQuery),
    eq: jest.fn(() => weekQuery),
    maybeSingle: jest.fn().mockResolvedValue({ data: existingStatus ? { status: existingStatus } : null }),
    upsert,
  }
  const from = jest.fn((table: string) => (table === 'league_features' ? featureQuery : weekQuery))
  ;(createServiceClient as jest.Mock).mockReturnValue({ from })
  return { upsert, weekQuery }
}

const params = { params: Promise.resolve({ id: 'g1' }) }
const lineupBody = { season: '2026', week: 1, date: '05 Jan 2026', format: '5-a-side', teamA: ['A'], teamB: ['B'] }
const cancelBody = { season: '2026', week: 1, date: '05 Jan 2026' }

describe.each([
  ['lineup', saveLineup, lineupBody],
  ['cancel', cancelWeek, cancelBody],
] as const)('POST /api/public/league/[id]/%s — recorded week guard', (_name, handler, body) => {
  beforeEach(() => jest.clearAllMocks())

  it.each(['played', 'dnf'])('returns 409 without writing when the week is %s', async (status) => {
    const { upsert, weekQuery } = mockService(status)
    const res = await handler(jsonRequest(body), params)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'This week already has a result' })
    expect(weekQuery.eq).toHaveBeenCalledWith('season', '2026')
    expect(weekQuery.eq).toHaveBeenCalledWith('week', 1)
    expect(upsert).not.toHaveBeenCalled()
  })

  it.each([null, 'scheduled', 'cancelled'])('writes when the existing week is %s', async (status) => {
    const { upsert } = mockService(status)
    const res = await handler(jsonRequest(body), params)
    expect(res.status).toBe(200)
    expect(upsert).toHaveBeenCalledTimes(1)
  })
})
