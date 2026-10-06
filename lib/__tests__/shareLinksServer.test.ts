import { createServiceClient } from '@/lib/supabase/service'
import { getGame, getWeeks } from '@/lib/fetchers'
import { signLeagueToken, signLineupToken, signQuarterToken, signResultToken } from '@/lib/shareLinks'

jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))
jest.mock('@/lib/fetchers', () => ({ getGame: jest.fn(), getWeeks: jest.fn() }))

// Import after the mocks are registered.
import {
  leagueShareTokenFor,
  loadInvitePreview,
  loadSharedLeague,
  loadSharedLineup,
  loadSharedQuarter,
  loadSharedResult,
  quarterShareUrls,
  resultShareUrlFor,
} from '@/lib/shareLinksServer'

const SECRET = 'test-secret'
const WEEK_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const WEEK_ROW = {
  game_id: 'game-1',
  week: 13,
  date: '06 Oct 2026',
  format: '6-a-side',
  team_a: ['Marcus Reid', 'Rav Singh'],
  team_b: ['Callum Shaw', 'Sofia Marsh'],
}
const GAME_ROW = { name: 'The Boot Room', slug: 'the-boot-room', location: 'Powerleague Shoreditch', kickoff_time: '19:00' }
const TOKEN = signLineupToken(SECRET, WEEK_ID, { teamA: WEEK_ROW.team_a, teamB: WEEK_ROW.team_b })

/**
 * Service client whose `from(table)…maybeSingle()` resolves to rows[table].
 * Returns `from` plus the chains created per table, so tests can assert on
 * the arguments each query used.
 */
function mockTables(rows: Record<string, unknown>, rpcRows: unknown = null) {
  const chains: Record<string, Record<string, jest.Mock>> = {}
  const from = jest.fn((table: string) => {
    const chain: Record<string, jest.Mock> = {}
    chain.select = jest.fn(() => chain)
    chain.eq = jest.fn(() => chain)
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: rows[table] ?? null, error: null })
    chains[table] = chain
    return chain
  })
  const rpc = jest.fn().mockResolvedValue({ data: rpcRows, error: null })
  ;(createServiceClient as jest.Mock).mockReturnValue({ from, rpc })
  return Object.assign(from, { chains, rpc })
}

beforeEach(() => {
  jest.resetAllMocks()
  process.env.SHARE_SIGNING_SECRET = SECRET
})
afterAll(() => {
  delete process.env.SHARE_SIGNING_SECRET
})

describe('loadSharedLineup', () => {
  it('returns the lineup for a valid token', async () => {
    const from = mockTables({ weeks: WEEK_ROW, games: GAME_ROW })
    await expect(loadSharedLineup(TOKEN)).resolves.toEqual({
      leagueName: 'The Boot Room',
      slug: 'the-boot-room',
      week: 13,
      date: '06 Oct 2026',
      format: '6-a-side',
      teamA: ['Marcus Reid', 'Rav Singh'],
      teamB: ['Callum Shaw', 'Sofia Marsh'],
      location: 'Powerleague Shoreditch',
      kickoffTime: '19:00',
    })
    expect(from.chains.weeks.eq).toHaveBeenCalledWith('id', WEEK_ID)
    expect(from.chains.games.eq).toHaveBeenCalledWith('id', 'game-1')
  })

  it('returns null once the lineups have changed', async () => {
    const from = mockTables({ weeks: { ...WEEK_ROW, team_a: ['Marcus Reid', 'Leon Brooks'] }, games: GAME_ROW })
    await expect(loadSharedLineup(TOKEN)).resolves.toBeNull()
    // Nothing about the league is fetched before the signature verifies.
    expect(from.mock.calls.map(([table]) => table)).toEqual(['weeks'])
  })

  it('returns null without touching the database when signing is not configured', async () => {
    delete process.env.SHARE_SIGNING_SECRET
    const from = mockTables({ weeks: WEEK_ROW, games: GAME_ROW })
    await expect(loadSharedLineup(TOKEN)).resolves.toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it.each([null, undefined, '', 'garbage'])('returns null for token %p', async (token) => {
    const from = mockTables({ weeks: WEEK_ROW, games: GAME_ROW })
    await expect(loadSharedLineup(token)).resolves.toBeNull()
    expect(from).not.toHaveBeenCalled()
  })

  it('returns null when the week no longer exists', async () => {
    mockTables({ games: GAME_ROW })
    await expect(loadSharedLineup(TOKEN)).resolves.toBeNull()
  })

  it('returns null when the league no longer exists', async () => {
    mockTables({ weeks: WEEK_ROW })
    await expect(loadSharedLineup(TOKEN)).resolves.toBeNull()
  })

  it('returns null when the database throws', async () => {
    ;(createServiceClient as jest.Mock).mockImplementation(() => { throw new Error('boom') })
    await expect(loadSharedLineup(TOKEN)).resolves.toBeNull()
  })
})

const GAME_ID = '9cf13e81-4382-428b-a4ec-c94cb8e2567e'
const GAME = { id: GAME_ID, name: 'The Boot Room', slug: 'the-boot-room', location: 'Powerleague Shoreditch', day: null, kickoff_time: '19:00', bio: null }

function played(id: string, week: number, date: string, teamA: string[], teamB: string[], winner: 'teamA' | 'teamB' | 'draw') {
  return { id, season: '2026', week, date, status: 'played' as const, teamA, teamB, winner, goal_difference: winner === 'draw' ? 0 : 2, team_a_rating: 4, team_b_rating: 4 }
}

describe('loadSharedResult', () => {
  const A = ['Marcus Reid', 'Rav Singh']
  const B = ['Callum Shaw', 'Sofia Marsh']
  const WEEKS = [
    played('00000000-0000-4000-8000-000000000001', 1, '07 Jul 2026', A, B, 'teamA'),
    played('00000000-0000-4000-8000-000000000002', 2, '14 Jul 2026', A, B, 'teamA'),
    played(WEEK_ID, 3, '21 Jul 2026', A, B, 'teamA'),
    played('00000000-0000-4000-8000-000000000004', 4, '28 Jul 2026', A, B, 'teamA'),
  ]
  const ROW = { game_id: GAME_ID, status: 'played', winner: 'teamA', goal_difference: 2, team_a: A, team_b: B }
  const RESULT_TOKEN = signResultToken(SECRET, WEEK_ID, { winner: 'teamA', goalDifference: 2, teamA: A, teamB: B })

  beforeEach(() => {
    ;(getGame as jest.Mock).mockResolvedValue(GAME)
    ;(getWeeks as jest.Mock).mockResolvedValue(WEEKS)
  })

  it('returns the result with highlights as of that game', async () => {
    mockTables({ weeks: ROW })
    const result = await loadSharedResult(RESULT_TOKEN)
    expect(result).toEqual(expect.objectContaining({
      leagueName: 'The Boot Room', slug: 'the-boot-room', week: 3, date: '21 Jul 2026',
      winner: 'teamA', goalDifference: 2, teamA: A, teamB: B,
    }))
    // Week 4 is later, so the streak is 3, not 4.
    expect(result?.highlights[0]).toEqual({ icon: 'flame', text: 'Marcus Reid · 3-game win streak' })
  })

  it('returns null once the result has been edited, without loading the league', async () => {
    mockTables({ weeks: { ...ROW, goal_difference: 1 } })
    await expect(loadSharedResult(RESULT_TOKEN)).resolves.toBeNull()
    expect(getGame).not.toHaveBeenCalled()
  })

  it('returns null for a week that is not played', async () => {
    mockTables({ weeks: { ...ROW, status: 'dnf' } })
    await expect(loadSharedResult(RESULT_TOKEN)).resolves.toBeNull()
  })

  it('returns null for a lineup token', async () => {
    mockTables({ weeks: ROW })
    await expect(loadSharedResult(signLineupToken(SECRET, WEEK_ID, { teamA: A, teamB: B }))).resolves.toBeNull()
  })

  it('returns null without a secret', async () => {
    delete process.env.SHARE_SIGNING_SECRET
    const from = mockTables({ weeks: ROW })
    await expect(loadSharedResult(RESULT_TOKEN)).resolves.toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
})

describe('resultShareUrlFor', () => {
  const WEEK = played(WEEK_ID, 3, '21 Jul 2026', ['Marcus Reid'], ['Callum Shaw'], 'teamB')

  it('signs a played week', () => {
    const url = resultShareUrlFor('the-boot-room', WEEK)
    expect(url).toMatch(/^https:\/\/craft-football\.com\/the-boot-room\?result=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
  })

  it('never throws on a week id that is not a UUID', () => {
    expect(resultShareUrlFor('the-boot-room', { ...WEEK, id: 'w1' })).toBeNull()
  })

  it('signs a played week with no margin, and the link then loads', async () => {
    const A = ['Marcus Reid']
    const B = ['Callum Shaw']
    const week = { ...played(WEEK_ID, 3, '21 Jul 2026', A, B, 'teamA'), goal_difference: null }
    const url = resultShareUrlFor('the-boot-room', week)!
    expect(url).not.toBeNull()
    ;(getGame as jest.Mock).mockResolvedValue(GAME)
    ;(getWeeks as jest.Mock).mockResolvedValue([week])
    mockTables({ weeks: { game_id: GAME_ID, status: 'played', winner: 'teamA', goal_difference: null, team_a: A, team_b: B } })
    const loaded = await loadSharedResult(url.split('?result=')[1])
    expect(loaded).toEqual(expect.objectContaining({ week: 3, winner: 'teamA', goalDifference: 0 }))
  })

  it('is null for a DNF week, a missing week or no secret', () => {
    expect(resultShareUrlFor('the-boot-room', { ...WEEK, status: 'dnf' })).toBeNull()
    expect(resultShareUrlFor('the-boot-room', null)).toBeNull()
    delete process.env.SHARE_SIGNING_SECRET
    expect(resultShareUrlFor('the-boot-room', WEEK)).toBeNull()
  })
})

describe('loadSharedQuarter', () => {
  // Five Q3 games so the quarter crowns a champion; "now" is well past Q3.
  const WEEKS = ['07 Jul 2026', '14 Jul 2026', '21 Jul 2026', '28 Jul 2026', '04 Aug 2026'].map((date, i) =>
    played(`00000000-0000-4000-8000-00000000000${i + 1}`, i + 1, date, ['Marcus Reid', 'Rav Singh'], ['Callum Shaw', 'Sofia Marsh'], 'teamA')
  )

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'))
    ;(getGame as jest.Mock).mockResolvedValue(GAME)
    ;(getWeeks as jest.Mock).mockResolvedValue(WEEKS)
  })
  afterEach(() => jest.useRealTimers())

  it('returns the champion and podium for a completed quarter', async () => {
    const quarter = await loadSharedQuarter(signQuarterToken(SECRET, GAME_ID, 2026, 3))
    expect(quarter).toEqual(expect.objectContaining({ leagueName: 'The Boot Room', year: 2026, q: 3, seasonName: 'Summer', gamesPlayed: 5 }))
    expect(quarter?.podium[0]).toEqual({ name: 'Marcus Reid', points: 15, won: 5, drew: 0 })
    expect(quarter?.podium).toHaveLength(3)
  })

  it('returns null for a quarter without a champion', async () => {
    await expect(loadSharedQuarter(signQuarterToken(SECRET, GAME_ID, 2026, 2))).resolves.toBeNull()
  })

  it('returns null for a tampered token without loading anything', async () => {
    const [id, , sig] = signQuarterToken(SECRET, GAME_ID, 2026, 3).split('.')
    await expect(loadSharedQuarter(`${id}.20262.${sig}`)).resolves.toBeNull()
    expect(getWeeks).not.toHaveBeenCalled()
  })

  it('never throws on a bad game id or quarter', () => {
    expect(quarterShareUrls('the-boot-room', 'not-a-uuid', [{ year: 2026, q: 3 }])).toEqual({})
    const urls = quarterShareUrls('the-boot-room', GAME_ID, [{ year: 2026, q: 5 }, { year: 26, q: 3 }, { year: 2026, q: 3 }])
    expect(Object.keys(urls)).toEqual(['2026-3'])
  })

  it('signs every quarter it is given', () => {
    const urls = quarterShareUrls('the-boot-room', GAME_ID, [{ year: 2026, q: 3 }])
    expect(Object.keys(urls)).toEqual(['2026-3'])
    expect(urls['2026-3']).toMatch(/\/the-boot-room\/honours\?quarter=.+#q-2026-3$/)
  })
})

describe('loadSharedLeague', () => {
  it('counts played games and players and finds the next game', async () => {
    ;(getGame as jest.Mock).mockResolvedValue(GAME)
    ;(getWeeks as jest.Mock).mockResolvedValue([
      played('00000000-0000-4000-8000-000000000001', 1, '07 Jul 2026', ['Marcus Reid'], ['Callum Shaw'], 'teamA'),
      played('00000000-0000-4000-8000-000000000002', 2, '14 Jul 2026', ['Marcus Reid'], ['Rav Singh'], 'draw'),
      { id: 's', season: '2099', week: 3, date: '05 Jan 2099', status: 'scheduled', teamA: [], teamB: [], winner: null },
    ])
    await expect(loadSharedLeague(signLeagueToken(SECRET, GAME_ID))).resolves.toEqual({
      leagueName: 'The Boot Room',
      slug: 'the-boot-room',
      gamesPlayed: 2,
      playerCount: 3,
      nextGame: { date: '05 Jan 2099', kickoffTime: '19:00', location: 'Powerleague Shoreditch' },
    })
  })

  it('returns null for a bad token', async () => {
    await expect(loadSharedLeague('garbage')).resolves.toBeNull()
    expect(getGame).not.toHaveBeenCalled()
  })

  it('signs a league token only when configured', () => {
    expect(leagueShareTokenFor(GAME_ID)).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
    expect(leagueShareTokenFor('not-a-uuid')).toBeNull()
    delete process.env.SHARE_SIGNING_SECRET
    expect(leagueShareTokenFor(GAME_ID)).toBeNull()
  })
})

describe('loadInvitePreview', () => {
  const TOKEN = 'a'.repeat(64)

  it('returns only the league name for a live invite', async () => {
    const service = mockTables({}, [{ league_name: 'The Boot Room', league_slug: 'the-boot-room', role: 'admin', target_email: 'x@y.z' }])
    await expect(loadInvitePreview(TOKEN)).resolves.toEqual({ leagueName: 'The Boot Room' })
    expect(service.rpc).toHaveBeenCalledWith('preview_invite', { invite_token: TOKEN })
  })

  it('returns null when the RPC throws', async () => {
    const service = mockTables({})
    service.rpc.mockRejectedValue(new Error('boom'))
    await expect(loadInvitePreview(TOKEN)).resolves.toBeNull()
  })

  it('returns null for an unknown or malformed invite', async () => {
    mockTables({}, [])
    await expect(loadInvitePreview(TOKEN)).resolves.toBeNull()
    const service = mockTables({}, [])
    await expect(loadInvitePreview('bad token!')).resolves.toBeNull()
    expect(service.rpc).not.toHaveBeenCalled()
  })
})
