import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

// Import after the mocks are registered.
import { getUser, getAuthAndRole, getPendingBadgeCount, getMyJoinRequestStatus, getMyClaimInfo } from '@/lib/fetchers'

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
  const getUserMock = jest.fn().mockResolvedValue({ data: { user }, error: null })
  const rpc = jest.fn()
  ;(createClient as jest.Mock).mockResolvedValue({ auth: { getUser: getUserMock }, rpc })
  return { getUserMock, rpc }
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
    const { rpc } = mockAuth(USER)
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() => queryReturning({ role: 'admin' })),
    })
    rpc.mockImplementation((name: string) => {
      if (name === 'get_join_requests') return Promise.resolve({ data: [{}, {}], error: null })
      if (name === 'get_player_claims') return Promise.resolve({ data: [{ status: 'pending' }, { status: 'approved' }], error: null })
      return Promise.resolve({ data: null, error: { message: 'unknown rpc' } })
    })
    await expect(getPendingBadgeCount(LEAGUE)).resolves.toBe(3)
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
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
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
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: USER }, error: null }) },
      from: jest.fn(() => queryReturning({ status: 'approved', admin_override_name: null, player_name: 'Dev' })),
      rpc: jest.fn(),
    })
    await expect(getMyClaimInfo(LEAGUE)).resolves.toEqual({ status: 'approved', playerName: 'Dev' })
  })
})
