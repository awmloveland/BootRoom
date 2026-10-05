// app/[slug]/(tabs)/results/page.tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { leaguePageMetadata } from '@/lib/metadata'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled, isLeagueHidden } from '@/lib/features'
import { dayNameToIndex, isPastDeadline, parseWeekDate } from '@/lib/utils'
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyClaimInfo, ensureUnrecordedWeek } from '@/lib/fetchers'
import { PublicResultsSection } from '@/components/PublicResultsSection'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { ResultsSection } from '@/components/ResultsSection'
import { BfcacheRefresh } from '@/components/BfcacheRefresh'
import { ClaimOnboardingBanner } from '@/components/ClaimOnboardingBanner'
import { getCelebratedQuarter, type ResultsCelebration } from '@/lib/sidebar-stats'
import type { Week, ScheduledWeek } from '@/lib/types'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lineup } = await searchParams
  return leaguePageMetadata((await params).slug, 'results', typeof lineup === 'string' ? lineup : undefined)
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
  const isAdmin = tier === 'admin'

  // Onboarding banner for members with no claim.
  const showClaimBanner = tier === 'member' && claim.status === 'none'

  const canSeeMatchHistory = isAdmin || isFeatureEnabled(features, 'match_history', tier)
  const canSeeMatchEntry = isAdmin || isFeatureEnabled(features, 'match_entry', tier)
  const canShareLineupImage = isFeatureEnabled(features, 'lineup_share_image', tier)

  if (isLeagueHidden(features, tier)) {
    return <LeaguePrivateState leagueName={game.name} />
  }

  const leagueDayIndex = dayNameToIndex(game.day ?? null) ?? undefined

  // Lazily create an unrecorded row if the most recent expected game day passed
  // with no row. Shared with the Overview tab.
  const weeks: Week[] = tier !== 'public'
    ? await ensureUnrecordedWeek(leagueId, rawWeeks, leagueDayIndex)
    : rawWeeks

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

  // Champion card for the latest completed quarter. The match lists render it
  // above that quarter's first result, so it sits below the next match.
  const celebratedQuarter = getCelebratedQuarter(weeks)
  const canSeeCelebration =
    isAdmin || isFeatureEnabled(features, 'quarter_celebration', tier)
  const celebration: ResultsCelebration | null =
    celebratedQuarter && canSeeCelebration
      ? { quarter: celebratedQuarter, leagueName: game.name, leagueSlug: slug }
      : null

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
            canEditMatchEntry={canSeeMatchEntry}
            showMatchHistory={canSeeMatchHistory}
            canShareImage={canShareLineupImage}
            celebration={celebration}
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
        {canSeeMatchEntry || canSeeMatchHistory ? (
          <ResultsSection
            gameId={leagueId}
            leagueSlug={game.slug}
            weeks={weeks}
            goalkeepers={goalkeepers}
            initialScheduledWeek={nextWeek}
            canAutoPick={true}
            allPlayers={players}
            showMatchHistory={canSeeMatchHistory}
            showMatchEntry={canSeeMatchEntry}
            leagueDayIndex={leagueDayIndex}
            isAdmin={isAdmin}
            leagueName={game.name}
            celebration={celebration}
            linkedPlayerName={claim.playerName}
            canShareImage={canShareLineupImage}
          />
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm text-[#6f88a8]">Nothing to show here yet.</p>
          </div>
        )}
      </div>
    </>
  )
}
