'use client'

import { Fragment } from 'react'
import { Week } from '@/lib/types'
import { getMonthKey, formatMonthYear } from '@/lib/utils'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'

const SEASON_LENGTH = 52

export interface BootRoomMatchHistoryProps {
  weeks: Week[]
  season: string
  openWeek: number | null
  onToggle: (weekNum: number) => void
}

/**
 * Original Phase 1 UI: subtitle bar + match cards.
 * Used for The Boot Room (boot_room.json) at /league/[legacy-id].
 */
export function BootRoomMatchHistory({
  weeks,
  season,
  openWeek,
  onToggle,
}: BootRoomMatchHistoryProps) {
  return (
    <>
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3">
          <h1 className="text-lg font-semibold text-slate-100 mb-1">The Boot Room</h1>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Season {season}</span>
            <span className="text-sm text-slate-400">
              {weeks.length} of {SEASON_LENGTH} Weeks
            </span>
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col gap-3">
          {weeks.map((week, index) => {
            const monthChanged =
              index > 0 && getMonthKey(week.date) !== getMonthKey(weeks[index - 1].date)
            return (
              <Fragment key={week.week}>
                {monthChanged && <MonthDivider label={formatMonthYear(week.date)} />}
                <MatchCard
                  week={week}
                  isOpen={openWeek === week.week}
                  onToggle={() => onToggle(week.week)}
                />
              </Fragment>
            )
          })}
        </div>
      </main>
    </>
  )
}
