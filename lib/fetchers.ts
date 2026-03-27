// lib/fetchers.ts
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sortWeeks } from '@/lib/utils'
import { DEFAULT_FEATURES } from '@/lib/defaults'
import type { GameRole, LeagueFeature, FeatureKey, Player, Week } from '@/lib/types'

// ── Game ─────────────────────────────────────────────────────────────────────

export const getGame = cache(async (leagueId: string) => {
  const service = createServiceClient()
  const { data } = await service
    .from('games')
    .select('id, name, location, day, kickoff_time, bio')
    .eq('id', leagueId)
    .maybeSingle()
  return data
})

// ── Auth + role ───────────────────────────────────────────────────────────────

export const getAuthAndRole = cache(async (leagueId: string) => {
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return { user: null, userRole: null as GameRole | null, isAuthenticated: false }
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
    goalkeeper: Boolean(row.goalkeeper),
    mentality: String(row.mentality ?? 'balanced') as Player['mentality'],
    rating: Number(row.rating ?? 0),
    recentForm: String(row.recentForm ?? ''),
  }))
})

// ── Weeks ─────────────────────────────────────────────────────────────────────

type WeekRow = {
  id: string
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
          })),
          new_players: ((row.lineup_metadata.new_players as any[]) ?? []).map((p: any) => ({
            type: 'new_player' as const,
            name: p.name,
            rating: p.rating,
          })),
        }
      : null,
  }
}

// Fetches all weeks in all statuses — pages filter in-memory as needed.
// Includes 'scheduled' so the results page can derive nextWeek without a
// separate DB query.
export const getWeeks = cache(async (leagueId: string): Promise<Week[]> => {
  const service = createServiceClient()
  const { data } = await service
    .from('weeks')
    .select('id, week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating, lineup_metadata')
    .eq('game_id', leagueId)
    .in('status', ['played', 'cancelled', 'unrecorded', 'scheduled'])
    .order('week', { ascending: false })
  return sortWeeks(((data ?? []) as WeekRow[]).map(mapWeekRow))
})
