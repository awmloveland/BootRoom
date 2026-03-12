'use client'

import { Fragment, useState } from 'react'
import { Week } from '@/lib/types'
import { sortWeeks, getPlayedWeeks, deriveSeason, getMonthKey, formatMonthYear } from '@/lib/utils'
import { Header } from '@/components/Header'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import bootRoomData from '@/data/boot_room.json'

export default function Home() {
  // Cast and filter: only played + cancelled (drop any future 'scheduled' weeks)
  const allWeeks = (bootRoomData.weeks as Week[]).filter(
    (w) => w.status === 'played' || w.status === 'cancelled'
  )

  const displayWeeks = sortWeeks(allWeeks)
  const playedWeeks = getPlayedWeeks(allWeeks)

  // Most recent played week (highest week number)
  const mostRecentPlayed =
    playedWeeks.length > 0
      ? playedWeeks.reduce((a, b) => (a.week > b.week ? a : b))
      : null

  const [openWeek, setOpenWeek] = useState<number | null>(
    mostRecentPlayed ? mostRecentPlayed.week : null
  )

  const totalWeeks = displayWeeks.length
  const season = deriveSeason(allWeeks)
  const SEASON_LENGTH = 52
  const pctComplete = Math.round((totalWeeks / SEASON_LENGTH) * 100)

  const handleToggle = (weekNum: number) => {
    setOpenWeek((prev) => (prev === weekNum ? null : weekNum))
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header />

      {/* Subtitle bar */}
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">Season {season}</span>
          <span className="text-xs text-slate-400">{totalWeeks} of {SEASON_LENGTH} Weeks ({pctComplete}% complete)</span>
        </div>
      </div>

      {/* Match list */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col gap-3">
          {displayWeeks.map((week, index) => {
            const monthChanged =
              index > 0 &&
              getMonthKey(week.date) !== getMonthKey(displayWeeks[index - 1].date)

            return (
              <Fragment key={week.week}>
                {monthChanged && <MonthDivider label={formatMonthYear(week.date)} />}
                <MatchCard
                  week={week}
                  isOpen={openWeek === week.week}
                  onToggle={() => handleToggle(week.week)}
                />
              </Fragment>
            )
          })}
        </div>
      </main>
    </div>
  )
}
