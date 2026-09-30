// app/[slug]/honours/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { resolveVisibilityTier } from '@/lib/roles'
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyJoinRequestStatus, getPendingBadgeCount, getMyClaimInfo } from '@/lib/fetchers'
import { computeAllQuarters } from '@/lib/sidebar-stats'
import { getSeasonPlayedWeekCount } from '@/lib/utils'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { HonoursSection } from '@/components/HonoursSection'
import { HonoursLoginPrompt } from '@/components/HonoursLoginPrompt'
import { StatsSidebar } from '@/components/StatsSidebar'
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
import { ClaimOnboardingBanner } from '@/components/ClaimOnboardingBanner'
import { SidebarSticky } from '@/components/SidebarSticky'
import type { LeagueDetails } from '@/lib/types'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function HonoursPage({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  // Everything below is independent given leagueId, so it runs in one batch.
  // getAuthAndRole and getFeatures are already in flight from the layout.
  const [
    { userRole, isAuthenticated },
    ,
    players,
    weeks,
    pendingRequestCount,
    joinStatus,
    claim,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),
    getMyJoinRequestStatus(leagueId),
    getMyClaimInfo(leagueId),
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  // Onboarding banner for members with no claim; linked name for the sidebar.
  const linkedPlayerName = claim.playerName
  const showClaimBanner = tier === 'member' && claim.status === 'none'

  const playedWeeks = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled')
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
            currentTab="honours"
            isAdmin={isAdmin}
            details={details}
            joinStatus={joinStatus}
            pendingRequestCount={pendingRequestCount}
          />
          {showClaimBanner && <ClaimOnboardingBanner leagueId={leagueId} />}
          {tier === 'public' || !isAuthenticated ? (
            <HonoursLoginPrompt leagueId={leagueId} leagueSlug={slug} leagueName={game.name} />
          ) : (
            <HonoursSection
              data={computeAllQuarters(weeks, new Date())}
              leagueName={game.name}
              leagueSlug={slug}
            />
          )}
        </div>
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            linkedPlayerName={linkedPlayerName}
          />
        </SidebarSticky>
      </div>
      <MobileStatsFAB>
        <StatsSidebar
          players={players}
          weeks={playedWeeks}
          linkedPlayerName={linkedPlayerName}
        />
      </MobileStatsFAB>
    </main>
  )
}
