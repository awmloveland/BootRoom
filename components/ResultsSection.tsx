'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getPlayedWeeks } from '@/lib/utils'
import { NextMatchCard } from '@/components/NextMatchCard'
import { WeekList } from '@/components/WeekList'
import type { Player, ScheduledWeek, Week } from '@/lib/types'

interface Props {
  gameId: string
  weeks: Week[]
  goalkeepers: string[]
  initialScheduledWeek: ScheduledWeek | null
  canAutoPick: boolean
  allPlayers: Player[]
  showMatchHistory: boolean
  leagueDayIndex?: number
  isAdmin?: boolean
}

export function ResultsSection({
  gameId,
  weeks,
  goalkeepers,
  initialScheduledWeek,
  canAutoPick,
  allPlayers,
  showMatchHistory,
  leagueDayIndex,
}: Props) {
  const router = useRouter()

  const [openWeek, setOpenWeek] = useState<number | null>(() => {
    const played = getPlayedWeeks(weeks)
    if (played.length === 0) return null
    return played.reduce((a, b) => (a.week > b.week ? a : b)).week
  })

  const handleBuildStart = useCallback(() => {
    setOpenWeek(null)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <NextMatchCard
        gameId={gameId}
        weeks={weeks}
        initialScheduledWeek={initialScheduledWeek}
        onResultSaved={() => router.refresh()}
        canEdit={true}
        canAutoPick={canAutoPick}
        allPlayers={allPlayers}
        onBuildStart={handleBuildStart}
        leagueDayIndex={leagueDayIndex}
      />
      {showMatchHistory && weeks.length > 0 && (
        <WeekList
          weeks={weeks}
          goalkeepers={goalkeepers}
          openWeek={openWeek}
          onOpenWeekChange={setOpenWeek}
        />
      )}
    </div>
  )
}
