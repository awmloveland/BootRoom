/**
 * Data fetching: uses API routes when access key mode is enabled,
 * otherwise uses Supabase directly.
 */

import { createClient } from '@/lib/supabase/client'
import type { Week } from '@/lib/types'

const USE_ACCESS_KEY = process.env.NEXT_PUBLIC_ACCESS_KEY_MODE === 'true'

export interface Game {
  id: string
  name: string
  created_at: string
}

export async function fetchGames(): Promise<Game[]> {
  const res = await fetch('/api/games', { credentials: 'include' })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  return (data ?? []) as Game[]
}

export async function fetchWeeks(gameId: string): Promise<Week[]> {
  if (USE_ACCESS_KEY) {
    const res = await fetch(`/api/weeks?gameId=${gameId}`, { credentials: 'include' })
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
    .eq('game_id', gameId)
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

export type PlayerStat = {
  name: string
  played: number
  won: number
  drew: number
  lost: number
  timesTeamA: number
  timesTeamB: number
  winRate: number
  qualified: boolean
  points: number
  goalkeeper: boolean
  mentality: string
  rating: number
  recentForm: string
}

export async function fetchPlayers(gameId: string): Promise<PlayerStat[]> {
  if (USE_ACCESS_KEY) {
    const res = await fetch(`/api/players?gameId=${gameId}`, { credentials: 'include' })
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
  const supabase = createClient()
  const { data, error } = await supabase.rpc('get_player_stats', { p_game_id: gameId })
  if (error) throw error
  return (data ?? []).map((row: Record<string, unknown>) => ({
    name: row.name,
    played: Number(row.played),
    won: Number(row.won),
    drew: Number(row.drew),
    lost: Number(row.lost),
    timesTeamA: Number(row.timesTeamA),
    timesTeamB: Number(row.timesTeamB),
    winRate: Number(row.winRate),
    qualified: Boolean(row.qualified),
    points: Number(row.points),
    goalkeeper: Boolean(row.goalkeeper),
    mentality: String(row.mentality ?? 'balanced'),
    rating: Number(row.rating ?? 0),
    recentForm: String(row.recentForm ?? ''),
  }))
}
