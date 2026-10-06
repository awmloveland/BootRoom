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
