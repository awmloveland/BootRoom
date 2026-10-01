'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getLatestResultWeek } from '@/lib/utils'
import { NextMatchCard } from '@/components/NextMatchCard'
import { WeekList } from '@/components/WeekList'
import { YearTabs, useResultsYear } from '@/components/YearTabs'
import type { Player, ScheduledWeek, Week } from '@/lib/types'
import type { ResultsCelebration } from '@/lib/sidebar-stats'

interface Props {
  gameId: string
  leagueSlug: string
  weeks: Week[]
  goalkeepers: string[]
  initialScheduledWeek: ScheduledWeek | null
  canAutoPick: boolean
  allPlayers: Player[]
  showMatchHistory: boolean
  initialYear: string               // season to show first, resolved from ?year= on the server
  showMatchEntry?: boolean          // false for members who can see results but not enter them
  leagueDayIndex?: number
  isAdmin?: boolean
  leagueName?: string
  celebration?: ResultsCelebration | null
  linkedPlayerName?: string | null
}

/** Latest result in one season, the card that opens when that season is shown. */
function latestResultIn(weeks: Week[], season: string): number | null {
  return getLatestResultWeek(weeks.filter((w) => w.season === season))?.week ?? null
}

export function ResultsSection({
  gameId,
  leagueSlug,
  weeks,
  goalkeepers,
  initialScheduledWeek,
  canAutoPick,
  allPlayers,
  showMatchHistory,
  initialYear,
  showMatchEntry = true,
  leagueDayIndex,
  isAdmin = false,
  leagueName,
  celebration = null,
  linkedPlayerName = null,
}: Props) {
  const router = useRouter()
  const { seasons, year, isDefaultYear, selectYear } = useResultsYear(weeks, initialYear)

  const [openWeek, setOpenWeek] = useState<number | null>(() => latestResultIn(weeks, year))

  function handleYearSelect(next: string) {
    selectYear(next)
    setOpenWeek(latestResultIn(weeks, next))
  }

  const handleBuildStart = useCallback(() => {
    setOpenWeek(null)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {showMatchHistory && <YearTabs years={seasons} selected={year} onSelect={handleYearSelect} />}
      {showMatchEntry && (
        // Hidden rather than unmounted on past years, so a half-built line-up survives a year switch.
        <div hidden={showMatchHistory && !isDefaultYear}>
          <NextMatchCard
            gameId={gameId}
            leagueSlug={leagueSlug}
            weeks={weeks}
            initialScheduledWeek={initialScheduledWeek}
            onResultSaved={() => router.refresh()}
            canEdit={true}
            canAutoPick={canAutoPick}
            allPlayers={allPlayers}
            onBuildStart={handleBuildStart}
            leagueDayIndex={leagueDayIndex}
            leagueName={leagueName}
          />
        </div>
      )}
      {showMatchHistory && weeks.length > 0 && (
        <WeekList
          weeks={weeks}
          season={year}
          goalkeepers={goalkeepers}
          openWeek={openWeek}
          onOpenWeekChange={setOpenWeek}
          isAdmin={isAdmin}
          gameId={gameId}
          leagueSlug={leagueSlug}
          allPlayers={allPlayers}
          onResultSaved={() => router.refresh()}
          leagueName={leagueName}
          celebration={celebration}
          linkedPlayerName={linkedPlayerName}
        />
      )}
    </div>
  )
}
