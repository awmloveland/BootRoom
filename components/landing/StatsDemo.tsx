'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface DemoPlayer {
  name: string
  played: number
  role: string
  form: string
  winRate: number
}

const PLAYERS: DemoPlayer[] = [
  { name: 'Will Loveland', played: 42, role: 'KEEPER', form: 'WWDWL', winRate: 66.7 },
  { name: 'Rav Singh', played: 36, role: 'DEFENSIVE', form: 'WWWDL', winRate: 58.3 },
  { name: 'Alex Miller', played: 38, role: 'BALANCED', form: 'WLWWW', winRate: 57.9 },
  { name: 'Ellie Knight', played: 34, role: 'ATTACKING', form: 'WDWWW', winRate: 55.9 },
]

type SortKey = 'winRate' | 'played' | 'form' | 'az'

const SORT_CHIPS: { key: SortKey; label: string }[] = [
  { key: 'winRate', label: 'WIN %' },
  { key: 'played', label: 'CAPS' },
  { key: 'form', label: 'FORM' },
  { key: 'az', label: 'A–Z' },
]

const wins = (form: string) => form.split('').filter((c) => c === 'W').length

const SORTERS: Record<SortKey, (a: DemoPlayer, b: DemoPlayer) => number> = {
  winRate: (a, b) => b.winRate - a.winRate,
  played: (a, b) => b.played - a.played,
  form: (a, b) => wins(b.form) - wins(a.form),
  az: (a, b) => a.name.localeCompare(b.name),
}

const BAR_CLASS: Record<string, string> = {
  W: 'bg-[#38bdf8]',
  D: 'bg-[#3d5578]',
  L: 'bg-[#e2686f]',
}

export function StatsDemo() {
  const [sortBy, setSortBy] = useState<SortKey>('winRate')
  const sorted = [...PLAYERS].sort(SORTERS[sortBy])

  return (
    <section id="feature-stats" className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px]">
      <div className="grid lg:grid-cols-[.85fr_1.15fr] gap-10 lg:gap-14 items-center">
        <div>
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#38bdf8]">01 · TEAM &amp; PLAYER STATS</p>
          <h2 className="mt-3.5 text-4xl sm:text-[46px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
            Records that<br />settle it.
          </h2>
          <p className="mt-4 font-inter-body text-[15px] leading-[1.65] text-[#8ba4c4] text-pretty">
            Every appearance counted, every run of form kept. Sort it by whatever the argument is
            this week, then send the link and let the table talk.
          </p>
          <div className="flex flex-wrap gap-2 mt-6">
            {SORT_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={() => setSortBy(chip.key)}
                className={cn(
                  'font-plex text-[10px] font-bold tracking-[.12em] px-[13px] py-[9px] rounded border transition-colors cursor-pointer',
                  sortBy === chip.key
                    ? 'bg-[#38bdf8] border-[#38bdf8] text-[#05101d]'
                    : 'bg-transparent border-[#223a5c] text-[#8ba4c4]'
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-px bg-[#17263c] border border-[#17263c] rounded-xl overflow-hidden">
          <div className="grid grid-cols-[44px_1fr_86px_64px] sm:grid-cols-[44px_1fr_130px_96px] items-center gap-3.5 px-4 sm:px-[22px] py-3 bg-[#0c1728] font-plex text-[9px] font-semibold tracking-[.18em] text-[#6f88a8]">
            <span>#</span>
            <span>PLAYER</span>
            <span>LAST 5</span>
            <span className="text-right">WIN %</span>
          </div>
          {sorted.map((player, i) => (
            <div
              key={player.name}
              className="grid grid-cols-[44px_1fr_86px_64px] sm:grid-cols-[44px_1fr_130px_96px] items-center gap-3.5 px-4 sm:px-[22px] py-4 bg-[#0a1421]"
            >
              <span className={cn('font-plex text-[22px] font-bold', i === 0 ? 'text-[#38bdf8]' : 'text-[#3d5578]')}>
                {i + 1}
              </span>
              <span>
                <span className="block font-inter-body text-[15px] font-bold text-[#f4f9ff]">{player.name}</span>
                <span className="block mt-0.5 font-plex text-[9px] tracking-[.14em] text-[#6f88a8]">
                  {player.played} CAPS · {player.role}
                </span>
              </span>
              <span className="flex gap-1">
                {player.form.split('').map((ch, j) => (
                  <span key={j} className={cn('w-3 sm:w-[18px] h-2 rounded-sm', BAR_CLASS[ch])} />
                ))}
              </span>
              <span
                className={cn(
                  'text-right font-plex text-lg sm:text-2xl font-bold tracking-[-.03em]',
                  i === 0 ? 'text-[#38bdf8]' : 'text-[#eaf2ff]'
                )}
              >
                {player.winRate.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
