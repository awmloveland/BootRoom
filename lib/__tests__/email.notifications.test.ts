import {
  notifyAdminsOfJoinRequest,
  notifyRequesterOfReview,
} from '@/lib/email/send-join-request-notifications'
import { createServiceClient } from '@/lib/supabase/service'
import { getResendClient } from '@/lib/email/resend'

jest.mock('@/lib/supabase/service')
jest.mock('@/lib/email/resend')

const mockEmailSend = jest.fn().mockResolvedValue({ data: { id: 'e1' }, error: null })

beforeEach(() => {
  jest.clearAllMocks()
  ;(getResendClient as jest.Mock).mockReturnValue({ emails: { send: mockEmailSend } })
})

/** Builds a chainable Supabase query mock whose terminal methods resolve to data. */
function makeChain(terminalData: unknown) {
  const result = { data: terminalData, error: null }
  const chain: Record<string, jest.Mock> = {}
  chain.select = jest.fn(() => chain)
  chain.eq = jest.fn(() => chain)
  chain.in = jest.fn().mockResolvedValue(result)
  chain.single = jest.fn().mockResolvedValue(result)
  return chain
}

describe('notifyAdminsOfJoinRequest', () => {
  it('sends one email per admin with correct subject and recipient', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'games') return makeChain({ name: 'Sunday 5s', slug: 'sunday-5s' })
        if (table === 'game_members') return makeChain([{ user_id: 'uid-admin' }])
        if (table === 'profiles') return makeChain({ display_name: 'Marcus Thompson' })
        throw new Error(`Unexpected table: ${table}`)
      }),
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({
            data: { user: { email: 'admin@test.com' } },
            error: null,
          }),
        },
      },
    })

    await notifyAdminsOfJoinRequest(
      'game-id',
      { userId: 'user-id', email: 'marcus@test.com', message: null },
      'https://craft-football.com'
    )

    expect(mockEmailSend).toHaveBeenCalledTimes(1)
    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@test.com',
        subject: 'New join request for Sunday 5s',
        from: 'notifications@craft-football.com',
      })
    )
  })

  it('sends one email per admin when there are multiple admins', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'games') return makeChain({ name: 'Sunday 5s', slug: 'sunday-5s' })
        if (table === 'game_members')
          return makeChain([{ user_id: 'uid-1' }, { user_id: 'uid-2' }])
        if (table === 'profiles') return makeChain({ display_name: 'Marcus' })
        throw new Error(`Unexpected table: ${table}`)
      }),
      auth: {
        admin: {
          getUserById: jest
            .fn()
            .mockResolvedValueOnce({ data: { user: { email: 'admin1@test.com' } }, error: null })
            .mockResolvedValueOnce({ data: { user: { email: 'admin2@test.com' } }, error: null }),
        },
      },
    })

    await notifyAdminsOfJoinRequest(
      'game-id',
      { userId: 'user-id', email: 'marcus@test.com', message: null },
      'https://craft-football.com'
    )

    expect(mockEmailSend).toHaveBeenCalledTimes(2)
  })

  it('does nothing when there are no admins', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'games') return makeChain({ name: 'Sunday 5s', slug: 'sunday-5s' })
        if (table === 'game_members') return makeChain([])
        throw new Error(`Unexpected table: ${table}`)
      }),
      auth: { admin: { getUserById: jest.fn() } },
    })

    await notifyAdminsOfJoinRequest(
      'game-id',
      { userId: 'user-id', email: 'marcus@test.com', message: null },
      'https://craft-football.com'
    )

    expect(mockEmailSend).not.toHaveBeenCalled()
  })
})

describe('notifyRequesterOfReview', () => {
  it('sends approved email with correct subject', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() =>
        makeChain({
          email: 'marcus@test.com',
          display_name: 'Marcus',
          games: { name: 'Sunday 5s', slug: 'sunday-5s' },
        })
      ),
    })

    await notifyRequesterOfReview('request-id', 'approved', 'https://craft-football.com')

    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'marcus@test.com',
        subject: "You've been approved to join Sunday 5s",
        from: 'notifications@craft-football.com',
      })
    )
  })

  it('sends declined email with correct subject', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() =>
        makeChain({
          email: 'marcus@test.com',
          display_name: 'Marcus',
          games: { name: 'Sunday 5s', slug: 'sunday-5s' },
        })
      ),
    })

    await notifyRequesterOfReview('request-id', 'declined', 'https://craft-football.com')

    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'marcus@test.com',
        subject: 'Update on your request to join Sunday 5s',
      })
    )
  })
})
