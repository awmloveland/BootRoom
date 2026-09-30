import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/supabase/service', () => ({ createServiceClient: jest.fn() }))

// Import after the mocks are registered.
import { getUser, getAuthAndRole } from '@/lib/fetchers'

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
