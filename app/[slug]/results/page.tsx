// app/[slug]/results/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { sortWeeks, dayNameToIndex, isPastDeadline, getMostRecentExpectedGameDate, getNextWeekNumber, deriveSeason, parseWeekDate, getSeasonPlayedWeekCount } from '@/lib/utils'
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyJoinRequestStatus, getPendingBadgeCount, getMyClaimInfo } from '@/lib/fetchers'
import { PublicMatchEntrySection } from '@/components/PublicMatchEntrySection'
import { PublicMatchList } from '@/components/PublicMatchList'
import { WeekList } from '@/components/WeekList'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { ResultsSection } from '@/components/ResultsSection'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { StatsSidebar } from '@/components/StatsSidebar'
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
import { SidebarSticky } from '@/components/SidebarSticky'
import { BfcacheRefresh } from '@/components/BfcacheRefresh'
import { ClaimOnboardingBanner } from '@/components/ClaimOnboardingBanner'
import { getCelebratedQuarter } from '@/lib/sidebar-stats'
import { QuarterCelebration } from '@/components/QuarterCelebration'
import type { Week, ScheduledWeek, LeagueDetails } from '@/lib/types'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function LeagueResultsPage({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  // Everything below is independent given leagueId, so it runs in one batch.
  // getAuthAndRole and getFeatures are already in flight from the layout.
  const [
    { userRole, isAuthenticated },
    features,
    players,
    rawWeeks,
    pendingRequestCount,
    joinStatus,
    claim,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),   // 0 for non-admins, no RPCs
    getMyJoinRequestStatus(leagueId), // null | 'member' | JoinRequestStatus
    getMyClaimInfo(leagueId),         // 'none' for non-members, no query
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  // Onboarding banner for members with no claim; linked name for the sidebar.
  const linkedPlayerName = claim.playerName
  const showClaimBanner = tier === 'member' && claim.status === 'none'

  const canSeeMatchHistory = isAdmin || isFeatureEnabled(features, 'match_history', tier)
  const canSeeMatchEntry = isAdmin || isFeatureEnabled(features, 'match_entry', tier)
  const canSeePlayerStats = isAdmin || isFeatureEnabled(features, 'player_stats', tier)

  if (tier === 'public' && !canSeeMatchHistory && !canSeeMatchEntry && !canSeePlayerStats) {
    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-4">
        <LeaguePrivateState leagueName={game.name} />
      </main>
    )
  }

  const leagueDayIndex = dayNameToIndex(game.day ?? null) ?? undefined

  // Lazily create an unrecorded row if the most recent expected game day passed
  // with no row. Uses the UUID returned by the RPC to construct the Week locally
  // — no second DB fetch needed.
  let weeks: Week[] = rawWeeks
  const recentDate = getMostRecentExpectedGameDate(weeks, leagueDayIndex)
  if (recentDate && isPastDeadline(recentDate) && tier !== 'public') {
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
          season,
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

  // Derive nextWeek unconditionally — used for both the editable match entry section
  // (gated by canSeeMatchEntry) and the always-public read-only lineup display.
  let nextWeek: ScheduledWeek | null = null
  const first = weeks
    .filter((w) => w.status === 'scheduled')
    .sort((a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime())[0]
  if (first && !isPastDeadline(first.date)) {
    nextWeek = {
      id: first.id!,
      season: first.season,
      week: first.week,
      date: first.date,
      format: first.format ?? null,
      teamA: first.teamA,
      teamB: first.teamB,
      status: 'scheduled',
      lineupMetadata: first.lineupMetadata ?? null,
      team_a_rating: first.team_a_rating ?? null,
      team_b_rating: first.team_b_rating ?? null,
    }
  }

  const celebratedQuarter = getCelebratedQuarter(weeks)
  const canSeeCelebration =
    isAdmin || isFeatureEnabled(features, 'quarter_celebration', tier)
  const showCelebration = celebratedQuarter !== null && canSeeCelebration

  const goalkeepers = players.filter((p) => p.mentality === 'goalkeeper').map((p) => p.name)

  const playedCount = getSeasonPlayedWeekCount(weeks)
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  const details: LeagueDetails = {
    location: game.location ?? null,
    day: game.day ?? null,
    kickoff_time: game.kickoff_time ?? null,
    bio: game.bio ?? null,
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
              leagueName={game.name}
              leagueId={leagueId}
              leagueSlug={slug}
              playedCount={playedCount}
              totalWeeks={totalWeeks}
              pct={pct}
              currentTab="results"
              isAdmin={isAdmin}
              details={details}
              joinStatus={joinStatus}
              pendingRequestCount={pendingRequestCount}
            />
            {showCelebration && (
              <QuarterCelebration
                quarter={celebratedQuarter!}
                leagueName={game.name}
                leagueSlug={slug}
                variant="card"
              />
            )}
            {nextWeek && (
              <PublicMatchEntrySection
                gameId={leagueId}
                leagueSlug={slug}
                weeks={weeks}
                initialScheduledWeek={nextWeek}
                canEdit={canSeeMatchEntry}
                leagueName={game.name}
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
          <SidebarSticky>
            <StatsSidebar
              players={players}
              weeks={weeks}
              leagueDayIndex={leagueDayIndex}
              linkedPlayerName={linkedPlayerName}
            />
          </SidebarSticky>
        </div>
        <MobileStatsFAB>
          <StatsSidebar
            players={players}
            weeks={weeks}
            leagueDayIndex={leagueDayIndex}
            linkedPlayerName={linkedPlayerName}
          />
        </MobileStatsFAB>
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
            leagueName={game.name}
            leagueId={leagueId}
            leagueSlug={slug}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="results"
            isAdmin={isAdmin}
            details={details}
            joinStatus={joinStatus}
            pendingRequestCount={pendingRequestCount}
          />
          {showClaimBanner && <ClaimOnboardingBanner leagueId={leagueId} />}
          {showCelebration && (
            <div className="mb-3">
              <QuarterCelebration
                quarter={celebratedQuarter!}
                leagueName={game.name}
                leagueSlug={slug}
                variant="card"
              />
            </div>
          )}
          <div className="flex flex-col gap-3">
            {canSeeMatchEntry ? (
              <ResultsSection
                gameId={leagueId}
                leagueSlug={game.slug}
                weeks={weeks}
                goalkeepers={goalkeepers}
                initialScheduledWeek={nextWeek}
                canAutoPick={true}
                allPlayers={players}
                showMatchHistory={canSeeMatchHistory}
                leagueDayIndex={leagueDayIndex}
                isAdmin={isAdmin}
                leagueName={game.name}
              />
            ) : canSeeMatchHistory ? (
              <WeekList
                weeks={weeks}
                goalkeepers={goalkeepers}
                isAdmin={isAdmin}
                gameId={leagueId}
                leagueSlug={game.slug}
                allPlayers={players}
                leagueName={game.name}
              />
            ) : (
              <div className="py-16 text-center">
                <p className="text-sm text-slate-500">Nothing to show here yet.</p>
              </div>
            )}
          </div>
        </div>
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={weeks}
            leagueDayIndex={leagueDayIndex}
            linkedPlayerName={linkedPlayerName}
          />
        </SidebarSticky>
      </div>
      <MobileStatsFAB>
        <StatsSidebar
          players={players}
          weeks={weeks}
          leagueDayIndex={leagueDayIndex}
          linkedPlayerName={linkedPlayerName}
        />
      </MobileStatsFAB>
    </main>
  )
}
