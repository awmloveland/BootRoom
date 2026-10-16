'use client'

import { NextMatchCard } from '@/components/NextMatchCard'
import type { Week, ScheduledWeek } from '@/lib/types'

interface Props {
  gameId: string
  leagueSlug: string
  weeks: Week[]
  initialScheduledWeek: ScheduledWeek | null
  leagueName?: string
  kickoffTime?: string | null
}

/**
 * Thin client wrapper that renders NextMatchCard read-only in public mode.
 * Accepts serializable props from the server page component.
 */
export function PublicMatchEntrySection({ gameId, leagueSlug, weeks, initialScheduledWeek, leagueName, kickoffTime = null }: Props) {
  return (
    <NextMatchCard
      gameId={gameId}
      leagueSlug={leagueSlug}
      weeks={weeks}
      publicMode={true}
      initialScheduledWeek={initialScheduledWeek}
      canEdit={false}
      onResultSaved={() => window.location.reload()}
      leagueName={leagueName}
      kickoffTime={kickoffTime}
    />
  )
}
