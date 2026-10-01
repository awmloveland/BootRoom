// app/[slug]/lineup-lab/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { resolveVisibilityTier } from '@/lib/roles'
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyJoinRequestStatus, getPendingBadgeCount } from '@/lib/fetchers'
import { getSeasonPlayedWeekCount, getHeaderSeason } from '@/lib/utils'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { LineupLab } from '@/components/LineupLab'
import { LineupLabLoginPrompt } from '@/components/LineupLabLoginPrompt'
import { StatsSidebar } from '@/components/StatsSidebar'
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
import { SidebarSticky } from '@/components/SidebarSticky'
import type { LeagueDetails } from '@/lib/types'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function LineupLabPage({ params }: Props) {
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
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),
    getMyJoinRequestStatus(leagueId),
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

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
    <main className="px-4 sm:px-6 pt-5 pb-14">
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          <LeaguePageHeader
            leagueName={game.name}
            leagueId={leagueId}
            leagueSlug={slug}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            season={getHeaderSeason(weeks)}
            currentTab="lineup-lab"
            isAdmin={isAdmin}
            details={details}
            joinStatus={joinStatus}
            pendingRequestCount={pendingRequestCount}
          />
          {isAuthenticated
            ? <LineupLab allPlayers={players} />
            : <LineupLabLoginPrompt leagueId={leagueId} leagueSlug={slug} leagueName={game.name} />
          }
        </div>
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
          />
        </SidebarSticky>
      </div>
      <MobileStatsFAB>
        <StatsSidebar
          players={players}
          weeks={playedWeeks}
        />
      </MobileStatsFAB>
    </main>
  )
}
