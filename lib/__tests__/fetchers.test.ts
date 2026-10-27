import { createClient } from '@/lib/supabase/server'
import { mockAuthNamespace } from '@/lib/__tests__/helpers/supabase-auth'
import { createServiceClient } from '@/lib/supabase/service'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

// unstable_cache is an identity in tests: the fetchers are exercised, the
// cross-request cache is not.
jest.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
  revalidateTag: jest.fn(),
}))

// Import after the mocks are registered.
import { getUser, getPlayerStats, getWeeks, getNavSession, getAuthAndRole, getPendingBadgeCount, getPendingRequests, getMyJoinRequestStatus, getMyClaimInfo, ensureUnrecordedWeek, getLeagueMembers, getRosterPlayers, getAllPlayerClaims, getAccountData } from '@/lib/fetchers'
import type { NavSession, Week } from '@/lib/types'

const LEAGUE = '11111111-1111-1111-1111-111111111111'
const USER = { id: 'user-1', email: 'a@b.c' }

/** Builds a chainable query mock whose terminal `maybeSingle` resolves to `data`. */
function queryReturning(data: unknown) {
  const chain: Record<string, jest.Mock> = {}
  for (const m of ['select', 'eq', 'in', 'order']) chain[m] = jest.fn(() => chain)
  chain.maybeSingle = jest.fn().mockResolvedValue({ data, error: null })
  return chain
}

function mockAuth(user: typeof USER | null) {
  const auth = mockAuthNamespace(user)
  const rpc = jest.fn()
  ;(createClient as jest.Mock).mockResolvedValue({ auth, rpc })
  return { rpc }
}

beforeEach(() => jest.resetAllMocks())

describe('getUser', () => {
  it('returns the signed-in user', async () => {
    mockAuth(USER)
    await expect(getUser()).resolves.toEqual(USER)
  })

  it('returns null when there is no session', async () => {
    mockAuth(null)
    await expect(getUser()).resolves.toBeNull()
  })

  it('returns null when the auth client throws', async () => {
    ;(createClient as jest.Mock).mockRejectedValue(new Error('cookies unavailable'))
    await expect(getUser()).resolves.toBeNull()
  })
})

describe('getAuthAndRole', () => {
  it('reports the league role for a signed-in member', async () => {
    mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'admin' })),
    })
    await expect(getAuthAndRole(LEAGUE)).resolves.toEqual({
      user: USER,
      userRole: 'admin',
      isAuthenticated: true,
    })
  })

  it('reports unauthenticated when there is no user', async () => {
    mockAuth(null)
    await expect(getAuthAndRole(LEAGUE)).resolves.toEqual({
      user: null,
      userRole: null,
      isAuthenticated: false,
    })
  })
})

describe('getPendingBadgeCount', () => {
  it('returns 0 for a plain member without calling either admin RPC', async () => {
    const { rpc } = mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'member' })),
    })
    await expect(getPendingBadgeCount(LEAGUE)).resolves.toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns 0 for a signed-out visitor without calling either admin RPC', async () => {
    const { rpc } = mockAuth(null)
    await expect(getPendingBadgeCount(LEAGUE)).resolves.toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('sums pending join requests and pending claims for an admin', async () => {
    mockAdminRpcs(
      [{ user_id: 'u1', display_name: 'Callum Shaw' }, { user_id: 'u2', display_name: 'Priya Nair' }],
      [{ user_id: 'u3', display_name: 'Sofia Marsh', status: 'pending' }, { user_id: 'u4', display_name: 'Rav Singh', status: 'approved' }]
    )
    await expect(getPendingBadgeCount(LEAGUE)).resolves.toBe(3)
  })

  it('counts a claim made with a pending join request once', async () => {
    mockAdminRpcs(
      [{ user_id: 'u1', display_name: 'Callum Shaw' }],
      [{ user_id: 'u1', display_name: 'Callum Shaw', status: 'pending' }]
    )
    await expect(getPendingBadgeCount(LEAGUE)).resolves.toBe(1)
  })
})

/** Signs in an admin and answers the two admin RPCs with the given rows. */
function mockAdminRpcs(joinRows: unknown[], claimRows: unknown[]) {
  const { rpc } = mockAuth(USER)
  ;(createServiceClient as jest.Mock).mockReturnValue({
    from: jest.fn(() => queryReturning({ role: 'admin' })),
  })
  rpc.mockImplementation((name: string) => {
    if (name === 'get_join_requests') return Promise.resolve({ data: joinRows, error: null })
    if (name === 'get_player_claims') return Promise.resolve({ data: claimRows, error: null })
    return Promise.resolve({ data: null, error: { message: 'unknown rpc' } })
  })
  return rpc
}

describe('getPendingRequests', () => {
  it('returns empty lists for a plain member without calling either admin RPC', async () => {
    const { rpc } = mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'member' })),
    })
    await expect(getPendingRequests(LEAGUE)).resolves.toEqual({ joinNames: [], claimNames: [] })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('names join requesters and members with a standalone pending claim', async () => {
    mockAdminRpcs(
      [{ user_id: 'u1', display_name: 'Callum Shaw' }, { user_id: 'u2', display_name: 'Priya Nair' }],
      [
        { user_id: 'u1', display_name: 'Callum Shaw', status: 'pending' },
        { user_id: 'u3', display_name: 'Sofia Marsh', status: 'pending' },
        { user_id: 'u4', display_name: 'Rav Singh', status: 'approved' },
        { user_id: 'u5', display_name: null, status: 'pending' },
      ]
    )
    await expect(getPendingRequests(LEAGUE)).resolves.toEqual({
      joinNames: ['Callum Shaw', 'Priya Nair'],
      claimNames: ['Sofia Marsh', 'A member'],
    })
  })
})

describe('getMyJoinRequestStatus', () => {
  it('returns null when signed out', async () => {
    mockAuth(null)
    await expect(getMyJoinRequestStatus(LEAGUE)).resolves.toBeNull()
  })

  it("returns 'member' for anyone with a league role", async () => {
    mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'member' })),
    })
    await expect(getMyJoinRequestStatus(LEAGUE)).resolves.toBe('member')
  })

  it('returns the join request status for a signed-in non-member', async () => {
    mockAuth(USER)
    const from = jest.fn((table: string) =>
      table === 'game_members'
        ? queryReturning(null)
        : queryReturning({ status: 'pending' })
    )
    ;(createServiceClient as jest.Mock).mockReturnValue({ from })
    await expect(getMyJoinRequestStatus(LEAGUE)).resolves.toBe('pending')
    expect(from).toHaveBeenCalledWith('game_join_requests')
  })

  it("returns 'none' for a signed-in non-member with no request", async () => {
    mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning(null)),
    })
    await expect(getMyJoinRequestStatus(LEAGUE)).resolves.toBe('none')
  })
})

describe('getMyClaimInfo', () => {
  it('short-circuits for a signed-in non-member without querying player_claims', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning(null)),
    })
    const authFrom = jest.fn()
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: mockAuthNamespace(USER),
      from: authFrom,
      rpc: jest.fn(),
    })
    await expect(getMyClaimInfo(LEAGUE)).resolves.toEqual({ status: 'none', playerName: null })
    expect(authFrom).not.toHaveBeenCalled()
  })

  it('returns the approved player name for a member', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'member' })),
    })
    ;(createClient as jest.Mock).mockResolvedValue({
      auth: mockAuthNamespace(USER),
      from: jest.fn(() => queryReturning({ status: 'approved', admin_override_name: null, player_name: 'Dev' })),
      rpc: jest.fn(),
    })
    await expect(getMyClaimInfo(LEAGUE)).resolves.toEqual({ status: 'approved', playerName: 'Dev' })
  })
})

describe('ensureUnrecordedWeek', () => {
  // Thursday league (day index 4).
  const playedWeek: Week = {
    id: 'w14', season: '2026', week: 14, date: '02 Apr 2026', status: 'played',
    teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA',
  }

  afterEach(() => { jest.useRealTimers() })

  it('creates and appends an unrecorded row when the last game day has no row', async () => {
    // Friday 10 Apr 2026: Thursday 9 Apr is past its 20:00 deadline.
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 12))
    const rpc = jest.fn().mockResolvedValue({ data: 'new-id', error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })

    const result = await ensureUnrecordedWeek(LEAGUE, [playedWeek], 4)

    expect(rpc).toHaveBeenCalledWith('create_unrecorded_week', {
      p_game_id: LEAGUE,
      p_season: '2026',
      p_week: 15,
      p_date: '09 Apr 2026',
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 'new-id', season: '2026', week: 15, date: '09 Apr 2026', status: 'unrecorded',
      teamA: [], teamB: [], winner: null,
    })
  })

  it('keys a January unrecorded row to week 1 of the new season', async () => {
    // Friday 8 Jan 2027: Thursday 7 Jan is past its deadline; the last game was in 2026.
    jest.useFakeTimers().setSystemTime(new Date(2027, 0, 8, 12))
    const rpc = jest.fn().mockResolvedValue({ data: 'new-id', error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
    const weeks: Week[] = [
      { id: 'w1', season: '2026', week: 1, date: '01 Jan 2026', status: 'played', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' },
      { id: 'w52', season: '2026', week: 52, date: '31 Dec 2026', status: 'played', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' },
    ]

    await ensureUnrecordedWeek(LEAGUE, weeks, 4)

    expect(rpc).toHaveBeenCalledWith('create_unrecorded_week', {
      p_game_id: LEAGUE,
      p_season: '2027',
      p_week: 1,
      p_date: '07 Jan 2027',
    })
  })

  it('does nothing when a row already exists for that date', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 12))
    const rpc = jest.fn()
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
    const weeks: Week[] = [
      playedWeek,
      { id: 'w15', season: '2026', week: 15, date: '09 Apr 2026', status: 'cancelled', teamA: [], teamB: [], winner: null },
    ]

    await expect(ensureUnrecordedWeek(LEAGUE, weeks, 4)).resolves.toBe(weeks)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does nothing before the game day deadline', async () => {
    // Thursday 9 Apr 2026 at midday: the deadline is 20:00 that evening.
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, 12))
    const rpc = jest.fn()
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
    const weeks = [playedWeek]

    await expect(ensureUnrecordedWeek(LEAGUE, weeks, 4)).resolves.toBe(weeks)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('getNavSession', () => {
  it('returns null when signed out', async () => {
    mockAuth(null)
    await expect(getNavSession()).resolves.toBeNull()
  })

  it('builds the display name and league roles for a signed-in user', async () => {
    mockAuth(USER)
    const profile = queryReturning({ first_name: 'Ada', last_name: 'Lovelace' })
    const memberships = {
      select: jest.fn(() => memberships),
      eq: jest.fn(() => memberships),
      overrideTypes: jest.fn().mockResolvedValue({
        data: [
          { role: 'admin', games: { slug: 'boot-room' } },
          { role: 'member', games: { slug: 'sunday' } },
        ],
        error: null,
      }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'profiles' ? profile : memberships)),
    })
    const session: NavSession | null = await getNavSession()
    expect(session).toEqual({
      userId: 'user-1',
      email: 'a@b.c',
      displayName: 'Ada Lovelace',
      leagues: [
        { slug: 'boot-room', role: 'admin' },
        { slug: 'sunday', role: 'member' },
      ],
    })
  })

  it('falls back to the email when the profile has no name', async () => {
    mockAuth(USER)
    const profile = queryReturning({ first_name: '', last_name: '' })
    const memberships = {
      select: jest.fn(() => memberships),
      eq: jest.fn(() => memberships),
      overrideTypes: jest.fn().mockResolvedValue({ data: [], error: null }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'profiles' ? profile : memberships)),
    })
    await expect(getNavSession()).resolves.toMatchObject({ displayName: 'a@b.c', leagues: [] })
  })

  it('drops memberships whose game is missing', async () => {
    mockAuth(USER)
    const profile = queryReturning({ first_name: 'Ada', last_name: 'Lovelace' })
    const memberships = {
      select: jest.fn(() => memberships),
      eq: jest.fn(() => memberships),
      overrideTypes: jest.fn().mockResolvedValue({
        data: [
          { role: 'admin', games: { slug: 'boot-room' } },
          { role: 'member', games: null },
        ],
        error: null,
      }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'profiles' ? profile : memberships)),
    })
    const session = await getNavSession()
    expect(session?.leagues).toEqual([{ slug: 'boot-room', role: 'admin' }])
  })

  it('logs and degrades when the memberships read fails', async () => {
    mockAuth(USER)
    const profile = queryReturning({ first_name: 'Ada', last_name: 'Lovelace' })
    const memberships = {
      select: jest.fn(() => memberships),
      eq: jest.fn(() => memberships),
      overrideTypes: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'profiles' ? profile : memberships)),
    })
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(getNavSession()).resolves.toMatchObject({ displayName: 'Ada Lovelace', leagues: [] })
      expect(errorSpy).toHaveBeenCalledTimes(1)
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('admin settings fetchers', () => {
  it('getLeagueMembers returns the RPC rows and [] on error', async () => {
    const { rpc } = mockAuth(USER)
    rpc.mockResolvedValueOnce({ data: [{ user_id: 'u2', email: 'b@b.c', display_name: 'B', role: 'member', joined_at: 'x', linked_player_name: null }], error: null })
    await expect(getLeagueMembers(LEAGUE)).resolves.toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('get_league_members', { p_game_id: LEAGUE })
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'Access denied' } })
    await expect(getLeagueMembers('other')).resolves.toEqual([])
  })

  it('getAllPlayerClaims returns every claim row', async () => {
    const { rpc } = mockAuth(USER)
    rpc.mockResolvedValueOnce({ data: [{ id: 'c1', status: 'pending' }, { id: 'c2', status: 'approved' }], error: null })
    await expect(getAllPlayerClaims(LEAGUE)).resolves.toHaveLength(2)
  })

  it('getRosterPlayers joins attributes with linked members and played counts', async () => {
    const { rpc } = mockAuth(USER)
    rpc.mockResolvedValueOnce({ data: [{ user_id: 'u2', email: 'b@b.c', display_name: 'Bea', role: 'member', joined_at: 'x', linked_player_name: 'Bea Smith' }], error: null })
    const attributes = {
      select: jest.fn(() => attributes),
      eq: jest.fn(() => attributes),
      order: jest.fn().mockResolvedValue({ data: [{ name: 'Bea Smith', rating: 3, mentality: 'balanced' }, { name: 'New Kid', rating: 0, mentality: 'attacking' }], error: null }),
    }
    const from = jest.fn(() => attributes)
    const serviceRpc = jest.fn().mockResolvedValue({ data: [{ name: 'Bea Smith', played: 12 }], error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue({ from, rpc: serviceRpc })
    await expect(getRosterPlayers(LEAGUE)).resolves.toEqual([
      { name: 'Bea Smith', strength: 'above', mentality: 'balanced', played: 12, linked_user_id: 'u2', linked_display_name: 'Bea' },
      { name: 'New Kid', strength: null, mentality: 'attacking', played: 0, linked_user_id: null, linked_display_name: null },
    ])
    expect(from).toHaveBeenCalledWith('player_attributes')
    expect(serviceRpc).toHaveBeenCalledWith('get_player_stats_public', { p_game_id: LEAGUE })
  })

  it('getRosterPlayers returns [] and logs when the attributes read fails', async () => {
    const { rpc } = mockAuth(USER)
    rpc.mockResolvedValueOnce({ data: [], error: null })
    const attributes = {
      select: jest.fn(() => attributes),
      eq: jest.fn(() => attributes),
      order: jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => attributes),
      rpc: jest.fn().mockResolvedValue({ data: [], error: null }),
    })
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(getRosterPlayers(LEAGUE)).resolves.toEqual([])
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('getAccountData', () => {
  it('returns null when signed out', async () => {
    mockAuth(null)
    await expect(getAccountData()).resolves.toBeNull()
  })

  it('keys claims by league id and drops memberships without a game', async () => {
    mockAuth(USER)
    const profile = queryReturning({ first_name: 'Ada', last_name: 'L', created_at: '2026-01-01' })
    const memberships = {
      select: jest.fn(() => memberships),
      eq: jest.fn(() => memberships),
      overrideTypes: jest.fn().mockResolvedValue({ data: [{ games: { id: 'g1', name: 'Boot Room' } }, { games: null }], error: null }),
    }
    const claims = {
      select: jest.fn(() => claims),
      eq: jest.fn().mockResolvedValue({ data: [{ id: 'c1', game_id: 'g1', status: 'pending', player_name: 'Ada' }], error: null }),
    }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => (table === 'profiles' ? profile : table === 'game_members' ? memberships : claims)),
    })
    await expect(getAccountData()).resolves.toEqual({
      email: 'a@b.c',
      firstName: 'Ada',
      lastName: 'L',
      createdAt: '2026-01-01',
      leagues: [{ id: 'g1', name: 'Boot Room' }],
      claims: { g1: { id: 'c1', game_id: 'g1', status: 'pending', player_name: 'Ada' } },
    })
  })
})

describe('ensureUnrecordedWeek when the row already exists', () => {
  afterEach(() => { jest.useRealTimers() })

  it('re-reads weeks uncached instead of returning the stale list', async () => {
    const existing: Week[] = [
      { id: 'w1', season: '2026', week: 1, date: '01 Oct 2026', status: 'played', teamA: ['A'], teamB: ['B'], winner: 'teamA' },
    ]
    const rows = [
      { id: 'w1', season: '2026', week: 1, date: '01 Oct 2026', status: 'played', format: null, team_a: ['A'], team_b: ['B'], winner: 'teamA', notes: null, goal_difference: null, team_a_rating: null, team_b_rating: null, lineup_metadata: null },
      { id: 'w2', season: '2026', week: 2, date: '08 Oct 2026', status: 'unrecorded', format: null, team_a: [], team_b: [], winner: null, notes: null, goal_difference: null, team_a_rating: null, team_b_rating: null, lineup_metadata: null },
    ]
    const weeksQuery = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), in: jest.fn().mockResolvedValue({ data: rows, error: null }) }
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => weeksQuery),
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }), // ON CONFLICT DO NOTHING
    })
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 10, 12)) // Sat 10 Oct 2026; Thursday 8 Oct has passed its deadline
    const result = await ensureUnrecordedWeek(LEAGUE, existing, 4)
    expect(result.map((w) => w.id)).toEqual(['w2', 'w1'])
    expect(result.find((w) => w.id === 'w2')?.status).toBe('unrecorded')
  })
})

describe('league reads', () => {
  // A failed read must throw: unstable_cache stores whatever resolves, so an
  // empty list returned here would serve "0 players" to everyone until the
  // entry expires. A throw is not cached, so the next request reads again.
  let consoleError: jest.SpyInstance
  beforeEach(() => { consoleError = jest.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => consoleError.mockRestore())

  it('getPlayerStats maps the rows', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ name: 'Alice', played: 3, won: 2, drew: 0, lost: 1, winRate: 66.7, recentForm: 'WLW' }], error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
    const players = await getPlayerStats(LEAGUE)
    expect(rpc).toHaveBeenCalledWith('get_player_stats_public', { p_game_id: LEAGUE })
    expect(players).toHaveLength(1)
    expect(players[0]).toMatchObject({ name: 'Alice', played: 3, recentForm: 'WLW' })
  })

  it('getPlayerStats throws and logs when the read fails', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'canceling statement due to statement timeout' } })
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
    await expect(getPlayerStats(LEAGUE)).rejects.toThrow('statement timeout')
    expect(consoleError).toHaveBeenCalled()
  })

  it('getWeeks throws and logs when the read fails', async () => {
    const chain: Record<string, jest.Mock> = {}
    for (const m of ['select', 'eq']) chain[m] = jest.fn(() => chain)
    chain.in = jest.fn().mockResolvedValue({ data: null, error: { message: 'upstream timeout' } })
    ;(createServiceClient as jest.Mock).mockReturnValue({ from: jest.fn(() => chain) })
    await expect(getWeeks(LEAGUE)).rejects.toThrow('upstream timeout')
    expect(consoleError).toHaveBeenCalled()
  })
})
