export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { PublicPlayerList } from '@/components/PublicPlayerList'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { DEFAULT_FEATURES } from '@/lib/defaults'
import type { GameRole, LeagueFeature, FeatureKey, Player } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LeaguePlayersPage({ params }: Props) {
  const { leagueId } = await params
  const service = createServiceClient()

  // 1. Resolve league existence via service client (bypasses RLS for unauthenticated users)
  const { data: game } = await service
    .from('games')
    .select('id, name')
    .eq('id', leagueId)
    .maybeSingle()

  if (!game) notFound()

  // 2. Resolve auth + league membership
  let userRole: GameRole | null = null
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (user) {
      const { data: memberRow } = await service
        .from('game_members')
        .select('role')
        .eq('game_id', leagueId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (memberRow) {
        userRole = memberRow.role as GameRole
      }
    }
  } catch (err) {
    console.error('[players] auth check failed:', err)
  }

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  // 3. Fetch feature_experiments + league_features + played week count in parallel
  const [experimentsResult, leagueFeaturesResult, weeksResult] = await Promise.all([
    service.from('feature_experiments').select('feature, available'),
    service.from('league_features').select('*').eq('game_id', leagueId),
    service.from('weeks').select('week', { count: 'exact', head: true }).eq('game_id', leagueId).in('status', ['played', 'cancelled']),
  ])
  const playedCount = weeksResult.count ?? 0

  const availableSet = experimentsResult.error
    ? new Set(DEFAULT_FEATURES.map((f) => f.feature as FeatureKey))
    : new Set(
        (experimentsResult.data ?? [])
          .filter((e) => e.available)
          .map((e) => e.feature as FeatureKey)
      )
  const featureMap = Object.fromEntries((leagueFeaturesResult.data ?? []).map((f) => [f.feature, f]))
  const rawFeatures: LeagueFeature[] = DEFAULT_FEATURES
    .filter((def) => availableSet.has(def.feature))
    .map((def) => {
      const row = featureMap[def.feature] ?? def
      return { ...row, available: true } as LeagueFeature
    })

  const header = (
    <LeaguePageHeader
      leagueName={game.name}
      leagueId={leagueId}
      playedCount={playedCount}
      currentTab="players"
      isAdmin={isAdmin}
    />
  )

  // 4. Check player_stats feature visibility
  if (!isFeatureEnabled(rawFeatures, 'player_stats', tier)) {
    return (
      <>
        {header}
        <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-6">
          <LeaguePrivateState leagueName={game.name} />
        </main>
      </>
    )
  }

  // 5. Fetch players via RPC
  const { data: playersData } = await service.rpc('get_player_stats_public', {
    p_game_id: leagueId,
  })

  const players: Player[] = ((playersData ?? []) as Record<string, unknown>[]).map((row) => ({
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

  // 6. Extract visibleStats and showMentality from the appropriate tier config
  const statsFeat = rawFeatures.find((f) => f.feature === 'player_stats')
  const config = tier === 'public' ? (statsFeat?.public_config ?? null) : (statsFeat?.config ?? null)
  const visibleStats = config?.visible_stats ?? undefined
  const showMentality = config?.show_mentality ?? true

  return (
    <>
      {header}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-8">
        <PublicPlayerList
          players={players}
          visibleStats={visibleStats}
          showMentality={showMentality}
        />
      </main>
    </>
  )
}
