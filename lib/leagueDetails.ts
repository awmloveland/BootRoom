// lib/leagueDetails.ts
// The limits on a league's own text, shared by the routes that write it
// (POST /api/games, PATCH /api/league/[id]/details) and the forms that send it.
// The games table enforces the same limits (migration 20261116000001).

export const LEAGUE_NAME_MAX = 80
export const LEAGUE_LOCATION_MAX = 120
export const LEAGUE_BIO_MAX = 500

export const LEAGUE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
/** 'HH:MM' on the 24-hour clock, as games.kickoff_time stores it. */
export const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

export interface LeagueText {
  name: string
  location: string | null
  bio: string | null
}

/** Name, venue and bio from a request body, trimmed, or the message for a 400. */
export function parseLeagueText(body: Record<string, unknown> | null): LeagueText | { error: string } {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const name = text(body?.name)
  const location = text(body?.location)
  const bio = text(body?.bio)
  if (!name) return { error: 'Name is required' }
  if (name.length > LEAGUE_NAME_MAX) return { error: `Name must be ${LEAGUE_NAME_MAX} characters or fewer` }
  if (location.length > LEAGUE_LOCATION_MAX) return { error: `Venue must be ${LEAGUE_LOCATION_MAX} characters or fewer` }
  if (bio.length > LEAGUE_BIO_MAX) return { error: `Bio must be ${LEAGUE_BIO_MAX} characters or fewer` }
  return { name, location: location || null, bio: bio || null }
}
