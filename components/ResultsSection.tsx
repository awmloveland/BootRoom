'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sortWeeks } from '@/lib/utils'
import { NextMatchCard } from '@/components/NextMatchCard'
import { WeekList } from '@/components/WeekList'
import type { Player, ScheduledWeek, Week } from '@/lib/types'

interface Props {
  gameId: string
  leagueSlug: string
  weeks: Week[]
  goalkeepers: string[]
  initialScheduledWeek: ScheduledWeek | null
  canAutoPick: boolean
  allPlayers: Player[]
  showMatchHistory: boolean
  leagueDayIndex?: number
  isAdmin?: boolean
  leagueName?: string
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
  leagueDayIndex,
  isAdmin = false,
  leagueName,
}: Props) {
  const router = useRouter()

  const [openWeek, setOpenWeek] = useState<number | null>(() => {
    const resulted = weeks.filter((w) => w.status === 'played' || w.status === 'dnf')
    if (resulted.length === 0) return null
    return sortWeeks(resulted)[0].week
  })

  const handleBuildStart = useCallback(() => {
    setOpenWeek(null)
  }, [])

  return (
    <div className="flex flex-col gap-3">
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
      {showMatchHistory && weeks.length > 0 && (
        <WeekList
          weeks={weeks}
          goalkeepers={goalkeepers}
          openWeek={openWeek}
          onOpenWeekChange={setOpenWeek}
          isAdmin={isAdmin}
          gameId={gameId}
          leagueSlug={leagueSlug}
          allPlayers={allPlayers}
          onResultSaved={() => router.refresh()}
          leagueName={leagueName}
        />
      )}
    </div>
  )
}
