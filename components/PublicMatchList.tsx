'use client'

import { Fragment, useState } from 'react'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { YearDivider } from '@/components/YearDivider'
import { QuarterCelebration } from '@/components/QuarterCelebration'
import { startsCelebratedQuarter, type ResultsCelebration } from '@/lib/sidebar-stats'
import { getMonthKey, formatMonthYear, getPlayedWeeks, sortWeeks } from '@/lib/utils'
import type { Week } from '@/lib/types'

interface PublicMatchListProps {
  weeks: Week[]
  celebration?: ResultsCelebration | null   // champion card, rendered above the first result of that quarter
}

export function PublicMatchList({ weeks, celebration = null }: PublicMatchListProps) {
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = sortWeeks(playedWeeks)[0] ?? null

  const [openWeek, setOpenWeek] = useState<number | null>(mostRecent?.week ?? null)

  if (weeks.length === 0) {
    return <p className="text-[#8ba4c4] text-sm">No match data available yet.</p>
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
            {celebration && startsCelebratedQuarter(weeks, index, celebration.quarter) && (
              <QuarterCelebration
                quarter={celebration.quarter}
                leagueName={celebration.leagueName}
                leagueSlug={celebration.leagueSlug}
                variant="card"
              />
            )}
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
