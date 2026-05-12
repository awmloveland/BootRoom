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
