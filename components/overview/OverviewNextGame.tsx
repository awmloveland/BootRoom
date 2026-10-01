'use client'

import { useRouter } from 'next/navigation'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { Player, ScheduledWeek, Week } from '@/lib/types'

interface OverviewNextGameProps {
  gameId: string
  leagueSlug: string
  leagueName: string
  weeks: Week[]
  allPlayers: Player[]
  /** From getNextMatchSeed on the server, so the card is in the first paint. */
  initialScheduledWeek: ScheduledWeek | null
  /** The viewer's tier is allowed to build teams and record results (match_entry). */
  canEdit: boolean
  /** Public tier: writes go through the public API routes. */
  publicMode: boolean
  leagueDayIndex?: number
  linkedPlayerName: string | null
  location: string | null
  kickoffTime: string | null
}

/**
 * Thin client wrapper that renders NextMatchCard in its Overview variant.
 * Takes serialisable props from the server page and supplies the refresh callback.
 */
export function OverviewNextGame({
  gameId,
  leagueSlug,
  leagueName,
  weeks,
  allPlayers,
  initialScheduledWeek,
  canEdit,
  publicMode,
  leagueDayIndex,
  linkedPlayerName,
  location,
  kickoffTime,
}: OverviewNextGameProps) {
  const router = useRouter()

  return (
    <NextMatchCard
      variant="overview"
      overview={{ linkedPlayerName, location, kickoffTime }}
      gameId={gameId}
      leagueSlug={leagueSlug}
      leagueName={leagueName}
      weeks={weeks}
      allPlayers={allPlayers}
      initialScheduledWeek={initialScheduledWeek}
      canEdit={canEdit}
      publicMode={publicMode}
      canAutoPick={true}
      leagueDayIndex={leagueDayIndex}
      onResultSaved={() => (publicMode ? window.location.reload() : router.refresh())}
    />
  )
}
