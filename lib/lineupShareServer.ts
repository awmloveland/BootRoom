import { createServiceClient } from '@/lib/supabase/service'
import { getShareSecret, parseLineupToken, verifyLineupSignature } from '@/lib/lineupShare'
import type { SharedLineup } from '@/lib/types'

/**
 * Resolves a share token to the lineup it was signed for. Null when the token
 * is malformed, signing is not configured, the week is gone, or the lineups
 * have changed since the link was made. Never throws.
 *
 * Uses the service client: the token itself is the authorisation.
 */
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
