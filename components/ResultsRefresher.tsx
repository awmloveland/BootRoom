'use client'

import { useRouter } from 'next/navigation'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { Player, ScheduledWeek, Week } from '@/lib/types'

interface Props {
  gameId: string
  weeks: Week[]
  initialScheduledWeek: ScheduledWeek | null
  canEdit: boolean
  canAutoPick: boolean
  allPlayers: Player[]
  leagueName?: string
}

export function ResultsRefresher({ gameId, weeks, initialScheduledWeek, canEdit, canAutoPick, allPlayers, leagueName }: Props) {
  const router = useRouter()
  return (
    <NextMatchCard
      gameId={gameId}
      weeks={weeks}
      initialScheduledWeek={initialScheduledWeek}
      onResultSaved={() => router.refresh()}
      canEdit={canEdit}
      canAutoPick={canAutoPick}
      allPlayers={allPlayers}
      onBuildStart={() => {}}
      leagueName={leagueName}
    />
  )
}
