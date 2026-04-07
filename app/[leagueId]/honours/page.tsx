// app/[leagueId]/honours/page.tsx
export const dynamic = 'force-dynamic'

import { resolveVisibilityTier } from '@/lib/roles'
import { getGame, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getJoinRequestStatus, getPendingBadgeCount, getMyClaimInfo } from '@/lib/fetchers'
import { isFeatureEnabled } from '@/lib/features'
import { computeAllCompletedQuarters } from '@/lib/sidebar-stats'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { HonoursSection } from '@/components/HonoursSection'
import { HonoursLoginPrompt } from '@/components/HonoursLoginPrompt'
import { StatsSidebar } from '@/components/StatsSidebar'
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
import { ClaimOnboardingBanner } from '@/components/ClaimOnboardingBanner'
import type { LeagueDetails, JoinRequestStatus } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function HonoursPage({ params }: Props) {
  const { leagueId } = await params

  const [{ user, userRole, isAuthenticated }, game, features, players, weeks, pendingRequestCount] = await Promise.all([
    getAuthAndRole(leagueId),
    getGame(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),
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

  // Show onboarding banner for non-admin members with no claim.
  let linkedPlayerName: string | null = null
  let showClaimBanner = false
  if (tier !== 'public') {
    const { status, playerName } = await getMyClaimInfo(leagueId)
    linkedPlayerName = playerName
    if (tier === 'member') showClaimBanner = status === 'none'
  }

  const playedWeeks = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled')
  const playedCount = playedWeeks.length
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  const details: LeagueDetails = {
    location: game!.location ?? null,
    day: game!.day ?? null,
    kickoff_time: game!.kickoff_time ?? null,
    bio: game!.bio ?? null,
    player_count: players.length,
  }

  return (
    <main className="px-4 sm:px-6 pt-4 pb-8">
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          <LeaguePageHeader
            leagueName={game!.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="honours"
            isAdmin={isAdmin}
            details={details}
            joinStatus={joinStatus}
            pendingRequestCount={pendingRequestCount}
          />
          {showClaimBanner && <ClaimOnboardingBanner leagueId={leagueId} />}
          {tier === 'public' || !isAuthenticated ? (
            <HonoursLoginPrompt leagueId={leagueId} leagueName={game!.name} />
          ) : (
            <HonoursSection data={computeAllCompletedQuarters(weeks, new Date())} />
          )}
        </div>
        {canSeeStatsSidebar && (
          <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
            <StatsSidebar
              players={players}
              weeks={playedWeeks}
              features={features}
              role={userRole}
              linkedPlayerName={linkedPlayerName}
            />
          </div>
        )}
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
