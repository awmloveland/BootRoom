'use client'

import { Fragment, useState } from 'react'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { getPlayedWeeks, getMonthKey, formatMonthYear } from '@/lib/utils'
import type { Week } from '@/lib/types'

interface Props {
  weeks: Week[]
  goalkeepers?: string[]
}

export function WeekList({ weeks, goalkeepers }: Props) {
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = playedWeeks.length > 0
    ? playedWeeks.reduce((a, b) => (a.week > b.week ? a : b))
    : null
  const [openWeek, setOpenWeek] = useState<number | null>(mostRecent?.week ?? null)

  if (weeks.length === 0) {
    return <p className="text-slate-400 text-sm">No results yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {weeks.map((week, index) => {
        const monthChanged =
          index > 0 &&
          getMonthKey(week.date) !== getMonthKey(weeks[index - 1].date)
        return (
          <Fragment key={week.week}>
            {monthChanged && <MonthDivider label={formatMonthYear(week.date)} />}
            <MatchCard
              week={week}
              isOpen={openWeek === week.week}
              onToggle={() => setOpenWeek((prev) => (prev === week.week ? null : week.week))}
              goalkeepers={goalkeepers}
            />
          </Fragment>
        )
      })}
    </div>
  )
}
