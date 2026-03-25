import type { Mentality, PlayerAttribute } from '@/lib/types'

const VALID_MENTALITIES: Mentality[] = ['goalkeeper', 'defensive', 'balanced', 'attacking']

export type PlayerPatch = Partial<Pick<PlayerAttribute, 'rating' | 'mentality'>>

/**
 * Validates and parses a PATCH request body.
 * Returns a typed patch object, or null if the body is invalid.
 */
export function parsePlayerPatch(body: unknown): PlayerPatch | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null

  const b = body as Record<string, unknown>
  const patch: PlayerPatch = {}

  if ('rating' in b) {
    const r = b.rating
    if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 3) return null
    patch.rating = r
  }

  if ('mentality' in b) {
    const m = b.mentality
    if (typeof m !== 'string' || !VALID_MENTALITIES.includes(m as Mentality)) return null
    patch.mentality = m as Mentality
  }

  if (Object.keys(patch).length === 0) return null
  return patch
}
