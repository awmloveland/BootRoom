'use client'

import { useCallback, useEffect, useState } from 'react'
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
  showMatchEntry?: boolean          // false for members who can see results but not enter them
  leagueDayIndex?: number
  isAdmin?: boolean
  leagueName?: string
  celebration?: ResultsCelebration | null
  linkedPlayerName?: string | null
  canShareImage?: boolean
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
  showMatchEntry = true,
  leagueDayIndex,
  isAdmin = false,
  leagueName,
  celebration = null,
  linkedPlayerName = null,
  canShareImage = false,
}: Props) {
  const router = useRouter()
  const { seasons, year, isDefaultYear, selectYear } = useResultsYear(weeks)

  const [openWeek, setOpenWeek] = useState<number | null>(() => latestResultIn(weeks, year))

  function handleYearSelect(next: string) {
    selectYear(next)
    setOpenWeek(latestResultIn(weeks, next))
  }

  // Deep link: …/results?year=<season>#week-<season>-<week> (the Records tab's
  // biggest win) opens that match and scrolls it into view on load.
  useEffect(() => {
    const match = window.location.hash.replace(/^#/, '').match(/^week-(\d{4})-(\d+)$/)
    if (!match) return
    const [, season, weekNum] = match
    if (!weeks.some((w) => w.season === season && w.week === Number(weekNum))) return
    if (season !== year) selectYear(season)
    setOpenWeek(Number(weekNum))
    // Wait a frame so the card is rendered/expanded before scrolling to it.
    requestAnimationFrame(() => {
      document.getElementById(`week-${season}-${weekNum}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    // Mount only: the hash is read once, like the Seasons quarter links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            canShareImage={canShareImage}
          />
        </div>
      )}
      {/* Read-only members on an empty league still get WeekList's "No results yet." */}
      {showMatchHistory && (weeks.length > 0 || !showMatchEntry) && (
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
