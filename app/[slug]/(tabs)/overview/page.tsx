// app/[slug]/(tabs)/overview/page.tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { leaguePageMetadata } from '@/lib/metadata'
import { resolveVisibilityTier } from '@/lib/roles'
import { dayNameToIndex, getNextMatchSeed, getOverviewViewerCard, leagueNow } from '@/lib/utils'
import { getGameBySlug, getAuthAndRole, getPlayerStats, getWeeks, getMyClaimInfo, ensureUnrecordedWeek } from '@/lib/fetchers'
import { computeQuarterlyTable, getQuarterStanding, getLastResult } from '@/lib/sidebar-stats'
import { LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'
import { BfcacheRefresh } from '@/components/BfcacheRefresh'
import { InFormWidget, MarginsWidget, TeamABWidget } from '@/components/StatsSidebar'
import { OverviewDesktopRedirect } from '@/components/overview/OverviewDesktopRedirect'
import { OverviewNextGame } from '@/components/overview/OverviewNextGame'
import { OverviewYourStats } from '@/components/overview/OverviewYourStats'
import { OverviewSignInCard, OverviewLinkProfileCard } from '@/components/overview/OverviewPromptCards'
import { OverviewTableCard } from '@/components/overview/OverviewTableCard'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return leaguePageMetadata((await params).slug, 'overview', await searchParams)
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
    players,
    rawWeeks,
    claim,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getMyClaimInfo(leagueId), // 'none' for non-members, no query
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'
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

  const table = computeQuarterlyTable(weeks, leagueNow(), leagueDayIndex)
  const standing = getQuarterStanding(table.allEntries, linkedPlayer?.name)
  const lastResult = getLastResult(weeks)

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
          initialScheduledWeek={getNextMatchSeed(weeks, game.kickoff_time ?? null)}
          canEdit={isAdmin}
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
            weeks={weeks}
          />
        )}
        {viewerCard === 'sign-in' && <OverviewSignInCard leagueSlug={slug} />}
        {viewerCard === 'link-profile' && <OverviewLinkProfileCard />}

        <OverviewTableCard table={table} standing={standing} lastResult={lastResult} />
        <InFormWidget players={players} weeks={weeks} size="page" showWindowTag />
        <TeamABWidget weeks={weeks} size="page" linkedPlayer={linkedPlayer} />
        <MarginsWidget weeks={weeks} size="page" isAdmin={isAdmin} />
      </div>
    </>
  )
}
