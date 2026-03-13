/**
 * Data fetching: uses API routes when access key mode is enabled,
 * otherwise uses Supabase directly.
 */

import { createClient } from '@/lib/supabase/client'
import type { Week } from '@/lib/types'

const USE_ACCESS_KEY = process.env.NEXT_PUBLIC_ACCESS_KEY_MODE === 'true'

export async function fetchWeeks(): Promise<Week[]> {
  if (USE_ACCESS_KEY) {
    const res = await fetch('/api/weeks', { credentials: 'include' })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    return (data ?? []).map((row: Record<string, unknown>) => ({
      week: row.week,
      date: row.date,
      status: row.status,
      format: row.format ?? undefined,
      teamA: row.team_a ?? [],
      teamB: row.team_b ?? [],
      winner: row.winner ?? null,
      notes: row.notes ?? undefined,
    })) as Week[]
  }
  const supabase = createClient()
  const { data, error } = await supabase
    .from('weeks')
    .select('week, date, status, format, team_a, team_b, winner, notes')
    .in('status', ['played', 'cancelled'])
    .order('week', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    week: row.week,
    date: row.date,
    status: row.status,
    format: row.format ?? undefined,
    teamA: row.team_a ?? [],
    teamB: row.team_b ?? [],
    winner: row.winner ?? null,
    notes: row.notes ?? undefined,
  })) as Week[]
}

export async function fetchPlayers(): Promise<Awaited<ReturnType<typeof fetchPlayersFromSupabase>>> {
  if (USE_ACCESS_KEY) {
    const res = await fetch('/api/players', { credentials: 'include' })
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    return (data ?? []).map((row: Record<string, unknown>) => ({
      name: row.name,
      played: row.played,
      won: row.won,
      drew: row.drew,
      lost: row.lost,
      timesTeamA: row.timesTeamA,
      timesTeamB: row.timesTeamB,
      winRate: row.winRate,
      qualified: row.qualified,
      points: row.points,
      goalkeeper: row.goalkeeper,
      mentality: row.mentality,
      rating: row.rating,
      recentForm: row.recentForm ?? '',
    }))
  }
  return fetchPlayersFromSupabase()
}

async function fetchPlayersFromSupabase() {
  const supabase = createClient()
  const { data, error } = await supabase.from('player_stats').select('*')
  if (error) throw error
  return (data ?? []).map((row) => ({
    name: row.name,
    played: row.played,
    won: row.won,
    drew: row.drew,
    lost: row.lost,
    timesTeamA: row.timesTeamA,
    timesTeamB: row.timesTeamB,
    winRate: row.winRate,
    qualified: row.qualified,
    points: row.points,
    goalkeeper: row.goalkeeper,
    mentality: row.mentality,
    rating: row.rating,
    recentForm: row.recentForm ?? '',
  }))
}
