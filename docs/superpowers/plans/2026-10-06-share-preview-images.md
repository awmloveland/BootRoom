# Share Preview Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shared result, quarter, league and invite links unfurl with their own preview image, and every other craft-football.com link gets a default image.

**Architecture:** The line-ups signing module becomes a general `lib/shareLinks.ts` with one HMAC payload tag per kind. Server pages sign the links they render and pass them down as props; the result modal asks a new `share-link` endpoint after saving. `leaguePageMetadata` reads the token from the query string and adds Open Graph tags pointing at a `next/og` image route per kind. Share text builders are untouched: a `withShareLink` helper swaps the final link line at tap time.

**Tech Stack:** Next.js 16 App Router, `next/og` (`ImageResponse`, Satori), Node `crypto`, Supabase service client, Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-06-share-preview-images-design.md`

**Conventions for every task:**
- Run single test files with `npm test -- <path>`.
- Images in `components/og/` use inline `style` only (CLAUDE.md exception); every element with more than one child needs `display: 'flex'`.
- British English, no em dashes in UI copy. Use fictional names in fixtures.
- Commit message trailer: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `lib/shareLinks.ts` | renamed from `lib/lineupShare.ts`, extended | Token sign/parse/verify for lineup, result, quarter, league; share URLs; Open Graph metadata builders |
| `lib/shareLinksServer.ts` | renamed from `lib/lineupShareServer.ts`, extended | Token → data loaders for each image; server-side URL signing for pages |
| `lib/types.ts` | modify | `SharedResult`, `SharedQuarter`, `SharedLeague`, `SharedInvite`, `ResultHighlightIcon`, `ResultImageHighlight` |
| `lib/utils.ts` | modify | `computeResultHighlights`, `resultImageHighlights`, `playerStatsAsOf`, `weeksUpTo`, `withShareLink`, `leagueShareHref`, `fetchShareLink`, `fitFontSize`, `quarterShareKey`, `quarterRangeLabel`, `gamesPlayedLabel`, `nextLeagueGame`, `SITE_TAGLINE` |
| `lib/features.ts` | modify | `canSeeResults`, `canSeeQuarterChampion` |
| `lib/sidebar-stats.ts` | modify | `ResultsCelebration.shareUrls` |
| `lib/ogImage.tsx` | create | `shareImageResponse()` shared by every image route |
| `lib/metadata.ts` | modify | Reads `lineup` / `result` / `quarter` / `league` params |
| `components/og/frame.tsx` | create | `OG_SIZE`, `ROOT`, `MetaLine`, `Wordmark`, `FooterWordmark`, `DotField`, `Glow`, `OgIcon`, `GenericShareImage` |
| `components/og/LineupShareImage.tsx` | modify | Uses `frame.tsx` |
| `components/og/ResultShareImage.tsx` | create | Result image (layout C) |
| `components/og/QuarterShareImage.tsx` | create | Quarter image (layout A) |
| `components/og/LeagueShareImage.tsx` | create | League image (layout C) |
| `components/og/InviteShareImage.tsx` | create | Invite image |
| `app/api/og/{result,quarter,league,invite,default}/route.tsx` | create | Image routes |
| `app/api/og/lineup/route.tsx` | modify | Uses `shareImageResponse` |
| `app/api/league/[id]/share-link/route.ts` | create | Signs result and quarter links for the result modal |
| `app/[slug]/(tabs)/*/page.tsx` | modify | Pass `searchParams` to metadata; results and honours sign links |
| `app/[slug]/(tabs)/layout.tsx`, `components/LeaguePageHeader.tsx`, `components/LeagueJoinArea.tsx` | modify | League share token |
| `components/{ResultsSection,PublicResultsSection,WeekList,PublicMatchList,MatchCard,QuarterCelebration,HonoursSection,ResultModal}.tsx` | modify | Thread and use share URLs |
| `components/InviteAccept.tsx` | moved from `app/invite/page.tsx` | Client invite flow |
| `app/invite/page.tsx` | rewrite | Server wrapper with `generateMetadata` |
| `app/layout.tsx` | modify | Default `og:image` |
| `next.config.js` | modify | Trace fonts into every image route |

---

### Task 1: Generalise the signing module

**Files:**
- Rename: `lib/lineupShare.ts` → `lib/shareLinks.ts`, `lib/lineupShareServer.ts` → `lib/shareLinksServer.ts`, `lib/__tests__/lineupShare.test.ts` → `lib/__tests__/shareLinks.test.ts`, `lib/__tests__/lineupShareServer.test.ts` → `lib/__tests__/shareLinksServer.test.ts`
- Modify: every importer (found by grep), `lib/types.ts`, `lib/utils.ts`
- Test: `lib/__tests__/shareLinks.test.ts`

- [ ] **Step 1: Rename files and fix imports**

```bash
git mv lib/lineupShare.ts lib/shareLinks.ts
git mv lib/lineupShareServer.ts lib/shareLinksServer.ts
git mv lib/__tests__/lineupShare.test.ts lib/__tests__/shareLinks.test.ts
git mv lib/__tests__/lineupShareServer.test.ts lib/__tests__/shareLinksServer.test.ts
grep -rlE "lineupShare(Server)?'" app components lib __tests__ | xargs sed -i '' \
  -e "s#@/lib/lineupShareServer'#@/lib/shareLinksServer'#g" \
  -e "s#@/lib/lineupShare'#@/lib/shareLinks'#g" \
  -e "s#'\.\./lineupShareServer'#'../shareLinksServer'#g" \
  -e "s#'\.\./lineupShare'#'../shareLinks'#g"
grep -rnE "lineupShare(Server)?'" app components lib __tests__
```

Expected: the final grep prints nothing.

- [ ] **Step 2: Run the moved tests**

Run: `npm test -- lib/__tests__/shareLinks.test.ts lib/__tests__/shareLinksServer.test.ts lib/__tests__/metadata.lineupShare.test.ts __tests__/lineup-share-route.test.ts __tests__/og-lineup-route.test.tsx`
Expected: PASS (pure rename).

- [ ] **Step 3: Add the shared types**

Append to `lib/types.ts` after `SharedLineup`:

```ts
/** Icon next to a highlight line in the result preview image. */
export type ResultHighlightIcon = 'flame' | 'heart-crack' | 'zap' | 'award' | 'trending-up' | 'crown';

export interface ResultImageHighlight {
  icon: ResultHighlightIcon;
  text: string;
}

/** A played result, as drawn in its link-preview image. */
export interface SharedResult {
  leagueName: string;
  slug: string;
  week: number;
  date: string;               // 'DD MMM YYYY'
  winner: 'teamA' | 'teamB' | 'draw';
  goalDifference: number;
  teamA: string[];
  teamB: string[];
  highlights: ResultImageHighlight[]; // at most three, as of that game
}

/** A completed quarter with a champion, as drawn in its link-preview image. */
export interface SharedQuarter {
  leagueName: string;
  slug: string;
  year: number;
  q: number;
  seasonName: string;
  dateRange: { from: string; to: string }; // 'DD MMM YYYY'
  gamesPlayed: number;
  /** Top three of the final table; the first is the champion. Never empty. */
  podium: { name: string; points: number; won: number; drew: number }[];
}

/** A league card, as drawn in its link-preview image. */
export interface SharedLeague {
  leagueName: string;
  slug: string;
  gamesPlayed: number;
  playerCount: number;
  nextGame: { date: string; kickoffTime: string | null; location: string | null } | null;
}

/** An open invite, as drawn in its link-preview image. Never the role or email. */
export interface SharedInvite {
  leagueName: string;
}
```

- [ ] **Step 4: Add two small utils the metadata needs**

Add to `lib/utils.ts` (near `formatFixtureDate`):

```ts
/** The site tagline, used by the root metadata and the preview images. */
export const SITE_TAGLINE = 'Results, stats and fair teams for your weekly game.'

/** "1 game played", "142 games played". */
export function gamesPlayedLabel(n: number): string {
  return `${n} ${n === 1 ? 'game' : 'games'} played`
}
```

- [ ] **Step 5: Write the failing tests**

Append to `lib/__tests__/shareLinks.test.ts`, and replace its two import statements at the top with:

```ts
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
```

```ts
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
```

- [ ] **Step 6: Run to verify they fail**

Run: `npm test -- lib/__tests__/shareLinks.test.ts`
Expected: FAIL, `signResultToken` (and the others) are not exported.

- [ ] **Step 7: Rewrite `lib/shareLinks.ts`**

Replace the whole file with:

```ts
// Signed share links. Server-only: uses Node's crypto.
//
// Each kind signs a JSON payload that starts with its own version tag, so a
// token made for one kind never verifies as another.
//
//   lineup, result: <week id as base64url (22 chars)>.<signature (16 chars)>
//   league:         <game id as base64url (22 chars)>.<signature (16 chars)>
//   quarter:        <game id as base64url (22 chars)>.<year><q>.<signature (16 chars)>
//
// Lineup and result signatures cover the teams (and the result), so editing
// them produces a new link and an old link stops verifying. League and
// quarter signatures never change; their images are drawn from live data.
import { createHmac, timingSafeEqual } from 'crypto'
import type { Metadata } from 'next'
import { formatFixtureDate, gamesPlayedLabel, SITE_TAGLINE } from '@/lib/utils'
import type { SharedInvite, SharedLeague, SharedLineup, SharedQuarter, SharedResult } from '@/lib/types'

const SIG_BYTES = 12
const ENCODED_ID_RE = /^[A-Za-z0-9_-]{22}$/
const ENCODED_SIG_RE = /^[A-Za-z0-9_-]{16}$/
const UUID_HEX_RE = /^[0-9a-f]{32}$/
const QUARTER_RE = /^(\d{4})([1-4])$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SITE = 'https://craft-football.com'

export interface LineupTeams {
  teamA: string[]
  teamB: string[]
}

export interface ResultFields extends LineupTeams {
  winner: 'teamA' | 'teamB' | 'draw'
  goalDifference: number
}

export interface ParsedLineupToken {
  weekId: string
  signature: Buffer
}

export type ParsedResultToken = ParsedLineupToken

export interface ParsedLeagueToken {
  gameId: string
  signature: Buffer
}

export interface ParsedQuarterToken {
  gameId: string
  year: number
  q: number
  signature: Buffer
}

/** The signing key, or null when signing is not configured. */
export function getShareSecret(): string | null {
  return process.env.SHARE_SIGNING_SECRET || null
}

function encodeId(uuid: string): string {
  return Buffer.from(uuid.replace(/-/g, '').toLowerCase(), 'hex').toString('base64url')
}

function decodeId(encoded: string): string | null {
  if (!ENCODED_ID_RE.test(encoded)) return null
  const hex = Buffer.from(encoded, 'base64url').toString('hex')
  if (!UUID_HEX_RE.test(hex)) return null
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  // The last char has spare bits, so only the canonical encoding is accepted.
  return encodeId(uuid) === encoded ? uuid : null
}

function sign(secret: string, payload: unknown[]): Buffer {
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest().subarray(0, SIG_BYTES)
}

function matches(signature: Buffer, expected: Buffer): boolean {
  return signature.length === expected.length && timingSafeEqual(signature, expected)
}

function requireUuid(fn: string, name: string, id: string): void {
  if (!UUID_RE.test(id)) throw new Error(`${fn}: ${name} must be a UUID`)
}

/** Splits `<id>.<signature>` into its id and signature. Null when malformed. */
function parseIdToken(token: unknown): { id: string; signature: Buffer } | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2 || !ENCODED_SIG_RE.test(parts[1])) return null
  const id = decodeId(parts[0])
  return id ? { id, signature: Buffer.from(parts[1], 'base64url') } : null
}

// ── Lineup ────────────────────────────────────────────────────────────────────

function lineupPayload(weekId: string, { teamA, teamB }: LineupTeams): unknown[] {
  return ['lineup:v1', weekId.toLowerCase(), teamA, teamB]
}

export function signLineupToken(secret: string, weekId: string, teams: LineupTeams): string {
  requireUuid('signLineupToken', 'weekId', weekId)
  return `${encodeId(weekId)}.${sign(secret, lineupPayload(weekId, teams)).toString('base64url')}`
}

/** Splits a token into its week id and signature. Null when malformed. */
export function parseLineupToken(token: unknown): ParsedLineupToken | null {
  const parsed = parseIdToken(token)
  return parsed && { weekId: parsed.id, signature: parsed.signature }
}

export function verifyLineupSignature(secret: string, parsed: ParsedLineupToken, teams: LineupTeams): boolean {
  return matches(parsed.signature, sign(secret, lineupPayload(parsed.weekId, teams)))
}

export function lineupShareUrl(slug: string, token: string): string {
  return `${SITE}/${slug}?lineup=${token}`
}

// ── Result ────────────────────────────────────────────────────────────────────

function resultPayload(weekId: string, r: ResultFields): unknown[] {
  return ['result:v1', weekId.toLowerCase(), r.winner, r.goalDifference, r.teamA, r.teamB]
}

export function signResultToken(secret: string, weekId: string, result: ResultFields): string {
  requireUuid('signResultToken', 'weekId', weekId)
  return `${encodeId(weekId)}.${sign(secret, resultPayload(weekId, result)).toString('base64url')}`
}

export function parseResultToken(token: unknown): ParsedResultToken | null {
  return parseLineupToken(token)
}

export function verifyResultSignature(secret: string, parsed: ParsedResultToken, result: ResultFields): boolean {
  return matches(parsed.signature, sign(secret, resultPayload(parsed.weekId, result)))
}

export function resultShareUrl(slug: string, token: string): string {
  return `${SITE}/${slug}?result=${token}`
}

// ── League ────────────────────────────────────────────────────────────────────

function leaguePayload(gameId: string): unknown[] {
  return ['league:v1', gameId.toLowerCase()]
}

export function signLeagueToken(secret: string, gameId: string): string {
  requireUuid('signLeagueToken', 'gameId', gameId)
  return `${encodeId(gameId)}.${sign(secret, leaguePayload(gameId)).toString('base64url')}`
}

export function parseLeagueToken(token: unknown): ParsedLeagueToken | null {
  const parsed = parseIdToken(token)
  return parsed && { gameId: parsed.id, signature: parsed.signature }
}

export function verifyLeagueSignature(secret: string, parsed: ParsedLeagueToken): boolean {
  return matches(parsed.signature, sign(secret, leaguePayload(parsed.gameId)))
}

// ── Quarter ───────────────────────────────────────────────────────────────────

function quarterPayload(gameId: string, year: number, q: number): unknown[] {
  return ['quarter:v1', gameId.toLowerCase(), year, q]
}

export function signQuarterToken(secret: string, gameId: string, year: number, q: number): string {
  requireUuid('signQuarterToken', 'gameId', gameId)
  if (!Number.isInteger(year) || year < 1000 || year > 9999) throw new Error('signQuarterToken: year must be four digits')
  if (!Number.isInteger(q) || q < 1 || q > 4) throw new Error('signQuarterToken: q must be 1 to 4')
  const sig = sign(secret, quarterPayload(gameId, year, q)).toString('base64url')
  return `${encodeId(gameId)}.${year}${q}.${sig}`
}

export function parseQuarterToken(token: unknown): ParsedQuarterToken | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3 || !ENCODED_SIG_RE.test(parts[2])) return null
  const quarter = QUARTER_RE.exec(parts[1])
  const gameId = decodeId(parts[0])
  if (!quarter || !gameId) return null
  return { gameId, year: Number(quarter[1]), q: Number(quarter[2]), signature: Buffer.from(parts[2], 'base64url') }
}

export function verifyQuarterSignature(secret: string, parsed: ParsedQuarterToken): boolean {
  return matches(parsed.signature, sign(secret, quarterPayload(parsed.gameId, parsed.year, parsed.q)))
}

/** Keeps the Seasons deep link (#q-<year>-<q>) so the card opens on arrival. */
export function quarterShareUrl(slug: string, token: string, year: number, q: number): string {
  return `${SITE}/${slug}/honours?quarter=${token}#q-${year}-${q}`
}

// ── Metadata ──────────────────────────────────────────────────────────────────

/**
 * Open Graph and Twitter tags for a link preview. No og:url: shared league
 * links redirect to a tab, and an og:url pointing back creates a redirect
 * loop for Facebook's scraper.
 */
function shareMetadata(title: string, description: string, imageUrl: string): Metadata {
  const image = { url: imageUrl, width: 1200, height: 630, alt: title }
  return {
    openGraph: { title, description, images: [image], siteName: 'Craft Football', type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

export function buildLineupShareMetadata(lineup: SharedLineup, token: string): Metadata {
  const description = [formatFixtureDate(lineup.date), lineup.kickoffTime, lineup.location]
    .filter(Boolean)
    .join(' · ')
  return shareMetadata(`Week ${lineup.week} lineups · ${lineup.leagueName}`, description, `/api/og/lineup?t=${token}`)
}

export function buildResultShareMetadata(result: SharedResult, token: string): Metadata {
  const outcome = result.winner === 'draw'
    ? 'Draw'
    : `${result.winner === 'teamA' ? 'Team A' : 'Team B'} won by ${result.goalDifference}`
  return shareMetadata(
    `Week ${result.week} result · ${result.leagueName}`,
    `${outcome} · ${formatFixtureDate(result.date)}`,
    `/api/og/result?t=${token}`
  )
}

export function buildQuarterShareMetadata(quarter: SharedQuarter, token: string): Metadata {
  const champion = quarter.podium[0]
  return shareMetadata(
    `Q${quarter.q} ${quarter.year} champion · ${quarter.leagueName}`,
    `${champion.name} wins the ${quarter.seasonName} quarter with ${champion.points} pts`,
    `/api/og/quarter?t=${token}`
  )
}

export function buildLeagueShareMetadata(league: SharedLeague, token: string): Metadata {
  const next = league.nextGame
  const description = next
    ? `Next game ${[formatFixtureDate(next.date), next.kickoffTime, next.location].filter(Boolean).join(' · ')}`
    : gamesPlayedLabel(league.gamesPlayed)
  return shareMetadata(league.leagueName, description, `/api/og/league?t=${token}`)
}

export function buildInviteShareMetadata(invite: SharedInvite, token: string): Metadata {
  return shareMetadata(
    `Join ${invite.leagueName} on Craft Football`,
    SITE_TAGLINE,
    `/api/og/invite?token=${encodeURIComponent(token)}`
  )
}
```

- [ ] **Step 8: Run the tests**

Run: `npm test -- lib/__tests__/shareLinks.test.ts lib/__tests__/metadata.lineupShare.test.ts`
Expected: PASS (the existing lineup cases, including `buildLineupShareMetadata`'s exact `images` value, still pass).

- [ ] **Step 9: Commit**

```bash
git add -A lib app components __tests__
git commit -m "Generalise share link signing for results, quarters and leagues"
```

---

### Task 2: Result highlights as data

The highlight logic inside `buildResultShareText` moves into `computeResultHighlights`, so the image can use it. The share text must stay byte-identical.

**Files:**
- Modify: `lib/utils.ts` (`buildResultShareText` and new helpers)
- Test: `lib/__tests__/utils.resultHighlights.test.ts`

- [ ] **Step 1: Write the golden and helper tests**

Create `lib/__tests__/utils.resultHighlights.test.ts`:

```ts
import {
  buildResultShareText,
  computeResultHighlights,
  playerStatsAsOf,
  resultImageHighlights,
  weeksUpTo,
} from '../utils'
import type { Player, Week } from '../types'

function wk(n: number, date: string, teamA: string[], teamB: string[], winner: Week['winner']): Week {
  return { id: `w${n}`, season: '2026', week: n, date, status: 'played', format: '5-a-side', teamA, teamB, winner, goal_difference: winner === 'draw' ? 0 : 1 }
}

const A = ['Ava Stone', 'Ben Hale']
const B = ['Cal Reed', 'Dan Moss']
const HISTORY: Week[] = [
  wk(1, '07 Jul 2026', A, B, 'teamB'),
  wk(2, '14 Jul 2026', A, B, 'teamA'),
  wk(3, '21 Jul 2026', A, B, 'draw'),
  wk(4, '28 Jul 2026', B, A, 'teamA'),
  wk(5, '04 Aug 2026', B, A, 'teamA'),
  wk(6, '11 Aug 2026', A, B, 'teamA'),
  wk(7, '18 Aug 2026', A, B, 'teamA'),
]
const TONIGHT: Week = { ...wk(8, '25 Aug 2026', A, B, 'teamA'), goal_difference: 3, team_a_rating: 4.1, team_b_rating: 4.6 }

function player(name: string, played: number, recentForm: string): Player {
  return { playerId: name, name, played, won: 0, drew: 0, lost: 0, timesTeamA: 0, timesTeamB: 0, winRate: 0, qualified: true, points: 0, mentality: 'balanced', strength: null, recentForm }
}
const PLAYERS = [player('Ava Stone', 9, 'WWWWD'), player('Ben Hale', 24, 'WWLWW'), player('Cal Reed', 7, 'LLLWD'), player('Dan Moss', 7, 'LLDWL')]

const PARAMS = {
  leagueName: 'Test FC', leagueSlug: 'test-fc', week: 8, date: '25 Aug 2026', format: '5-a-side',
  teamA: A, teamB: B, winner: 'teamA' as const, goalDifference: 3, teamARating: 4.1, teamBRating: 4.6,
  players: PLAYERS, weeks: [...HISTORY, TONIGHT],
}

// Captured from buildResultShareText before the refactor. Must not change.
const GOLDEN_HIGHLIGHTS = '🔥 Ava Stone on a 3-game winning streak\n\n🔥 Ben Hale on a 3-game winning streak\n\n😱 Upset! Team B were stronger on paper (4.6 vs 4.1)\n\n🎖️ Ava Stone played their 10th game tonight\n\n🎖️ Ben Hale played their 25th game tonight\n\n📊 Q3 2026 standings\n1. Ava Stone — 13pts\n2. Ben Hale — 13pts\n3. Cal Reed — 10pts\n4. Dan Moss — 10pts\n\n⚡ In form: Ava Stone (2.6 PPG)'
const GOLDEN_TEXT = `⚽ Test FC — Week 8\n📅 Tue 25 Aug · 5-a-side\n\n🏆 Team A win! (+3 goals)\n\n🔵 Team A\nAva Stone, Ben Hale\n\n🟣 Team B\nCal Reed, Dan Moss\n\n${GOLDEN_HIGHLIGHTS}\n\n🔗 https://craft-football.com/test-fc`

describe('buildResultShareText', () => {
  it('is byte-identical to the pre-refactor output', () => {
    expect(buildResultShareText(PARAMS)).toEqual({ shareText: GOLDEN_TEXT, highlightsText: GOLDEN_HIGHLIGHTS })
  })
})

describe('computeResultHighlights', () => {
  it('returns typed highlights in share text order', () => {
    const h = computeResultHighlights({
      date: PARAMS.date, teamA: A, teamB: B, winner: 'teamA',
      teamARating: 4.1, teamBRating: 4.6, players: PLAYERS, weeks: PARAMS.weeks,
    })
    expect(h.items).toEqual([
      { kind: 'win_streak', player: 'Ava Stone', count: 3 },
      { kind: 'win_streak', player: 'Ben Hale', count: 3 },
      { kind: 'upset', strongerTeam: 'Team B', strongRating: '4.6', weakRating: '4.1' },
      { kind: 'milestone', player: 'Ava Stone', games: 10 },
      { kind: 'milestone', player: 'Ben Hale', games: 25 },
    ])
    expect(h.table?.q).toBe(3)
    expect(h.table?.year).toBe(2026)
    expect(h.table?.entries[0]).toEqual(expect.objectContaining({ name: 'Ava Stone', points: 13 }))
    expect(h.inForm).toEqual({ name: 'Ava Stone', ppg: 2.6 })
  })

  it('has no streaks or upset on a draw', () => {
    const h = computeResultHighlights({
      date: PARAMS.date, teamA: A, teamB: B, winner: 'draw',
      teamARating: 4.1, teamBRating: 4.6, players: PLAYERS, weeks: [...HISTORY, { ...TONIGHT, winner: 'draw' }],
    })
    expect(h.items.filter((i) => i.kind !== 'milestone')).toEqual([])
  })
})

describe('resultImageHighlights', () => {
  it('keeps the first three in priority order with short copy', () => {
    const h = computeResultHighlights({
      date: PARAMS.date, teamA: A, teamB: B, winner: 'teamA',
      teamARating: 4.1, teamBRating: 4.6, players: PLAYERS, weeks: PARAMS.weeks,
    })
    expect(resultImageHighlights(h)).toEqual([
      { icon: 'flame', text: 'Ava Stone · 3-game win streak' },
      { icon: 'flame', text: 'Ben Hale · 3-game win streak' },
      { icon: 'zap', text: 'Upset · Team B stronger on paper' },
    ])
  })

  it('falls back to in form and the quarter leader', () => {
    expect(resultImageHighlights({
      items: [{ kind: 'milestone', player: 'Cal Reed', games: 50 }],
      table: { q: 4, year: 2026, entries: [{ name: 'Dan Moss', played: 3, won: 3, drew: 0, lost: 0, points: 9, goalDiff: 4 }] },
      inForm: { name: 'Ava Stone', ppg: 2.4 },
    })).toEqual([
      { icon: 'award', text: "Cal Reed's 50th game" },
      { icon: 'trending-up', text: 'In form · Ava Stone · 2.4 PPG' },
      { icon: 'crown', text: 'Q4 leader · Dan Moss · 9 pts' },
    ])
  })

  it('words an ended unbeaten run', () => {
    expect(resultImageHighlights({ items: [{ kind: 'unbeaten_ended', player: 'Kit Marsh', count: 7 }], table: null, inForm: null }))
      .toEqual([{ icon: 'heart-crack', text: "Kit Marsh's 7-game unbeaten run is over" }])
  })

  it('is empty when nothing applies', () => {
    expect(resultImageHighlights({ items: [], table: null, inForm: null })).toEqual([])
  })
})

describe('weeksUpTo', () => {
  it('returns oldest first, ending with the target', () => {
    const shuffled = [HISTORY[3], TONIGHT, HISTORY[0], HISTORY[6]]
    expect(weeksUpTo(shuffled, 'w4').map((w) => w.id)).toEqual(['w1', 'w4'])
    expect(weeksUpTo(shuffled, 'w8').map((w) => w.id)).toEqual(['w1', 'w4', 'w7', 'w8'])
  })

  it('is empty when the target is missing', () => {
    expect(weeksUpTo(HISTORY, 'nope')).toEqual([])
  })
})

describe('playerStatsAsOf', () => {
  it('counts games and the last five results from played weeks only', () => {
    const stats = playerStatsAsOf([...HISTORY, { ...wk(9, '01 Sep 2026', A, B, null), status: 'scheduled' }])
    expect(stats.find((p) => p.name === 'Ava Stone')).toEqual({ name: 'Ava Stone', played: 7, recentForm: 'DLLWW' })
    expect(stats.find((p) => p.name === 'Cal Reed')).toEqual({ name: 'Cal Reed', played: 7, recentForm: 'DWWLL' })
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- lib/__tests__/utils.resultHighlights.test.ts`
Expected: the golden test PASSES (it pins today's behaviour); the others FAIL because the new functions are not exported.

- [ ] **Step 3: Add the types and `computeResultHighlights`**

In `lib/utils.ts`, add `ResultImageHighlight` to the `./types` import and add, directly above `buildResultShareText`:

```ts
export type ResultHighlightItem =
  | { kind: 'win_streak'; player: string; count: number }
  | { kind: 'unbeaten_ended'; player: string; count: number }
  | { kind: 'upset'; strongerTeam: 'Team A' | 'Team B'; strongRating: string; weakRating: string }
  | { kind: 'milestone'; player: string; games: number }

export interface ResultHighlights {
  /** Win streaks, ended unbeaten runs, the upset, then milestones. */
  items: ResultHighlightItem[]
  /** Top five of the result's quarter, or null when nobody has played in it. */
  table: { q: number; year: number; entries: QuarterlyEntry[] } | null
  inForm: { name: string; ppg: number } | null
}

/** The player stats highlights need, as they stood before the game. */
export type HighlightPlayer = Pick<Player, 'name' | 'played' | 'recentForm'>

/**
 * Everything worth calling out about a result. `weeks` must end with the
 * result itself; `players` are the stats from before it. Shared by the share
 * text and the result preview image.
 */
export function computeResultHighlights(params: {
  date: string           // 'DD MMM YYYY'
  teamA: string[]
  teamB: string[]
  winner: Winner
  teamARating: number
  teamBRating: number
  players: HighlightPlayer[]
  weeks: Week[]
}): ResultHighlights {
  const { date, teamA, teamB, winner, teamARating, teamBRating, players, weeks } = params
  const items: ResultHighlightItem[] = []

  if (winner !== 'draw') {
    // Win streaks (winning team only)
    for (const name of winner === 'teamA' ? teamA : teamB) {
      const count = currentWinStreak(name, weeks)
      if (count >= 3) items.push({ kind: 'win_streak', player: name, count })
    }
    // Unbeaten streaks broken (losing team only), from the weeks before tonight
    const priorWeeks = weeks.slice(0, -1)
    for (const name of winner === 'teamA' ? teamB : teamA) {
      const count = currentUnbeatenStreak(name, priorWeeks)
      if (count >= 5) items.push({ kind: 'unbeaten_ended', player: name, count })
    }
    // Upset: the winners were weaker on paper
    const upset =
      (winner === 'teamA' && teamBRating > teamARating) ||
      (winner === 'teamB' && teamARating > teamBRating)
    if (upset) {
      const [strongRating, weakRating] =
        winner === 'teamA'
          ? [teamBRating.toFixed(1), teamARating.toFixed(1)]
          : [teamARating.toFixed(1), teamBRating.toFixed(1)]
      items.push({ kind: 'upset', strongerTeam: winner === 'teamA' ? 'Team B' : 'Team A', strongRating, weakRating })
    }
  }

  // Milestones
  for (const name of [...teamA, ...teamB]) {
    const player = players.find((p) => p.name === name)
    if (!player) continue
    const games = player.played + 1
    if (isMilestone(games)) items.push({ kind: 'milestone', player: name, games })
  }

  // Quarter table top 5: the quarter of the result, not of today
  const parsed = parseWeekDate(date)
  const q = Math.floor(parsed.getMonth() / 3) + 1
  const year = parsed.getFullYear()
  const qWeeks = weeks.filter((w) => {
    const d = parseWeekDate(w.date)
    return Math.floor(d.getMonth() / 3) + 1 === q && d.getFullYear() === year
  })
  const entries = computeStandings(qWeeks).slice(0, 5)
  const table = entries.length > 0 ? { q, year, entries } : null

  // In form: best recent PPG among tonight's players
  const tonight = new Set([...teamA, ...teamB])
  const inForm = players
    .filter((p) => tonight.has(p.name) && p.played >= 5)
    .map((p) => {
      const chars = p.recentForm.split('').filter((c) => c !== '-')
      if (chars.length === 0) return { name: p.name, ppg: 0 }
      const pts = chars.reduce((acc, c) => acc + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0)
      return { name: p.name, ppg: pts / chars.length }
    })
    .filter((e) => e.ppg >= 1.5)
    .sort((a, b) => b.ppg - a.ppg)[0] ?? null

  return { items, table, inForm }
}

function highlightLine(item: ResultHighlightItem): string {
  switch (item.kind) {
    case 'win_streak':
      return `🔥 ${item.player} on a ${item.count}-game winning streak`
    case 'unbeaten_ended':
      return `💔 ${item.player}'s ${item.count}-game unbeaten run is over`
    case 'upset':
      return `😱 Upset! ${item.strongerTeam} were stronger on paper (${item.strongRating} vs ${item.weakRating})`
    case 'milestone':
      return `🎖️ ${item.player} played their ${ordinal(item.games)} game tonight`
  }
}
```

- [ ] **Step 4: Make `buildResultShareText` use it**

In `buildResultShareText`, replace everything from the `// ── Highlights ──` comment down to (and including) the `// ── In-form ──` block, i.e. up to the line before `// ── Assemble highlightsText`, with:

```ts
  // ── Highlights ───────────────────────────────────────────────────────────
  const { items, table, inForm } = computeResultHighlights({
    date, teamA, teamB, winner, teamARating, teamBRating, players, weeks,
  })
  const highlights = items.map(highlightLine)
  const tableLines = table
    ? [`📊 Q${table.q} ${table.year} standings`, ...table.entries.map((e, i) => `${i + 1}. ${e.name} — ${e.points}pts`)]
    : []
  const inFormLines = inForm ? [`⚡ In form: ${inForm.name} (${inForm.ppg.toFixed(1)} PPG)`] : []
```

Leave the `parsed` / `shortDate` lines above it and the assembly code below it unchanged.

- [ ] **Step 5: Add the image and as-of helpers**

Add below `buildResultShareText`:

```ts
/**
 * The result image's highlight lines: up to three, in priority order (streaks,
 * ended runs, upset, milestones, in form, quarter leader), with short copy.
 */
export function resultImageHighlights(h: ResultHighlights): ResultImageHighlight[] {
  const out: ResultImageHighlight[] = h.items.map((item): ResultImageHighlight => {
    switch (item.kind) {
      case 'win_streak':
        return { icon: 'flame', text: `${item.player} · ${item.count}-game win streak` }
      case 'unbeaten_ended':
        return { icon: 'heart-crack', text: `${item.player}'s ${item.count}-game unbeaten run is over` }
      case 'upset':
        return { icon: 'zap', text: `Upset · ${item.strongerTeam} stronger on paper` }
      case 'milestone':
        return { icon: 'award', text: `${item.player}'s ${ordinal(item.games)} game` }
    }
  })
  if (h.inForm) out.push({ icon: 'trending-up', text: `In form · ${h.inForm.name} · ${h.inForm.ppg.toFixed(1)} PPG` })
  const leader = h.table?.entries[0]
  if (h.table && leader) out.push({ icon: 'crown', text: `Q${h.table.q} leader · ${leader.name} · ${leader.points} pts` })
  return out.slice(0, 3)
}

function byDateThenWeek(a: Week, b: Week): number {
  return parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime() || a.week - b.week
}

/** Weeks up to and including the one with `targetId`, oldest first; empty when it is missing. */
export function weeksUpTo(weeks: Week[], targetId: string): Week[] {
  const ordered = [...weeks].sort(byDateThenWeek)
  const index = ordered.findIndex((w) => w.id === targetId)
  return index === -1 ? [] : ordered.slice(0, index + 1)
}

/**
 * Games played and last five results (oldest first) per player, from played
 * weeks only. Stands in for the stored player stats when highlights must be
 * worked out as of an earlier game.
 */
export function playerStatsAsOf(weeks: Week[]): HighlightPlayer[] {
  const stats = new Map<string, { name: string; played: number; results: string[] }>()
  for (const w of [...weeks].filter((x) => x.status === 'played').sort(byDateThenWeek)) {
    for (const name of [...w.teamA, ...w.teamB]) {
      const onTeamA = w.teamA.includes(name)
      const result = w.winner === 'draw' ? 'D'
        : (w.winner === 'teamA') === onTeamA ? 'W' : 'L'
      const entry = stats.get(name) ?? { name, played: 0, results: [] }
      entry.played++
      entry.results.push(result)
      stats.set(name, entry)
    }
  }
  return Array.from(stats.values()).map(({ name, played, results }) => ({
    name,
    played,
    recentForm: results.slice(-5).join(''),
  }))
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- lib/__tests__/utils.resultHighlights.test.ts lib/__tests__/utils.winCopy.test.ts`
Expected: PASS, including the golden test.

- [ ] **Step 7: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.resultHighlights.test.ts
git commit -m "Extract result highlights so the preview image can reuse them"
```

---

### Task 3: Small share and layout utils

**Files:**
- Modify: `lib/utils.ts`
- Test: `lib/__tests__/utils.shareLinks.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/utils.shareLinks.test.ts`:

```ts
import {
  buildQuarterShareText,
  fetchShareLink,
  fitFontSize,
  leagueShareHref,
  nextLeagueGame,
  quarterRangeLabel,
  quarterShareKey,
  withShareLink,
} from '../utils'
import type { Week } from '../types'

describe('withShareLink', () => {
  const TEXT = '⚽ Test FC\n\n🔗 https://craft-football.com/test-fc'

  it('swaps the final link line', () => {
    expect(withShareLink(TEXT, 'https://craft-football.com/test-fc?result=abc')).toBe(
      '⚽ Test FC\n\n🔗 https://craft-football.com/test-fc?result=abc'
    )
  })

  it('leaves the text alone without a URL', () => {
    expect(withShareLink(TEXT, null)).toBe(TEXT)
    expect(withShareLink(TEXT, undefined)).toBe(TEXT)
  })

  it('leaves text without a link line alone', () => {
    expect(withShareLink('no link', 'https://x')).toBe('no link')
  })
})

describe('leagueShareHref', () => {
  it('adds the token to the current page and drops other share params', () => {
    expect(leagueShareHref('https://craft-football.com/test-fc/results?year=2025&lineup=x#week-2025-3', 'tok.sig'))
      .toBe('https://craft-football.com/test-fc/results?year=2025&league=tok.sig')
  })
})

describe('fitFontSize', () => {
  it('uses the max when the text fits', () => {
    expect(fitFontSize(10, 1000, 104, 64)).toBe(104)
  })

  it('shrinks long text and stops at the floor', () => {
    expect(fitFontSize(20, 1000, 104, 64)).toBe(83)
    expect(fitFontSize(60, 1000, 104, 64)).toBe(64)
  })
})

describe('quarterShareKey and quarterRangeLabel', () => {
  it('keys a quarter by year and number', () => {
    expect(quarterShareKey({ year: 2026, q: 3 })).toBe('2026-3')
  })

  it('labels the dates without the year', () => {
    expect(quarterRangeLabel({ from: '07 Jul 2026', to: '29 Sep 2026' }, 12)).toBe('07 Jul – 29 Sep · 12 games')
    expect(quarterRangeLabel({ from: '07 Jul 2026', to: '07 Jul 2026' }, 1)).toBe('07 Jul – 07 Jul · 1 game')
  })

  it('keeps the quarter share text unchanged', () => {
    const text = buildQuarterShareText({
      leagueName: 'Test FC',
      leagueSlug: 'test-fc',
      quarter: {
        q: 3, year: 2026, quarterLabel: 'Q3 26', seasonName: 'Summer', status: 'completed',
        weekRange: { from: 1, to: 12 }, dateRange: { from: '07 Jul 2026', to: '29 Sep 2026' }, gamesPlayed: 12,
      },
    })
    expect(text.split('\n')[2]).toBe('📅 07 Jul – 29 Sep · 12 games')
  })
})

describe('nextLeagueGame', () => {
  const LEAGUE = { day: null, kickoff_time: '19:00', location: 'Powerleague Shoreditch' }

  it('uses the scheduled week when there is one', () => {
    const scheduled: Week = { id: 's', season: '2099', week: 1, date: '05 Jan 2099', status: 'scheduled', teamA: [], teamB: [], winner: null }
    expect(nextLeagueGame([scheduled], LEAGUE)).toEqual({ date: '05 Jan 2099', kickoffTime: '19:00', location: 'Powerleague Shoreditch' })
  })

  it('is null with no scheduled week and no game day', () => {
    expect(nextLeagueGame([], LEAGUE)).toBeNull()
  })

  it('falls back to the next game day', () => {
    const next = nextLeagueGame([], { ...LEAGUE, day: 'Tuesday' })
    expect(next?.date).toMatch(/^\d{2} \w{3} \d{4}$/)
  })
})

describe('fetchShareLink', () => {
  afterEach(() => {
    ;(global as { fetch?: unknown }).fetch = undefined
  })

  it('posts the request and returns the url', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://x?result=a' }) })
    ;(global as { fetch?: unknown }).fetch = fetchMock
    await expect(fetchShareLink('game-1', { kind: 'result', weekId: 'w' })).resolves.toBe('https://x?result=a')
    expect(fetchMock).toHaveBeenCalledWith('/api/league/game-1/share-link', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ kind: 'result', weekId: 'w' }),
    }))
  })

  it('returns null when the server declines or the request fails', async () => {
    ;(global as { fetch?: unknown }).fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ url: null }) })
    await expect(fetchShareLink('game-1', { kind: 'quarter', year: 2026, q: 3 })).resolves.toBeNull()
    ;(global as { fetch?: unknown }).fetch = jest.fn().mockRejectedValue(new Error('offline'))
    await expect(fetchShareLink('game-1', { kind: 'quarter', year: 2026, q: 3 })).resolves.toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- lib/__tests__/utils.shareLinks.test.ts`
Expected: FAIL, functions not exported.

- [ ] **Step 3: Implement**

In `lib/utils.ts`, replace `fetchLineupShareUrl` with a shared poster plus both callers:

```ts
async function postForShareUrl(path: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { url?: unknown }
    return typeof json.url === 'string' ? json.url : null
  } catch {
    return null
  }
}

/**
 * Asks the server for a signed share link for a scheduled lineup. Null when
 * the server declines (feature off, not visible, not configured) or the
 * request fails; callers fall back to the plain league link.
 */
export function fetchLineupShareUrl(leagueId: string, weekId: string): Promise<string | null> {
  return postForShareUrl(`/api/league/${leagueId}/lineup-share`, { weekId })
}

export type ShareLinkRequest =
  | { kind: 'result'; weekId: string }
  | { kind: 'quarter'; year: number; q: number }

/** Signed result or quarter link for something just saved in the browser. Null when declined or failed. */
export function fetchShareLink(leagueId: string, request: ShareLinkRequest): Promise<string | null> {
  return postForShareUrl(`/api/league/${leagueId}/share-link`, request)
}

/**
 * Swaps the final "🔗 <url>" line of a share message for a signed link. Every
 * share text builder ends with that line. Unchanged without a URL.
 */
export function withShareLink(text: string, url: string | null | undefined): string {
  if (!url) return text
  const lines = text.split('\n')
  const last = lines.length - 1
  if (!lines[last].startsWith('🔗 ')) return text
  lines[last] = `🔗 ${url}`
  return lines.join('\n')
}

/** The page being viewed, carrying a signed league token instead of any other share token. */
export function leagueShareHref(href: string, token: string): string {
  const url = new URL(href)
  for (const key of ['lineup', 'result', 'quarter', 'league', 'open_join']) url.searchParams.delete(key)
  url.searchParams.set('league', token)
  url.hash = ''
  return url.toString()
}

/**
 * Largest font size (px) at which `length` characters fit `width`, between
 * `min` and `max`. `charWidth` approximates Space Grotesk Bold's average glyph
 * width in em. Text that still doesn't fit is cut off by the image.
 */
export function fitFontSize(length: number, width: number, max: number, min: number, charWidth = 0.6): number {
  const fit = Math.floor(width / (Math.max(length, 1) * charWidth))
  return Math.max(min, Math.min(max, fit))
}

/** Key for a quarter in share URL maps: '2026-3'. Matches the Seasons card keys. */
export function quarterShareKey(quarter: { year: number; q: number }): string {
  return `${quarter.year}-${quarter.q}`
}

/** '07 Jul – 29 Sep · 12 games': the quarter's dates without the year. */
export function quarterRangeLabel(dateRange: { from: string; to: string }, gamesPlayed: number): string {
  const stripYear = (d: string) => d.split(' ').slice(0, 2).join(' ')
  const games = gamesPlayed === 1 ? '1 game' : `${gamesPlayed} games`
  return `${stripYear(dateRange.from)} – ${stripYear(dateRange.to)} · ${games}`
}

/**
 * The league's next game, as the Overview next game card picks it: the
 * earliest scheduled week before its deadline, otherwise the next date from
 * the league's game day. Null when neither exists.
 */
export function nextLeagueGame(
  weeks: Week[],
  league: { day: string | null; kickoff_time: string | null; location: string | null }
): { date: string; kickoffTime: string | null; location: string | null } | null {
  const scheduled = weeks
    .filter((w) => w.status === 'scheduled' && !isPastDeadline(w.date))
    .sort((a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime())[0]
  const dayIndex = dayNameToIndex(league.day)
  const date = scheduled?.date ?? (dayIndex !== null ? getNextMatchDate(weeks, dayIndex) : null)
  return date ? { date, kickoffTime: league.kickoff_time, location: league.location } : null
}
```

In `buildQuarterShareText`, replace the `stripYear` / `gamesLabel` constants and the `📅` line with:

```ts
  const parts: string[] = [
    `🏁 That's a wrap on Q${q} ${year}!`,
    `⚽ ${leagueName} — ${seasonName} quarter`,
    `📅 ${quarterRangeLabel(dateRange, gamesPlayed)}`,
  ]
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- lib/__tests__/utils.shareLinks.test.ts lib/__tests__/utils.quarterShare.test.ts __tests__/next-match-card-share.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.shareLinks.test.ts
git commit -m "Add share link and preview layout helpers"
```

---

### Task 4: Loaders and server-side signing

**Files:**
- Modify: `lib/shareLinksServer.ts`, `lib/sidebar-stats.ts`
- Test: `lib/__tests__/shareLinksServer.test.ts`

- [ ] **Step 1: Write the failing tests**

At the top of `lib/__tests__/shareLinksServer.test.ts`, add a fetchers mock beside the service mock and widen the imports:

```ts
import { getGame, getWeeks } from '@/lib/fetchers'
import { signLeagueToken, signLineupToken, signQuarterToken, signResultToken } from '@/lib/shareLinks'

jest.mock('@/lib/fetchers', () => ({ getGame: jest.fn(), getWeeks: jest.fn() }))
```

and change the loader import to:

```ts
import {
  leagueShareTokenFor,
  loadInvitePreview,
  loadSharedLeague,
  loadSharedLineup,
  loadSharedQuarter,
  loadSharedResult,
  quarterShareUrls,
  resultShareUrlFor,
} from '@/lib/shareLinksServer'
```

Extend `mockTables` so the service client also has `rpc`:

```ts
function mockTables(rows: Record<string, unknown>, rpcRows: unknown = null) {
  const chains: Record<string, Record<string, jest.Mock>> = {}
  const from = jest.fn((table: string) => {
    const chain: Record<string, jest.Mock> = {}
    chain.select = jest.fn(() => chain)
    chain.eq = jest.fn(() => chain)
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: rows[table] ?? null, error: null })
    chains[table] = chain
    return chain
  })
  const rpc = jest.fn().mockResolvedValue({ data: rpcRows, error: null })
  ;(createServiceClient as jest.Mock).mockReturnValue({ from, rpc })
  return Object.assign(from, { chains, rpc })
}
```

Append:

```ts
const GAME_ID = '9cf13e81-4382-428b-a4ec-c94cb8e2567e'
const GAME = { id: GAME_ID, name: 'The Boot Room', slug: 'the-boot-room', location: 'Powerleague Shoreditch', day: null, kickoff_time: '19:00', bio: null }

function played(id: string, week: number, date: string, teamA: string[], teamB: string[], winner: 'teamA' | 'teamB' | 'draw') {
  return { id, season: '2026', week, date, status: 'played' as const, teamA, teamB, winner, goal_difference: winner === 'draw' ? 0 : 2, team_a_rating: 4, team_b_rating: 4 }
}

describe('loadSharedResult', () => {
  const A = ['Marcus Reid', 'Rav Singh']
  const B = ['Callum Shaw', 'Sofia Marsh']
  const WEEKS = [
    played('00000000-0000-4000-8000-000000000001', 1, '07 Jul 2026', A, B, 'teamA'),
    played('00000000-0000-4000-8000-000000000002', 2, '14 Jul 2026', A, B, 'teamA'),
    played(WEEK_ID, 3, '21 Jul 2026', A, B, 'teamA'),
    played('00000000-0000-4000-8000-000000000004', 4, '28 Jul 2026', A, B, 'teamA'),
  ]
  const ROW = { game_id: GAME_ID, status: 'played', winner: 'teamA', goal_difference: 2, team_a: A, team_b: B }
  const RESULT_TOKEN = signResultToken(SECRET, WEEK_ID, { winner: 'teamA', goalDifference: 2, teamA: A, teamB: B })

  beforeEach(() => {
    ;(getGame as jest.Mock).mockResolvedValue(GAME)
    ;(getWeeks as jest.Mock).mockResolvedValue(WEEKS)
  })

  it('returns the result with highlights as of that game', async () => {
    mockTables({ weeks: ROW })
    const result = await loadSharedResult(RESULT_TOKEN)
    expect(result).toEqual(expect.objectContaining({
      leagueName: 'The Boot Room', slug: 'the-boot-room', week: 3, date: '21 Jul 2026',
      winner: 'teamA', goalDifference: 2, teamA: A, teamB: B,
    }))
    // Week 4 is later, so the streak is 3, not 4.
    expect(result?.highlights[0]).toEqual({ icon: 'flame', text: 'Marcus Reid · 3-game win streak' })
  })

  it('returns null once the result has been edited, without loading the league', async () => {
    mockTables({ weeks: { ...ROW, goal_difference: 1 } })
    await expect(loadSharedResult(RESULT_TOKEN)).resolves.toBeNull()
    expect(getGame).not.toHaveBeenCalled()
  })

  it('returns null for a week that is not played', async () => {
    mockTables({ weeks: { ...ROW, status: 'dnf' } })
    await expect(loadSharedResult(RESULT_TOKEN)).resolves.toBeNull()
  })

  it('returns null for a lineup token', async () => {
    mockTables({ weeks: ROW })
    await expect(loadSharedResult(signLineupToken(SECRET, WEEK_ID, { teamA: A, teamB: B }))).resolves.toBeNull()
  })

  it('returns null without a secret', async () => {
    delete process.env.SHARE_SIGNING_SECRET
    const from = mockTables({ weeks: ROW })
    await expect(loadSharedResult(RESULT_TOKEN)).resolves.toBeNull()
    expect(from).not.toHaveBeenCalled()
  })
})

describe('resultShareUrlFor', () => {
  const WEEK = played(WEEK_ID, 3, '21 Jul 2026', ['Marcus Reid'], ['Callum Shaw'], 'teamB')

  it('signs a played week', () => {
    const url = resultShareUrlFor('the-boot-room', WEEK)
    expect(url).toMatch(/^https:\/\/craft-football\.com\/the-boot-room\?result=[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
  })

  it('is null for a DNF week, a missing week or no secret', () => {
    expect(resultShareUrlFor('the-boot-room', { ...WEEK, status: 'dnf' })).toBeNull()
    expect(resultShareUrlFor('the-boot-room', null)).toBeNull()
    delete process.env.SHARE_SIGNING_SECRET
    expect(resultShareUrlFor('the-boot-room', WEEK)).toBeNull()
  })
})

describe('loadSharedQuarter', () => {
  // Five Q3 games so the quarter crowns a champion; "now" is well past Q3.
  const WEEKS = ['07 Jul 2026', '14 Jul 2026', '21 Jul 2026', '28 Jul 2026', '04 Aug 2026'].map((date, i) =>
    played(`00000000-0000-4000-8000-00000000000${i + 1}`, i + 1, date, ['Marcus Reid', 'Rav Singh'], ['Callum Shaw', 'Sofia Marsh'], 'teamA')
  )

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'))
    ;(getGame as jest.Mock).mockResolvedValue(GAME)
    ;(getWeeks as jest.Mock).mockResolvedValue(WEEKS)
  })
  afterEach(() => jest.useRealTimers())

  it('returns the champion and podium for a completed quarter', async () => {
    const quarter = await loadSharedQuarter(signQuarterToken(SECRET, GAME_ID, 2026, 3))
    expect(quarter).toEqual(expect.objectContaining({ leagueName: 'The Boot Room', year: 2026, q: 3, seasonName: 'Summer', gamesPlayed: 5 }))
    expect(quarter?.podium[0]).toEqual({ name: 'Marcus Reid', points: 15, won: 5, drew: 0 })
    expect(quarter?.podium).toHaveLength(3)
  })

  it('returns null for a quarter without a champion', async () => {
    await expect(loadSharedQuarter(signQuarterToken(SECRET, GAME_ID, 2026, 2))).resolves.toBeNull()
  })

  it('returns null for a tampered token without loading anything', async () => {
    const [id, , sig] = signQuarterToken(SECRET, GAME_ID, 2026, 3).split('.')
    await expect(loadSharedQuarter(`${id}.20262.${sig}`)).resolves.toBeNull()
    expect(getWeeks).not.toHaveBeenCalled()
  })

  it('signs every quarter it is given', () => {
    const urls = quarterShareUrls('the-boot-room', GAME_ID, [{ year: 2026, q: 3 }])
    expect(Object.keys(urls)).toEqual(['2026-3'])
    expect(urls['2026-3']).toMatch(/\/the-boot-room\/honours\?quarter=.+#q-2026-3$/)
  })
})

describe('loadSharedLeague', () => {
  it('counts played games and players and finds the next game', async () => {
    ;(getGame as jest.Mock).mockResolvedValue(GAME)
    ;(getWeeks as jest.Mock).mockResolvedValue([
      played('00000000-0000-4000-8000-000000000001', 1, '07 Jul 2026', ['Marcus Reid'], ['Callum Shaw'], 'teamA'),
      played('00000000-0000-4000-8000-000000000002', 2, '14 Jul 2026', ['Marcus Reid'], ['Rav Singh'], 'draw'),
      { id: 's', season: '2099', week: 3, date: '05 Jan 2099', status: 'scheduled', teamA: [], teamB: [], winner: null },
    ])
    await expect(loadSharedLeague(signLeagueToken(SECRET, GAME_ID))).resolves.toEqual({
      leagueName: 'The Boot Room',
      slug: 'the-boot-room',
      gamesPlayed: 2,
      playerCount: 3,
      nextGame: { date: '05 Jan 2099', kickoffTime: '19:00', location: 'Powerleague Shoreditch' },
    })
  })

  it('returns null for a bad token', async () => {
    await expect(loadSharedLeague('garbage')).resolves.toBeNull()
    expect(getGame).not.toHaveBeenCalled()
  })

  it('signs a league token only when configured', () => {
    expect(leagueShareTokenFor(GAME_ID)).toMatch(/^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{16}$/)
    delete process.env.SHARE_SIGNING_SECRET
    expect(leagueShareTokenFor(GAME_ID)).toBeNull()
  })
})

describe('loadInvitePreview', () => {
  const TOKEN = 'a'.repeat(64)

  it('returns only the league name for a live invite', async () => {
    const service = mockTables({}, [{ league_name: 'The Boot Room', league_slug: 'the-boot-room', role: 'admin', target_email: 'x@y.z' }])
    await expect(loadInvitePreview(TOKEN)).resolves.toEqual({ leagueName: 'The Boot Room' })
    expect(service.rpc).toHaveBeenCalledWith('preview_invite', { invite_token: TOKEN })
  })

  it('returns null for an unknown or malformed invite', async () => {
    mockTables({}, [])
    await expect(loadInvitePreview(TOKEN)).resolves.toBeNull()
    const service = mockTables({}, [])
    await expect(loadInvitePreview('bad token!')).resolves.toBeNull()
    expect(service.rpc).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- lib/__tests__/shareLinksServer.test.ts`
Expected: FAIL, new loaders not exported (the existing `loadSharedLineup` cases still pass).

- [ ] **Step 3: Implement the loaders**

Replace `lib/shareLinksServer.ts` with:

```ts
import { createServiceClient } from '@/lib/supabase/service'
import { getGame, getWeeks } from '@/lib/fetchers'
import { getCelebratedQuarters } from '@/lib/sidebar-stats'
import {
  computeResultHighlights,
  nextLeagueGame,
  playerStatsAsOf,
  quarterShareKey,
  resultImageHighlights,
  weeksUpTo,
} from '@/lib/utils'
import {
  getShareSecret,
  parseLeagueToken,
  parseLineupToken,
  parseQuarterToken,
  parseResultToken,
  quarterShareUrl,
  resultShareUrl,
  signLeagueToken,
  signQuarterToken,
  signResultToken,
  verifyLeagueSignature,
  verifyLineupSignature,
  verifyQuarterSignature,
  verifyResultSignature,
  type ResultFields,
} from '@/lib/shareLinks'
import type { SharedInvite, SharedLeague, SharedLineup, SharedQuarter, SharedResult, Week } from '@/lib/types'

// Loaders resolve a share token to the data its preview shows. Each returns
// null when the token is malformed, signing is not configured, the data is
// gone or no longer matches the signature, and never throws. They use the
// service client: the token itself is the authorisation.

/** Resolves a lineup token to the lineup it was signed for. */
export async function loadSharedLineup(token: string | null | undefined): Promise<SharedLineup | null> {
  const secret = getShareSecret()
  const parsed = token ? parseLineupToken(token) : null
  if (!secret || !parsed) return null

  try {
    const service = createServiceClient()
    const { data: week } = await service
      .from('weeks')
      .select('game_id, week, date, format, team_a, team_b')
      .eq('id', parsed.weekId)
      .maybeSingle()
    if (!week) return null

    const teamA: string[] = week.team_a ?? []
    const teamB: string[] = week.team_b ?? []
    if (!verifyLineupSignature(secret, parsed, { teamA, teamB })) return null

    const { data: game } = await service
      .from('games')
      .select('name, slug, location, kickoff_time')
      .eq('id', week.game_id)
      .maybeSingle()
    if (!game) return null

    return {
      leagueName: game.name,
      slug: game.slug,
      week: week.week,
      date: week.date,
      format: week.format ?? null,
      teamA,
      teamB,
      location: game.location ?? null,
      kickoffTime: game.kickoff_time ?? null,
    }
  } catch {
    return null
  }
}

/** Resolves a result token, with highlights worked out as of that game. */
export async function loadSharedResult(token: string | null | undefined): Promise<SharedResult | null> {
  const secret = getShareSecret()
  const parsed = token ? parseResultToken(token) : null
  if (!secret || !parsed) return null

  try {
    const { data: row } = await createServiceClient()
      .from('weeks')
      .select('game_id, status, winner, goal_difference, team_a, team_b')
      .eq('id', parsed.weekId)
      .maybeSingle()
    if (!row || row.status !== 'played' || !row.winner) return null

    const fields: ResultFields = {
      winner: row.winner,
      goalDifference: row.goal_difference ?? 0,
      teamA: row.team_a ?? [],
      teamB: row.team_b ?? [],
    }
    if (!verifyResultSignature(secret, parsed, fields)) return null

    const [game, weeks] = await Promise.all([getGame(row.game_id), getWeeks(row.game_id)])
    const asOf = weeksUpTo(weeks, parsed.weekId)
    const shared = asOf[asOf.length - 1]
    if (!game?.slug || !shared) return null

    const highlights = computeResultHighlights({
      date: shared.date,
      teamA: fields.teamA,
      teamB: fields.teamB,
      winner: fields.winner,
      teamARating: shared.team_a_rating ?? 0,
      teamBRating: shared.team_b_rating ?? 0,
      players: playerStatsAsOf(asOf.slice(0, -1)),
      weeks: asOf,
    })

    return {
      leagueName: game.name,
      slug: game.slug,
      week: shared.week,
      date: shared.date,
      ...fields,
      highlights: resultImageHighlights(highlights),
    }
  } catch {
    return null
  }
}

/** Resolves a quarter token to a completed quarter with a champion. */
export async function loadSharedQuarter(token: string | null | undefined): Promise<SharedQuarter | null> {
  const secret = getShareSecret()
  const parsed = token ? parseQuarterToken(token) : null
  if (!secret || !parsed || !verifyQuarterSignature(secret, parsed)) return null

  try {
    const [game, weeks] = await Promise.all([getGame(parsed.gameId), getWeeks(parsed.gameId)])
    const quarter = getCelebratedQuarters(weeks).find((s) => s.year === parsed.year && s.q === parsed.q)
    const podium = (quarter?.entries ?? []).slice(0, 3).map((e) => ({ name: e.name, points: e.points, won: e.won, drew: e.drew }))
    if (!game?.slug || !quarter || podium.length === 0) return null

    return {
      leagueName: game.name,
      slug: game.slug,
      year: quarter.year,
      q: quarter.q,
      seasonName: quarter.seasonName,
      dateRange: quarter.dateRange,
      gamesPlayed: quarter.gamesPlayed ?? 0,
      podium,
    }
  } catch {
    return null
  }
}

/** Resolves a league token to the league card, drawn from live data. */
export async function loadSharedLeague(token: string | null | undefined): Promise<SharedLeague | null> {
  const secret = getShareSecret()
  const parsed = token ? parseLeagueToken(token) : null
  if (!secret || !parsed || !verifyLeagueSignature(secret, parsed)) return null

  try {
    const [game, weeks] = await Promise.all([getGame(parsed.gameId), getWeeks(parsed.gameId)])
    if (!game?.slug) return null
    const played = weeks.filter((w) => w.status === 'played')
    const players = new Set(played.flatMap((w) => [...w.teamA, ...w.teamB]))
    return {
      leagueName: game.name,
      slug: game.slug,
      gamesPlayed: played.length,
      playerCount: players.size,
      nextGame: nextLeagueGame(weeks, {
        day: game.day ?? null,
        kickoff_time: game.kickoff_time ?? null,
        location: game.location ?? null,
      }),
    }
  } catch {
    return null
  }
}

const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/

/** The league an invite is for, or null when it is unknown or expired. Never the role or email. */
export async function loadInvitePreview(token: string | null | undefined): Promise<SharedInvite | null> {
  const trimmed = token?.trim() ?? ''
  if (!INVITE_TOKEN_RE.test(trimmed)) return null
  try {
    const { data } = await createServiceClient().rpc('preview_invite', { invite_token: trimmed })
    const row = Array.isArray(data) ? (data[0] as { league_name?: string } | undefined) : undefined
    return row?.league_name ? { leagueName: row.league_name } : null
  } catch {
    return null
  }
}

// ── Signing for server-rendered pages ─────────────────────────────────────────

/** Signed link for a played result, or null (not played, no winner, not configured). */
export function resultShareUrlFor(slug: string, week: Week | null | undefined): string | null {
  const secret = getShareSecret()
  if (!secret || !week?.id || week.status !== 'played' || !week.winner) return null
  const token = signResultToken(secret, week.id, {
    winner: week.winner,
    goalDifference: week.goal_difference ?? 0,
    teamA: week.teamA,
    teamB: week.teamB,
  })
  return resultShareUrl(slug, token)
}

/** Signed links for completed quarters, keyed by quarterShareKey. Empty when not configured. */
export function quarterShareUrls(
  slug: string,
  gameId: string,
  quarters: { year: number; q: number }[]
): Record<string, string> {
  const secret = getShareSecret()
  if (!secret) return {}
  return Object.fromEntries(
    quarters.map((q) => [quarterShareKey(q), quarterShareUrl(slug, signQuarterToken(secret, gameId, q.year, q.q), q.year, q.q)])
  )
}

/** The league's share token, or null when signing is not configured. */
export function leagueShareTokenFor(gameId: string): string | null {
  const secret = getShareSecret()
  return secret ? signLeagueToken(secret, gameId) : null
}
```

- [ ] **Step 4: Let results celebrations carry share URLs**

In `lib/sidebar-stats.ts`, extend `ResultsCelebration`:

```ts
export interface ResultsCelebration {
  quarters: QuarterSummary[]
  leagueName: string
  leagueSlug: string
  /** Signed share links keyed by quarterShareKey; missing keys share the plain link. */
  shareUrls?: Record<string, string>
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- lib/__tests__/shareLinksServer.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/shareLinksServer.ts lib/sidebar-stats.ts lib/__tests__/shareLinksServer.test.ts
git commit -m "Load shared results, quarters, leagues and invites for previews"
```

---

### Task 5: Shared image frame and response helper

**Files:**
- Create: `components/og/frame.tsx`, `lib/ogImage.tsx`
- Modify: `components/og/LineupShareImage.tsx`, `app/api/og/lineup/route.tsx`, `components/__tests__/LineupShareImage.test.tsx`, `__tests__/og-lineup-route.test.tsx`
- Test: `components/__tests__/ogFrame.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/ogFrame.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { GenericShareImage, MetaLine, OgIcon } from '@/components/og/frame'

describe('og frame', () => {
  it('renders the generic card with the tagline', () => {
    render(<GenericShareImage />)
    expect(screen.getByText('Craft Football')).toBeInTheDocument()
    expect(screen.getByText('Results, stats and fair teams for your weekly game.')).toBeInTheDocument()
  })

  it('renders both sides of the meta line', () => {
    render(<MetaLine left="The Boot Room · Week 41" right="Tue 06 Oct" />)
    expect(screen.getByText('The Boot Room · Week 41')).toBeInTheDocument()
    expect(screen.getByText('Tue 06 Oct')).toBeInTheDocument()
  })

  it('draws an icon in the given colour', () => {
    const { container } = render(<OgIcon name="award" size={24} color="#bef264" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('stroke', '#bef264')
    expect(svg?.querySelectorAll('path')).toHaveLength(1)
    expect(svg?.querySelectorAll('circle')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/__tests__/ogFrame.test.tsx`
Expected: FAIL, cannot find module `@/components/og/frame`.

- [ ] **Step 3: Create `components/og/frame.tsx`**

```tsx
// Shared pieces for the link-preview images in components/og, rendered to PNG
// by next/og (Satori) in app/api/og/*. Satori only understands inline style
// objects, so this folder is the one place in the app that styles with
// `style`. Every element with more than one child needs display: 'flex'.
import type { CSSProperties } from 'react'
import { SITE_TAGLINE } from '@/lib/utils'
import type { ResultHighlightIcon } from '@/lib/types'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_W = OG_SIZE.width
export const OG_H = OG_SIZE.height

// The ball from app/icon.svg (viewBox 4 4 72 72).
const BALL_PATH =
  'M40.15 31.00L40.15 23.50L49.26 17.64L58.40 24.28L55.65 34.76L48.51 37.08ZM48.61 37.36L55.74 35.04L64.13 41.90L60.63 52.64L49.82 53.26L45.41 47.19ZM45.17 47.37L49.58 53.44L45.65 63.53L34.35 63.53L30.42 53.44L34.83 47.37ZM34.59 47.19L30.18 53.26L19.37 52.64L15.87 41.90L24.26 35.04L31.39 37.36ZM31.49 37.08L24.35 34.76L21.60 24.28L30.74 17.64L39.85 23.50L39.85 31.00Z'

export const ROOT: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  position: 'relative',
  backgroundColor: '#060b14',
  color: '#f4f9ff',
  fontFamily: 'Space Grotesk',
}

const FULL: CSSProperties = { position: 'absolute', left: 0, top: 0, width: OG_W, height: OG_H }

export function Wordmark({ ballSize, fontSize }: { ballSize: number; fontSize: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(ballSize * 0.35) }}>
      <svg width={ballSize} height={ballSize} viewBox="4 4 72 72">
        <circle cx="40" cy="40" r="33" fill="none" stroke="#d8d8d8" strokeWidth="4" />
        <path fill="#d8d8d8" d={BALL_PATH} />
      </svg>
      <div style={{ fontSize, fontWeight: 700, letterSpacing: -0.02 * fontSize, color: '#f4f9ff' }}>
        Craft Football
      </div>
    </div>
  )
}

/** The small centred wordmark 24px from the bottom of every image. */
export function FooterWordmark() {
  return (
    <div style={{ position: 'absolute', left: 0, bottom: 24, width: OG_W, display: 'flex', justifyContent: 'center', opacity: 0.9 }}>
      <Wordmark ballSize={28} fontSize={21} />
    </div>
  )
}

/** The top line: Plex Mono caps, a label on the left and an optional detail on the right. */
export function MetaLine({ left, right }: { left: string; right?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        fontFamily: 'IBM Plex Mono',
        fontSize: 19,
        fontWeight: 700,
        letterSpacing: 2.85,
        textTransform: 'uppercase',
        color: '#8ba4c4',
      }}
    >
      <div style={{ maxWidth: 680, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{left}</div>
      {right ? <div>{right}</div> : null}
    </div>
  )
}

/** The app's dot field, fading out towards the bottom. */
export function DotField() {
  return (
    <div style={{ ...FULL, display: 'flex' }}>
      <div style={{ ...FULL, backgroundImage: 'radial-gradient(circle, #16283f 2px, rgba(22,40,63,0) 2.5px)', backgroundSize: '24px 24px' }} />
      <div style={{ ...FULL, backgroundImage: 'linear-gradient(180deg, rgba(6,11,20,0) 0%, rgba(6,11,20,0.6) 55%, #060b14 100%)' }} />
    </div>
  )
}

/** A soft radial glow, e.g. the winner's colour behind a result. */
export function Glow({ at, color, size = '55%' }: { at: string; color: string; size?: string }) {
  return <div style={{ ...FULL, backgroundImage: `radial-gradient(circle at ${at}, ${color}, rgba(6,11,20,0) ${size})` }} />
}

export type OgIconName = ResultHighlightIcon | 'trophy'

// Path data copied from lucide (24 × 24, stroke icons). Satori can't render
// the lucide-react components themselves, so the shapes are inlined.
const ICONS: Record<OgIconName, { paths: string[]; circles?: { cx: number; cy: number; r: number }[] }> = {
  flame: { paths: ['M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4'] },
  'heart-crack': {
    paths: [
      'M12.409 5.824c-.702.792-1.15 1.496-1.415 2.166l2.153 2.156a.5.5 0 0 1 0 .707l-2.293 2.293a.5.5 0 0 0 0 .707L12 15',
      'M13.508 20.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.677.6.6 0 0 0 .818.001A5.5 5.5 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5z',
    ],
  },
  zap: { paths: ['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'] },
  award: {
    paths: ['m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526'],
    circles: [{ cx: 12, cy: 8, r: 6 }],
  },
  'trending-up': { paths: ['M16 7h6v6', 'm22 7-8.5 8.5-5-5L2 17'] },
  crown: {
    paths: [
      'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
      'M5 21h14',
    ],
  },
  trophy: {
    paths: [
      'M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978',
      'M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978',
      'M18 9h1.5a1 1 0 0 0 0-5H18',
      'M4 22h16',
      'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z',
      'M6 9H4.5a1 1 0 0 1 0-5H6',
    ],
  },
}

export function OgIcon({ name, size, color, strokeWidth = 2.2 }: {
  name: OgIconName
  size: number
  color: string
  strokeWidth?: number
}) {
  const icon = ICONS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icon.paths.map((d) => <path key={d} d={d} />)}
      {icon.circles?.map((c) => <circle key={`${c.cx}-${c.cy}`} cx={c.cx} cy={c.cy} r={c.r} />)}
    </svg>
  )
}

/** Shown for missing, malformed or stale tokens and as the site default. Reveals no league data. */
export function GenericShareImage() {
  return (
    <div style={{ ...ROOT, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Wordmark ballSize={88} fontSize={64} />
      <div style={{ marginTop: 28, fontFamily: 'Inter', fontWeight: 700, fontSize: 28, color: '#8ba4c4' }}>
        {SITE_TAGLINE}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Slim `components/og/LineupShareImage.tsx`**

Replace the file's header, constants, `Wordmark` and `GenericShareImage` so it reads:

```tsx
// Link-preview image for a shared lineup (layout C): shaded team halves, big
// names, wordmark along the bottom. See components/og/frame.tsx for the
// Satori rules this file follows.
import { formatFixtureDate, lineupImageFontSize, LINEUP_IMAGE } from '@/lib/utils'
import type { SharedLineup } from '@/lib/types'
import { FooterWordmark, MetaLine, OG_H as H, OG_W as W, ROOT } from '@/components/og/frame'

const HALF = W / 2
const EDGE = 8
```

Keep `TeamColumn` unchanged. In `LineupImage`, replace the top-line `<div>…</div>` block with:

```tsx
        <MetaLine left={`${lineup.leagueName} · Week ${lineup.week}`} right={when} />
```

and the absolute wordmark `<div>` at the bottom with `<FooterWordmark />`. Delete `GenericShareImage`, `Wordmark`, `BALL_PATH`, `ROOT` and `OG_SIZE` from this file (they now live in `frame.tsx`).

Update the two tests that imported them:

```bash
perl -pi -e "s#import \{ GenericShareImage, LineupImage, OG_SIZE \} from '\@/components/og/LineupShareImage'#import { LineupImage } from '\@/components/og/LineupShareImage'\nimport { GenericShareImage, OG_SIZE } from '\@/components/og/frame'#" components/__tests__/LineupShareImage.test.tsx
perl -pi -e "s#import \{ GenericShareImage, LineupImage \} from '\@/components/og/LineupShareImage'#import { LineupImage } from '\@/components/og/LineupShareImage'\nimport { GenericShareImage } from '\@/components/og/frame'#" __tests__/og-lineup-route.test.tsx
grep -rn "og/LineupShareImage'" app components lib __tests__
```

Expected: every remaining import of `LineupShareImage` only takes `LineupImage`.

- [ ] **Step 5: Create `lib/ogImage.tsx` and use it in the lineup route**

```tsx
import type { ReactElement } from 'react'
import { ImageResponse } from 'next/og'
import { loadOgFonts } from '@/lib/ogFonts'
import { GenericShareImage, OG_SIZE } from '@/components/og/frame'

// A null image can stand in for a transient DB error, so don't pin the generic card at the CDN.
export const GENERIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=60'

/**
 * The PNG for a link preview. `image` resolves to the element to draw, or to
 * null for the generic card. Always a 200 PNG; only a font read failure
 * surfaces as an (uncached) error.
 */
export async function shareImageResponse(
  image: Promise<ReactElement | null>,
  cacheControl: string
): Promise<ImageResponse> {
  const [element, fonts] = await Promise.all([image, loadOgFonts()])
  return new ImageResponse(element ?? <GenericShareImage />, {
    ...OG_SIZE,
    fonts,
    headers: { 'Cache-Control': element ? cacheControl : GENERIC_CACHE_CONTROL },
  })
}
```

Replace `app/api/og/lineup/route.tsx` with:

```tsx
import { loadSharedLineup } from '@/lib/shareLinksServer'
import { shareImageResponse } from '@/lib/ogImage'
import { LineupImage } from '@/components/og/LineupShareImage'

export const runtime = 'nodejs'

// The token changes whenever the lineups do, so the CDN can cache this by URL.
const LINEUP_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600'

/** GET ?t=<token> — the link-preview image for a shared lineup. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  return shareImageResponse(
    loadSharedLineup(token).then((lineup) => (lineup ? <LineupImage lineup={lineup} /> : null)),
    LINEUP_CACHE_CONTROL
  )
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- components/__tests__/ogFrame.test.tsx components/__tests__/LineupShareImage.test.tsx __tests__/og-lineup-route.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/og lib/ogImage.tsx app/api/og/lineup components/__tests__ __tests__/og-lineup-route.test.tsx
git commit -m "Share the preview image frame and response across images"
```

---

### Task 6: Result image

**Files:**
- Create: `components/og/ResultShareImage.tsx`
- Test: `components/__tests__/ResultShareImage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { ResultImage, resultHeadline } from '@/components/og/ResultShareImage'
import type { SharedResult } from '@/lib/types'

const RESULT: SharedResult = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  week: 41,
  date: '06 Oct 2026',
  winner: 'teamA',
  goalDifference: 3,
  teamA: ['Marcus Reid', 'Rav Singh'],
  teamB: ['Callum Shaw', 'Sofia Marsh'],
  highlights: [
    { icon: 'flame', text: 'Marcus Reid · 4-game win streak' },
    { icon: 'zap', text: 'Upset · Team B stronger on paper' },
  ],
}

describe('ResultImage', () => {
  it('shows the headline, the winners and the highlights', () => {
    render(<ResultImage result={RESULT} />)
    expect(screen.getByText('The Boot Room · Week 41')).toBeInTheDocument()
    expect(screen.getByText('Tue 06 Oct')).toBeInTheDocument()
    expect(screen.getByText('Full time')).toBeInTheDocument()
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('win by 3')).toBeInTheDocument()
    expect(screen.getByText('Marcus Reid, Rav Singh')).toBeInTheDocument()
    expect(screen.getByText('Highlights')).toBeInTheDocument()
    expect(screen.getByText('Marcus Reid · 4-game win streak')).toBeInTheDocument()
    expect(screen.queryByText('Callum Shaw, Sofia Marsh')).not.toBeInTheDocument()
  })

  it('names the losing side when there are no highlights', () => {
    render(<ResultImage result={{ ...RESULT, highlights: [] }} />)
    expect(screen.getByText('Beat')).toBeInTheDocument()
    expect(screen.getByText('Callum Shaw, Sofia Marsh')).toBeInTheDocument()
  })

  it('treats a draw as honours even with both teams and no panel', () => {
    render(<ResultImage result={{ ...RESULT, winner: 'draw', goalDifference: 0, highlights: [] }} />)
    expect(screen.getByText('Honours')).toBeInTheDocument()
    expect(screen.getByText('even')).toBeInTheDocument()
    expect(screen.getByText('Team A · Marcus Reid, Rav Singh')).toBeInTheDocument()
    expect(screen.getByText('Team B · Callum Shaw, Sofia Marsh')).toBeInTheDocument()
    expect(screen.queryByText('Beat')).not.toBeInTheDocument()
  })
})

describe('resultHeadline', () => {
  it('names the winner and margin', () => {
    expect(resultHeadline({ winner: 'teamB', goalDifference: 1 })).toEqual(['Team B', 'win by 1'])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/__tests__/ResultShareImage.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// Link-preview image for a shared result (layout C): headline and winners on
// the left, up to three highlights on the right. See components/og/frame.tsx
// for the Satori rules this file follows.
import type { CSSProperties } from 'react'
import { formatFixtureDate } from '@/lib/utils'
import type { SharedResult } from '@/lib/types'
import { FooterWordmark, Glow, MetaLine, OG_H, OgIcon, ROOT } from '@/components/og/frame'

const EDGE = 8
const SIDES = {
  teamA: { bar: '#38bdf8', light: '#7dd3fc', names: '#dff1ff', glow: 'rgba(56,189,248,0.18)' },
  teamB: { bar: '#a78bfa', light: '#c4b5fd', names: '#efeaff', glow: 'rgba(167,139,250,0.18)' },
} as const

const LABEL: CSSProperties = {
  fontFamily: 'IBM Plex Mono',
  fontSize: 19,
  fontWeight: 700,
  letterSpacing: 2.85,
  textTransform: 'uppercase',
}
// Names wrap to at most three lines, then are cut off.
const NAMES: CSSProperties = { fontFamily: 'Inter', fontSize: 24, fontWeight: 700, lineHeight: 1.3, maxHeight: 94, overflow: 'hidden' }

/** The two headline lines: "Team A" / "win by 3", or "Honours" / "even". */
export function resultHeadline(result: Pick<SharedResult, 'winner' | 'goalDifference'>): [string, string] {
  if (result.winner === 'draw') return ['Honours', 'even']
  return [result.winner === 'teamA' ? 'Team A' : 'Team B', `win by ${result.goalDifference}`]
}

export function ResultImage({ result }: { result: SharedResult }) {
  const side = result.winner === 'draw' ? null : SIDES[result.winner]
  const [line1, line2] = resultHeadline(result)
  const winners = result.winner === 'teamB' ? result.teamB : result.teamA
  const losers = result.winner === 'teamB' ? result.teamA : result.teamB
  // A draw with nothing to call out gives the teams the full width.
  const showPanel = side !== null || result.highlights.length > 0

  return (
    <div style={ROOT}>
      {side && <Glow at="15% 10%" color={side.glow} />}
      <div style={{ position: 'absolute', left: 0, top: 0, width: EDGE, height: OG_H, backgroundColor: side?.bar ?? '#223a5c' }} />

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '30px 60px' }}>
        <MetaLine left={`${result.leagueName} · Week ${result.week}`} right={formatFixtureDate(result.date)} />
        <div style={{ display: 'flex', marginTop: 34 }}>
          <div style={{ display: 'flex', flexDirection: 'column', width: showPanel ? 570 : 1080 }}>
            <div style={{ ...LABEL, color: side?.light ?? '#8ba4c4' }}>Full time</div>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: 10, fontSize: 80, fontWeight: 700, letterSpacing: -2.4, lineHeight: 1.02 }}>
              <div>{line1}</div>
              <div style={{ color: side?.light ?? '#8ba4c4' }}>{line2}</div>
            </div>
            {side ? (
              <div style={{ ...NAMES, marginTop: 18, color: side.names }}>{winners.join(', ')}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
                <div style={{ ...NAMES, maxHeight: 62, color: SIDES.teamA.names }}>{`Team A · ${result.teamA.join(', ')}`}</div>
                <div style={{ ...NAMES, maxHeight: 62, marginTop: 6, color: SIDES.teamB.names }}>{`Team B · ${result.teamB.join(', ')}`}</div>
              </div>
            )}
          </div>
          {showPanel && <HighlightsPanel highlights={result.highlights} losers={losers} />}
        </div>
      </div>

      <FooterWordmark />
    </div>
  )
}

function HighlightsPanel({ highlights, losers }: { highlights: SharedResult['highlights']; losers: string[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 470, marginLeft: 40, paddingLeft: 40, borderLeft: '2px solid #17263c' }}>
      <div style={{ ...LABEL, color: '#8ba4c4' }}>{highlights.length > 0 ? 'Highlights' : 'Beat'}</div>
      {highlights.length > 0 ? (
        highlights.map((h, i) => (
          <div
            key={h.text}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginTop: i === 0 ? 20 : 18,
              fontFamily: 'Inter',
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1.25,
              color: i === 0 ? '#bef264' : '#f4f9ff',
            }}
          >
            <OgIcon name={h.icon} size={26} color={i === 0 ? '#bef264' : '#8ba4c4'} />
            <div style={{ display: 'flex', marginLeft: 14, width: 390 }}>{h.text}</div>
          </div>
        ))
      ) : (
        <div style={{ ...NAMES, marginTop: 20, color: '#8ba4c4' }}>{losers.join(', ')}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- components/__tests__/ResultShareImage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/og/ResultShareImage.tsx components/__tests__/ResultShareImage.test.tsx
git commit -m "Add the result preview image"
```

---

### Task 7: Quarter image

**Files:**
- Create: `components/og/QuarterShareImage.tsx`
- Test: `components/__tests__/QuarterShareImage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { championRecord, QuarterImage } from '@/components/og/QuarterShareImage'
import type { SharedQuarter } from '@/lib/types'

const QUARTER: SharedQuarter = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  year: 2026,
  q: 3,
  seasonName: 'Summer',
  dateRange: { from: '07 Jul 2026', to: '29 Sep 2026' },
  gamesPlayed: 12,
  podium: [
    { name: 'Jordan Hale', points: 24, won: 8, drew: 0 },
    { name: 'Sam Okafor', points: 21, won: 7, drew: 0 },
    { name: 'Kit Marsh', points: 19, won: 6, drew: 1 },
  ],
}

describe('QuarterImage', () => {
  it('crowns the champion with their record and the podium', () => {
    render(<QuarterImage quarter={QUARTER} />)
    expect(screen.getByText('The Boot Room')).toBeInTheDocument()
    expect(screen.getByText('07 Jul – 29 Sep · 12 games')).toBeInTheDocument()
    expect(screen.getByText('Q3 2026 · Summer champion')).toBeInTheDocument()
    expect(screen.getByText('Jordan Hale')).toBeInTheDocument()
    expect(screen.getByText('24 pts · 8 wins')).toBeInTheDocument()
    expect(screen.getByText('Sam Okafor · 21')).toBeInTheDocument()
    expect(screen.getByText('Kit Marsh · 19')).toBeInTheDocument()
  })

  it('leaves out the podium line for a one-player table', () => {
    render(<QuarterImage quarter={{ ...QUARTER, podium: QUARTER.podium.slice(0, 1) }} />)
    expect(screen.queryByText('Sam Okafor · 21')).not.toBeInTheDocument()
  })
})

describe('championRecord', () => {
  it('mentions draws only when there are some', () => {
    expect(championRecord({ name: 'x', points: 10, won: 3, drew: 1 })).toBe('10 pts · 3 wins · 1 draw')
    expect(championRecord({ name: 'x', points: 3, won: 1, drew: 0 })).toBe('3 pts · 1 win')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/__tests__/QuarterShareImage.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```tsx
// Link-preview image for a shared quarter (layout A): a centred champion
// hero with a podium line. See components/og/frame.tsx for the Satori rules.
import { fitFontSize, quarterRangeLabel } from '@/lib/utils'
import type { SharedQuarter } from '@/lib/types'
import { FooterWordmark, Glow, MetaLine, OgIcon, ROOT } from '@/components/og/frame'

/** "24 pts · 8 wins · 1 draw", worded like QuarterCelebration (draws left out at zero). */
export function championRecord(e: SharedQuarter['podium'][number]): string {
  return [
    `${e.points} pts`,
    `${e.won} ${e.won === 1 ? 'win' : 'wins'}`,
    e.drew > 0 ? `${e.drew} ${e.drew === 1 ? 'draw' : 'draws'}` : null,
  ].filter(Boolean).join(' · ')
}

export function QuarterImage({ quarter }: { quarter: SharedQuarter }) {
  const [champion, ...rest] = quarter.podium
  const nameSize = fitFontSize(champion.name.length, 1000, 104, 64)

  return (
    <div style={{ ...ROOT, flexDirection: 'column' }}>
      <Glow at="18% 10%" color="rgba(190,242,100,0.16)" size="45%" />
      <Glow at="85% 0%" color="rgba(56,189,248,0.14)" size="42%" />

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '30px 60px' }}>
        <MetaLine left={quarter.leagueName} right={quarterRangeLabel(quarter.dateRange, quarter.gamesPlayed)} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 34 }}>
          <OgIcon name="trophy" size={52} color="#bef264" strokeWidth={1.8} />
          <div style={{ marginTop: 14, fontFamily: 'IBM Plex Mono', fontSize: 20, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: '#bef264' }}>
            {`Q${quarter.q} ${quarter.year} · ${quarter.seasonName} champion`}
          </div>
          <div style={{ marginTop: 14, maxWidth: 1000, fontSize: nameSize, fontWeight: 700, letterSpacing: -0.03 * nameSize, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {champion.name}
          </div>
          <div style={{ marginTop: 16, fontFamily: 'IBM Plex Mono', fontSize: 20, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#8ba4c4' }}>
            {championRecord(champion)}
          </div>
          {rest.length > 0 && (
            <div style={{ display: 'flex', marginTop: 28, fontFamily: 'Inter', fontSize: 22, fontWeight: 700, color: '#8ba4c4' }}>
              {rest.map((e, i) => (
                <div key={e.name} style={{ display: 'flex', marginLeft: i === 0 ? 0 : 44 }}>
                  <div style={{ color: '#f4f9ff', marginRight: 10 }}>{String(i + 2)}</div>
                  <div>{`${e.name} · ${e.points}`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <FooterWordmark />
    </div>
  )
}
```

- [ ] **Step 4: Run the test**

Run: `npm test -- components/__tests__/QuarterShareImage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/og/QuarterShareImage.tsx components/__tests__/QuarterShareImage.test.tsx
git commit -m "Add the quarter champion preview image"
```

---

### Task 8: League and invite images

**Files:**
- Create: `components/og/LeagueShareImage.tsx`, `components/og/InviteShareImage.tsx`
- Test: `components/__tests__/LeagueInviteShareImage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { LeagueImage } from '@/components/og/LeagueShareImage'
import { InviteImage } from '@/components/og/InviteShareImage'
import type { SharedLeague } from '@/lib/types'

const LEAGUE: SharedLeague = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  gamesPlayed: 142,
  playerCount: 38,
  nextGame: { date: '13 Oct 2026', kickoffTime: '19:00', location: 'Powerleague Shoreditch' },
}

describe('LeagueImage', () => {
  it('shows the league and its next game', () => {
    render(<LeagueImage league={LEAGUE} />)
    expect(screen.getAllByText('The Boot Room')).toHaveLength(2) // meta line and title
    expect(screen.getByText('142 games played')).toBeInTheDocument()
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(screen.getByText('Tue 13 Oct · 19:00')).toBeInTheDocument()
    expect(screen.getByText('Powerleague Shoreditch')).toBeInTheDocument()
  })

  it('shows a stat line when there is no next game', () => {
    render(<LeagueImage league={{ ...LEAGUE, nextGame: null }} />)
    expect(screen.queryByText('Next game')).not.toBeInTheDocument()
    expect(screen.getByText('142 games · 38 players')).toBeInTheDocument()
  })
})

describe('InviteImage', () => {
  it('invites without naming a role', () => {
    render(<InviteImage invite={{ leagueName: 'The Boot Room' }} />)
    expect(screen.getByText("You're invited to join")).toBeInTheDocument()
    expect(screen.getByText('The Boot Room')).toBeInTheDocument()
    expect(screen.getByText('Join the league')).toBeInTheDocument()
    expect(screen.queryByText(/admin/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/__tests__/LeagueInviteShareImage.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `components/og/LeagueShareImage.tsx`**

```tsx
// Link-preview image for a shared league link (layout C): the league name and
// its next game. See components/og/frame.tsx for the Satori rules.
import { fitFontSize, formatFixtureDate, gamesPlayedLabel } from '@/lib/utils'
import type { SharedLeague } from '@/lib/types'
import { DotField, FooterWordmark, MetaLine, ROOT } from '@/components/og/frame'

export function LeagueImage({ league }: { league: SharedLeague }) {
  const nameSize = fitFontSize(league.leagueName.length, 1080, 92, 56)
  const next = league.nextGame

  return (
    <div style={{ ...ROOT, flexDirection: 'column' }}>
      <DotField />
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', padding: '30px 60px' }}>
        <MetaLine left={league.leagueName} right={gamesPlayedLabel(league.gamesPlayed)} />
        <div style={{ marginTop: 60, maxWidth: 1080, fontSize: nameSize, fontWeight: 700, letterSpacing: -0.035 * nameSize, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {league.leagueName}
        </div>
        {next ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignSelf: 'flex-start', marginTop: 44, padding: '24px 32px', backgroundColor: '#0a1421', border: '2px solid #1b2c46', borderRadius: 16 }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 18, fontWeight: 700, letterSpacing: 2.7, textTransform: 'uppercase', color: '#38bdf8' }}>
              Next game
            </div>
            <div style={{ marginTop: 10, fontSize: 34, fontWeight: 700, letterSpacing: -0.7 }}>
              {[formatFixtureDate(next.date), next.kickoffTime].filter(Boolean).join(' · ')}
            </div>
            {next.location && (
              <div style={{ marginTop: 6, fontFamily: 'Inter', fontSize: 24, fontWeight: 700, color: '#8ba4c4' }}>{next.location}</div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 44, fontFamily: 'IBM Plex Mono', fontSize: 22, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: '#8ba4c4' }}>
            {`${league.gamesPlayed} ${league.gamesPlayed === 1 ? 'game' : 'games'} · ${league.playerCount} ${league.playerCount === 1 ? 'player' : 'players'}`}
          </div>
        )}
      </div>
      <FooterWordmark />
    </div>
  )
}
```

- [ ] **Step 4: Implement `components/og/InviteShareImage.tsx`**

```tsx
// Link-preview image for an invite link. Shows only the league name: never
// the role or the invited email. See components/og/frame.tsx for the Satori rules.
import { fitFontSize, SITE_TAGLINE } from '@/lib/utils'
import type { SharedInvite } from '@/lib/types'
import { DotField, FooterWordmark, Glow, ROOT } from '@/components/og/frame'

export function InviteImage({ invite }: { invite: SharedInvite }) {
  const nameSize = fitFontSize(invite.leagueName.length, 1000, 104, 60)

  return (
    <div style={{ ...ROOT, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <DotField />
      <Glow at="50% 40%" color="rgba(56,189,248,0.16)" />
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 20, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase', color: '#7dd3fc' }}>
        {"You're invited to join"}
      </div>
      <div style={{ marginTop: 16, maxWidth: 1000, fontSize: nameSize, fontWeight: 700, letterSpacing: -0.035 * nameSize, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {invite.leagueName}
      </div>
      <div style={{ marginTop: 22, fontFamily: 'Inter', fontSize: 28, fontWeight: 700, color: '#8ba4c4' }}>{SITE_TAGLINE}</div>
      <div style={{ display: 'flex', marginTop: 32, padding: '14px 30px', borderRadius: 4, backgroundColor: '#38bdf8', color: '#05101d', fontSize: 24, fontWeight: 700 }}>
        Join the league
      </div>
      <FooterWordmark />
    </div>
  )
}
```

- [ ] **Step 5: Run the test**

Run: `npm test -- components/__tests__/LeagueInviteShareImage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/og/LeagueShareImage.tsx components/og/InviteShareImage.tsx components/__tests__/LeagueInviteShareImage.test.tsx
git commit -m "Add the league and invite preview images"
```

---

### Task 9: Image routes

**Files:**
- Create: `app/api/og/result/route.tsx`, `app/api/og/quarter/route.tsx`, `app/api/og/league/route.tsx`, `app/api/og/invite/route.tsx`, `app/api/og/default/route.tsx`
- Modify: `next.config.js`, `lib/ogFonts.ts` (comment)
- Test: `__tests__/og-share-routes.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { ImageResponse } from 'next/og'
import { loadInvitePreview, loadSharedLeague, loadSharedQuarter, loadSharedResult } from '@/lib/shareLinksServer'
import { loadOgFonts } from '@/lib/ogFonts'
import { GenericShareImage } from '@/components/og/frame'
import { ResultImage } from '@/components/og/ResultShareImage'
import { QuarterImage } from '@/components/og/QuarterShareImage'
import { LeagueImage } from '@/components/og/LeagueShareImage'
import { InviteImage } from '@/components/og/InviteShareImage'

jest.mock('next/og', () => ({ ImageResponse: jest.fn() }))
jest.mock('@/lib/ogFonts', () => ({ loadOgFonts: jest.fn() }))
jest.mock('@/lib/shareLinksServer', () => ({
  loadSharedResult: jest.fn(),
  loadSharedQuarter: jest.fn(),
  loadSharedLeague: jest.fn(),
  loadInvitePreview: jest.fn(),
}))

import { GET as resultGET } from '@/app/api/og/result/route'
import { GET as quarterGET } from '@/app/api/og/quarter/route'
import { GET as leagueGET } from '@/app/api/og/league/route'
import { GET as inviteGET } from '@/app/api/og/invite/route'
import { GET as defaultGET } from '@/app/api/og/default/route'

const SENTINEL = { sentinel: true }
const GENERIC_CACHE = 'public, max-age=60, s-maxage=60'

beforeEach(() => {
  jest.resetAllMocks()
  ;(loadOgFonts as jest.Mock).mockResolvedValue([])
  ;(ImageResponse as unknown as jest.Mock).mockImplementation(function () {
    return SENTINEL
  })
})

function lastRender() {
  const [element, options] = (ImageResponse as unknown as jest.Mock).mock.calls[0]
  return { element, options }
}

const CASES = [
  { name: 'result', GET: resultGET, loader: loadSharedResult, param: 't', component: ResultImage, prop: 'result', cache: 'public, max-age=300, s-maxage=3600' },
  { name: 'quarter', GET: quarterGET, loader: loadSharedQuarter, param: 't', component: QuarterImage, prop: 'quarter', cache: 'public, max-age=300, s-maxage=3600' },
  { name: 'league', GET: leagueGET, loader: loadSharedLeague, param: 't', component: LeagueImage, prop: 'league', cache: 'public, max-age=300, s-maxage=900' },
  { name: 'invite', GET: inviteGET, loader: loadInvitePreview, param: 'token', component: InviteImage, prop: 'invite', cache: 'public, max-age=300, s-maxage=900' },
]

describe.each(CASES)('GET /api/og/$name', ({ name, GET, loader, param, component, prop, cache }) => {
  it('draws the image for a token that resolves', async () => {
    const data = { leagueName: 'The Boot Room' }
    ;(loader as jest.Mock).mockResolvedValue(data)
    await expect(GET(new Request(`http://localhost/api/og/${name}?${param}=abc`))).resolves.toBe(SENTINEL)
    expect(loader).toHaveBeenCalledWith('abc')
    const { element, options } = lastRender()
    expect(element.type).toBe(component)
    expect(element.props[prop]).toBe(data)
    expect(options).toEqual(expect.objectContaining({ width: 1200, height: 630, headers: { 'Cache-Control': cache } }))
  })

  it('draws the generic card, briefly cached, when it does not', async () => {
    ;(loader as jest.Mock).mockResolvedValue(null)
    await GET(new Request(`http://localhost/api/og/${name}`))
    expect(loader).toHaveBeenCalledWith(null)
    const { element, options } = lastRender()
    expect(element.type).toBe(GenericShareImage)
    expect(options.headers).toEqual({ 'Cache-Control': GENERIC_CACHE })
  })
})

describe('GET /api/og/default', () => {
  it('draws the generic card, cached for a day', async () => {
    await defaultGET()
    const { element, options } = lastRender()
    expect(element.type).toBe(GenericShareImage)
    expect(options.headers).toEqual({ 'Cache-Control': 'public, max-age=3600, s-maxage=86400' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- __tests__/og-share-routes.test.tsx`
Expected: FAIL, route modules not found.

- [ ] **Step 3: Create the routes**

`app/api/og/result/route.tsx`:

```tsx
import { loadSharedResult } from '@/lib/shareLinksServer'
import { shareImageResponse } from '@/lib/ogImage'
import { ResultImage } from '@/components/og/ResultShareImage'

export const runtime = 'nodejs'

// The token changes whenever the result does, so the CDN can cache this by URL.
const RESULT_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600'

/** GET ?t=<token> — the link-preview image for a shared result. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  return shareImageResponse(
    loadSharedResult(token).then((result) => (result ? <ResultImage result={result} /> : null)),
    RESULT_CACHE_CONTROL
  )
}
```

`app/api/og/quarter/route.tsx`:

```tsx
import { loadSharedQuarter } from '@/lib/shareLinksServer'
import { shareImageResponse } from '@/lib/ogImage'
import { QuarterImage } from '@/components/og/QuarterShareImage'

export const runtime = 'nodejs'

// A completed quarter rarely changes.
const QUARTER_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600'

/** GET ?t=<token> — the link-preview image for a shared quarter. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  return shareImageResponse(
    loadSharedQuarter(token).then((quarter) => (quarter ? <QuarterImage quarter={quarter} /> : null)),
    QUARTER_CACHE_CONTROL
  )
}
```

`app/api/og/league/route.tsx`:

```tsx
import { loadSharedLeague } from '@/lib/shareLinksServer'
import { shareImageResponse } from '@/lib/ogImage'
import { LeagueImage } from '@/components/og/LeagueShareImage'

export const runtime = 'nodejs'

// The token never changes but the next game moves weekly.
const LEAGUE_CACHE_CONTROL = 'public, max-age=300, s-maxage=900'

/** GET ?t=<token> — the link-preview image for a shared league link. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  return shareImageResponse(
    loadSharedLeague(token).then((league) => (league ? <LeagueImage league={league} /> : null)),
    LEAGUE_CACHE_CONTROL
  )
}
```

`app/api/og/invite/route.tsx`:

```tsx
import { loadInvitePreview } from '@/lib/shareLinksServer'
import { shareImageResponse } from '@/lib/ogImage'
import { InviteImage } from '@/components/og/InviteShareImage'

export const runtime = 'nodejs'

// A revoked invite falls back to the generic card within 15 minutes.
const INVITE_CACHE_CONTROL = 'public, max-age=300, s-maxage=900'

/** GET ?token=<invite token> — the link-preview image for an invite link. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  return shareImageResponse(
    loadInvitePreview(token).then((invite) => (invite ? <InviteImage invite={invite} /> : null)),
    INVITE_CACHE_CONTROL
  )
}
```

`app/api/og/default/route.tsx`:

```tsx
import { shareImageResponse } from '@/lib/ogImage'
import { GenericShareImage } from '@/components/og/frame'

export const runtime = 'nodejs'

const DEFAULT_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400'

/** GET — the site-wide default link-preview image. */
export async function GET() {
  return shareImageResponse(Promise.resolve(<GenericShareImage />), DEFAULT_CACHE_CONTROL)
}
```

- [ ] **Step 4: Trace the fonts into every image route**

Replace `next.config.js` with:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  // The preview images read these TTFs from disk at runtime. File tracing
  // cannot see a path built from process.cwd(), so include them per route.
  outputFileTracingIncludes: {
    '/api/og/lineup': ['./assets/fonts/**/*'],
    '/api/og/result': ['./assets/fonts/**/*'],
    '/api/og/quarter': ['./assets/fonts/**/*'],
    '/api/og/league': ['./assets/fonts/**/*'],
    '/api/og/invite': ['./assets/fonts/**/*'],
    '/api/og/default': ['./assets/fonts/**/*'],
  },
}

module.exports = nextConfig
```

In `lib/ogFonts.ts`, change "traces them into the /api/og/lineup bundle" to "traces them into each /api/og/* bundle".

- [ ] **Step 5: Run the tests**

Run: `npm test -- __tests__/og-share-routes.test.tsx __tests__/og-lineup-route.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/og next.config.js lib/ogFonts.ts __tests__/og-share-routes.test.tsx
git commit -m "Add image routes for result, quarter, league, invite and default previews"
```

---

### Task 10: League page metadata and the site default

**Files:**
- Modify: `lib/metadata.ts`, every `app/[slug]/(tabs)/*/page.tsx`, `app/layout.tsx`
- Test: `lib/__tests__/metadata.lineupShare.test.ts` (rename to `metadata.shareLinks.test.ts`)

- [ ] **Step 1: Update the existing tests and add new ones**

```bash
git mv lib/__tests__/metadata.lineupShare.test.ts lib/__tests__/metadata.shareLinks.test.ts
```

In that file:
- Change the server mock to `jest.mock('@/lib/shareLinksServer', () => ({ loadSharedLineup: jest.fn(), loadSharedResult: jest.fn(), loadSharedQuarter: jest.fn(), loadSharedLeague: jest.fn() }))` and import all four.
- Replace each third argument `'tok.sig'` with `{ lineup: 'tok.sig' }` and `'bad'` with `{ lineup: 'bad' }`.
- Append:

```ts
const RESULT: SharedResult = {
  leagueName: 'The Boot Room', slug: 'the-boot-room', week: 41, date: '06 Oct 2026',
  winner: 'teamB', goalDifference: 2, teamA: [], teamB: [], highlights: [],
}
const QUARTER: SharedQuarter = {
  leagueName: 'The Boot Room', slug: 'the-boot-room', year: 2026, q: 3, seasonName: 'Summer',
  dateRange: { from: '07 Jul 2026', to: '29 Sep 2026' }, gamesPlayed: 12,
  podium: [{ name: 'Jordan Hale', points: 24, won: 8, drew: 0 }],
}
const LEAGUE: SharedLeague = { leagueName: 'The Boot Room', slug: 'the-boot-room', gamesPlayed: 142, playerCount: 38, nextGame: null }

describe('leaguePageMetadata with other share tokens', () => {
  it('adds a result preview on Results and Overview', async () => {
    ;(loadSharedResult as jest.Mock).mockResolvedValue(RESULT)
    for (const page of ['results', 'overview'] as const) {
      const meta = await leaguePageMetadata('the-boot-room', page, { result: 'r.tok' })
      expect(meta.openGraph?.title).toBe('Week 41 result · The Boot Room')
      expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/result?t=r.tok' })])
    }
  })

  it('adds a quarter preview on Seasons only', async () => {
    ;(loadSharedQuarter as jest.Mock).mockResolvedValue(QUARTER)
    const honours = await leaguePageMetadata('the-boot-room', 'honours', { quarter: 'q.tok' })
    expect(honours.openGraph?.title).toBe('Q3 2026 champion · The Boot Room')
    const results = await leaguePageMetadata('the-boot-room', 'results', { quarter: 'q.tok' })
    expect(results.openGraph).toBeUndefined()
  })

  it('adds a league preview on any tab', async () => {
    ;(loadSharedLeague as jest.Mock).mockResolvedValue(LEAGUE)
    const meta = await leaguePageMetadata('the-boot-room', 'players', { league: 'l.tok' })
    expect(meta.openGraph?.description).toBe('142 games played')
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/league?t=l.tok' })])
  })

  it('prefers a lineup over a result over a league', async () => {
    ;(loadSharedLineup as jest.Mock).mockResolvedValue(LINEUP)
    ;(loadSharedResult as jest.Mock).mockResolvedValue(RESULT)
    ;(loadSharedLeague as jest.Mock).mockResolvedValue(LEAGUE)
    const all = await leaguePageMetadata('the-boot-room', 'results', { lineup: 'a', result: 'b', league: 'c' })
    expect(all.openGraph?.title).toBe('Week 13 lineups · The Boot Room')
    const noLineup = await leaguePageMetadata('the-boot-room', 'results', { result: 'b', league: 'c' })
    expect(noLineup.openGraph?.title).toBe('Week 41 result · The Boot Room')
  })

  it('ignores tokens for another league and array params', async () => {
    ;(loadSharedLeague as jest.Mock).mockResolvedValue({ ...LEAGUE, slug: 'other' })
    expect((await leaguePageMetadata('the-boot-room', 'players', { league: 'c' })).openGraph).toBeUndefined()
    expect((await leaguePageMetadata('the-boot-room', 'players', { league: ['c', 'd'] })).openGraph).toBeUndefined()
  })
})
```

Add `SharedLeague, SharedQuarter, SharedResult` to the file's type import.

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- lib/__tests__/metadata.shareLinks.test.ts`
Expected: FAIL (third argument is still a string token; no result/quarter/league handling).

- [ ] **Step 3: Update `lib/metadata.ts`**

Change the imports:

```ts
import {
  buildLeagueShareMetadata,
  buildLineupShareMetadata,
  buildQuarterShareMetadata,
  buildResultShareMetadata,
} from '@/lib/shareLinks'
import { loadSharedLeague, loadSharedLineup, loadSharedQuarter, loadSharedResult } from '@/lib/shareLinksServer'
```

Replace `leaguePageMetadata` with:

```ts
export type PageSearchParams = Record<string, string | string[] | undefined>

/**
 * Tab title for a league page. Overview and Results, the league's landing
 * tabs, swap their label for what is happening today ("Match day",
 * "Full time: Team A won") when the viewer can see match history. Admins get
 * their pending join requests and claims as a leading count.
 *
 * Shares the request-cached fetchers with the page and tabs layout, so it adds
 * no queries. A share token in the query string (see sharePreview) also adds
 * the Open Graph tags that make the shared link unfurl.
 */
export async function leaguePageMetadata(
  slug: string,
  page: LeaguePage,
  searchParams: PageSearchParams = {}
): Promise<Metadata> {
  const game = await getGameBySlug(slug)
  if (!game) return {}

  const [{ userRole }, features, weeks, pendingCount, preview] = await Promise.all([
    getAuthAndRole(game.id),
    getFeatures(game.id),
    getWeeks(game.id),
    getPendingBadgeCount(game.id), // 0 for non-admins
    sharePreview(slug, page, searchParams),
  ])

  const tier = resolveVisibilityTier(userRole)
  const showStatus =
    (page === 'overview' || page === 'results') &&
    !isLeagueHidden(features, tier) &&
    (tier === 'admin' || isFeatureEnabled(features, 'match_history', tier))
  const status = showStatus
    ? getLeagueTitleStatus(weeks, new Date(), dayNameToIndex(game.day ?? null) ?? undefined)
    : null

  const title = {
    absolute: buildLeagueTitle({ page: status ?? PAGE_LABELS[page], leagueName: game.name, pendingCount }),
  }
  return preview ? { title, ...preview } : { title }
}

/**
 * Open Graph tags for the first share token in the query string that
 * resolves to this league. Lineup and result links land on Overview or
 * Results, quarter links on Seasons, and league links on any tab.
 */
async function sharePreview(slug: string, page: LeaguePage, searchParams: PageSearchParams): Promise<Metadata | null> {
  const param = (key: string) => {
    const value = searchParams[key]
    return typeof value === 'string' && value ? value : undefined
  }
  const landing = page === 'overview' || page === 'results'
  const lineupToken = landing ? param('lineup') : undefined
  const resultToken = landing ? param('result') : undefined
  const quarterToken = page === 'honours' ? param('quarter') : undefined
  const leagueToken = param('league')

  const [lineup, result, quarter, league] = await Promise.all([
    lineupToken ? loadSharedLineup(lineupToken) : null,
    resultToken ? loadSharedResult(resultToken) : null,
    quarterToken ? loadSharedQuarter(quarterToken) : null,
    leagueToken ? loadSharedLeague(leagueToken) : null,
  ])

  if (lineupToken && lineup?.slug === slug) return buildLineupShareMetadata(lineup, lineupToken)
  if (resultToken && result?.slug === slug) return buildResultShareMetadata(result, resultToken)
  if (quarterToken && quarter?.slug === slug) return buildQuarterShareMetadata(quarter, quarterToken)
  if (leagueToken && league?.slug === slug) return buildLeagueShareMetadata(league, leagueToken)
  return null
}
```

- [ ] **Step 4: Pass `searchParams` from every tab page**

For `overview` and `results` (which already declare `searchParams`), replace `generateMetadata` with:

```ts
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return leaguePageMetadata((await params).slug, 'results', await searchParams) // 'overview' in overview/page.tsx
}
```

For `honours`, `lineup-lab`, `players` and `records`, add to `Props`:

```ts
  searchParams: Promise<Record<string, string | string[] | undefined>>
```

and change `generateMetadata` to take `{ params, searchParams }` and call `leaguePageMetadata((await params).slug, '<page>', await searchParams)`.

For `admin` (whose `searchParams` is typed `{ range?: string; from?: string; to?: string }`), change `generateMetadata` to `({ params, searchParams }: Props)` and pass `await searchParams`.

Run: `grep -n "leaguePageMetadata(" "app/[slug]/(tabs)"/*/page.tsx`
Expected: every call has three arguments.

- [ ] **Step 5: Add the site default image**

In `app/layout.tsx`, import `SITE_TAGLINE` from `@/lib/utils` and replace the `metadata` export with:

```ts
export const metadata: Metadata = {
  metadataBase: new URL('https://craft-football.com'),
  // Pages set their own tab title; league pages override it in full (lib/metadata.ts).
  title: { default: 'Craft Football', template: '%s · Craft Football' },
  description: SITE_TAGLINE,
  // The default preview for every page without its own. Child metadata that
  // sets openGraph replaces this object, so share previews set their own image.
  openGraph: {
    title: 'Craft Football',
    description: SITE_TAGLINE,
    url: 'https://craft-football.com',
    siteName: 'Craft Football',
    images: [{ url: '/api/og/default', width: 1200, height: 630, alt: 'Craft Football' }],
  },
  twitter: { card: 'summary_large_image', images: ['/api/og/default'] },
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npm test -- lib/__tests__/metadata.shareLinks.test.ts && npx tsc --noEmit`
Expected: PASS and no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/metadata.ts lib/__tests__ "app/[slug]/(tabs)" app/layout.tsx
git commit -m "Unfurl result, quarter and league links and add a default preview"
```

---

### Task 11: Invite page metadata

**Files:**
- Move: `app/invite/page.tsx` → `components/InviteAccept.tsx`
- Create: `app/invite/page.tsx`
- Test: `__tests__/invite-metadata.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { loadInvitePreview } from '@/lib/shareLinksServer'

jest.mock('@/lib/shareLinksServer', () => ({ loadInvitePreview: jest.fn() }))
jest.mock('@/components/InviteAccept', () => ({ InviteAccept: () => null }))

import { generateMetadata } from '@/app/invite/page'

function call(searchParams: Record<string, string | string[] | undefined>) {
  return generateMetadata({ searchParams: Promise.resolve(searchParams) })
}

beforeEach(() => jest.resetAllMocks())

describe('invite page metadata', () => {
  it('adds the invite preview for a live invite', async () => {
    ;(loadInvitePreview as jest.Mock).mockResolvedValue({ leagueName: 'The Boot Room' })
    const meta = await call({ token: 'abc' })
    expect(loadInvitePreview).toHaveBeenCalledWith('abc')
    expect(meta.openGraph?.title).toBe('Join The Boot Room on Craft Football')
    expect(meta.openGraph?.images).toEqual([expect.objectContaining({ url: '/api/og/invite?token=abc' })])
  })

  it('adds nothing for a dead or missing invite', async () => {
    ;(loadInvitePreview as jest.Mock).mockResolvedValue(null)
    expect(await call({ token: 'abc' })).toEqual({})
    expect(await call({})).toEqual({})
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- __tests__/invite-metadata.test.ts`
Expected: FAIL, `generateMetadata` is not exported (or the module is a client component).

- [ ] **Step 3: Move the client flow**

```bash
git mv app/invite/page.tsx components/InviteAccept.tsx
sed -i '' 's/^export default function InvitePage() {/export function InviteAccept() {/' components/InviteAccept.tsx
grep -n "export function InviteAccept" components/InviteAccept.tsx
```

Expected: one match. The file keeps its `'use client'` directive and is otherwise unchanged.

- [ ] **Step 4: Create the server page**

`app/invite/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { InviteAccept } from '@/components/InviteAccept'
import { buildInviteShareMetadata } from '@/lib/shareLinks'
import { loadInvitePreview } from '@/lib/shareLinksServer'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/** A live invite link unfurls with the "You're invited" image; anything else keeps the site default. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { token } = await searchParams
  if (typeof token !== 'string') return {}
  const invite = await loadInvitePreview(token)
  return invite ? buildInviteShareMetadata(invite, token.trim()) : {}
}

export default function InvitePage() {
  return <InviteAccept />
}
```

The tab title stays `League invite` from `app/invite/layout.tsx`.

- [ ] **Step 5: Run the test and typecheck**

Run: `npm test -- __tests__/invite-metadata.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add app/invite components/InviteAccept.tsx __tests__/invite-metadata.test.ts
git commit -m "Unfurl invite links with a preview image"
```

---

### Task 12: Share-link endpoint

**Files:**
- Modify: `lib/features.ts`
- Create: `app/api/league/[id]/share-link/route.ts`
- Test: `lib/__tests__/features.shareLinks.test.ts`, `__tests__/share-link-route.test.ts`

- [ ] **Step 1: Write the failing feature tests**

```ts
import { canSeeQuarterChampion, canSeeResults } from '../features'
import type { FeatureKey, LeagueFeature } from '../types'

function f(feature: FeatureKey, enabled: boolean, publicEnabled: boolean): LeagueFeature {
  return { feature, enabled, public_enabled: publicEnabled, config: null, public_config: null } as LeagueFeature
}

describe('canSeeResults', () => {
  it('follows match history, admins always', () => {
    const features = [f('match_history', true, false)]
    expect(canSeeResults(features, 'admin')).toBe(true)
    expect(canSeeResults(features, 'member')).toBe(true)
    expect(canSeeResults(features, 'public')).toBe(false)
    expect(canSeeResults([], 'member')).toBe(false)
  })
})

describe('canSeeQuarterChampion', () => {
  it('lets members in via Seasons and the public via Results champion cards', () => {
    expect(canSeeQuarterChampion([], 'member')).toBe(true)
    expect(canSeeQuarterChampion([], 'public')).toBe(false)
    expect(canSeeQuarterChampion([f('match_history', true, true)], 'public')).toBe(false)
    expect(canSeeQuarterChampion([f('match_history', true, true), f('quarter_celebration', true, true)], 'public')).toBe(true)
  })
})
```

- [ ] **Step 2: Implement the helpers**

Append to `lib/features.ts`:

```ts
/** Whether a viewer at this tier can see played results (match history). */
export function canSeeResults(features: LeagueFeature[], tier: VisibilityTier): boolean {
  return tier === 'admin' || isFeatureEnabled(features, 'match_history', tier)
}

/**
 * Whether a viewer at this tier can see a completed quarter's champion:
 * members and admins on Seasons, the public on the Results champion cards.
 */
export function canSeeQuarterChampion(features: LeagueFeature[], tier: VisibilityTier): boolean {
  if (tier !== 'public') return true
  return isFeatureEnabled(features, 'match_history', tier) && isFeatureEnabled(features, 'quarter_celebration', tier)
}
```

Run: `npm test -- lib/__tests__/features.shareLinks.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing route test**

`__tests__/share-link-route.test.ts`:

```ts
import { getAuthAndRole, getFeatures, getGame, getWeeks } from '@/lib/fetchers'
import { parseQuarterToken, parseResultToken, verifyQuarterSignature, verifyResultSignature } from '@/lib/shareLinks'
import type { FeatureKey, GameRole, LeagueFeature, Week } from '@/lib/types'

jest.mock('@/lib/fetchers', () => ({ getAuthAndRole: jest.fn(), getFeatures: jest.fn(), getGame: jest.fn(), getWeeks: jest.fn() }))

import { POST } from '@/app/api/league/[id]/share-link/route'

const SECRET = 'test-secret'
const GAME_ID = '9cf13e81-4382-428b-a4ec-c94cb8e2567e'
const WEEK_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const A = ['Marcus Reid', 'Rav Singh']
const B = ['Callum Shaw', 'Sofia Marsh']

function played(id: string, week: number, date: string): Week {
  return { id, season: '2026', week, date, status: 'played', teamA: A, teamB: B, winner: 'teamA', goal_difference: 2 }
}
const WEEKS: Week[] = [
  played('00000000-0000-4000-8000-000000000001', 1, '07 Jul 2026'),
  played('00000000-0000-4000-8000-000000000002', 2, '14 Jul 2026'),
  played('00000000-0000-4000-8000-000000000003', 3, '21 Jul 2026'),
  played('00000000-0000-4000-8000-000000000004', 4, '28 Jul 2026'),
  played(WEEK_ID, 5, '04 Aug 2026'),
]

function feature(key: FeatureKey, enabled: boolean, publicEnabled = false): LeagueFeature {
  return { feature: key, enabled, config: null, public_enabled: publicEnabled, public_config: null } as LeagueFeature
}

function setup({ role = 'member' as GameRole | null, features = [feature('match_history', true)] } = {}) {
  ;(getGame as jest.Mock).mockResolvedValue({ id: GAME_ID, slug: 'the-boot-room', name: 'The Boot Room' })
  ;(getAuthAndRole as jest.Mock).mockResolvedValue({ user: null, userRole: role, isAuthenticated: role !== null })
  ;(getFeatures as jest.Mock).mockResolvedValue(features)
  ;(getWeeks as jest.Mock).mockResolvedValue(WEEKS)
}

function call(body: unknown) {
  return POST(
    new Request(`http://localhost/api/league/${GAME_ID}/share-link`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: GAME_ID }) }
  )
}

function tokenOf(url: string, param: string): string {
  return new URL(url).searchParams.get(param) ?? ''
}

beforeEach(() => {
  jest.resetAllMocks()
  jest.useFakeTimers().setSystemTime(new Date('2026-11-01T12:00:00Z'))
  process.env.SHARE_SIGNING_SECRET = SECRET
})
afterEach(() => jest.useRealTimers())
afterAll(() => {
  delete process.env.SHARE_SIGNING_SECRET
})

describe('POST /api/league/[id]/share-link', () => {
  it('signs a played result the viewer can see', async () => {
    setup()
    const { url } = await (await call({ kind: 'result', weekId: WEEK_ID })).json()
    expect(url).toMatch(/^https:\/\/craft-football\.com\/the-boot-room\?result=/)
    const parsed = parseResultToken(tokenOf(url, 'result'))!
    expect(verifyResultSignature(SECRET, parsed, { winner: 'teamA', goalDifference: 2, teamA: A, teamB: B })).toBe(true)
  })

  it('declines a result when match history is hidden from the viewer', async () => {
    setup({ role: null, features: [feature('match_history', true, false)] })
    expect(await (await call({ kind: 'result', weekId: WEEK_ID })).json()).toEqual({ url: null })
  })

  it('declines a week from another league', async () => {
    setup()
    expect(await (await call({ kind: 'result', weekId: '00000000-0000-4000-8000-0000000000ff' })).json()).toEqual({ url: null })
  })

  it('signs a completed quarter with a champion', async () => {
    setup()
    const { url } = await (await call({ kind: 'quarter', year: 2026, q: 3 })).json()
    expect(url).toMatch(/\/the-boot-room\/honours\?quarter=.+#q-2026-3$/)
    const parsed = parseQuarterToken(tokenOf(url, 'quarter'))!
    expect(verifyQuarterSignature(SECRET, parsed)).toBe(true)
  })

  it('declines a quarter without a champion', async () => {
    setup()
    expect(await (await call({ kind: 'quarter', year: 2026, q: 2 })).json()).toEqual({ url: null })
  })

  it('declines when signing is not configured', async () => {
    delete process.env.SHARE_SIGNING_SECRET
    setup()
    expect(await (await call({ kind: 'result', weekId: WEEK_ID })).json()).toEqual({ url: null })
  })

  it.each([
    [{}],
    [{ kind: 'result', weekId: 'nope' }],
    [{ kind: 'quarter', year: 2026, q: 5 }],
    [{ kind: 'quarter', year: '2026', q: 3 }],
    [{ kind: 'league' }],
  ])('rejects bad input %p with a 400', async (body) => {
    setup()
    expect((await call(body)).status).toBe(400)
  })
})
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test -- __tests__/share-link-route.test.ts`
Expected: FAIL, route module not found.

- [ ] **Step 5: Implement the route**

`app/api/league/[id]/share-link/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getAuthAndRole, getFeatures, getGame, getWeeks } from '@/lib/fetchers'
import { resolveVisibilityTier } from '@/lib/roles'
import { canSeeQuarterChampion, canSeeResults } from '@/lib/features'
import { UUID_RE, getShareSecret } from '@/lib/shareLinks'
import { quarterShareUrls, resultShareUrlFor } from '@/lib/shareLinksServer'
import { getCelebratedQuarters } from '@/lib/sidebar-stats'
import { quarterShareKey, type ShareLinkRequest } from '@/lib/utils'

function noLink() {
  return NextResponse.json({ url: null })
}

function parseRequest(body: unknown): ShareLinkRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.kind === 'result') {
    return typeof b.weekId === 'string' && UUID_RE.test(b.weekId) ? { kind: 'result', weekId: b.weekId } : null
  }
  if (b.kind === 'quarter') {
    const { year, q } = b
    const validYear = typeof year === 'number' && Number.isInteger(year) && year >= 1000 && year <= 9999
    const validQ = typeof q === 'number' && Number.isInteger(q) && q >= 1 && q <= 4
    return validYear && validQ ? { kind: 'quarter', year, q } : null
  }
  return null
}

/**
 * POST — signs a share link for a result or completed quarter the result
 * modal has just saved, so its preview can show it. Returns { url: null }
 * when the viewer can't see it, it isn't shareable yet, or signing isn't
 * configured; the modal then shares the plain link.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const req = parseRequest(await request.json().catch(() => null))
  if (!req) return NextResponse.json({ error: 'Invalid share link request' }, { status: 400 })
  if (!getShareSecret()) return noLink()

  const [game, { userRole }, features] = await Promise.all([getGame(id), getAuthAndRole(id), getFeatures(id)])
  if (!game?.slug) return noLink()
  const tier = resolveVisibilityTier(userRole)

  if (req.kind === 'result') {
    if (!canSeeResults(features, tier)) return noLink()
    // getWeeks is scoped to this league, so a week from elsewhere is never found.
    const week = (await getWeeks(id)).find((w) => w.id === req.weekId)
    return NextResponse.json({ url: resultShareUrlFor(game.slug, week) })
  }

  if (!canSeeQuarterChampion(features, tier)) return noLink()
  const quarter = getCelebratedQuarters(await getWeeks(id)).find((s) => s.year === req.year && s.q === req.q)
  if (!quarter) return noLink()
  return NextResponse.json({ url: quarterShareUrls(game.slug, id, [quarter])[quarterShareKey(quarter)] ?? null })
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test -- __tests__/share-link-route.test.ts lib/__tests__/features.shareLinks.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/features.ts app/api/league/[id]/share-link lib/__tests__/features.shareLinks.test.ts __tests__/share-link-route.test.ts
git commit -m "Add an endpoint that signs result and quarter share links"
```

---

### Task 13: Share signed links from Results

**Files:**
- Modify: `app/[slug]/(tabs)/results/page.tsx`, `components/ResultsSection.tsx`, `components/PublicResultsSection.tsx`, `components/WeekList.tsx`, `components/PublicMatchList.tsx`, `components/MatchCard.tsx`, `components/QuarterCelebration.tsx`
- Test: `__tests__/share-signed-links.test.tsx`

- [ ] **Step 1: Write the failing component tests**

```tsx
/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MatchCard } from '@/components/MatchCard'
import { QuarterCelebration } from '@/components/QuarterCelebration'
import type { QuarterSummary } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'

jest.mock('@/components/ResultModal', () => ({ ResultModal: () => null }))
jest.mock('@/components/EditWeekModal', () => ({ EditWeekModal: () => null }))

const writeText = jest.fn().mockResolvedValue(undefined)
beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
})

const WEEK: Week = {
  id: 'w15', season: '2026', week: 15, date: '01 Apr 2026', status: 'played', format: '5-a-side',
  teamA: ['Jamie Ellis'], teamB: ['Jordan Taylor'], winner: 'teamA', goal_difference: 2,
}

const QUARTER: QuarterSummary = {
  q: 2, year: 2026, quarterLabel: 'Q2 26', seasonName: 'Spring', status: 'completed',
  weekRange: { from: 1, to: 2 }, dateRange: { from: '10 Apr 2026', to: '17 Apr 2026' }, champion: 'Marcus',
  entries: [{ name: 'Marcus', played: 6, won: 5, drew: 1, lost: 0, points: 16, goalDiff: 9 }], awards: [], gamesPlayed: 6,
}

async function clickAndRead(name: string): Promise<string> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }))
  })
  return writeText.mock.calls[0][0] as string
}

describe('signed share links', () => {
  it('MatchCard shares the signed result link when it has one', async () => {
    render(
      <MatchCard week={WEEK} isOpen onToggle={() => {}} leagueName="Test FC" leagueSlug="test-fc"
        weeks={[WEEK]} isMostRecent shareUrl="https://craft-football.com/test-fc?result=tok" />
    )
    expect((await clickAndRead('Share')).split('\n').pop()).toBe('🔗 https://craft-football.com/test-fc?result=tok')
  })

  it('MatchCard falls back to the league link without one', async () => {
    render(<MatchCard week={WEEK} isOpen onToggle={() => {}} leagueName="Test FC" leagueSlug="test-fc" weeks={[WEEK]} isMostRecent />)
    expect((await clickAndRead('Share')).split('\n').pop()).toBe('🔗 https://craft-football.com/test-fc')
  })

  it('QuarterCelebration shares the signed quarter link when it has one', async () => {
    render(
      <QuarterCelebration quarter={QUARTER} leagueName="Test FC" leagueSlug="test-fc" variant="card"
        shareUrl="https://craft-football.com/test-fc/honours?quarter=tok#q-2026-2" />
    )
    expect((await clickAndRead('Share the glory')).split('\n').pop()).toBe(
      '🔗 https://craft-football.com/test-fc/honours?quarter=tok#q-2026-2'
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- __tests__/share-signed-links.test.tsx`
Expected: FAIL, the signed-link cases end with the plain link (and TypeScript complains about the unknown `shareUrl` prop).

- [ ] **Step 3: MatchCard**

In `components/MatchCard.tsx`:
- Add `withShareLink` to the `@/lib/utils` import.
- Add to both `MatchCardProps` and `PlayedCardProps`:

```ts
  /** Signed link for the most recent result; shares the plain league link when absent. */
  shareUrl?: string | null
```

- Destructure `shareUrl` in `PlayedCard` and `MatchCard`, and pass `shareUrl={shareUrl}` from `MatchCard` to `<PlayedCard … />`.
- In `PlayedCard`'s `handleShare`, change the share call to:

```ts
      if (await shareOrCopy(withShareLink(shareText, shareUrl)) === 'copied') {
```

- [ ] **Step 4: QuarterCelebration**

In `components/QuarterCelebration.tsx`:
- Import `withShareLink` from `@/lib/utils`.
- Add to `QuarterCelebrationProps`:

```ts
  /** Signed link to this quarter; shares the plain Seasons link when absent. */
  shareUrl?: string | null
```

- Destructure `shareUrl` and change `handleShare` to build `const text = withShareLink(buildQuarterShareText({ leagueName, leagueSlug, quarter }), shareUrl)`.

- [ ] **Step 5: Thread the URLs through the lists**

`components/WeekList.tsx`:
- Add `quarterShareKey` to the `@/lib/utils` import.
- Add to `Props`: `resultShareUrl?: string | null   // signed link for the most recent result`, destructure it (default `null`).
- In the map, compute `const isMostRecent = week.season === mostRecent?.season && week.week === mostRecent?.week` and use it for the `isMostRecent` prop; add `shareUrl={isMostRecent ? resultShareUrl : null}` to `<MatchCard>`.
- Add `shareUrl={celebration.shareUrls?.[quarterShareKey(celebratedQuarter)]}` to `<QuarterCelebration>`.

`components/PublicMatchList.tsx`:
- Add `quarterShareKey` to the `@/lib/utils` import; add `resultShareUrl?: string | null` to `PublicMatchListProps` and destructure it.
- Extract the existing `isMostRecent` expression into a `const isMostRecent = …` inside the map, pass it as before, and add `shareUrl={isMostRecent ? resultShareUrl : null}` to `<MatchCard>`.
- Add `shareUrl={celebration.shareUrls?.[quarterShareKey(celebratedQuarter)]}` to `<QuarterCelebration>`.

`components/ResultsSection.tsx`: add `resultShareUrl?: string | null` to `Props`, destructure it (default `null`) and pass `resultShareUrl={resultShareUrl}` to `<WeekList>`.

`components/PublicResultsSection.tsx`: add `resultShareUrl: string | null` to `Props`, destructure it and pass it to `<PublicMatchList>`.

- [ ] **Step 6: Sign on the Results page**

In `app/[slug]/(tabs)/results/page.tsx`:
- Add `getLatestResultWeek` to the `@/lib/utils` import and `import { quarterShareUrls, resultShareUrlFor } from '@/lib/shareLinksServer'`.
- After the `celebratedQuarters` line, replace the `celebration` construction with:

```ts
  const celebration: ResultsCelebration | null =
    celebratedQuarters.length > 0 && canSeeCelebration
      ? {
          quarters: celebratedQuarters,
          leagueName: game.name,
          leagueSlug: slug,
          shareUrls: quarterShareUrls(slug, leagueId, celebratedQuarters),
        }
      : null

  // Signed link for the Share button on the latest result. The lists only
  // show results to viewers who can see match history.
  const resultShareUrl = canSeeMatchHistory ? resultShareUrlFor(slug, getLatestResultWeek(weeks)) : null
```

- Pass `resultShareUrl={resultShareUrl}` to `<PublicResultsSection>` and to `<ResultsSection>`.

- [ ] **Step 7: Run the tests and typecheck**

Run: `npm test -- __tests__/share-signed-links.test.tsx __tests__/match-card-tug-of-war.test.tsx __tests__/quarter-celebration.test.tsx components/__tests__/quarterCelebrationPlacement.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add "app/[slug]/(tabs)/results/page.tsx" components/ResultsSection.tsx components/PublicResultsSection.tsx components/WeekList.tsx components/PublicMatchList.tsx components/MatchCard.tsx components/QuarterCelebration.tsx __tests__/share-signed-links.test.tsx
git commit -m "Share signed result and quarter links from Results"
```

---

### Task 14: Share signed links from Seasons

**Files:**
- Modify: `app/[slug]/(tabs)/honours/page.tsx`, `components/HonoursSection.tsx`
- Test: `components/__tests__/HonoursSection.shareLink.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { HonoursSection } from '@/components/HonoursSection'
import type { HonoursYear } from '@/lib/sidebar-stats'

const writeText = jest.fn().mockResolvedValue(undefined)
beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true })
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
})

const DATA: HonoursYear[] = [{
  year: 2026,
  completedCount: 1,
  quarters: [{
    q: 2, year: 2026, quarterLabel: 'Q2 26', seasonName: 'Spring', status: 'completed',
    weekRange: { from: 1, to: 6 }, dateRange: { from: '07 Apr 2026', to: '12 May 2026' }, champion: 'Marcus',
    entries: [{ name: 'Marcus', played: 6, won: 5, drew: 1, lost: 0, points: 16, goalDiff: 9 }],
    awards: [], gamesPlayed: 6,
  }],
}]

it('shares the signed quarter link from a completed quarter', async () => {
  render(
    <HonoursSection data={DATA} leagueName="Test FC" leagueSlug="test-fc"
      shareUrls={{ '2026-2': 'https://craft-football.com/test-fc/honours?quarter=tok#q-2026-2' }} />
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Share the glory' }))
  })
  expect((writeText.mock.calls[0][0] as string).split('\n').pop()).toBe(
    '🔗 https://craft-football.com/test-fc/honours?quarter=tok#q-2026-2'
  )
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/__tests__/HonoursSection.shareLink.test.tsx`
Expected: FAIL (plain link, unknown prop).

- [ ] **Step 3: Thread `shareUrls` through `HonoursSection`**

In `components/HonoursSection.tsx`:
- Add `withShareLink` to the `@/lib/utils` import.
- Add to `HonoursSectionProps`:

```ts
  /** Signed share links for completed quarters, keyed '2026-3'. */
  shareUrls?: Record<string, string>
```

- `HonoursSection`: destructure `shareUrls = {}` and pass `shareUrl={shareUrls[key]}` to `<QuarterCard>`.
- `QuarterCard`: add `shareUrl?: string` to its props type and destructuring; pass `shareUrl={shareUrl}` to `<CompletedCardBody>`.
- `CompletedCardBody`: add `shareUrl?: string` to its props; in `handleShare` use `withShareLink(buildQuarterShareText({ leagueName, leagueSlug, quarter }), shareUrl)`.

- [ ] **Step 4: Sign on the Seasons page**

In `app/[slug]/(tabs)/honours/page.tsx`:
- Import `getCelebratedQuarters` alongside the other `@/lib/sidebar-stats` imports and `import { quarterShareUrls } from '@/lib/shareLinksServer'`.
- Pass to `<HonoursSection>`:

```tsx
          shareUrls={quarterShareUrls(slug, leagueId, getCelebratedQuarters(weeks, now))}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npm test -- components/__tests__/HonoursSection.shareLink.test.tsx components/__tests__/HonoursSection.liveTable.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add "app/[slug]/(tabs)/honours/page.tsx" components/HonoursSection.tsx components/__tests__/HonoursSection.shareLink.test.tsx
git commit -m "Share signed quarter links from Seasons"
```

---

### Task 15: Signed league link in the header

**Files:**
- Modify: `app/[slug]/(tabs)/layout.tsx`, `components/LeaguePageHeader.tsx`, `components/LeagueJoinArea.tsx`
- Test: `components/__tests__/LeagueJoinArea.share.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { LeagueJoinArea } from '@/components/LeagueJoinArea'

jest.mock('next/navigation', () => ({
  usePathname: () => '/test-fc/results',
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
jest.mock('@/components/JoinRequestDialog', () => ({ JoinRequestDialog: () => null }))
jest.mock('@/components/AuthDialog', () => ({ AuthDialog: () => null }))

const writeText = jest.fn().mockResolvedValue(undefined)
beforeEach(() => {
  writeText.mockClear()
  Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
})

const PROPS = { leagueId: 'g', leagueSlug: 'test-fc', leagueName: 'Test FC', joinStatus: 'member' as const, isAdmin: false }

it('copies the page with the signed league token', () => {
  render(<LeagueJoinArea {...PROPS} shareToken="tok.sig" />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(writeText).toHaveBeenCalledWith(leagueHref('tok.sig'))
})

it('copies the plain page without a token', () => {
  render(<LeagueJoinArea {...PROPS} />)
  fireEvent.click(screen.getByRole('button', { name: 'Share' }))
  expect(writeText).toHaveBeenCalledWith(window.location.href)
})

function leagueHref(token: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set('league', token)
  return url.toString()
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- components/__tests__/LeagueJoinArea.share.test.tsx`
Expected: FAIL on the first test.

- [ ] **Step 3: Implement**

`components/LeagueJoinArea.tsx`:
- `import { leagueShareHref } from '@/lib/utils'`.
- Add to `LeagueJoinAreaProps`:

```ts
  /** Signed league token for members, so the copied link unfurls with the league card. */
  shareToken?: string | null
```

- Destructure `shareToken = null` and change `handleShareClick` to:

```ts
  function handleShareClick() {
    const href = shareToken ? leagueShareHref(window.location.href, shareToken) : window.location.href
    navigator.clipboard.writeText(href).catch(() => {})
    setShowToast(true)
  }
```

`components/LeaguePageHeader.tsx`: add `shareToken?: string | null` to the props interface, destructure it (default `null`) and pass `shareToken={shareToken}` to `<LeagueJoinArea>`.

`app/[slug]/(tabs)/layout.tsx`: `import { leagueShareTokenFor } from '@/lib/shareLinksServer'`. In `LeagueHeader`, before `return`, add:

```ts
  // Only members and admins see Share, so only they get a signed token.
  const shareToken = tier === 'public' ? null : leagueShareTokenFor(leagueId)
```

and pass `shareToken={shareToken}` to `<LeaguePageHeader>`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npm test -- components/__tests__/LeagueJoinArea.share.test.tsx && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add "app/[slug]/(tabs)/layout.tsx" components/LeaguePageHeader.tsx components/LeagueJoinArea.tsx components/__tests__/LeagueJoinArea.share.test.tsx
git commit -m "Copy a signed league link from the header Share button"
```

---

### Task 16: Signed links from the result modal

**Files:**
- Modify: `components/ResultModal.tsx`

No component test: driving the modal through save needs Supabase RPC mocks for every step. The behaviour rests on `fetchShareLink` and `withShareLink` (tested in Task 3) and is covered by the manual check in Task 17.

- [ ] **Step 1: Fetch the links after a successful save**

In `components/ResultModal.tsx`:
- Extend the utils import: `import { cn, buildResultShareText, buildDnfShareText, buildResultHeadline, fetchShareLink, resolveTeamRatingForResult, withShareLink } from '@/lib/utils'`.
- Add state beside `shareCopied`:

```ts
  // Signed links fetched in the background once the result is saved. Safari
  // drops navigator.share if it awaits a request after the tap, so they must
  // be ready before Share is pressed; until then the plain link is shared.
  const [resultShareUrl, setResultShareUrl] = useState<string | null>(null)
  const [quarterShareUrl, setQuarterShareUrl] = useState<string | null>(null)
```

- In `routeAfterSave`, inside the `if (clinched)` branch before `setCelebrateQuarter`, add:

```ts
      void fetchShareLink(gameId, { kind: 'quarter', year: clinched.year, q: clinched.q }).then(setQuarterShareUrl)
```

- In `handleSave`'s normal (non-DNF) path, directly before `setShareData({ dnf: false, … })`, add:

```ts
      void fetchShareLink(gameId, { kind: 'result', weekId: scheduledWeek.id }).then(setResultShareUrl)
```

- [ ] **Step 2: Use them**

- In `handleShareClick`, change `const text = shareData.shareText` to:

```ts
    const text = shareData.dnf ? shareData.shareText : withShareLink(shareData.shareText, resultShareUrl)
```

- On the celebrate step's `<QuarterCelebration … variant="modal" />`, add `shareUrl={quarterShareUrl}`.

- [ ] **Step 3: Typecheck and run related tests**

Run: `npx tsc --noEmit && npm test -- __tests__/upcoming-card-face-off.test.tsx __tests__/next-match-card-share.test.tsx`
Expected: no type errors; PASS.

- [ ] **Step 4: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "Share signed result and quarter links straight after saving a result"
```

---

### Task 17: Docs, full verification and a visual check

**Files:**
- Modify: `docs/superpowers/specs/2026-10-06-share-preview-images-design.md`, `CLAUDE.md`

- [ ] **Step 1: Bring the spec in line with the build**

In the spec:
- §2 "Text builders": replace the paragraph with: "Share text builders are unchanged. A `withShareLink(text, url)` helper in `lib/utils.ts` swaps the final `🔗` line for the signed URL at tap time, falling back to the text as built."
- §5 Quarter meta line: replace the date wording with "`{from} – {to} · {n} games` with the year dropped from each date, matching the share text (e.g. `07 Jul – 29 Sep · 12 games`)."
- §5 Result names: replace "wrapping to at most three lines then ellipsised" with "wrapping to at most three lines, then cut off".
- Status: change `Draft, awaiting review` to `Approved`.

In `CLAUDE.md`, change the `SHARE_SIGNING_SECRET` row's purpose to: "HMAC key for signed share links (line-ups, results, quarters, league) and their preview images (see `docs/superpowers/specs/2026-10-05-lineup-share-preview-image-design.md` and `2026-10-06-share-preview-images-design.md`). Missing → Share falls back to plain links and previews render the generic card. Rotating it invalidates every previously shared preview."

- [ ] **Step 2: Run everything**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all tests pass, no type or lint errors, build succeeds and lists `/api/og/result`, `/api/og/quarter`, `/api/og/league`, `/api/og/invite`, `/api/og/default` and `/api/league/[id]/share-link`.

- [ ] **Step 3: Look at every image**

`.env.local` has no `SHARE_SIGNING_SECRET`. Add a local-only value (never commit it):

```bash
grep -q SHARE_SIGNING_SECRET .env.local || echo "SHARE_SIGNING_SECRET=$(openssl rand -hex 32)" >> .env.local
```

Start `npm run dev`. Local dev reads production Supabase, so only make GET requests and stay signed out. Get signed URLs from the signed-out public pages of the real league (`craft-football`), whose match history and quarter celebration are public:

```bash
curl -s http://localhost:3000/craft-football/results | grep -oE 'craft-football\.com/craft-football(/honours)?\?(result|quarter)=[A-Za-z0-9._-]+' | sort -u
```

For each token found, save its image and the generic and default cards to `.context/`:

```bash
curl -s "http://localhost:3000/api/og/result?t=<result token>" -o .context/og-result.png
curl -s "http://localhost:3000/api/og/quarter?t=<quarter token>" -o .context/og-quarter.png
curl -s "http://localhost:3000/api/og/default" -o .context/og-default.png
curl -s "http://localhost:3000/api/og/result?t=bad" -o .context/og-generic.png
```

A league token is only rendered for members, so for the league image sign one in the dev server's own process: temporarily log `leagueShareTokenFor(leagueId)` from the tabs layout, load any tab once, copy the token from the dev server output, remove the log, then fetch `/api/og/league?t=<token>` into `.context/og-league.png`. For the invite image, check `/api/og/invite?token=bad` renders the generic card (don't create invites against production).

Open each PNG and check against the spec §5: no clipped headline, names inside their columns, icons drawn (not blank squares), glow and dot field visible but subtle, wordmark centred at the bottom. Fix and re-run any that fail.

Also check the page tags: `curl -s "http://localhost:3000/craft-football?result=<token>" -L | grep -E 'og:(title|description|image)'` shows the result title and `/api/og/result` image; `curl -s http://localhost:3000/ | grep og:image` shows `/api/og/default`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-06-share-preview-images-design.md CLAUDE.md
git commit -m "Document the share preview images"
```

- [ ] **Step 5: Before merging (manual, by the user)**

`SHARE_SIGNING_SECRET` is already set in Vercel for line-ups, so there is nothing new to configure. After deploying, share one result, quarter, league and invite link into WhatsApp (iOS and web), iMessage, Slack and Discord, and confirm the large preview appears and the text arrives intact. Edit a result and re-share: Slack shows the new result, and the old link shows the generic card within an hour.
