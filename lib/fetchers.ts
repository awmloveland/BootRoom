// lib/fetchers.ts
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sortWeeks } from '@/lib/utils'
import { DEFAULT_FEATURES } from '@/lib/defaults'
import type { GameRole, LeagueFeature, FeatureKey, Player, Week, Mentality, JoinRequestStatus, PendingJoinRequest, PlayerClaimStatus } from '@/lib/types'

// ── Game ─────────────────────────────────────────────────────────────────────

export const getGame = cache(async (leagueId: string) => {
  const service = createServiceClient()
  const { data } = await service
    .from('games')
    .select('id, name, slug, location, day, kickoff_time, bio')
    .eq('id', leagueId)
    .maybeSingle()
  return data
})

export const getGameBySlug = cache(async (slug: string) => {
  const service = createServiceClient()
  const { data } = await service
    .from('games')
    .select('id, name, slug, location, day, kickoff_time, bio')
    .eq('slug', slug)
    .maybeSingle()
  return data
})

// ── Auth + role ───────────────────────────────────────────────────────────────

export const getAuthAndRole = cache(async (leagueId: string) => {
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return { user: null, userRole: null as GameRole | null, isAuthenticated: false }
    // Sequential by necessity: user.id is required to look up the league role.
    const service = createServiceClient()
    const { data: memberRow } = await service
      .from('game_members')
      .select('role')
      .eq('game_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    return {
      user,
      userRole: (memberRow?.role ?? null) as GameRole | null,
      isAuthenticated: true,
    }
  } catch {
    return { user: null, userRole: null as GameRole | null, isAuthenticated: false }
  }
})

// ── Features ──────────────────────────────────────────────────────────────────

export const getFeatures = cache(async (leagueId: string): Promise<LeagueFeature[]> => {
  const service = createServiceClient()
  const [experimentsResult, leagueFeaturesResult] = await Promise.all([
    service.from('feature_experiments').select('feature, available'),
    service.from('league_features').select('*').eq('game_id', leagueId),
  ])
  const availableSet = experimentsResult.error
    ? new Set(DEFAULT_FEATURES.map((f) => f.feature as FeatureKey))
    : new Set(
        (experimentsResult.data ?? [])
          .filter((e) => e.available)
          .map((e) => e.feature as FeatureKey)
      )
  const featureMap = Object.fromEntries((leagueFeaturesResult.data ?? []).map((f) => [f.feature, f]))
  return DEFAULT_FEATURES
    .filter((def) => availableSet.has(def.feature))
    .map((def) => {
      const row = featureMap[def.feature] ?? def
      return { ...row, available: true } as LeagueFeature
    })
})

// ── Player stats ──────────────────────────────────────────────────────────────

export const getPlayerStats = cache(async (leagueId: string): Promise<Player[]> => {
  const service = createServiceClient()
  const { data } = await service.rpc('get_player_stats_public', { p_game_id: leagueId })
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    // Roster players are identified by name since the public RPC doesn't expose
    // a DB id. Two identical-name players on the roster would collide here;
    // preferred fix is to switch to `roster|<row.id>` once the RPC returns it.
    playerId: `roster|${String(row.name)}`,
    name: String(row.name),
    played: Number(row.played),
    won: Number(row.won),
    drew: Number(row.drew),
    lost: Number(row.lost),
    timesTeamA: Number(row.timesTeamA ?? 0),
    timesTeamB: Number(row.timesTeamB ?? 0),
    winRate: Number(row.winRate),
    qualified: Boolean(row.qualified),
    points: Number(row.points ?? 0),
    // DB keeps a legacy `goalkeeper` boolean column alongside `mentality`.
    // On read, collapse to the single source of truth: mentality.
    mentality: (row.goalkeeper
      ? 'goalkeeper'
      : String(row.mentality ?? 'balanced')) as Player['mentality'],
    rating: Number(row.rating ?? 0),
    recentForm: String(row.recentForm ?? ''),
  }))
})

// ── Weeks ─────────────────────────────────────────────────────────────────────

type WeekRow = {
  id: string
  season: string
  week: number
  date: string
  status: string
  format: string | null
  team_a: string[] | null
  team_b: string[] | null
  winner: string | null
  notes: string | null
  goal_difference: number | null
  team_a_rating: number | null
  team_b_rating: number | null
  lineup_metadata: Record<string, unknown> | null
}

function mapWeekRow(row: WeekRow): Week {
  return {
    id: row.id,
    season: row.season,
    week: row.week,
    date: row.date,
    status: row.status as Week['status'],
    format: row.format ?? undefined,
    teamA: row.team_a ?? [],
    teamB: row.team_b ?? [],
    winner: (row.winner as Week['winner']) ?? null,
    notes: row.notes ?? undefined,
    goal_difference: row.goal_difference ?? null,
    team_a_rating: row.team_a_rating ?? null,
    team_b_rating: row.team_b_rating ?? null,
    lineupMetadata: row.lineup_metadata
      ? {
          guests: ((row.lineup_metadata.guests as any[]) ?? []).map((g: any) => ({
            type: 'guest' as const,
            name: g.name,
            associatedPlayer: g.associated_player,
            rating: g.rating,
            goalkeeper: g.goalkeeper ?? false,
            strengthHint: g.strength_hint ?? 'average',
          })),
          new_players: ((row.lineup_metadata.new_players as any[]) ?? []).map((p: any) => ({
            type: 'new_player' as const,
            name: p.name,
            rating: p.rating,
            // Legacy metadata may have only `goalkeeper` set; derive mentality from it.
            mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
            strengthHint: p.strength_hint ?? 'average',
          })),
        }
      : null,
  }
}

// ── Join request status ───────────────────────────────────────────────────────

// Not wrapped in cache() — depends on userId which is derived from auth,
// not just leagueId.
export async function getJoinRequestStatus(
  leagueId: string,
  userId: string
): Promise<JoinRequestStatus> {
  const service = createServiceClient()
  const { data } = await service
    .from('game_join_requests')
    .select('status')
    .eq('game_id', leagueId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!data) return 'none'
  return data.status as JoinRequestStatus
}

// ── Pending join requests ─────────────────────────────────────────────────────

// Fetches all pending join requests for a league. Returns [] if the caller
// is not an admin (the RPC raises 'Access denied' which the catch swallows).
export const getPendingJoinRequests = cache(async (leagueId: string): Promise<PendingJoinRequest[]> => {
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return []

    const { data, error } = await authSupabase.rpc('get_join_requests', {
      p_game_id: leagueId,
    })

    if (error) return []
    return (data ?? []) as PendingJoinRequest[]
  } catch {
    return []
  }
})

export const getPendingJoinCount = cache(async (leagueId: string): Promise<number> => {
  const requests = await getPendingJoinRequests(leagueId)
  return requests.length
})

// Returns count of pending player claims. Returns 0 for non-admins (RPC denies access).
export const getPendingClaimCount = cache(async (leagueId: string): Promise<number> => {
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return 0
    const { data, error } = await authSupabase.rpc('get_player_claims', { p_game_id: leagueId })
    if (error) return 0
    const claims = (data ?? []) as { status: string }[]
    return claims.filter((c) => c.status === 'pending').length
  } catch {
    return 0
  }
})

// Combined badge count for the admin settings gear: pending join requests + pending claims.
export const getPendingBadgeCount = cache(async (leagueId: string): Promise<number> => {
  const [joinCount, claimCount] = await Promise.all([
    getPendingJoinCount(leagueId),
    getPendingClaimCount(leagueId),
  ])
  return joinCount + claimCount
})

// Returns the current user's claim info for a league (status + linked player name).
// Uses the auth client — members can only read their own rows via RLS.
export const getMyClaimInfo = cache(async (leagueId: string): Promise<{
  status: PlayerClaimStatus | 'none'
  playerName: string | null
}> => {
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return { status: 'none', playerName: null }
    const { data } = await authSupabase
      .from('player_claims')
      .select('status, admin_override_name, player_name')
      .eq('game_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!data) return { status: 'none', playerName: null }
    const resolvedName = data.admin_override_name ?? data.player_name ?? null
    const playerName = data.status === 'approved' ? resolvedName : null
    return { status: (data.status ?? 'none') as PlayerClaimStatus | 'none', playerName }
  } catch {
    return { status: 'none', playerName: null }
  }
})

// ── Weeks ─────────────────────────────────────────────────────────────────────

// Fetches all weeks in all statuses — pages filter in-memory as needed.
// Includes 'scheduled' so the results page can derive nextWeek without a
// separate DB query.
export const getWeeks = cache(async (leagueId: string): Promise<Week[]> => {
  const service = createServiceClient()
  const { data } = await service
    .from('weeks')
    .select('id, season, week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating, lineup_metadata')
    .eq('game_id', leagueId)
    .in('status', ['played', 'cancelled', 'unrecorded', 'scheduled', 'dnf'])
  return sortWeeks(((data ?? []) as WeekRow[]).map(mapWeekRow))
})
