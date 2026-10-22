'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { getNextMatchDate, getNextWeekNumber, seasonOfDate, isPastDeadline } from '@/lib/utils'
import { saveLineup, cancelLineup, cancelWeek } from '@/lib/leagueApi'
import type { Week, Player, ScheduledWeek } from '@/lib/types'
import { WinnerBadge } from '@/components/WinnerBadge'
import { ResultModal } from '@/components/ResultModal'
import { LineupBuilder } from '@/components/LineupBuilder'
import { LineupCard, CancelGameDialog, useLineupShare } from '@/components/LineupCard'
import { useLineupBuilder } from '@/components/useLineupBuilder'
import { NextGameAwaiting, NextGameIdle, NextGameLineup } from '@/components/overview/NextGameCard'

interface Props {
  gameId: string
  /** League slug used for share URLs (e.g. craft-football.com/[leagueSlug]). Separate from gameId (UUID) which is used for API calls. */
  leagueSlug: string
  weeks: Week[]
  onResultSaved: () => void
  canEdit?: boolean
  /** Signed-out viewer: read-only card, no admin controls. */
  publicMode?: boolean
  /** The week the card starts from, computed on the server with getNextMatchSeed. */
  initialScheduledWeek?: ScheduledWeek | null
  /** When true, shows the Auto-Pick Teams button. */
  canAutoPick?: boolean
  /** Full player list for the league — used for squad selection and auto-pick ratings. */
  allPlayers?: Player[]
  /** Called when the user enters building state — used to collapse open match cards. */
  onBuildStart?: () => void
  /** Day-of-week index (0=Sun…6=Sat) from league config — used to compute next match date. */
  leagueDayIndex?: number
  /** Display name of the league — used to build the share text. */
  leagueName?: string
  /** The viewer's linked player, for the YOU tag on the Results lineup. */
  linkedPlayerName?: string | null
  /** League kick-off time ('HH:MM'). A scheduled game awaits its result from then; 20:00 when unset. */
  kickoffTime?: string | null
  /**
   * 'overview' renders the idle and lineup states in the Overview tab design and
   * takes its first state from `initialScheduledWeek` instead of fetching, so the
   * card is in the page's first paint. Building and cancelled are the same in both.
   */
  variant?: 'results' | 'overview'
  /** Extra context shown by the Overview variant. */
  overview?: {
    linkedPlayerName?: string | null
    location?: string | null
  }
}

type CardState = 'idle' | 'building' | 'lineup' | 'cancelled'

export function NextMatchCard({
  gameId,
  leagueSlug,
  weeks,
  onResultSaved,
  canEdit = true,
  publicMode = false,
  initialScheduledWeek,
  canAutoPick = false,
  allPlayers = [],
  onBuildStart,
  leagueDayIndex,
  leagueName = '',
  linkedPlayerName = null,
  kickoffTime = null,
  variant = 'results',
  overview,
}: Props) {
  const isOverview = variant === 'overview'
  const [cardState, setCardState] = useState<CardState>(() =>
    initialScheduledWeek
      ? initialScheduledWeek.status === 'cancelled' ? 'cancelled' : 'lineup'
      : 'idle'
  )
  const [scheduledWeek, setScheduledWeek] = useState<ScheduledWeek | null>(initialScheduledWeek ?? null)
  // Overview keeps a kicked-off game on the card until its result is saved.
  const overviewAwaiting =
    isOverview && cardState === 'lineup' && scheduledWeek !== null &&
    isPastDeadline(scheduledWeek.date, kickoffTime)

  const builder = useLineupBuilder({ allPlayers, weeks })
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showResultModal, setShowResultModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const share = useLineupShare({
    gameId,
    leagueSlug,
    leagueName,
    week: cardState === 'lineup' && !overviewAwaiting ? scheduledWeek : null,
  })

  const nextDate = useMemo(() => getNextMatchDate(weeks, leagueDayIndex), [weeks, leagueDayIndex])
  // Both halves of the week key come from the match date, so a January game
  // starts a new season instead of reusing last year's week numbers.
  const nextSeason = useMemo(() => seasonOfDate(nextDate), [nextDate])
  const nextWeekNum = useMemo(() => getNextWeekNumber(weeks, nextSeason), [weeks, nextSeason])

  // Every variant takes its first week from the server (getNextMatchSeed), so
  // the card is in the first paint and never re-reads weeks from the browser.
  useEffect(() => {
    if (initialScheduledWeek) {
      setScheduledWeek(initialScheduledWeek)
      setCardState(initialScheduledWeek.status === 'cancelled' ? 'cancelled' : 'lineup')
    } else {
      setCardState('idle')
    }
  }, [initialScheduledWeek])

  function startBuilding() {
    onBuildStart?.()
    setCardState('building')
  }

  function openCancel() {
    setError(null)
    setShowCancelModal(true)
  }

  function openResult() {
    setError(null)
    setShowResultModal(true)
  }

  async function handleSaveLineup() {
    const lineup = builder.toLineup()
    if (!lineup) {
      setError('No suggestion available')
      return
    }
    const { teamA, teamB, teamARating, teamBRating, lineupMetadata, lineupMetadataForDB } = lineup
    // When editing an existing scheduled week, use its season, week number and date
    const saveSeason = scheduledWeek?.season ?? nextSeason
    const saveWeek = scheduledWeek?.week ?? nextWeekNum
    const saveDate = scheduledWeek?.date ?? nextDate
    const format = builder.format
    setSaving(true)
    setError(null)
    try {
      const { weekId } = await saveLineup(gameId, {
        season: saveSeason,
        week: saveWeek,
        date: saveDate,
        format: format || null,
        teamA,
        teamB,
        lineupMetadata: lineupMetadataForDB,
        teamARating,
        teamBRating,
      })
      setScheduledWeek({ id: weekId, season: saveSeason, week: saveWeek, date: saveDate, format, teamA, teamB, status: 'scheduled', lineupMetadata, team_a_rating: teamARating, team_b_rating: teamBRating })
      setCardState('lineup')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save lineup')
    } finally {
      setSaving(false)
    }
  }

  function handleEditLineup() {
    if (!scheduledWeek) return
    builder.loadLineup(scheduledWeek)
    setCardState('building')
  }

  async function handleCancelGame() {
    const cancelSeason = scheduledWeek?.season ?? nextSeason
    const cancelWeekNumber = scheduledWeek?.week ?? nextWeekNum
    const cancelDate = scheduledWeek?.date ?? nextDate
    setSaving(true)
    setError(null)
    try {
      const { weekId } = await cancelWeek(gameId, { season: cancelSeason, week: cancelWeekNumber, date: cancelDate })
      setScheduledWeek({ id: weekId, season: cancelSeason, week: cancelWeekNumber, date: cancelDate, format: null, teamA: [], teamB: [], status: 'cancelled' })
      setShowCancelModal(false)
      setError(null)
      setCardState('cancelled')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel game')
    } finally {
      setSaving(false)
    }
  }

  async function handleReactivate() {
    if (!scheduledWeek) return
    setSaving(true)
    setError(null)
    try {
      await cancelLineup(gameId, scheduledWeek.id)
      setScheduledWeek(null)
      setCardState('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reactivate game')
    } finally {
      setSaving(false)
    }
  }

  const displayWeek = scheduledWeek?.week ?? nextWeekNum
  const displayDate = scheduledWeek?.date ?? nextDate
  const hasTeams = scheduledWeek !== null && scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0

  return (
    <>
      <div
        className={cn(
          'rounded-xl border border-[#223a5c] bg-[#0a1421] overflow-hidden shadow-[0_18px_44px_rgba(0,0,0,.42)]',
          // The Results lineup reads as an open match card.
          !isOverview && cardState === 'lineup' && 'border-[#2c4a72]',
          overviewAwaiting && 'border-[#2c4a72]'
        )}
      >

        {/* ── IDLE (Overview tab) ── */}
        {isOverview && cardState === 'idle' && (
          <NextGameIdle
            week={nextWeekNum}
            date={nextDate}
            kickoffTime={kickoffTime}
            canEdit={canEdit}
            onBuildTeams={startBuilding}
            onCancelGame={openCancel}
          />
        )}

        {/* ── IDLE ── */}
        {!isOverview && cardState === 'idle' && (
          canEdit ? (
            <div className="flex items-center justify-between gap-4 px-[18px] py-3">
              <WeekHeading week={nextWeekNum} date={nextDate} />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={startBuilding}
                  className="h-8 px-3.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold whitespace-nowrap transition-colors"
                >
                  Build Teams
                </button>
                <button
                  type="button"
                  onClick={openCancel}
                  className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="px-[18px] py-3">
              <WeekHeading week={nextWeekNum} date={nextDate} />
            </div>
          )
        )}

        {/* ── BUILDING ── */}
        {cardState === 'building' && (
          canEdit ? (
            <LineupBuilder
              builder={builder}
              allPlayers={allPlayers}
              week={displayWeek}
              date={displayDate}
              saving={saving}
              error={error}
              onClose={() => {
                setError(null)
                builder.reset()
                setCardState(scheduledWeek ? 'lineup' : 'idle')
              }}
              onCancel={() => setCardState(scheduledWeek ? 'lineup' : 'idle')}
              onConfirm={handleSaveLineup}
            />
          ) : (
            <div className="px-[18px] py-3">
              <p className="font-inter-body text-xs text-[#6f88a8]">Lineup not yet set.</p>
            </div>
          )
        )}

        {/* ── AWAITING RESULT (Overview tab) ── */}
        {overviewAwaiting && scheduledWeek && (
          <NextGameAwaiting
            week={displayWeek}
            teamA={scheduledWeek.teamA}
            teamB={scheduledWeek.teamB}
            kickoffTime={kickoffTime}
            canEdit={canEdit && hasTeams}
            onEditLineups={handleEditLineup}
            onResultGame={openResult}
          />
        )}

        {/* ── LINEUP (Overview tab) ── */}
        {isOverview && cardState === 'lineup' && !overviewAwaiting && scheduledWeek && (
          <NextGameLineup
            week={displayWeek}
            date={displayDate}
            format={scheduledWeek.format}
            teamA={scheduledWeek.teamA}
            teamB={scheduledWeek.teamB}
            linkedPlayerName={overview?.linkedPlayerName ?? null}
            location={overview?.location ?? null}
            kickoffTime={kickoffTime}
            canEdit={canEdit && hasTeams}
            onEditLineups={handleEditLineup}
            onResultGame={openResult}
            onShare={hasTeams ? share.share : undefined}
            copied={share.copied}
          />
        )}

        {/* ── LINEUP ── */}
        {!isOverview && cardState === 'lineup' && scheduledWeek && (
          <LineupCard
            week={scheduledWeek}
            allPlayers={allPlayers}
            kickoffTime={kickoffTime}
            canEdit={canEdit}
            linkedPlayerName={linkedPlayerName}
            copied={share.copied}
            onShare={share.share}
            onCancelGame={() => setShowCancelModal(true)}
            onEditLineup={handleEditLineup}
            onResultGame={openResult}
          />
        )}

        {/* ── CANCELLED ── */}
        {cardState === 'cancelled' && scheduledWeek && (
          <div className="flex items-center justify-between gap-4 px-[18px] py-3">
            <div className="flex items-center gap-3">
              <WeekHeading week={scheduledWeek.week} date={scheduledWeek.date} />
              <WinnerBadge winner={null} cancelled />
            </div>
            {canEdit && !isPastDeadline(scheduledWeek.date, kickoffTime) && (
              <button
                type="button"
                onClick={handleReactivate}
                disabled={saving}
                className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors disabled:opacity-50"
              >
                Reactivate
              </button>
            )}
          </div>
        )}
      </div>

      <CancelGameDialog
        open={showCancelModal}
        onOpenChange={(open) => { setShowCancelModal(open); if (!open) setError(null) }}
        week={displayWeek}
        date={displayDate}
        saving={saving}
        error={error}
        onConfirm={handleCancelGame}
      />

      {showResultModal && scheduledWeek && (
        <ResultModal
          scheduledWeek={scheduledWeek}
          lineupMetadata={scheduledWeek.lineupMetadata ?? null}
          allPlayers={allPlayers}
          gameId={gameId}
          leagueSlug={leagueSlug}
          leagueName={leagueName}
          weeks={weeks}
          onSaved={() => {
            setShowResultModal(false)
            builder.clearAddedPlayers()
            setScheduledWeek(null)
            setCardState('idle')
            onResultSaved()
          }}
          onClose={() => setShowResultModal(false)}
        />
      )}

    </>
  )
}

function WeekHeading({ week, date }: { week: number; date: string }) {
  return (
    <div>
      <p className="text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">Week {week}</p>
      <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">{date}</p>
    </div>
  )
}
