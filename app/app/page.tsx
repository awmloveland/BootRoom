'use client'

import { Fragment, useEffect, useState } from 'react'
import { Week } from '@/lib/types'
import { sortWeeks, getPlayedWeeks, deriveSeason, getMonthKey, formatMonthYear } from '@/lib/utils'
import { fetchWeeks } from '@/lib/data'
import { Header } from '@/components/Header'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'

export default function AppHome() {
  const [weeks, setWeeks] = useState<Week[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openWeek, setOpenWeek] = useState<number | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchWeeks()
        const allWeeks = data
        const displayWeeks = sortWeeks(allWeeks)
        const playedWeeks = getPlayedWeeks(allWeeks)
        const mostRecentPlayed =
          playedWeeks.length > 0
            ? playedWeeks.reduce((a, b) => (a.week > b.week ? a : b))
            : null

        setWeeks(displayWeeks)
        setOpenWeek(mostRecentPlayed?.week ?? null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  const allWeeks = weeks
  const season = deriveSeason(allWeeks)
  const SEASON_LENGTH = 52
  const totalWeeks = weeks.length
  const pctComplete = Math.round((totalWeeks / SEASON_LENGTH) * 100)

  const handleToggle = (weekNum: number) => {
    setOpenWeek((prev) => (prev === weekNum ? null : weekNum))
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header />

      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <span className="text-xs text-slate-400">Season {season}</span>
          <span className="text-xs text-slate-400">
            {totalWeeks} of {SEASON_LENGTH} Weeks ({pctComplete}% complete)
          </span>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
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
