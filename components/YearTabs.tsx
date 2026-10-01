'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { cn, getSeasons, resolveSelectedYear, writeYearParam } from '@/lib/utils'
import type { Week } from '@/lib/types'

interface YearTabsProps {
  years: string[] // newest first
  selected: string
  onSelect: (year: string) => void
}

/** Pill recipe shared by the Results year tabs and the Records group pills. */
export function pillClassName(active: boolean): string {
  return cn(
    'h-8 shrink-0 rounded-full border px-4 font-plex text-[10px] font-bold uppercase tracking-[.14em] whitespace-nowrap transition-colors',
    active
      ? 'border-[#38bdf8]/50 bg-[#38bdf8]/12 text-[#7dd3fc]'
      : 'border-[#1b2c46] bg-[#0a1421] text-[#8ba4c4] hover:border-[#2c4a72] hover:text-[#f4f9ff]'
  )
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
            className={pillClassName(active)}
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
 *
 * The starting year comes from the URL, not a server-resolved prop. Our year
 * switches only call history.replaceState, so Next's cached RSC payload keeps
 * whatever year the server first rendered. Pressing Back restores that cached
 * payload without refetching, and a server prop would then disagree with the
 * URL. useSearchParams follows Next's canonical URL, replaceState updates
 * included. It is read only in the useState initialiser so our own later
 * replaceState calls don't fight the state.
 */
export function useResultsYear(weeks: Week[]) {
  const param = useSearchParams().get('year')
  const seasons = getSeasons(weeks)
  const defaultYear = resolveSelectedYear(seasons, null)
  const [picked, setPicked] = useState<string | null>(() => {
    const fromUrl = resolveSelectedYear(seasons, param)
    return fromUrl === defaultYear ? null : fromUrl
  })
  const year = picked && seasons.includes(picked) ? picked : defaultYear

  function selectYear(next: string) {
    setPicked(next === defaultYear ? null : next)
    writeYearParam(next, defaultYear)
  }

  return { seasons, year, isDefaultYear: year === defaultYear, selectYear }
}
