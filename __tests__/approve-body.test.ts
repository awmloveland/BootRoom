import { approveErrorResponse, parseApproveBody } from '@/lib/playerUtils'

describe('parseApproveBody', () => {
  it('trims the name and reads create_player', () => {
    expect(parseApproveBody({ player_name: '  John Easton ', create_player: true }))
      .toEqual({ player_name: 'John Easton', create_player: true })
  })
  it('defaults create_player to false', () => {
    expect(parseApproveBody({ player_name: 'Sam O' })).toEqual({ player_name: 'Sam O', create_player: false })
  })
  it('rejects a missing or blank name', () => {
    expect(parseApproveBody({})).toBeNull()
    expect(parseApproveBody({ player_name: '   ' })).toBeNull()
    expect(parseApproveBody(null)).toBeNull()
    expect(parseApproveBody({ player_name: 'Sam', create_player: 'yes' })).toBeNull()
  })
})

describe('approveErrorResponse', () => {
  it.each([
    ['Access denied', 403, 'Forbidden'],
    ['Request not found', 404, 'Not found'],
    ['Claim not found', 404, 'Not found'],
    ['request_not_pending', 409, 'This has already been reviewed.'],
    ['claim_not_pending', 409, 'This has already been reviewed.'],
    ['player_exists', 409, "There's already a John E in the squad."],
    ['player_already_linked', 409, 'John E is already linked to another member.'],
    ['player_claim_pending', 409, 'Someone else has a pending claim for John E.'],
    ['player_not_found', 400, "John E isn't in the squad."],
    ['player_name_required', 400, 'Enter a player name.'],
  ])('maps %s', (message, status, error) => {
    expect(approveErrorResponse(message, 'John E')).toEqual({ status, error })
  })

  it('falls back to 500', () => {
    expect(approveErrorResponse('boom', 'John E')).toEqual({ status: 500, error: 'Internal server error' })
  })
})
