// app/[leagueId]/results/page.tsx
export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { sortWeeks, dayNameToIndex, isPastDeadline, getMostRecentExpectedGameDate, getNextWeekNumber, deriveSeason } from '@/lib/utils'
import { getGame, getAuthAndRole, getFeatures, getPlayerStats, getWeeks } from '@/lib/fetchers'
import { PublicMatchEntrySection } from '@/components/PublicMatchEntrySection'
import { PublicMatchList } from '@/components/PublicMatchList'
import { WeekList } from '@/components/WeekList'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { ResultsSection } from '@/components/ResultsSection'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { StatsSidebar } from '@/components/StatsSidebar'
import { BfcacheRefresh } from '@/components/BfcacheRefresh'
import type { Week, ScheduledWeek, LeagueDetails } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LeagueResultsPage({ params }: Props) {
  const { leagueId } = await params

  // getGame, getAuthAndRole, getFeatures are cache hits from the layout.
  // getPlayerStats and getWeeks run fresh — both start in parallel.
  const [{ userRole, isAuthenticated }, game, features, players, rawWeeks] = await Promise.all([
    getAuthAndRole(leagueId),
    getGame(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
  ])

  // game is guaranteed non-null — the layout already called notFound() if missing.
  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  const canSeeMatchHistory = isAdmin || isFeatureEnabled(features, 'match_history', tier)
  const canSeeMatchEntry = isAdmin || isFeatureEnabled(features, 'match_entry', tier)
  const canSeePlayerStats = isAdmin || isFeatureEnabled(features, 'player_stats', tier)
  const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)

  if (tier === 'public' && !canSeeMatchHistory && !canSeeMatchEntry && !canSeePlayerStats) {
    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-4">
        <LeaguePrivateState leagueName={game!.name} />
      </main>
    )
  }

  const leagueDayIndex = dayNameToIndex(game!.day ?? null) ?? undefined

  // Lazily create an unrecorded row if the most recent expected game day passed
  // with no row. Uses the UUID returned by the RPC to construct the Week locally
  // — no second DB fetch needed.
  let weeks: Week[] = rawWeeks
  const recentDate = getMostRecentExpectedGameDate(weeks, leagueDayIndex)
  if (recentDate && isPastDeadline(recentDate)) {
    const recentWeekNum = getNextWeekNumber(weeks)
    const existingRow = weeks.find((w) => w.date === recentDate)
    if (!existingRow) {
      const season = deriveSeason(weeks) || String(new Date().getFullYear())
      const service = createServiceClient()
      const { data: newId } = await service.rpc('create_unrecorded_week', {
        p_game_id: leagueId,
        p_season: season,
        p_week: recentWeekNum,
        p_date: recentDate,
      })
      // RPC returns UUID on insert, null on ON CONFLICT DO NOTHING.
      // If non-null, the row is new — append it locally without re-fetching.
      if (newId) {
        const unrecordedWeek: Week = {
          id: newId as string,
          week: recentWeekNum,
          date: recentDate,
          status: 'unrecorded',
          teamA: [],
          teamB: [],
          winner: null,
        }
        weeks = sortWeeks([...weeks, unrecordedWeek])
      }
    }
  }

  // Derive nextWeek from already-fetched weeks — getWeeks includes 'scheduled'
  // rows so no extra DB query is needed.
  let nextWeek: ScheduledWeek | null = null
  if (canSeeMatchEntry) {
    const first = weeks
      .filter((w) => w.status === 'scheduled')
      .sort((a, b) => a.week - b.week)[0]
    if (first && !isPastDeadline(first.date)) {
      nextWeek = {
        id: first.id!,
        week: first.week,
        date: first.date,
        format: first.format ?? null,
        teamA: first.teamA,
        teamB: first.teamB,
        status: 'scheduled',
        lineupMetadata: first.lineupMetadata ?? null,
      }
    }
  }

  const goalkeepers = players.filter(p => p.goalkeeper).map(p => p.name)
  const playedCount = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled').length
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  const details: LeagueDetails = {
    location: game!.location ?? null,
    day: game!.day ?? null,
    kickoff_time: game!.kickoff_time ?? null,
    bio: game!.bio ?? null,
    player_count: players.length,
  }

  // ── Public tier ──
  if (tier === 'public') {
    return (
      <main className="px-4 sm:px-6 py-4">
        <BfcacheRefresh />
        <div className="flex justify-center gap-6 items-start">
          <div className="w-full max-w-xl shrink-0 space-y-8">
            <LeaguePageHeader
              leagueName={game!.name}
              leagueId={leagueId}
              playedCount={playedCount}
              totalWeeks={totalWeeks}
              pct={pct}
              currentTab="results"
              isAdmin={isAdmin}
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

  // ── Member / Admin tier ──
  return (
    <main className="px-4 sm:px-6 py-4">
      <BfcacheRefresh />
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          <LeaguePageHeader
            leagueName={game!.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="results"
            isAdmin={isAdmin}
            details={details}
          />
          <div className="flex flex-col gap-3">
            {canSeeMatchEntry ? (
              <ResultsSection
                gameId={leagueId}
                weeks={weeks}
                goalkeepers={goalkeepers}
                initialScheduledWeek={nextWeek}
                canAutoPick={true}
                allPlayers={players}
                showMatchHistory={canSeeMatchHistory}
                leagueDayIndex={leagueDayIndex}
                isAdmin={isAdmin}
              />
            ) : canSeeMatchHistory ? (
              <WeekList
                weeks={weeks}
                goalkeepers={goalkeepers}
                isAdmin={isAdmin}
                gameId={leagueId}
                allPlayers={players}
                onResultSaved={() => {}}
              />
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
