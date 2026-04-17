// app/[slug]/players/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getJoinRequestStatus, getPendingBadgeCount, getMyClaimInfo } from '@/lib/fetchers'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { PublicPlayerList } from '@/components/PublicPlayerList'
import { StatsSidebar } from '@/components/StatsSidebar'
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
import { ClaimOnboardingBanner } from '@/components/ClaimOnboardingBanner'
import { SidebarSticky } from '@/components/SidebarSticky'
import type { LeagueDetails, JoinRequestStatus } from '@/lib/types'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function LeaguePlayersPage({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  // getAuthAndRole and getFeatures are cache hits from the layout.
  // getPlayerStats and getWeeks run fresh — both start in parallel.
  const [{ user, userRole, isAuthenticated }, features, players, weeks, pendingRequestCount] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),  // returns 0 for non-admins
  ])

  // Resolve joinStatus for the Join/Share button
  let joinStatus: JoinRequestStatus | 'member' | 'not-member' | null = null
  if (!isAuthenticated) {
    joinStatus = null
  } else if (userRole !== null) {
    joinStatus = 'member'
  } else {
    joinStatus = await getJoinRequestStatus(leagueId, user!.id)
  }

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'
  const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)

  if (!isAdmin && !isFeatureEnabled(features, 'player_stats', tier)) {
    return <LeaguePrivateState leagueName={game.name} />
  }

  // Show onboarding banner for non-admin members with no claim.
  let linkedPlayerName: string | null = null
  let showClaimBanner = false
  if (tier !== 'public') {
    const { status, playerName } = await getMyClaimInfo(leagueId)
    linkedPlayerName = playerName
    if (tier === 'member') showClaimBanner = status === 'none'
  }

  const playedWeeks = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled')

  const currentYear = String(new Date().getFullYear())
  const currentYearPlayedWeeks = playedWeeks.filter((w) => w.season === currentYear)
  const playedCount = currentYearPlayedWeeks.length > 0
    ? Math.max(...currentYearPlayedWeeks.map((w) => w.week))
    : (() => {
        const prevYear = String(new Date().getFullYear() - 1)
        const prev = playedWeeks.filter((w) => w.season === prevYear)
        return prev.length > 0 ? Math.max(...prev.map((w) => w.week)) : 0
      })()
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  const details: LeagueDetails = {
    location: game.location ?? null,
    day: game.day ?? null,
    kickoff_time: game.kickoff_time ?? null,
    bio: game.bio ?? null,
    player_count: players.length,
  }

  const statsFeat = features.find((f) => f.feature === 'player_stats')
  const config = tier === 'public' ? (statsFeat?.public_config ?? null) : (statsFeat?.config ?? null)
  const visibleStats = config?.visible_stats ?? undefined
  const showMentality = config?.show_mentality ?? true

  return (
    <main className="px-4 sm:px-6 pt-4 pb-8">
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          <LeaguePageHeader
            leagueName={game.name}
            leagueId={leagueId}
            leagueSlug={slug}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="players"
            isAdmin={isAdmin}
            details={details}
            joinStatus={joinStatus}
            pendingRequestCount={pendingRequestCount}
          />
          {showClaimBanner && <ClaimOnboardingBanner leagueId={leagueId} />}
          <PublicPlayerList
            players={players}
            visibleStats={visibleStats}
            showMentality={showMentality}
            weeks={weeks}
          />
        </div>
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
            linkedPlayerName={linkedPlayerName}
          />
        </SidebarSticky>
      </div>
      {canSeeStatsSidebar && (
        <MobileStatsFAB>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
            linkedPlayerName={linkedPlayerName}
          />
        </MobileStatsFAB>
      )}
    </main>
  )
}
