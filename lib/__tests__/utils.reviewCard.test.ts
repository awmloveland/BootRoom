import {
  buildReviewItems,
  findRosterPlayer,
  gamesLabel,
  initialPlaysAs,
  reviewProblem,
  timeAgo,
} from '../utils'
import type { PendingJoinRequest, PlayerAttribute, PlayerClaim } from '../types'

function request(overrides: Partial<PendingJoinRequest> = {}): PendingJoinRequest {
  return {
    id: 'r1',
    user_id: 'u1',
    email: 'john@example.com',
    display_name: 'John Easton',
    message: null,
    status: 'pending',
    created_at: '2026-10-20T10:00:00Z',
    player_name: null,
    played_before: null,
    ...overrides,
  }
}

function claim(overrides: Partial<PlayerClaim> = {}): PlayerClaim {
  return {
    id: 'c1',
    game_id: 'g1',
    user_id: 'u9',
    player_name: 'Sam O',
    admin_override_name: null,
    status: 'pending',
    reviewed_by: null,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
    display_name: 'Sam Okafor',
    email: 'sam@example.com',
    ...overrides,
  }
}

function player(name: string, overrides: Partial<PlayerAttribute> = {}): PlayerAttribute {
  return {
    name,
    strength: 'average',
    mentality: 'balanced',
    played: 0,
    linked_user_id: null,
    linked_display_name: null,
    ...overrides,
  }
}

describe('timeAgo', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  it('says just now under a minute', () => {
    expect(timeAgo('2026-10-20T11:59:30Z', now)).toBe('just now')
  })
  it('counts minutes', () => {
    expect(timeAgo('2026-10-20T11:59:00Z', now)).toBe('1 minute ago')
    expect(timeAgo('2026-10-20T11:15:00Z', now)).toBe('45 minutes ago')
  })
  it('counts hours', () => {
    expect(timeAgo('2026-10-20T11:00:00Z', now)).toBe('1 hour ago')
    expect(timeAgo('2026-10-20T01:00:00Z', now)).toBe('11 hours ago')
  })
  it('counts days up to 30', () => {
    expect(timeAgo('2026-10-19T12:00:00Z', now)).toBe('1 day ago')
    expect(timeAgo('2026-10-18T09:00:00Z', now)).toBe('2 days ago')
  })
  it('shows a date after 30 days', () => {
    expect(timeAgo('2026-09-01T12:00:00Z', now)).toBe('1 Sept')
  })
})

describe('gamesLabel', () => {
  it('handles none, one and many', () => {
    expect(gamesLabel(0)).toBe('no games yet')
    expect(gamesLabel(1)).toBe('1 game')
    expect(gamesLabel(23)).toBe('23 games')
  })
})

describe('buildReviewItems', () => {
  it('lists join requests first, then member claims oldest first', () => {
    const items = buildReviewItems(
      [request({ id: 'r1', user_id: 'u1' })],
      [
        claim({ id: 'c2', user_id: 'u3', created_at: '2026-10-19T12:00:00Z' }),
        claim({ id: 'c1', user_id: 'u2', created_at: '2026-10-18T12:00:00Z' }),
      ],
    )
    expect(items.map((i) => (i.kind === 'join' ? i.request.id : i.claim.id))).toEqual(['r1', 'c1', 'c2'])
  })

  it('drops claims from people with a pending join request', () => {
    const items = buildReviewItems([request({ user_id: 'u1' })], [claim({ user_id: 'u1' })])
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('join')
  })
})

describe('initialPlaysAs', () => {
  it('opens on the player they picked', () => {
    expect(initialPlaysAs({ kind: 'join', request: request({ player_name: 'John E', played_before: true }) }))
      .toEqual({ mode: 'existing', name: 'John E' })
  })
  it('opens the squad list when they played before but did not pick', () => {
    expect(initialPlaysAs({ kind: 'join', request: request({ played_before: true }) }))
      .toEqual({ mode: 'list' })
  })
  it('opens on a new player named after their profile when new', () => {
    expect(initialPlaysAs({ kind: 'join', request: request({ played_before: false }) }))
      .toEqual({ mode: 'new', name: 'John Easton' })
  })
  it('treats an unanswered request as new', () => {
    expect(initialPlaysAs({ kind: 'join', request: request() }))
      .toEqual({ mode: 'new', name: 'John Easton' })
  })
  it('opens a member claim on the claimed player', () => {
    expect(initialPlaysAs({ kind: 'claim', claim: claim() }))
      .toEqual({ mode: 'existing', name: 'Sam O' })
  })
})

describe('findRosterPlayer', () => {
  it('matches case-insensitively and ignores surrounding spaces', () => {
    const roster = [player('John E')]
    expect(findRosterPlayer(roster, '  john e ')?.name).toBe('John E')
    expect(findRosterPlayer(roster, 'John')).toBeUndefined()
  })
})

describe('reviewProblem', () => {
  const roster = [
    player('John E'),
    player('Sam O', { played: 23, linked_user_id: 'other', linked_display_name: 'Sam Smith' }),
    player('Dave S', { linked_user_id: 'u1', linked_display_name: 'John Easton' }),
  ]

  it('needs a choice while the squad list is open', () => {
    expect(reviewProblem({ mode: 'list' }, roster, 'u1')).toEqual({ kind: 'choose' })
  })
  it('needs a name for a new player', () => {
    expect(reviewProblem({ mode: 'new', name: '   ' }, roster, 'u1')).toEqual({ kind: 'empty' })
  })
  it('flags a new name already in the squad', () => {
    expect(reviewProblem({ mode: 'new', name: 'john e' }, roster, 'u1'))
      .toEqual({ kind: 'clash', player: roster[0] })
  })
  it('flags an existing player linked to someone else', () => {
    expect(reviewProblem({ mode: 'existing', name: 'Sam O' }, roster, 'u1'))
      .toEqual({ kind: 'linked', player: roster[1] })
  })
  it('allows a player already linked to this person', () => {
    expect(reviewProblem({ mode: 'existing', name: 'Dave S' }, roster, 'u1')).toBeNull()
  })
  it('allows a free existing player or a fresh new name', () => {
    expect(reviewProblem({ mode: 'existing', name: 'John E' }, roster, 'u1')).toBeNull()
    expect(reviewProblem({ mode: 'new', name: 'John Easton' }, roster, 'u1')).toBeNull()
  })
  it('allows an existing name missing from the roster (server checks line-ups)', () => {
    expect(reviewProblem({ mode: 'existing', name: 'Old Timer' }, roster, 'u1')).toBeNull()
  })
})
