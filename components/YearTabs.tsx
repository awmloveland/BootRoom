'use client'

import { useState } from 'react'
import { cn, getSeasons, writeYearParam } from '@/lib/utils'
import type { Week } from '@/lib/types'

interface YearTabsProps {
  years: string[] // newest first
  selected: string
  onSelect: (year: string) => void
}

/** Second tab row on Results: one pill per season. Hidden when the league has a single season. */
export function YearTabs({ years, selected, onSelect }: YearTabsProps) {
  if (years.length <= 1) return null

  return (
    <div
      role="tablist"
      aria-label="Season"
      className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {years.map((year) => {
        const active = year === selected
        return (
          <button
            key={year}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) onSelect(year)
            }}
            className={cn(
              'h-8 shrink-0 rounded-full border px-4 font-plex text-[10px] font-bold uppercase tracking-[.14em] transition-colors',
              active
                ? 'border-[#38bdf8]/50 bg-[#38bdf8]/12 text-[#7dd3fc]'
                : 'border-[#1b2c46] bg-[#0a1421] text-[#8ba4c4] hover:border-[#2c4a72] hover:text-[#f4f9ff]'
            )}
          >
            {year}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Selected Results year, mirrored to `?year=`. While the viewer is on the
 * default (newest) season, `picked` stays null so a newer season arriving on
 * refresh becomes the view rather than leaving them on last year.
 */
export function useResultsYear(weeks: Week[], initialYear: string) {
  const seasons = getSeasons(weeks)
  const defaultYear = seasons[0] ?? initialYear
  const [picked, setPicked] = useState<string | null>(initialYear === defaultYear ? null : initialYear)
  const year = picked && seasons.includes(picked) ? picked : defaultYear

  function selectYear(next: string) {
    setPicked(next === defaultYear ? null : next)
    writeYearParam(next, defaultYear)
  }

  return { seasons, year, isDefaultYear: year === defaultYear, selectYear }
}
