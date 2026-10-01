// app/[slug]/(tabs)/overview/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled, isLeagueHidden } from '@/lib/features'
import { dayNameToIndex, getNextMatchSeed, getOverviewViewerCard } from '@/lib/utils'
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyClaimInfo, ensureUnrecordedWeek } from '@/lib/fetchers'
import { computeQuarterlyTable, getQuarterStanding, getLastResult } from '@/lib/sidebar-stats'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'
import { BfcacheRefresh } from '@/components/BfcacheRefresh'
import { InFormWidget, TeamABWidget } from '@/components/StatsSidebar'
import { OverviewDesktopRedirect } from '@/components/overview/OverviewDesktopRedirect'
import { OverviewNextGame } from '@/components/overview/OverviewNextGame'
import { OverviewYourStats } from '@/components/overview/OverviewYourStats'
import { OverviewSignInCard, OverviewLinkProfileCard } from '@/components/overview/OverviewPromptCards'
import { OverviewTableCard } from '@/components/overview/OverviewTableCard'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function LeagueOverviewPage({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  // Everything below is independent given leagueId, so it runs in one batch.
  // The tabs layout (header and sidebar) shares these cached fetchers.
  const [
    { userRole, isAuthenticated },
    features,
    players,
    rawWeeks,
    claim,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getMyClaimInfo(leagueId), // 'none' for non-members, no query
  ])

  const tier = resolveVisibilityTier(userRole)

  if (isLeagueHidden(features, tier)) {
    return <LeaguePrivateState leagueName={game.name} />
  }

  const isAdmin = tier === 'admin'
  const canSeeMatchHistory = isAdmin || isFeatureEnabled(features, 'match_history', tier)
  const canSeeMatchEntry = isAdmin || isFeatureEnabled(features, 'match_entry', tier)
  const leagueDayIndex = dayNameToIndex(game.day ?? null) ?? undefined

  // Overview is the small-screen landing page, so it must keep week numbers and
  // "games left" honest the same way Results does.
  const weeks = tier !== 'public'
    ? await ensureUnrecordedWeek(leagueId, rawWeeks, leagueDayIndex)
    : rawWeeks

  // claim.playerName is only set for an approved claim.
  const linkedPlayer = claim.playerName
    ? players.find((p) => p.name === claim.playerName) ?? null
    : null
  const viewerCard = getOverviewViewerCard({
    isAuthenticated,
    tier,
    claimStatus: claim.status,
    hasLinkedPlayer: linkedPlayer !== null,
  })

  const table = computeQuarterlyTable(weeks, new Date(), leagueDayIndex)
  const standing = getQuarterStanding(table.allEntries, linkedPlayer?.name)
  const lastResult = canSeeMatchHistory ? getLastResult(weeks) : null

  return (
    <>
      <OverviewDesktopRedirect leagueSlug={slug} />
      <BfcacheRefresh />

      {/* Large screens are redirected to Results; show a placeholder until then
          so the cards never flash next to the sidebar. */}
      <div className="hidden lg:block">
        <LeagueTabSkeleton />
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        <OverviewNextGame
          gameId={leagueId}
          leagueSlug={game.slug}
          leagueName={game.name}
          weeks={weeks}
          allPlayers={players}
          initialScheduledWeek={getNextMatchSeed(weeks)}
          canEdit={canSeeMatchEntry}
          publicMode={tier === 'public'}
          leagueDayIndex={leagueDayIndex}
          linkedPlayerName={linkedPlayer?.name ?? null}
          location={game.location ?? null}
          kickoffTime={game.kickoff_time ?? null}
        />

        {viewerCard === 'your-stats' && linkedPlayer && (
          <OverviewYourStats
            player={linkedPlayer}
            standing={standing}
            quarterLabel={`Q${table.displayQ} ${table.displayYear}`}
          />
        )}
        {viewerCard === 'sign-in' && <OverviewSignInCard leagueSlug={slug} />}
        {viewerCard === 'link-profile' && <OverviewLinkProfileCard />}

        <OverviewTableCard table={table} standing={standing} lastResult={lastResult} />
        <InFormWidget players={players} weeks={weeks} size="page" showWindowTag />
        <TeamABWidget weeks={weeks} size="page" linkedPlayer={linkedPlayer} />
      </div>
    </>
  )
}
