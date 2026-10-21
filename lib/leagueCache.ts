// lib/leagueCache.ts
// Cross-request cache tags for a league's public reads (game row, weeks,
// player stats). Every route that writes to games, weeks or player_attributes
// calls revalidateLeague so the next render re-reads. Routes must call it on
// every path after a write has happened, including error returns that follow
// a successful record_result.
import { revalidateTag } from 'next/cache'

/** How long a cached league read may serve without a write, in seconds. */
export const LEAGUE_CACHE_SECONDS = 60

export const leagueTag = (leagueId: string) => `league:${leagueId}`
export const leagueSlugTag = (slug: string) => `league-slug:${slug}`

/**
 * Invalidates a league's cached reads. Pass every slug the league has had in
 * this request (old and new) when a write may have changed it; the slug
 * lookup is cached under its own tag.
 */
export function revalidateLeague(leagueId: string, slugs: string[] = []): void {
  revalidateTag(leagueTag(leagueId), 'max')
  for (const slug of slugs) revalidateTag(leagueSlugTag(slug), 'max')
}
