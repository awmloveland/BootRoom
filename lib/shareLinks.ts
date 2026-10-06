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
import type { SharedInvite, SharedLeague, SharedLineup, SharedQuarter, SharedResult, Week, Winner } from '@/lib/types'

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
  winner: NonNullable<Winner>
  goalDifference: number
}

/**
 * The result fields a token signs, from a week or a database row. Null when
 * there is no winner. A missing margin counts as 0, so signing and loading
 * agree for results saved without one.
 */
export function resultFieldsOf(
  week: Pick<Week, 'winner' | 'goal_difference' | 'teamA' | 'teamB'>
): ResultFields | null {
  if (!week.winner) return null
  return { winner: week.winner, goalDifference: week.goal_difference ?? 0, teamA: week.teamA, teamB: week.teamB }
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
  return shareMetadata(`Week ${lineup.week} lineups · ${lineup.leagueName}`, description, `/api/og/lineup?t=${encodeURIComponent(token)}`)
}

export function buildResultShareMetadata(result: SharedResult, token: string): Metadata {
  const team = result.winner === 'teamA' ? 'Team A' : 'Team B'
  const outcome = result.winner === 'draw'
    ? 'Draw'
    : result.goalDifference > 0 ? `${team} won by ${result.goalDifference}` : `${team} won`
  return shareMetadata(
    `Week ${result.week} result · ${result.leagueName}`,
    `${outcome} · ${formatFixtureDate(result.date)}`,
    `/api/og/result?t=${encodeURIComponent(token)}`
  )
}

export function buildQuarterShareMetadata(quarter: SharedQuarter, token: string): Metadata {
  const champion = quarter.podium[0]
  return shareMetadata(
    `Q${quarter.q} ${quarter.year} champion · ${quarter.leagueName}`,
    `${champion.name} wins the ${quarter.seasonName} quarter with ${champion.points} pts`,
    `/api/og/quarter?t=${encodeURIComponent(token)}`
  )
}

export function buildLeagueShareMetadata(league: SharedLeague, token: string): Metadata {
  const next = league.nextGame
  const description = next
    ? `Next game ${[formatFixtureDate(next.date), next.kickoffTime, next.location].filter(Boolean).join(' · ')}`
    : gamesPlayedLabel(league.gamesPlayed)
  return shareMetadata(league.leagueName, description, `/api/og/league?t=${encodeURIComponent(token)}`)
}

export function buildInviteShareMetadata(invite: SharedInvite, token: string): Metadata {
  return shareMetadata(
    `Join ${invite.leagueName} on Craft Football`,
    SITE_TAGLINE,
    `/api/og/invite?token=${encodeURIComponent(token)}`
  )
}
