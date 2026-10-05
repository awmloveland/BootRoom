'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { YearDivider } from '@/components/YearDivider'
import { NameGuestModal } from '@/components/NameGuestModal'
import { QuarterCelebration } from '@/components/QuarterCelebration'
import { celebratedQuarterStartingAt, type ResultsCelebration } from '@/lib/sidebar-stats'
import { getLatestResultWeek, getMonthKey, formatMonthYear } from '@/lib/utils'
import type { Mentality, Player, Strength, Week } from '@/lib/types'

interface Props {
  weeks: Week[]
  goalkeepers?: string[]
  openWeek?: number | null           // controlled: if provided, overrides internal state
  onOpenWeekChange?: (week: number | null) => void  // controlled setter
  isAdmin?: boolean
  gameId?: string
  leagueSlug?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
  leagueName?: string
  celebration?: ResultsCelebration | null   // champion cards, each rendered above the first result of its quarter
  linkedPlayerName?: string | null          // viewer's linked player, for the YOU tag on played weeks
  season?: string                           // only render this season's weeks (Results year tabs)
}

interface NameGuestTarget {
  week: Week
  guestName: string
}

export function WeekList({
  weeks,
  goalkeepers,
  openWeek: controlledOpenWeek,
  onOpenWeekChange,
  isAdmin = false,
  gameId = '',
  leagueSlug,
  allPlayers = [],
  onResultSaved = () => {},
  leagueName,
  celebration = null,
  linkedPlayerName = null,
  season,
}: Props) {
  const router = useRouter()
  // Cards render for one season when the year tabs are in play; cards still get
  // the full history for share text and edit modals.
  const visibleWeeks = season ? weeks.filter((w) => w.season === season) : weeks
  const mostRecent = getLatestResultWeek(weeks)
  const [internalOpenWeek, setInternalOpenWeek] = useState<number | null>(
    getLatestResultWeek(visibleWeeks)?.week ?? null
  )
  const [nameGuestTarget, setNameGuestTarget] = useState<NameGuestTarget | null>(null)

  const isControlled = controlledOpenWeek !== undefined
  const openWeek = isControlled ? controlledOpenWeek : internalOpenWeek

  function handleToggle(weekNum: number) {
    const next = openWeek === weekNum ? null : weekNum
    if (isControlled) {
      onOpenWeekChange?.(next)
    } else {
      setInternalOpenWeek(next)
    }
  }

  function handleNameGuestRequest(week: Week, guestName: string) {
    if (!week.id) return
    setNameGuestTarget({ week, guestName })
  }

  async function handleNameGuestSubmit(entry: {
    newName: string
    mentality: Mentality
    strength: Strength
  }) {
    if (!nameGuestTarget || !nameGuestTarget.week.id) return
    const res = await fetch(`/api/league/${gameId}/guests/name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekId: nameGuestTarget.week.id,
        oldName: nameGuestTarget.guestName,
        newName: entry.newName,
        mentality: entry.mentality,
        strength: entry.strength,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) throw new Error('A player with this name already exists.')
      if (res.status === 404) throw new Error('This guest entry is no longer on the match.')
      throw new Error(body?.error ?? 'Failed to add player.')
    }
    setNameGuestTarget(null)
    onResultSaved()
    router.refresh()
  }

  const existingPlayers = allPlayers.map((p) => p.name)

  if (visibleWeeks.length === 0) {
    return <p className="text-[#8ba4c4] text-sm">No results yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {visibleWeeks.map((week, index) => {
        const yearChanged = index > 0 && week.season !== visibleWeeks[index - 1].season
        const monthChanged =
          index > 0 && getMonthKey(week.date) !== getMonthKey(visibleWeeks[index - 1].date)
        const celebratedQuarter = celebration
          ? celebratedQuarterStartingAt(visibleWeeks, index, celebration.quarters)
          : null
        return (
          <Fragment key={week.id ?? `${week.season}-${week.week}`}>
            {celebration && celebratedQuarter && (
              <QuarterCelebration
                quarter={celebratedQuarter}
                leagueName={celebration.leagueName}
                leagueSlug={celebration.leagueSlug}
                variant="card"
              />
            )}
            {yearChanged && <YearDivider year={week.season} />}
            {monthChanged && !yearChanged && <MonthDivider label={formatMonthYear(week.date)} />}
            {/* Anchor for …/results#week-<season>-<week> deep links. */}
            <div id={`week-${week.season}-${week.week}`} className="scroll-mt-4">
              <MatchCard
                week={week}
                isOpen={openWeek === week.week}
                onToggle={() => handleToggle(week.week)}
                goalkeepers={goalkeepers}
                isAdmin={isAdmin}
                gameId={gameId}
                allPlayers={allPlayers}
                onResultSaved={onResultSaved}
                leagueName={leagueName}
                leagueSlug={leagueSlug}
                weeks={weeks}
                isMostRecent={week.season === mostRecent?.season && week.week === mostRecent?.week}
                onNameGuest={handleNameGuestRequest}
                linkedPlayerName={linkedPlayerName}
              />
            </div>
          </Fragment>
        )
      })}

      {nameGuestTarget && (
        <NameGuestModal
          guestName={nameGuestTarget.guestName}
          existingPlayers={existingPlayers}
          onSubmit={handleNameGuestSubmit}
          onClose={() => setNameGuestTarget(null)}
        />
      )}
    </div>
  )
}
