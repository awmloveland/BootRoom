// lib/fetchers.ts
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sortWeeks, deriveSeason, getMostRecentExpectedGameDate, getNextWeekNumber, isPastDeadline } from '@/lib/utils'
import { DEFAULT_FEATURES } from '@/lib/defaults'
import type { GameRole, LeagueFeature, NavSession, Player, Week, Mentality, Strength, JoinRequestStatus, PendingJoinRequest, PendingRequestSummary, PlayerClaimStatus } from '@/lib/types'
import { ratingToStrength } from '@/lib/strength'

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

// ── Auth client + user ────────────────────────────────────────────────────────

// One cookie-backed auth client per request. Creating it is cheap, but sharing
// it keeps every auth-dependent fetcher on the same instance.
export const getAuthClient = cache(async () => createClient())

// One call to Supabase Auth per request. Every fetcher that needs the current
// user goes through here so a page never pays for the auth round trip twice.
export const getUser = cache(async () => {
  try {
    const authSupabase = await getAuthClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    return user
  } catch {
    return null
  }
})

// ── Auth + role ───────────────────────────────────────────────────────────────

export const getAuthAndRole = cache(async (leagueId: string) => {
  try {
    const user = await getUser()
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

// ── Navbar session ────────────────────────────────────────────────────────────

// The viewer's name and league roles for the navbar. One profile read and one
// memberships read per request, both via the service client because the
// result is only ever rendered for the viewer themself.
type MembershipRow = { role: GameRole; games: { slug: string } | null }

export const getNavSession = cache(async (): Promise<NavSession | null> => {
  const user = await getUser()
  if (!user) return null
  const service = createServiceClient()
  const [profileRes, membershipsRes] = await Promise.all([
    service.from('profiles').select('first_name, last_name').eq('id', user.id).maybeSingle(),
    service
      .from('game_members')
      .select('role, games(slug)')
      .eq('user_id', user.id)
      .overrideTypes<MembershipRow[], { merge: false }>(),
  ])
  if (profileRes.error) console.error('[getNavSession] profiles read failed', profileRes.error)
  if (membershipsRes.error) console.error('[getNavSession] game_members read failed', membershipsRes.error)
  const profile = profileRes.data
  const memberships = membershipsRes.data ?? []
  const first = profile?.first_name ?? ''
  const last = profile?.last_name ?? ''
  const fullName = `${first} ${last}`.trim()
  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: fullName || user.email || null,
    leagues: memberships.flatMap((m) => (m.games ? [{ slug: m.games.slug, role: m.role }] : [])),
  }
})

// ── Features ──────────────────────────────────────────────────────────────────

export const getFeatures = cache(async (leagueId: string): Promise<LeagueFeature[]> => {
  if (DEFAULT_FEATURES.length === 0) return []
  const { data } = await createServiceClient().from('league_features').select('*').eq('game_id', leagueId)
  const featureMap = Object.fromEntries((data ?? []).map((f) => [f.feature, f]))
  return DEFAULT_FEATURES.map((def) => (featureMap[def.feature] ?? def) as LeagueFeature)
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
    strength: ratingToStrength(Number(row.rating ?? 0)),
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
            goalkeeper: g.goalkeeper ?? false,
            // Accept new `strength` key or legacy `strength_hint`; fall back to 'average'
            strength: (g.strength ?? g.strength_hint ?? 'average') as Strength,
          })),
          new_players: ((row.lineup_metadata.new_players as any[]) ?? []).map((p: any) => ({
            type: 'new_player' as const,
            name: p.name,
            // Legacy metadata may have only `goalkeeper` set; derive mentality from it.
            mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
            // Accept new `strength` key or legacy `strength_hint`; fall back to 'average'
            strength: (p.strength ?? p.strength_hint ?? 'average') as Strength,
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

// The join/share button state for the current visitor, resolved entirely from
// the request's cached auth state so pages can run it in their parallel batch.
//   null      → signed out (page shows Join → AuthDialog)
//   'member'  → has a league role (page shows Share)
//   otherwise → the visitor's join request status
export const getMyJoinRequestStatus = cache(async (
  leagueId: string
): Promise<JoinRequestStatus | 'member' | null> => {
  const { user, userRole, isAuthenticated } = await getAuthAndRole(leagueId)
  if (!isAuthenticated || !user) return null
  if (userRole !== null) return 'member'
  return getJoinRequestStatus(leagueId, user.id)
})

// ── Pending join requests ─────────────────────────────────────────────────────

// Fetches all pending join requests for a league. Returns [] if the caller
// is not an admin (the RPC raises 'Access denied' which the catch swallows).
export const getPendingJoinRequests = cache(async (leagueId: string): Promise<PendingJoinRequest[]> => {
  try {
    const user = await getUser()
    if (!user) return []
    const authSupabase = await getAuthClient()
    const { data, error } = await authSupabase.rpc('get_join_requests', {
      p_game_id: leagueId,
    })
    if (error) return []
    return (data ?? []) as PendingJoinRequest[]
  } catch {
    return []
  }
})

// Fetches pending player claims with the claimant's display name. Returns []
// if the caller is not an admin (the RPC raises 'Access denied').
const getPendingClaims = cache(async (leagueId: string): Promise<{ user_id: string; display_name: string | null }[]> => {
  try {
    const user = await getUser()
    if (!user) return []
    const authSupabase = await getAuthClient()
    const { data, error } = await authSupabase.rpc('get_player_claims', { p_game_id: leagueId })
    if (error) return []
    const claims = (data ?? []) as { user_id: string; display_name: string | null; status: string }[]
    return claims.filter((c) => c.status === 'pending')
  } catch {
    return []
  }
})

// Everything an admin has waiting: join requests, plus player claims from
// users without a pending join request (a claim made while asking to join is
// reviewed on that request). Only admins can review, and both RPCs deny
// non-admins anyway, so skip the two round trips unless the cached role says
// admin or creator.
export const getPendingRequests = cache(async (leagueId: string): Promise<PendingRequestSummary> => {
  const { userRole } = await getAuthAndRole(leagueId)
  if (userRole !== 'admin' && userRole !== 'creator') return { joinNames: [], claimNames: [] }
  const [requests, claims] = await Promise.all([
    getPendingJoinRequests(leagueId),
    getPendingClaims(leagueId),
  ])
  const requestUserIds = new Set(requests.map((r) => r.user_id))
  return {
    joinNames: requests.map((r) => r.display_name),
    claimNames: claims
      .filter((c) => !requestUserIds.has(c.user_id))
      .map((c) => c.display_name ?? 'A member'),
  }
})

// Badge count for the admin settings gear and the tab title.
export const getPendingBadgeCount = cache(async (leagueId: string): Promise<number> => {
  const { joinNames, claimNames } = await getPendingRequests(leagueId)
  return joinNames.length + claimNames.length
})

// Returns the current user's claim info for a league (status + linked player name).
// Uses the auth client — members can only read their own rows via RLS.
export const getMyClaimInfo = cache(async (leagueId: string): Promise<{
  status: PlayerClaimStatus | 'none'
  playerName: string | null
}> => {
  try {
    // Claims only exist for members. Non-members (public tier) skip the query.
    const { user, userRole } = await getAuthAndRole(leagueId)
    if (!user || userRole === null) return { status: 'none', playerName: null }
    const authSupabase = await getAuthClient()
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

// ── Unrecorded week ───────────────────────────────────────────────────────────

/**
 * Lazily create an 'unrecorded' row when the most recent expected game day has
 * passed its deadline with no row for it. Returns the weeks list with the new
 * row appended; the row is built locally from the id the RPC returns, so there
 * is no second fetch. Returns the same list when nothing was created.
 *
 * Not cached: it writes. Callers skip it for the public tier.
 */
export async function ensureUnrecordedWeek(
  leagueId: string,
  weeks: Week[],
  leagueDayIndex?: number,
): Promise<Week[]> {
  const recentDate = getMostRecentExpectedGameDate(weeks, leagueDayIndex)
  if (!recentDate || !isPastDeadline(recentDate)) return weeks
  if (weeks.some((w) => w.date === recentDate)) return weeks

  const season = deriveSeason(weeks) || String(new Date().getFullYear())
  const week = getNextWeekNumber(weeks)
  const service = createServiceClient()
  const { data: newId } = await service.rpc('create_unrecorded_week', {
    p_game_id: leagueId,
    p_season: season,
    p_week: week,
    p_date: recentDate,
  })
  // The RPC returns the new row's UUID, or null on ON CONFLICT DO NOTHING.
  if (!newId) return weeks

  return sortWeeks([
    ...weeks,
    { id: newId as string, season, week, date: recentDate, status: 'unrecorded', teamA: [], teamB: [], winner: null },
  ])
}
