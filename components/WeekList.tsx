'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { YearDivider } from '@/components/YearDivider'
import { NameGuestModal } from '@/components/NameGuestModal'
import { getMonthKey, formatMonthYear, sortWeeks } from '@/lib/utils'
import type { Mentality, Player, StrengthHint, Week } from '@/lib/types'

interface Props {
  weeks: Week[]
  goalkeepers?: string[]
  openWeek?: number | null
  onOpenWeekChange?: (week: number | null) => void
  isAdmin?: boolean
  gameId?: string
  leagueSlug?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
  leagueName?: string
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
}: Props) {
  const router = useRouter()
  const recentEligible = sortWeeks(weeks.filter((w) => w.status === 'played' || w.status === 'dnf'))
  const mostRecent = recentEligible[0] ?? null
  const [internalOpenWeek, setInternalOpenWeek] = useState<number | null>(mostRecent?.week ?? null)
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
    strengthHint: StrengthHint
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
        strengthHint: entry.strengthHint,
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

  if (weeks.length === 0) {
    return <p className="text-slate-400 text-sm">No results yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {weeks.map((week, index) => {
        const yearChanged = index > 0 && week.season !== weeks[index - 1].season
        const monthChanged =
          index > 0 && getMonthKey(week.date) !== getMonthKey(weeks[index - 1].date)
        return (
          <Fragment key={week.id ?? `${week.season}-${week.week}`}>
            {yearChanged && <YearDivider year={week.season} />}
            {monthChanged && !yearChanged && <MonthDivider label={formatMonthYear(week.date)} />}
            <MatchCard
              week={week}
              isOpen={openWeek === week.week}
              onToggle={() => handleToggle(week.week)}
              goalkeepers={goalkeepers}
              isAdmin={isAdmin}
              gameId={gameId}
              allPlayers={allPlayers}
              onResultSaved={onResultSaved}
              leagueName={week.week === mostRecent?.week ? leagueName : undefined}
              leagueSlug={week.week === mostRecent?.week ? leagueSlug : undefined}
              weeks={week.week === mostRecent?.week ? weeks : undefined}
              onNameGuest={handleNameGuestRequest}
            />
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
