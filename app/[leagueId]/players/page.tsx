export const dynamic = 'force-dynamic'

import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { getGame, getAuthAndRole, getFeatures, getPlayerStats, getWeeks } from '@/lib/fetchers'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { PublicPlayerList } from '@/components/PublicPlayerList'
import { StatsSidebar } from '@/components/StatsSidebar'
import type { LeagueDetails } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LeaguePlayersPage({ params }: Props) {
  const { leagueId } = await params

  // getGame, getAuthAndRole, getFeatures are cache hits from the layout.
  // getPlayerStats and getWeeks run fresh — both start in parallel.
  const [{ userRole }, game, features, players, weeks] = await Promise.all([
    getAuthAndRole(leagueId),
    getGame(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  if (!isAdmin && !isFeatureEnabled(features, 'player_stats', tier)) {
    return <LeaguePrivateState leagueName={game!.name} />
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

  const statsFeat = features.find((f) => f.feature === 'player_stats')
  const config = tier === 'public' ? (statsFeat?.public_config ?? null) : (statsFeat?.config ?? null)
  const visibleStats = config?.visible_stats ?? undefined
  const showMentality = config?.show_mentality ?? true

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
            currentTab="players"
            isAdmin={isAdmin}
            details={details}
          />
          <PublicPlayerList
            players={players}
            visibleStats={visibleStats}
            showMentality={showMentality}
          />
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
    </main>
  )
}
