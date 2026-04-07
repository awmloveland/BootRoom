// app/[leagueId]/lineup-lab/page.tsx
export const dynamic = 'force-dynamic'

import { resolveVisibilityTier } from '@/lib/roles'
import { getGame, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getJoinRequestStatus, getPendingBadgeCount } from '@/lib/fetchers'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { LineupLab } from '@/components/LineupLab'
import { LineupLabLoginPrompt } from '@/components/LineupLabLoginPrompt'
import { StatsSidebar } from '@/components/StatsSidebar'
import { isFeatureEnabled } from '@/lib/features'
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
import type { LeagueDetails, JoinRequestStatus } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LineupLabPage({ params }: Props) {
  const { leagueId } = await params

  // getGame, getAuthAndRole, getFeatures are cache hits from the layout.
  // getPlayerStats and getWeeks run fresh — both start in parallel.
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
            currentTab="lineup-lab"
            isAdmin={isAdmin}
            details={details}
            joinStatus={joinStatus}
            pendingRequestCount={pendingRequestCount}
          />
          {isAuthenticated
            ? <LineupLab allPlayers={players} />
            : <LineupLabLoginPrompt leagueId={leagueId} leagueName={game!.name} />
          }
        </div>
        <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
          />
        </div>
      </div>
      {canSeeStatsSidebar && (
        <MobileStatsFAB>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
          />
        </MobileStatsFAB>
      )}
    </main>
  )
}
