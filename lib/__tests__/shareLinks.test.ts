import {
  buildInviteShareMetadata,
  buildLeagueShareMetadata,
  buildLineupShareMetadata,
  buildQuarterShareMetadata,
  buildResultShareMetadata,
  getShareSecret,
  lineupShareUrl,
  parseLeagueToken,
  parseLineupToken,
  parseQuarterToken,
  parseResultToken,
  quarterShareUrl,
  resultFieldsOf,
  resultShareUrl,
  signLeagueToken,
  signLineupToken,
  signQuarterToken,
  signResultToken,
  verifyLeagueSignature,
  verifyLineupSignature,
  verifyQuarterSignature,
  verifyResultSignature,
} from '../shareLinks'
import type { SharedLeague, SharedLineup, SharedQuarter, SharedResult } from '../types'

const SECRET = 'test-secret'
const WEEK = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const TEAMS = { teamA: ['Marcus Reid', 'Rav Singh'], teamB: ['Callum Shaw', 'Sofia Marsh'] }

function verify(token: string, teams = TEAMS, secret = SECRET): boolean {
  const parsed = parseLineupToken(token)
  return parsed !== null && verifyLineupSignature(secret, parsed, teams)
}

describe('lineup share tokens', () => {
  it('is a 22-char week id and a 16-char signature', () => {
    expect(signLineupToken(SECRET, WEEK, TEAMS)).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
  })

  it('keeps the exact bytes of the original token so links already shared still verify', () => {
    expect(signLineupToken(SECRET, WEEK, TEAMS)).toBe('PyuMHppNTm-LehwtPk9aaw.7fZAQ83ce0ODN4zj')
  })

  it('round-trips the week id and verifies', () => {
    const token = signLineupToken(SECRET, WEEK, TEAMS)
    expect(parseLineupToken(token)?.weekId).toBe(WEEK)
    expect(verify(token)).toBe(true)
  })

  it('treats upper-case week ids the same as lower-case', () => {
    expect(signLineupToken(SECRET, WEEK.toUpperCase(), TEAMS)).toBe(signLineupToken(SECRET, WEEK, TEAMS))
  })

  it('rejects a tampered signature', () => {
    const [id, sig] = signLineupToken(SECRET, WEEK, TEAMS).split('.')
    const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    expect(verify(`${id}.${flipped}`)).toBe(false)
  })

  it('rejects a signature moved onto another week', () => {
    const [otherId] = signLineupToken(SECRET, '00000000-0000-4000-8000-000000000000', TEAMS).split('.')
    const [, sig] = signLineupToken(SECRET, WEEK, TEAMS).split('.')
    expect(verify(`${otherId}.${sig}`)).toBe(false)
  })

  it.each([
    ['a player changes', { teamA: ['Marcus Reid', 'Leon Brooks'], teamB: TEAMS.teamB }],
    ['a player is added', { teamA: [...TEAMS.teamA, 'Leon Brooks'], teamB: TEAMS.teamB }],
    ['a player is removed', { teamA: ['Marcus Reid'], teamB: TEAMS.teamB }],
    ['players are reordered', { teamA: ['Rav Singh', 'Marcus Reid'], teamB: TEAMS.teamB }],
    ['the teams are swapped', { teamA: TEAMS.teamB, teamB: TEAMS.teamA }],
  ])('fails verification when %s', (_label, teams) => {
    expect(verify(signLineupToken(SECRET, WEEK, TEAMS), teams)).toBe(false)
  })

  it('fails verification with a different secret', () => {
    expect(verify(signLineupToken(SECRET, WEEK, TEAMS), TEAMS, 'other-secret')).toBe(false)
  })

  it('throws when the week id is not a UUID', () => {
    expect(() => signLineupToken(SECRET, 'not-a-uuid', TEAMS)).toThrow('signLineupToken: weekId must be a UUID')
  })

  it('returns null for non-string tokens', () => {
    expect(parseLineupToken(['a', 'b'])).toBeNull()
    expect(parseLineupToken(undefined)).toBeNull()
    expect(parseLineupToken(null)).toBeNull()
  })

  it('rejects a non-canonical week id that decodes to the same bytes', () => {
    const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    const [id, sig] = signLineupToken(SECRET, WEEK, TEAMS).split('.')
    // The last char carries 2 data bits and 4 spare bits, so the canonical char
    // has an index that is a multiple of 16; index + 1 sets a spare bit only.
    const last = id[id.length - 1]
    expect(ALPHABET.indexOf(last) % 16).toBe(0)
    const sibling = id.slice(0, -1) + ALPHABET[ALPHABET.indexOf(last) + 1]
    expect(Buffer.from(sibling, 'base64url')).toEqual(Buffer.from(id, 'base64url'))
    expect(parseLineupToken(`${sibling}.${sig}`)).toBeNull()
  })

  it.each([
    '',
    'nope',
    'a.b',
    'a.b.c',
    `${'A'.repeat(22)}.${'A'.repeat(15)}`,
    `${'!'.repeat(22)}.${'A'.repeat(16)}`,
  ])('returns null for malformed token %p', (token) => {
    expect(parseLineupToken(token)).toBeNull()
  })
})

describe('getShareSecret', () => {
  const original = process.env.SHARE_SIGNING_SECRET
  afterEach(() => {
    if (original === undefined) delete process.env.SHARE_SIGNING_SECRET
    else process.env.SHARE_SIGNING_SECRET = original
  })

  it('returns the secret when set', () => {
    process.env.SHARE_SIGNING_SECRET = 'abc'
    expect(getShareSecret()).toBe('abc')
  })

  it('returns null when missing or empty', () => {
    delete process.env.SHARE_SIGNING_SECRET
    expect(getShareSecret()).toBeNull()
    process.env.SHARE_SIGNING_SECRET = ''
    expect(getShareSecret()).toBeNull()
  })
})

describe('lineupShareUrl', () => {
  it('points at the league root with the token', () => {
    expect(lineupShareUrl('the-boot-room', 'abc.def')).toBe('https://craft-football.com/the-boot-room?lineup=abc.def')
  })
})

describe('buildLineupShareMetadata', () => {
  const LINEUP: SharedLineup = {
    leagueName: 'The Boot Room',
    slug: 'the-boot-room',
    week: 13,
    date: '06 Oct 2026', // a Tuesday
    format: '6-a-side',
    teamA: ['Marcus Reid'],
    teamB: ['Callum Shaw'],
    location: 'Powerleague Shoreditch',
    kickoffTime: '19:00',
  }

  it('builds the title, description and large image', () => {
    const meta = buildLineupShareMetadata(LINEUP, 'tok.sig')
    expect(meta.openGraph?.title).toBe('Week 13 lineups · The Boot Room')
    expect(meta.openGraph?.description).toBe('Tue 06 Oct · 19:00 · Powerleague Shoreditch')
    expect(meta.openGraph?.images).toEqual([
      { url: '/api/og/lineup?t=tok.sig', width: 1200, height: 630, alt: 'Week 13 lineups · The Boot Room' },
    ])
    // The root URL redirects to /results?lineup=..., so og:url would loop scrapers.
    expect(meta.openGraph).not.toHaveProperty('url')
    expect(meta.twitter).toEqual(expect.objectContaining({ card: 'summary_large_image' }))
  })

  it('leaves out kick-off and venue when not set', () => {
    const meta = buildLineupShareMetadata({ ...LINEUP, kickoffTime: null, location: null }, 'tok.sig')
    expect(meta.openGraph?.description).toBe('Tue 06 Oct')
  })
})

const GAME = '9cf13e81-4382-428b-a4ec-c94cb8e2567e'
const RESULT = { winner: 'teamA' as const, goalDifference: 3, ...TEAMS }

describe('result share tokens', () => {
  function verifyResult(token: string, result = RESULT): boolean {
    const parsed = parseResultToken(token)
    return parsed !== null && verifyResultSignature(SECRET, parsed, result)
  }

  it('round-trips the week id and verifies', () => {
    const token = signResultToken(SECRET, WEEK, RESULT)
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
    expect(parseResultToken(token)?.weekId).toBe(WEEK)
    expect(verifyResult(token)).toBe(true)
  })

  it.each([
    ['the winner changes', { ...RESULT, winner: 'teamB' as const }],
    ['it becomes a draw', { ...RESULT, winner: 'draw' as const, goalDifference: 0 }],
    ['the margin changes', { ...RESULT, goalDifference: 2 }],
    ['a player changes', { ...RESULT, teamA: ['Marcus Reid', 'Leon Brooks'] }],
    ['players are reordered', { ...RESULT, teamB: ['Sofia Marsh', 'Callum Shaw'] }],
  ])('fails verification when %s', (_label, result) => {
    expect(verifyResult(signResultToken(SECRET, WEEK, RESULT), result)).toBe(false)
  })

  it('never verifies a lineup token as a result, or the reverse', () => {
    expect(verifyResult(signLineupToken(SECRET, WEEK, TEAMS))).toBe(false)
    expect(verify(signResultToken(SECRET, WEEK, RESULT))).toBe(false)
  })

  it('throws when the week id is not a UUID', () => {
    expect(() => signResultToken(SECRET, 'nope', RESULT)).toThrow('signResultToken: weekId must be a UUID')
  })
})

describe('resultFieldsOf', () => {
  it('maps a week and counts a missing margin as 0', () => {
    expect(resultFieldsOf({ winner: 'teamA', goal_difference: null, ...TEAMS }))
      .toEqual({ winner: 'teamA', goalDifference: 0, ...TEAMS })
    expect(resultFieldsOf({ winner: 'teamB', goal_difference: 4, ...TEAMS })?.goalDifference).toBe(4)
  })

  it('is null without a winner', () => {
    expect(resultFieldsOf({ winner: null, ...TEAMS })).toBeNull()
  })
})

describe('league share tokens', () => {
  function verifyLeague(token: string, secret = SECRET): boolean {
    const parsed = parseLeagueToken(token)
    return parsed !== null && verifyLeagueSignature(secret, parsed)
  }

  it('round-trips the game id and verifies', () => {
    const token = signLeagueToken(SECRET, GAME)
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
    expect(parseLeagueToken(token)?.gameId).toBe(GAME)
    expect(verifyLeague(token)).toBe(true)
  })

  it('fails with a different secret', () => {
    expect(verifyLeague(signLeagueToken(SECRET, GAME), 'other-secret')).toBe(false)
  })

  it('rejects a signature moved onto another league', () => {
    const [otherId] = signLeagueToken(SECRET, WEEK).split('.')
    const [, sig] = signLeagueToken(SECRET, GAME).split('.')
    expect(verifyLeague(`${otherId}.${sig}`)).toBe(false)
  })

  it('never verifies a lineup token with the same id', () => {
    expect(verifyLeague(signLineupToken(SECRET, GAME, TEAMS))).toBe(false)
  })
})

describe('quarter share tokens', () => {
  function verifyQuarter(token: string): boolean {
    const parsed = parseQuarterToken(token)
    return parsed !== null && verifyQuarterSignature(SECRET, parsed)
  }

  it('carries the year and quarter', () => {
    const token = signQuarterToken(SECRET, GAME, 2026, 3)
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}\.20263\.[A-Za-z0-9_-]{16}$/)
    expect(parseQuarterToken(token)).toEqual(expect.objectContaining({ gameId: GAME, year: 2026, q: 3 }))
    expect(verifyQuarter(token)).toBe(true)
  })

  it('fails when the quarter is edited', () => {
    const [id, , sig] = signQuarterToken(SECRET, GAME, 2026, 3).split('.')
    expect(verifyQuarter(`${id}.20262.${sig}`)).toBe(false)
  })

  it.each([
    '',
    'a.b',
    `${'A'.repeat(22)}.${'A'.repeat(16)}`,
    `${'A'.repeat(22)}.20265.${'A'.repeat(16)}`,
    `${'A'.repeat(22)}.2026.${'A'.repeat(16)}`,
  ])('returns null for malformed token %p', (token) => {
    expect(parseQuarterToken(token)).toBeNull()
  })

  it('rejects a quarter outside 1 to 4 when signing', () => {
    expect(() => signQuarterToken(SECRET, GAME, 2026, 5)).toThrow('signQuarterToken: q must be 1 to 4')
  })
})

describe('share URLs', () => {
  it('builds result and quarter links', () => {
    expect(resultShareUrl('the-boot-room', 'a.b')).toBe('https://craft-football.com/the-boot-room?result=a.b')
    expect(quarterShareUrl('the-boot-room', 'a.20263.b', 2026, 3)).toBe(
      'https://craft-football.com/the-boot-room/honours?quarter=a.20263.b#q-2026-3'
    )
  })
})

describe('share metadata builders', () => {
  const RESULT_SHARE: SharedResult = {
    leagueName: 'The Boot Room', slug: 'the-boot-room', week: 41, date: '06 Oct 2026',
    winner: 'teamA', goalDifference: 3, teamA: [], teamB: [], highlights: [],
  }
  const QUARTER: SharedQuarter = {
    leagueName: 'The Boot Room', slug: 'the-boot-room', year: 2026, q: 3, seasonName: 'Summer',
    dateRange: { from: '07 Jul 2026', to: '29 Sep 2026' }, gamesPlayed: 12,
    podium: [{ name: 'Jordan Hale', points: 24, won: 8, drew: 0 }],
  }
  const LEAGUE: SharedLeague = {
    leagueName: 'The Boot Room', slug: 'the-boot-room', gamesPlayed: 142, playerCount: 38,
    nextGame: { date: '13 Oct 2026', kickoffTime: '19:00', location: 'Powerleague Shoreditch' },
  }

  it('describes a result', () => {
    const meta = buildResultShareMetadata(RESULT_SHARE, 'tok')
    expect(meta.openGraph?.title).toBe('Week 41 result · The Boot Room')
    expect(meta.openGraph?.description).toBe('Team A won by 3 · Tue 06 Oct')
    expect(meta.openGraph?.images).toEqual([
      { url: '/api/og/result?t=tok', width: 1200, height: 630, alt: 'Week 41 result · The Boot Room' },
    ])
    expect(meta.openGraph).not.toHaveProperty('url')
    expect(meta.twitter).toEqual(expect.objectContaining({ card: 'summary_large_image' }))
  })

  it('does not say "won by 0" for a win without a margin', () => {
    const meta = buildResultShareMetadata({ ...RESULT_SHARE, winner: 'teamB', goalDifference: 0 }, 'tok')
    expect(meta.openGraph?.description).toBe('Team B won · Tue 06 Oct')
  })

  it('describes a draw', () => {
    const meta = buildResultShareMetadata({ ...RESULT_SHARE, winner: 'draw', goalDifference: 0 }, 'tok')
    expect(meta.openGraph?.description).toBe('Draw · Tue 06 Oct')
  })

  it('describes a quarter', () => {
    const meta = buildQuarterShareMetadata(QUARTER, 'tok')
    expect(meta.openGraph?.title).toBe('Q3 2026 champion · The Boot Room')
    expect(meta.openGraph?.description).toBe('Jordan Hale wins the Summer quarter with 24 pts')
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/quarter?t=tok' })])
  })

  it('describes a league with a next game', () => {
    const meta = buildLeagueShareMetadata(LEAGUE, 'tok')
    expect(meta.openGraph?.title).toBe('The Boot Room')
    expect(meta.openGraph?.description).toBe('Next game Tue 13 Oct · 19:00 · Powerleague Shoreditch')
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/league?t=tok' })])
  })

  it('describes a league with no next game', () => {
    const meta = buildLeagueShareMetadata({ ...LEAGUE, nextGame: null }, 'tok')
    expect(meta.openGraph?.description).toBe('142 games played')
  })

  it('describes an invite without the role or email', () => {
    const meta = buildInviteShareMetadata({ leagueName: 'The Boot Room' }, 'abc 123')
    expect(meta.openGraph?.title).toBe('Join The Boot Room on Craft Football')
    expect(meta.openGraph?.description).toBe('Results, stats and fair teams for your weekly game.')
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/invite?token=abc%20123' })])
  })
})
