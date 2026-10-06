import { getAuthAndRole, getFeatures, getGame, getWeeks } from '@/lib/fetchers'
import { parseQuarterToken, parseResultToken, verifyQuarterSignature, verifyResultSignature } from '@/lib/shareLinks'
import type { FeatureKey, GameRole, LeagueFeature, Week } from '@/lib/types'

jest.mock('@/lib/fetchers', () => ({ getAuthAndRole: jest.fn(), getFeatures: jest.fn(), getGame: jest.fn(), getWeeks: jest.fn() }))

import { POST } from '@/app/api/league/[id]/share-link/route'

const SECRET = 'test-secret'
const GAME_ID = '9cf13e81-4382-428b-a4ec-c94cb8e2567e'
const WEEK_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const A = ['Marcus Reid', 'Rav Singh']
const B = ['Callum Shaw', 'Sofia Marsh']

function played(id: string, week: number, date: string): Week {
  return { id, season: '2026', week, date, status: 'played', teamA: A, teamB: B, winner: 'teamA', goal_difference: 2 }
}
const WEEKS: Week[] = [
  played('00000000-0000-4000-8000-000000000001', 1, '07 Jul 2026'),
  played('00000000-0000-4000-8000-000000000002', 2, '14 Jul 2026'),
  played('00000000-0000-4000-8000-000000000003', 3, '21 Jul 2026'),
  played('00000000-0000-4000-8000-000000000004', 4, '28 Jul 2026'),
  played(WEEK_ID, 5, '04 Aug 2026'),
]

function feature(key: FeatureKey, enabled: boolean, publicEnabled = false): LeagueFeature {
  return { feature: key, enabled, config: null, public_enabled: publicEnabled, public_config: null } as LeagueFeature
}

function setup({ role = 'member' as GameRole | null, features = [feature('match_history', true)] } = {}) {
  ;(getGame as jest.Mock).mockResolvedValue({ id: GAME_ID, slug: 'the-boot-room', name: 'The Boot Room' })
  ;(getAuthAndRole as jest.Mock).mockResolvedValue({ user: null, userRole: role, isAuthenticated: role !== null })
  ;(getFeatures as jest.Mock).mockResolvedValue(features)
  ;(getWeeks as jest.Mock).mockResolvedValue(WEEKS)
}

function call(body: unknown, id = GAME_ID) {
  return POST(
    new Request(`http://localhost/api/league/${id}/share-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  )
}

function tokenOf(url: string, param: string): string {
  return new URL(url).searchParams.get(param) ?? ''
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'))
  process.env.SHARE_SIGNING_SECRET = SECRET
})
afterEach(() => jest.useRealTimers())
afterAll(() => {
  delete process.env.SHARE_SIGNING_SECRET
})

describe('POST /api/league/[id]/share-link', () => {
  it('signs a played result the viewer can see', async () => {
    setup()
    const { url } = await (await call({ kind: 'result', weekId: WEEK_ID })).json()
    expect(url).toMatch(/^https:\/\/craft-football\.com\/the-boot-room\?result=/)
    const parsed = parseResultToken(tokenOf(url, 'result'))!
    expect(verifyResultSignature(SECRET, parsed, { winner: 'teamA', goalDifference: 2, teamA: A, teamB: B })).toBe(true)
  })

  it('declines a result when match history is hidden from the viewer', async () => {
    setup({ role: null, features: [feature('match_history', true, false)] })
    expect(await (await call({ kind: 'result', weekId: WEEK_ID })).json()).toEqual({ url: null })
  })

  it('declines a week from another league', async () => {
    setup()
    expect(await (await call({ kind: 'result', weekId: '00000000-0000-4000-8000-0000000000ff' })).json()).toEqual({ url: null })
  })

  it('signs a completed quarter with a champion', async () => {
    setup()
    const { url } = await (await call({ kind: 'quarter', year: 2026, q: 3 })).json()
    expect(url).toMatch(/\/the-boot-room\/honours\?quarter=.+#q-2026-3$/)
    const parsed = parseQuarterToken(tokenOf(url, 'quarter'))!
    expect(verifyQuarterSignature(SECRET, parsed)).toBe(true)
  })

  it('declines a quarter with no games', async () => {
    setup()
    expect(await (await call({ kind: 'quarter', year: 2026, q: 2 })).json()).toEqual({ url: null })
  })

  it('declines a completed quarter with too few games for a champion', async () => {
    setup()
    ;(getWeeks as jest.Mock).mockResolvedValue([
      ...WEEKS,
      played('00000000-0000-4000-8000-000000000011', 1, '06 Jan 2026'),
      played('00000000-0000-4000-8000-000000000012', 2, '13 Jan 2026'),
      played('00000000-0000-4000-8000-000000000013', 3, '20 Jan 2026'),
    ])
    expect(await (await call({ kind: 'quarter', year: 2026, q: 1 })).json()).toEqual({ url: null })
  })

  it('signs a quarter for the public only with match history and quarter celebration on', async () => {
    setup({ role: null, features: [feature('match_history', true, true), feature('quarter_celebration', true, false)] })
    expect(await (await call({ kind: 'quarter', year: 2026, q: 3 })).json()).toEqual({ url: null })

    setup({ role: null, features: [feature('match_history', true, true), feature('quarter_celebration', true, true)] })
    const { url } = await (await call({ kind: 'quarter', year: 2026, q: 3 })).json()
    expect(url).toMatch(/\/the-boot-room\/honours\?quarter=/)
  })

  it('always signs a result for an admin, whatever the features', async () => {
    setup({ role: 'admin', features: [] })
    const { url } = await (await call({ kind: 'result', weekId: WEEK_ID })).json()
    expect(url).toMatch(/\?result=/)
  })

  it('declines a week that is scheduled, not played', async () => {
    setup()
    const SCHEDULED = '00000000-0000-4000-8000-0000000000aa'
    ;(getWeeks as jest.Mock).mockResolvedValue([
      ...WEEKS,
      { ...played(SCHEDULED, 6, '11 Aug 2026'), status: 'scheduled', winner: null, goal_difference: null },
    ])
    expect(await (await call({ kind: 'result', weekId: SCHEDULED })).json()).toEqual({ url: null })
  })

  it('does no database work for a junk league id', async () => {
    setup()
    expect(await (await call({ kind: 'result', weekId: WEEK_ID }, 'not-a-uuid')).json()).toEqual({ url: null })
    expect(getGame).not.toHaveBeenCalled()
    expect(getWeeks).not.toHaveBeenCalled()
  })

  it('declines when signing is not configured', async () => {
    delete process.env.SHARE_SIGNING_SECRET
    setup()
    expect(await (await call({ kind: 'result', weekId: WEEK_ID })).json()).toEqual({ url: null })
  })

  it.each([
    [{}],
    [{ kind: 'result', weekId: 'nope' }],
    [{ kind: 'quarter', year: 2026, q: 5 }],
    [{ kind: 'quarter', year: '2026', q: 3 }],
    [{ kind: 'league' }],
  ])('rejects bad input %p with a 400', async (body) => {
    setup()
    expect((await call(body)).status).toBe(400)
    expect(getGame).not.toHaveBeenCalled()
  })
})
