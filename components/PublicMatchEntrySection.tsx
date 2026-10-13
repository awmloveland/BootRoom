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
  canShareImage?: boolean
  kickoffTime?: string | null
}

/**
 * Thin client wrapper that renders NextMatchCard in public mode.
 * Accepts serializable props from the server page component and
 * wires onResultSaved to a full page reload (re-fetches server data).
 */
export function PublicMatchEntrySection({ gameId, leagueSlug, weeks, initialScheduledWeek, leagueName, canEdit = true, canShareImage = false, kickoffTime = null }: Props) {
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
      canShareImage={canShareImage}
      kickoffTime={kickoffTime}
    />
  )
}
