// Signed lineup share links. Server-only: uses Node's crypto.
//
// Token: <week id as base64url (22 chars)>.<signature (16 chars)>
// The signature covers the week and both team lists, so editing the lineups
// produces a new link and an old link stops verifying.
import { createHmac, timingSafeEqual } from 'crypto'
import type { Metadata } from 'next'
import { formatFixtureDate } from '@/lib/utils'
import type { SharedLineup } from '@/lib/types'

const SIG_BYTES = 12
const ENCODED_ID_RE = /^[A-Za-z0-9_-]{22}$/
const ENCODED_SIG_RE = /^[A-Za-z0-9_-]{16}$/
const UUID_HEX_RE = /^[0-9a-f]{32}$/
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface LineupTeams {
  teamA: string[]
  teamB: string[]
}

export interface ParsedLineupToken {
  weekId: string
  signature: Buffer
}

/** The signing key, or null when signing is not configured. */
export function getShareSecret(): string | null {
  return process.env.SHARE_SIGNING_SECRET || null
}

function encodeWeekId(weekId: string): string {
  return Buffer.from(weekId.replace(/-/g, '').toLowerCase(), 'hex').toString('base64url')
}

function decodeWeekId(encoded: string): string | null {
  if (!ENCODED_ID_RE.test(encoded)) return null
  const hex = Buffer.from(encoded, 'base64url').toString('hex')
  if (!UUID_HEX_RE.test(hex)) return null
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  // The last char has spare bits, so only the canonical encoding is accepted.
  return encodeWeekId(uuid) === encoded ? uuid : null
}

function sign(secret: string, weekId: string, { teamA, teamB }: LineupTeams): Buffer {
  return createHmac('sha256', secret)
    .update(JSON.stringify(['lineup:v1', weekId.toLowerCase(), teamA, teamB]))
    .digest()
    .subarray(0, SIG_BYTES)
}

export function signLineupToken(secret: string, weekId: string, teams: LineupTeams): string {
  if (!UUID_RE.test(weekId)) throw new Error('signLineupToken: weekId must be a UUID')
  return `${encodeWeekId(weekId)}.${sign(secret, weekId, teams).toString('base64url')}`
}

/** Splits a token into its week id and signature. Null when malformed. */
export function parseLineupToken(token: unknown): ParsedLineupToken | null {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 2 || !ENCODED_SIG_RE.test(parts[1])) return null
  const weekId = decodeWeekId(parts[0])
  if (!weekId) return null
  return { weekId, signature: Buffer.from(parts[1], 'base64url') }
}

export function verifyLineupSignature(secret: string, parsed: ParsedLineupToken, teams: LineupTeams): boolean {
  const expected = sign(secret, parsed.weekId, teams)
  return parsed.signature.length === expected.length && timingSafeEqual(parsed.signature, expected)
}

export function lineupShareUrl(slug: string, token: string): string {
  return `https://craft-football.com/${slug}?lineup=${token}`
}

/** Open Graph and Twitter tags that make a shared lineup link unfurl. */
export function buildLineupShareMetadata(lineup: SharedLineup, token: string): Metadata {
  const title = `Week ${lineup.week} lineups · ${lineup.leagueName}`
  const description = [formatFixtureDate(lineup.date), lineup.kickoffTime, lineup.location]
    .filter(Boolean)
    .join(' · ')
  const image = { url: `/api/og/lineup?t=${token}`, width: 1200, height: 630, alt: title }
  return {
    openGraph: { title, description, url: lineupShareUrl(lineup.slug, token), images: [image], siteName: 'Craft Football', type: 'website' },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}
