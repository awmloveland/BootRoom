import type { Mentality, PlayerAttribute, Strength } from '@/lib/types'
import { ratingToStrength } from '@/lib/strength'

const VALID_MENTALITIES: Mentality[] = ['goalkeeper', 'defensive', 'balanced', 'attacking']
const VALID_STRENGTHS: Strength[] = ['below', 'average', 'above']

export type PlayerPatch = Partial<Pick<PlayerAttribute, 'strength' | 'mentality'>>

/**
 * Validates and parses a PATCH request body.
 * Returns a typed patch object, or null if the body is invalid.
 */
export function parsePlayerPatch(body: unknown): PlayerPatch | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null

  const b = body as Record<string, unknown>
  const patch: PlayerPatch = {}

  // New canonical key: strength
  if ('strength' in b) {
    const s = b.strength
    if (typeof s !== 'string' || !VALID_STRENGTHS.includes(s as Strength)) return null
    patch.strength = s as Strength
  }

  // Deprecated fallback: rating (1-3 int). Removed in a follow-up PR.
  else if ('rating' in b) {
    const r = b.rating
    if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 3) return null
    patch.strength = ratingToStrength(r)
  }

  if ('mentality' in b) {
    const m = b.mentality
    if (typeof m !== 'string' || !VALID_MENTALITIES.includes(m as Mentality)) return null
    patch.mentality = m as Mentality
  }

  if (Object.keys(patch).length === 0) return null
  return patch
}

/**
 * Validates and trims a player rename input.
 * Returns the trimmed name, or null if the value is not a non-empty string.
 */
export function parseRenameName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export interface AddPlayerInput {
  name: string
  strength: Strength
  mentality: Mentality
}

/**
 * Validates and parses a POST /api/league/[id]/players body.
 * Returns a typed input object, or null if the body is invalid.
 * Trims the name; rejects empty/whitespace-only.
 */
export function parseAddPlayerBody(body: unknown): AddPlayerInput | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string') return null
  const name = b.name.trim()
  if (name.length === 0) return null

  if (typeof b.strength !== 'string' || !VALID_STRENGTHS.includes(b.strength as Strength)) return null
  if (typeof b.mentality !== 'string' || !VALID_MENTALITIES.includes(b.mentality as Mentality)) return null

  return {
    name,
    strength: b.strength as Strength,
    mentality: b.mentality as Mentality,
  }
}

export interface ApproveInput {
  player_name: string
  create_player: boolean
}

/**
 * Validates a POST …/approve body for a join request or player claim.
 * Returns null if the name is missing or blank, or create_player isn't a boolean.
 */
export function parseApproveBody(body: unknown): ApproveInput | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  if (typeof b.player_name !== 'string') return null
  const player_name = b.player_name.trim()
  if (!player_name) return null
  if (b.create_player !== undefined && typeof b.create_player !== 'boolean') return null
  return { player_name, create_player: b.create_player === true }
}

/** Maps an approve RPC error message to an HTTP status and user-facing copy. */
export function approveErrorResponse(message: string, playerName: string): { status: number; error: string } {
  if (message.includes('Not authenticated')) return { status: 401, error: 'Unauthorized' }
  if (message.includes('Access denied')) return { status: 403, error: 'Forbidden' }
  if (message.includes('not found')) return { status: 404, error: 'Not found' }
  if (message.includes('_not_pending')) return { status: 409, error: 'This has already been reviewed.' }
  if (message.includes('player_exists')) return { status: 409, error: `There's already a ${playerName} in the squad.` }
  if (message.includes('player_already_linked')) return { status: 409, error: `${playerName} is already linked to another member.` }
  if (message.includes('player_claim_pending')) return { status: 409, error: `Someone else has a pending claim for ${playerName}.` }
  if (message.includes('player_not_found')) return { status: 400, error: `${playerName} isn't in the squad.` }
  if (message.includes('player_name_required')) return { status: 400, error: 'Enter a player name.' }
  return { status: 500, error: 'Internal server error' }
}

/**
 * Names pasted into the league setup roster: one per line, or separated by
 * commas, `&`, `/` or the word "and". Trimmed, blanks dropped, duplicates
 * removed case-insensitively keeping the first spelling.
 */
export function splitPastedNames(text: string): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const part of text.split(/\r?\n|,|&|\/|\band\b/i)) {
    const name = part.trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}
