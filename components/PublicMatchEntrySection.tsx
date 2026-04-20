'use client'

import { NextMatchCard } from '@/components/NextMatchCard'
import type { Week, ScheduledWeek } from '@/lib/types'

interface Props {
  gameId: string
  leagueSlug: string
  weeks: Week[]
  initialScheduledWeek: ScheduledWeek | null
  leagueName?: string
  canEdit?: boolean
}

export function PublicMatchEntrySection({ gameId, leagueSlug, weeks, initialScheduledWeek, leagueName, canEdit = true }: Props) {
  return (
    <NextMatchCard
      gameId={gameId}
      leagueSlug={leagueSlug}
      weeks={weeks}
      publicMode={true}
      initialScheduledWeek={initialScheduledWeek}
      canEdit={canEdit}
      onResultSaved={() => window.location.reload()}
      leagueName={leagueName}
    />
  )
}
