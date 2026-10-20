import { createClient } from '@/lib/supabase/server'
import {
  notifyAdminsOfJoinRequest,
  notifyRequesterOfReview,
} from '@/lib/email/send-join-request-notifications'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/email/send-join-request-notifications', () => ({
  notifyAdminsOfJoinRequest: jest.fn().mockResolvedValue(undefined),
  notifyRequesterOfReview: jest.fn().mockResolvedValue(undefined),
}))

import { POST as submitRequest } from '@/app/api/league/[id]/join-requests/route'
import { POST as approveRequest } from '@/app/api/league/[id]/join-requests/[requestId]/approve/route'
import { POST as approveClaim } from '@/app/api/league/[id]/player-claims/[claimId]/approve/route'

const rpc = jest.fn()

function setup({ user = true, rpcError = null as null | { message: string } } = {}) {
  rpc.mockResolvedValue({ data: null, error: rpcError })
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: user ? { id: 'u1', email: 'a@example.com' } : null },
        error: null,
      }),
    },
    rpc,
  })
}

function post(body: unknown) {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const requestParams = { params: Promise.resolve({ id: 'g1', requestId: 'r1' }) }
const claimParams = { params: Promise.resolve({ id: 'g1', claimId: 'c1' }) }

beforeEach(() => {
  rpc.mockReset()
  ;(notifyAdminsOfJoinRequest as jest.Mock).mockClear()
  ;(notifyRequesterOfReview as jest.Mock).mockClear()
})

describe('POST join-requests', () => {
  it('passes played_before to submit_join_request', async () => {
    setup()
    const res = await submitRequest(
      post({ message: null, player_name: null, played_before: true }) as never,
      { params: Promise.resolve({ id: 'g1' }) },
    )
    expect(res.status).toBe(201)
    expect(rpc).toHaveBeenCalledWith('submit_join_request', {
      p_game_id: 'g1',
      p_message: null,
      p_player_name: null,
      p_played_before: true,
    })
  })

  it('sends null when played_before is missing or not a boolean', async () => {
    setup()
    await submitRequest(post({ played_before: 'yes' }) as never, { params: Promise.resolve({ id: 'g1' }) })
    expect(rpc.mock.calls[0][1].p_played_before).toBeNull()
  })
})

describe('POST join-requests/[requestId]/approve', () => {
  it('requires sign-in', async () => {
    setup({ user: false })
    const res = await approveRequest(post({ player_name: 'Sam O' }), requestParams)
    expect(res.status).toBe(401)
  })

  it('rejects a blank name without calling the RPC', async () => {
    setup()
    const res = await approveRequest(post({ player_name: ' ' }), requestParams)
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('approves, creating a player, and notifies the requester', async () => {
    setup()
    const res = await approveRequest(post({ player_name: 'John Easton', create_player: true }), requestParams)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('approve_join_request', {
      p_request_id: 'r1',
      p_player_name: 'John Easton',
      p_create_player: true,
    })
    expect(notifyRequesterOfReview).toHaveBeenCalledWith('r1', 'approved', expect.any(String))
  })

  it('maps a name clash to 409 with a readable message', async () => {
    setup({ rpcError: { message: 'player_exists' } })
    const res = await approveRequest(post({ player_name: 'John E', create_player: true }), requestParams)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: "There's already a John E in the squad." })
    expect(notifyRequesterOfReview).not.toHaveBeenCalled()
  })
})

describe('POST player-claims/[claimId]/approve', () => {
  it('approves the claim with the chosen player', async () => {
    setup()
    const res = await approveClaim(post({ player_name: 'Sam O' }), claimParams)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('approve_player_claim', {
      p_claim_id: 'c1',
      p_player_name: 'Sam O',
      p_create_player: false,
    })
  })

  it('maps an already-linked player to 409', async () => {
    setup({ rpcError: { message: 'player_already_linked' } })
    const res = await approveClaim(post({ player_name: 'Sam O' }), claimParams)
    expect(res.status).toBe(409)
  })
})
