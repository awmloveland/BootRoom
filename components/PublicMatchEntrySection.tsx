'use client'

import { NextMatchCard } from '@/components/NextMatchCard'
import type { Week, ScheduledWeek } from '@/lib/types'

interface Props {
  gameId: string
  weeks: Week[]
  initialScheduledWeek: ScheduledWeek | null
  leagueName?: string
}

/**
 * Thin client wrapper that renders NextMatchCard in public mode.
 * Accepts serializable props from the server page component and
 * wires onResultSaved to a full page reload (re-fetches server data).
 */
export function PublicMatchEntrySection({ gameId, weeks, initialScheduledWeek, leagueName }: Props) {
  return (
    <NextMatchCard
      gameId={gameId}
      weeks={weeks}
      publicMode={true}
      initialScheduledWeek={initialScheduledWeek}
      canEdit={true}
      onResultSaved={() => window.location.reload()}
      leagueName={leagueName}
    />
  )
}
