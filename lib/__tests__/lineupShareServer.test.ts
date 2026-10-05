import { createServiceClient } from '@/lib/supabase/service'
import { signLineupToken } from '@/lib/lineupShare'

jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

// Import after the mock is registered.
import { loadSharedLineup } from '@/lib/lineupShareServer'

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
function mockTables(rows: Record<string, unknown>) {
  const chains: Record<string, Record<string, jest.Mock>> = {}
  const from = jest.fn((table: string) => {
    const chain: Record<string, jest.Mock> = {}
    chain.select = jest.fn(() => chain)
    chain.eq = jest.fn(() => chain)
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: rows[table] ?? null, error: null })
    chains[table] = chain
    return chain
  })
  ;(createServiceClient as jest.Mock).mockReturnValue({ from })
  return Object.assign(from, { chains })
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
