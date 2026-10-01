import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { resolveVisibilityTier } from '@/lib/roles'
import { isLeagueHidden } from '@/lib/features'
import { dayNameToIndex, getSeasonPlayedWeekCount, getHeaderSeason } from '@/lib/utils'
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyJoinRequestStatus, getPendingBadgeCount, getMyClaimInfo } from '@/lib/fetchers'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { LeagueHeaderSkeleton, LeagueSidebarSkeleton } from '@/components/LeagueTabSkeleton'
import { StatsSidebar } from '@/components/StatsSidebar'
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
import { SidebarSticky } from '@/components/SidebarSticky'
import type { LeagueDetails } from '@/lib/types'

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

const TOTAL_WEEKS = 52

/**
 * Shared shell for the four league tabs. Next.js keeps a layout mounted across
 * navigations between its child routes, so the header, tab bar and stats
 * sidebar stay on screen while only the tab content below swaps (via each
 * tab's loading.tsx). router.refresh() re-renders the layout too, so header
 * counts and sidebar stats stay current after a result is saved.
 *
 * The header and sidebar each sit in their own Suspense boundary so the tab
 * content can stream in without waiting on them on a full page load.
 */
export default async function LeagueTabsLayout({ children, params }: Props) {
  const { slug } = await params

  return (
    <main className="px-4 sm:px-6 pt-5 pb-14">
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          <Suspense fallback={<LeagueHeaderSkeleton leagueSlug={slug} />}>
            <LeagueHeader slug={slug} />
          </Suspense>
          {children}
        </div>
        <Suspense fallback={<LeagueSidebarSkeleton />}>
          <LeagueSidebar slug={slug} />
        </Suspense>
      </div>
    </main>
  )
}

async function LeagueHeader({ slug }: { slug: string }) {
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  const [{ userRole }, features, players, weeks, pendingRequestCount, joinStatus] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),   // 0 for non-admins, no RPCs
    getMyJoinRequestStatus(leagueId), // null | 'member' | JoinRequestStatus
  ])

  const tier = resolveVisibilityTier(userRole)
  if (isLeagueHidden(features, tier)) return null

  const playedCount = getSeasonPlayedWeekCount(weeks)
  const details: LeagueDetails = {
    location: game.location ?? null,
    day: game.day ?? null,
    kickoff_time: game.kickoff_time ?? null,
    bio: game.bio ?? null,
    player_count: players.length,
  }

  return (
    <LeaguePageHeader
      leagueName={game.name}
      leagueId={leagueId}
      leagueSlug={slug}
      playedCount={playedCount}
      totalWeeks={TOTAL_WEEKS}
      pct={Math.round((playedCount / TOTAL_WEEKS) * 100)}
      season={getHeaderSeason(weeks)}
      isAdmin={tier === 'admin'}
      details={details}
      joinStatus={joinStatus}
      pendingRequestCount={pendingRequestCount}
    />
  )
}

async function LeagueSidebar({ slug }: { slug: string }) {
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  const [{ userRole }, features, players, weeks, claim] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getMyClaimInfo(leagueId), // 'none' for non-members, no query
  ])

  if (isLeagueHidden(features, resolveVisibilityTier(userRole))) return null

  const sidebar = (
    <StatsSidebar
      players={players}
      weeks={weeks}
      leagueDayIndex={dayNameToIndex(game.day ?? null) ?? undefined}
      linkedPlayerName={claim.playerName}
    />
  )

  return (
    <>
      <SidebarSticky>{sidebar}</SidebarSticky>
      <MobileStatsFAB>{sidebar}</MobileStatsFAB>
    </>
  )
}
