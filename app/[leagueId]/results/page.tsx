export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { sortWeeks, dayNameToIndex } from '@/lib/utils'
import { PublicMatchEntrySection } from '@/components/PublicMatchEntrySection'
import { PublicMatchList } from '@/components/PublicMatchList'
import { WeekList } from '@/components/WeekList'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { ResultsSection } from '@/components/ResultsSection'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { StatsSidebar } from '@/components/StatsSidebar'
import type { Week, GameRole, LeagueFeature, FeatureKey, Player, ScheduledWeek, LeagueDetails } from '@/lib/types'
import { DEFAULT_FEATURES } from '@/lib/defaults'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LeagueResultsPage({ params }: Props) {
  const { leagueId } = await params
  const serviceSupabase = createServiceClient()

  // 1. Fetch the game record (bypasses RLS — needed because unauthenticated
  //    users can't read games rows via anon key)
  const { data: game } = await serviceSupabase
    .from('games')
    .select('id, name, location, day, kickoff_time, bio')
    .eq('id', leagueId)
    .maybeSingle()

  if (!game) notFound()

  // 2. Resolve auth + league membership
  let userRole: GameRole | null = null
  let isAuthenticated = false
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (user) {
      isAuthenticated = true
      const { data: memberRow } = await serviceSupabase
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
    console.error('[results] auth check failed:', err)
    // treat as unauthenticated
  }

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  // 3. Fetch feature flags — join feature_experiments (global) with league_features (per-league)
  const [experimentsResult, leagueFeaturesResult] = await Promise.all([
    serviceSupabase.from('feature_experiments').select('feature, available'),
    serviceSupabase.from('league_features').select('*').eq('game_id', leagueId),
  ])

  const availableSet = experimentsResult.error
    ? new Set(DEFAULT_FEATURES.map((f) => f.feature as FeatureKey))
    : new Set(
        (experimentsResult.data ?? [])
          .filter((e) => e.available)
          .map((e) => e.feature as FeatureKey)
      )
  const featureMap = Object.fromEntries((leagueFeaturesResult.data ?? []).map((f) => [f.feature, f]))
  const features: LeagueFeature[] = DEFAULT_FEATURES
    .filter((def) => availableSet.has(def.feature))
    .map((def) => {
      const row = featureMap[def.feature] ?? def
      return { ...row, available: true } as LeagueFeature
    })

  const canSeeMatchHistory = isAdmin || isFeatureEnabled(features, 'match_history', tier)
  const canSeeMatchEntry = isAdmin || isFeatureEnabled(features, 'match_entry', tier)
  const canSeePlayerStats = isAdmin || isFeatureEnabled(features, 'player_stats', tier)
  const canSeeTeamBuilder = isAdmin || isFeatureEnabled(features, 'team_builder', tier)
  const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)

  // 4. For the public tier: if nothing is visible, show private state
  if (tier === 'public' && !canSeeMatchHistory && !canSeeMatchEntry && !canSeePlayerStats) {
    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-4">
        <LeaguePrivateState leagueName={game.name} />
      </main>
    )
  }

  // 5. Fetch weeks (played + cancelled — always needed for history and NextMatchCard context)
  type WeekRow = {
    week: number; date: string; status: string; format: string | null;
    team_a: string[] | null; team_b: string[] | null; winner: string | null; notes: string | null;
    goal_difference: number | null; team_a_rating: number | null; team_b_rating: number | null;
  }
  const { data: rawWeeks } = await serviceSupabase
    .from('weeks')
    .select('week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating')
    .eq('game_id', leagueId)
    .in('status', ['played', 'cancelled'])
    .order('week', { ascending: false })

  const weeks: Week[] = sortWeeks(
    (rawWeeks as WeekRow[] ?? []).map((row) => ({
      week: row.week,
      date: row.date,
      status: row.status as Week['status'],
      format: row.format ?? undefined,
      teamA: row.team_a ?? [],
      teamB: row.team_b ?? [],
      winner: row.winner as Week['winner'] ?? null,
      notes: row.notes ?? undefined,
      goal_difference: row.goal_difference ?? null,
      team_a_rating: row.team_a_rating ?? null,
      team_b_rating: row.team_b_rating ?? null,
    }))
  )

  // 6. Fetch next scheduled week when match_entry is visible
  let nextWeek: ScheduledWeek | null = null
  if (canSeeMatchEntry) {
    const { data: scheduledRows } = await serviceSupabase
      .from('weeks')
      .select('id, week, date, format, team_a, team_b')
      .eq('game_id', leagueId)
      .eq('status', 'scheduled')
      .order('week', { ascending: true })
      .limit(1)
    if (scheduledRows && scheduledRows.length > 0) {
      const row = scheduledRows[0]
      nextWeek = {
        id: row.id as string,
        week: row.week,
        date: row.date,
        format: row.format ?? null,
        teamA: (row.team_a as string[]) ?? [],
        teamB: (row.team_b as string[]) ?? [],
        status: 'scheduled' as const,
      }
    }
  }

  // 7. Fetch players for member/admin tier (needed for NextMatchCard squad selection + auto-pick)
  //    Also fetch for public tier when the stats sidebar is enabled (needed for InForm widget)
  let players: Player[] = []
  const playersFetched = (tier !== 'public' && (canSeeMatchHistory || canSeeMatchEntry)) || (tier === 'public' && canSeeStatsSidebar)
  if (playersFetched) {
    const { data: playersData } = await serviceSupabase.rpc('get_player_stats_public', {
      p_game_id: leagueId,
    })
    if (playersData) {
      players = (playersData as Record<string, unknown>[]).map((p) => ({
        name: p.name as string,
        played: Number(p.played),
        won: Number(p.won),
        drew: Number(p.drew),
        lost: Number(p.lost),
        timesTeamA: Number(p.timesTeamA),
        timesTeamB: Number(p.timesTeamB),
        winRate: Number(p.winRate),
        qualified: p.qualified as boolean,
        points: Number(p.points),
        goalkeeper: p.goalkeeper as boolean,
        mentality: p.mentality as Player['mentality'],
        rating: Number(p.rating),
        recentForm: (p.recentForm as string) ?? '',
      }))
    }
  }

  const goalkeepers = players.filter(p => p.goalkeeper).map(p => p.name)

  const leagueDayIndex = dayNameToIndex(game.day ?? null) ?? undefined

  const details: LeagueDetails = {
    location: game.location ?? null,
    day: game.day ?? null,
    kickoff_time: game.kickoff_time ?? null,
    bio: game.bio ?? null,
    player_count: playersFetched ? players.length : undefined,
  }

  const playedCount = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled').length
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  // ── Public tier render ──
  if (tier === 'public') {
    return (
      <main className="px-4 sm:px-6 py-4">
        <div className="flex justify-center gap-6 items-start">
          <div className="w-full max-w-xl shrink-0 space-y-8">
            <LeaguePageHeader
              leagueName={game.name}
              leagueId={leagueId}
              playedCount={playedCount}
              totalWeeks={totalWeeks}
              pct={pct}
              currentTab="results"
              isAdmin={isAdmin}
              showLineupLabTab={false}
              details={details}
            />
            {canSeeMatchEntry && (
              <PublicMatchEntrySection
                gameId={leagueId}
                weeks={weeks}
                initialScheduledWeek={nextWeek}
              />
            )}

            {canSeeMatchHistory && (
              <section>
                <PublicMatchList weeks={weeks} />
              </section>
            )}

            {!isAuthenticated && (
              <p className="text-xs text-slate-600 text-center pb-4">
                Sign in for full access to your league.
              </p>
            )}
          </div>
          {canSeeStatsSidebar && (
            <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
              <StatsSidebar
                players={players}
                weeks={weeks}
                features={features}
                role={userRole}
                leagueDayIndex={leagueDayIndex}
              />
            </div>
          )}
        </div>
      </main>
    )
  }

  // ── Member / Admin tier render ──
  return (
    <main className="px-4 sm:px-6 py-4">
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          <LeaguePageHeader
            leagueName={game.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="results"
            isAdmin={isAdmin}
            showLineupLabTab={canSeeTeamBuilder}
            details={details}
          />
          <div className="flex flex-col gap-3">
            {canSeeMatchEntry ? (
              <ResultsSection
                gameId={leagueId}
                weeks={weeks}
                goalkeepers={goalkeepers}
                initialScheduledWeek={nextWeek}
                canAutoPick={canSeeTeamBuilder}
                allPlayers={players}
                showMatchHistory={canSeeMatchHistory}
                leagueDayIndex={leagueDayIndex}
              />
            ) : canSeeMatchHistory ? (
              <WeekList weeks={weeks} goalkeepers={goalkeepers} />
            ) : (
              <div className="py-16 text-center">
                <p className="text-sm text-slate-500">Nothing to show here yet.</p>
              </div>
            )}
          </div>
        </div>
        <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
          <StatsSidebar
            players={players}
            weeks={weeks}
            features={features}
            role={userRole}
            leagueDayIndex={leagueDayIndex}
          />
        </div>
      </div>
    </main>
  )
}
