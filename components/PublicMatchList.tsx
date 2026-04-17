'use client'

import { Fragment, useState } from 'react'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { YearDivider } from '@/components/YearDivider'
import { getMonthKey, formatMonthYear, getPlayedWeeks } from '@/lib/utils'
import type { Week } from '@/lib/types'

interface PublicMatchListProps {
  weeks: Week[]
}

export function PublicMatchList({ weeks }: PublicMatchListProps) {
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = playedWeeks.length > 0
    ? playedWeeks.reduce((a, b) =>
        a.season > b.season || (a.season === b.season && a.week > b.week) ? a : b
      )
    : null

  const [openWeek, setOpenWeek] = useState<number | null>(mostRecent?.week ?? null)

  if (weeks.length === 0) {
    return <p className="text-slate-400 text-sm">No match data available yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div id={`year-${weeks[0]?.season}`} />
      {weeks.map((week, index) => {
        const yearChanged =
          index > 0 && week.season !== weeks[index - 1].season
        const monthChanged =
          index > 0 &&
          getMonthKey(week.date) !== getMonthKey(weeks[index - 1].date)
        return (
          <Fragment key={week.id ?? `${week.season}-${week.week}`}>
            {yearChanged && <YearDivider year={week.season} />}
            {monthChanged && !yearChanged && <MonthDivider label={formatMonthYear(week.date)} />}
            <MatchCard
              week={week}
              isOpen={openWeek === week.week}
              onToggle={() => setOpenWeek((prev) => (prev === week.week ? null : week.week))}
            />
          </Fragment>
        )
      })}
    </div>
  )
}
