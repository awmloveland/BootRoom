import { getAuthAndRole, getFeatures, getGame } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { parseLineupToken, verifyLineupSignature } from '@/lib/lineupShare'
import type { FeatureKey, GameRole, LeagueFeature } from '@/lib/types'

jest.mock('@/lib/fetchers', () => ({ getAuthAndRole: jest.fn(), getFeatures: jest.fn(), getGame: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

import { POST } from '@/app/api/league/[id]/lineup-share/route'

const SECRET = 'test-secret'
const GAME_ID = 'game-1'
const WEEK_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const WEEK = { id: WEEK_ID, status: 'scheduled', team_a: ['Marcus Reid'], team_b: ['Callum Shaw'] }

function feature(key: FeatureKey, enabled: boolean, publicEnabled = false): LeagueFeature {
  return { feature: key, available: true, enabled, config: null, public_enabled: publicEnabled, public_config: null }
}

function setup({
  role = 'member' as GameRole | null,
  features = [feature('lineup_share_image', true), feature('match_entry', true)],
  week = WEEK as unknown,
} = {}) {
  ;(getGame as jest.Mock).mockResolvedValue({ id: GAME_ID, slug: 'the-boot-room', name: 'The Boot Room' })
  ;(getAuthAndRole as jest.Mock).mockResolvedValue({ user: null, userRole: role, isAuthenticated: role !== null })
  ;(getFeatures as jest.Mock).mockResolvedValue(features)
  const chain: Record<string, jest.Mock> = {}
  chain.select = jest.fn(() => chain)
  chain.eq = jest.fn(() => chain)
  chain.maybeSingle = jest.fn().mockResolvedValue({ data: week, error: null })
  ;(createServiceClient as jest.Mock).mockReturnValue({ from: jest.fn(() => chain) })
  return chain
}

function call(body: unknown) {
  return POST(
    new Request(`http://localhost/api/league/${GAME_ID}/lineup-share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: GAME_ID }) }
  )
}

beforeEach(() => {
  jest.resetAllMocks()
  process.env.SHARE_SIGNING_SECRET = SECRET
})
afterAll(() => {
  delete process.env.SHARE_SIGNING_SECRET
})

describe('POST /api/league/[id]/lineup-share', () => {
  it('returns a signed link that verifies against the lineups', async () => {
    const chain = setup()
    const res = await call({ weekId: WEEK_ID })
    expect(res.status).toBe(200)
    const { url } = await res.json()
    expect(url).toMatch(/^https:\/\/craft-football\.com\/the-boot-room\?lineup=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
    const parsed = parseLineupToken(url.split('?lineup=')[1])!
    expect(parsed.weekId).toBe(WEEK_ID)
    expect(verifyLineupSignature(SECRET, parsed, { teamA: WEEK.team_a, teamB: WEEK.team_b })).toBe(true)
    // Scoped to this league.
    expect(chain.eq).toHaveBeenCalledWith('game_id', GAME_ID)
  })

  it('signs for admins even with every feature off', async () => {
    setup({ role: 'admin', features: [feature('lineup_share_image', false)] })
    expect((await (await call({ weekId: WEEK_ID })).json()).url).not.toBeNull()
  })

  it('signs for the public when the feature is public and the league is visible', async () => {
    setup({ role: null, features: [feature('lineup_share_image', false, true), feature('match_history', false, true)] })
    expect((await (await call({ weekId: WEEK_ID })).json()).url).not.toBeNull()
  })

  it.each([
    ['the feature is off for members', { features: [feature('lineup_share_image', false), feature('match_entry', true)] }],
    ['the member cannot see the lineup', { features: [feature('lineup_share_image', true)] }],
    ['the league is hidden from the public', { role: null, features: [feature('lineup_share_image', true, true)] }],
    ['the week is not scheduled', { week: { ...WEEK, status: 'played' } }],
    ['the week has no lineups', { week: { ...WEEK, team_b: [] } }],
    ['the week is not in this league', { week: null }],
  ])('returns url null when %s', async (_label, opts) => {
    setup(opts as Parameters<typeof setup>[0])
    const res = await call({ weekId: WEEK_ID })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ url: null })
  })

  it('returns url null when signing is not configured', async () => {
    delete process.env.SHARE_SIGNING_SECRET
    setup()
    await expect((await call({ weekId: WEEK_ID })).json()).resolves.toEqual({ url: null })
  })

  it('rejects a missing weekId with 400', async () => {
    setup()
    expect((await call({})).status).toBe(400)
  })
})
