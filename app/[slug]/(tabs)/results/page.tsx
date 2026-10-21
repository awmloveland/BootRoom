// app/[slug]/(tabs)/results/page.tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { leaguePageMetadata } from '@/lib/metadata'
import { resolveVisibilityTier } from '@/lib/roles'
import { dayNameToIndex, getLatestResultWeek, getNextMatchSeed } from '@/lib/utils'
import { quarterShareUrls, resultShareUrlFor } from '@/lib/shareLinksServer'
import { getGameBySlug, getAuthAndRole, getPlayerStats, getWeeks, getMyClaimInfo, ensureUnrecordedWeek } from '@/lib/fetchers'
import { PublicResultsSection } from '@/components/PublicResultsSection'
import { ResultsSection } from '@/components/ResultsSection'
import { BfcacheRefresh } from '@/components/BfcacheRefresh'
import { ClaimOnboardingBanner } from '@/components/ClaimOnboardingBanner'
import { getCelebratedQuarters, type ResultsCelebration } from '@/lib/sidebar-stats'
import type { Week, ScheduledWeek } from '@/lib/types'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return leaguePageMetadata((await params).slug, 'results', await searchParams)
}

export default async function LeagueResultsPage({ params }: Props) {
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

  // Onboarding banner for members with no claim.
  const showClaimBanner = tier === 'member' && claim.status === 'none'

  const leagueDayIndex = dayNameToIndex(game.day ?? null) ?? undefined

  // Lazily create an unrecorded row if the most recent expected game day passed
  // with no row. Shared with the Overview tab.
  const weeks: Week[] = tier !== 'public'
    ? await ensureUnrecordedWeek(leagueId, rawWeeks, leagueDayIndex)
    : rawWeeks

  // The next match card's starting week, with the same rules the Overview tab uses.
  const nextWeek: ScheduledWeek | null = getNextMatchSeed(weeks, game.kickoff_time ?? null)

  // Champion card for every completed quarter. The match lists render each
  // above that quarter's first result, so the latest sits below the next match.
  const celebratedQuarters = getCelebratedQuarters(weeks)
  const celebration: ResultsCelebration | null =
    celebratedQuarters.length > 0
      ? {
          quarters: celebratedQuarters,
          leagueName: game.name,
          leagueSlug: slug,
          shareUrls: quarterShareUrls(slug, leagueId, celebratedQuarters),
        }
      : null

  // Signed link for the Share button on the latest result.
  const resultShareUrl = resultShareUrlFor(slug, getLatestResultWeek(weeks))

  const goalkeepers = players.filter((p) => p.mentality === 'goalkeeper').map((p) => p.name)

  // ── Public tier ──
  if (tier === 'public') {
    return (
      <>
        <BfcacheRefresh />
        <div className="flex flex-col gap-3">
          <PublicResultsSection
            gameId={leagueId}
            leagueSlug={slug}
            leagueName={game.name}
            weeks={weeks}
            nextWeek={nextWeek}
            celebration={celebration}
            resultShareUrl={resultShareUrl}
            kickoffTime={game.kickoff_time ?? null}
          />
          {!isAuthenticated && (
            <p className="pt-2 font-plex text-[9px] uppercase tracking-[.14em] text-[#4f688a] text-center">
              Sign in for full access to your league.
            </p>
          )}
        </div>
      </>
    )
  }

  // ── Member / Admin tier ──
  return (
    <>
      <BfcacheRefresh />
      {showClaimBanner && <ClaimOnboardingBanner leagueId={leagueId} />}
      <div className="flex flex-col gap-3">
        <ResultsSection
          gameId={leagueId}
          leagueSlug={game.slug}
          weeks={weeks}
          goalkeepers={goalkeepers}
          initialScheduledWeek={nextWeek}
          canAutoPick={true}
          allPlayers={players}
          leagueDayIndex={leagueDayIndex}
          isAdmin={isAdmin}
          leagueName={game.name}
          celebration={celebration}
          linkedPlayerName={claim.playerName}
          resultShareUrl={resultShareUrl}
          kickoffTime={game.kickoff_time ?? null}
        />
      </div>
    </>
  )
}
