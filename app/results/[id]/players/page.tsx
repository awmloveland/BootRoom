export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { createServiceClient } from '@/lib/supabase/service'
import { PublicHeader } from '@/components/PublicHeader'
import { PublicPlayerList } from '@/components/PublicPlayerList'
import { createClient } from '@/lib/supabase/server'
import type { Player, FeatureConfig } from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

export default async function PublicPlayersPage({ params }: Props) {
  const { id } = await params

  const publicSupabase = createPublicClient()

  // Gate: public link must be enabled
  const { data: game } = await publicSupabase
    .from('games')
    .select('id, name, public_results_enabled')
    .eq('id', id)
    .maybeSingle()

  if (!game || !game.public_results_enabled) notFound()

  const serviceSupabase = createServiceClient()

  // Gate: player_stats must be public-enabled.
  // Note: must use select('*') — narrow column selection causes PostgREST to
  // silently return null for the newly-added public_config JSONB column.
  const { data: featRow } = await serviceSupabase
    .from('league_features')
    .select('*')
    .eq('game_id', id)
    .eq('feature', 'player_stats')
    .maybeSingle()

  if (!featRow?.public_enabled) notFound()

  const publicConfig = (featRow.public_config ?? null) as FeatureConfig | null

  // Fetch players — use the public variant that has no membership check
  const { data: playersData, error: playersError } = await serviceSupabase.rpc('get_player_stats_public', { p_game_id: id })
  if (playersError) console.error('[public/players] get_player_stats error:', playersError)
  let players: Player[] = ((playersData ?? []) as Record<string, unknown>[]).map((row) => ({
    name: String(row.name),
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
    mentality: String(row.mentality ?? 'balanced') as Player['mentality'],
    rating: Number(row.rating ?? 0),
    recentForm: String(row.recentForm ?? ''),
  }))
  if (publicConfig?.max_players) {
    players = players.slice(0, publicConfig.max_players)
  }

  // Fetch week counts for sub-header
  const { data: weekRows } = await serviceSupabase
    .from('weeks')
    .select('status')
    .eq('game_id', id)
    .in('status', ['played', 'cancelled'])
  const playedCount = (weekRows ?? []).length
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  // Auth check for header
  let isAuthenticated = false
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    isAuthenticated = !!user
  } catch {
    // treat as unauthenticated
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <PublicHeader
        leagueName={game.name}
        leagueId={id}
        isAuthenticated={isAuthenticated}
        currentPage="players"
        showPlayersNav={true}
      />

      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">{game.name}</span>
          <span className="text-xs text-slate-400">{playedCount} of {totalWeeks} weeks ({pct}% complete)</span>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <PublicPlayerList
          players={players}
          visibleStats={publicConfig?.visible_stats}
          showMentality={publicConfig?.show_mentality ?? true}
        />
      </main>
    </div>
  )
}
