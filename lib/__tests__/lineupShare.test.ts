import {
  buildLineupShareMetadata,
  getShareSecret,
  lineupShareUrl,
  parseLineupToken,
  signLineupToken,
  verifyLineupSignature,
} from '../lineupShare'
import type { SharedLineup } from '../types'

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
