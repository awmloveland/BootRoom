'use client'

import { Fragment, useState } from 'react'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { YearDivider } from '@/components/YearDivider'
import { QuarterCelebration } from '@/components/QuarterCelebration'
import { startsCelebratedQuarter, type ResultsCelebration } from '@/lib/sidebar-stats'
import { getLatestResultWeek, getMonthKey, formatMonthYear, getPlayedWeeks, sortWeeks } from '@/lib/utils'
import type { Week } from '@/lib/types'

interface PublicMatchListProps {
  weeks: Week[]
  celebration?: ResultsCelebration | null   // champion card, rendered above the first result of that quarter
  leagueName?: string                       // with leagueSlug, enables Share on the most recent result
  leagueSlug?: string
  season?: string                           // only render this season's weeks (Results year tabs)
}

export function PublicMatchList({ weeks, celebration = null, leagueName, leagueSlug, season }: PublicMatchListProps) {
  // Cards render for one season when the year tabs are in play; cards still get
  // the full history for share text.
  const visibleWeeks = season ? weeks.filter((w) => w.season === season) : weeks
  const mostRecent = sortWeeks(getPlayedWeeks(visibleWeeks))[0] ?? null
  // Share follows the same rule as WeekList (latest played or DNF week league-wide),
  // but only played cards offer it to guests; the DNF card is unchanged for now.
  const mostRecentResult = getLatestResultWeek(weeks)

  const [openWeek, setOpenWeek] = useState<number | null>(mostRecent?.week ?? null)

  if (visibleWeeks.length === 0) {
    return <p className="text-[#8ba4c4] text-sm">No match data available yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div id={`year-${visibleWeeks[0]?.season}`} />
      {visibleWeeks.map((week, index) => {
        const yearChanged =
          index > 0 && week.season !== visibleWeeks[index - 1].season
        const monthChanged =
          index > 0 &&
          getMonthKey(week.date) !== getMonthKey(visibleWeeks[index - 1].date)
        return (
          <Fragment key={week.id ?? `${week.season}-${week.week}`}>
            {celebration && startsCelebratedQuarter(visibleWeeks, index, celebration.quarter) && (
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
              leagueName={leagueName}
              leagueSlug={leagueSlug}
              weeks={weeks}
              isMostRecent={
                week.status === 'played' &&
                week.season === mostRecentResult?.season &&
                week.week === mostRecentResult?.week
              }
            />
          </Fragment>
        )
      })}
    </div>
  )
}
