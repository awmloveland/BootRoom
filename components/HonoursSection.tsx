'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompletedQuarter, HonoursYear } from '@/lib/sidebar-stats'

interface HonoursSectionProps {
  data: HonoursYear[]
}

const PAGE_SIZE = 10

function QuarterCard({
  quarter,
  isOpen,
  onToggle,
}: {
  quarter: CompletedQuarter
  isOpen: boolean
  onToggle: () => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visibleEntries = showAll ? quarter.entries : quarter.entries.slice(0, PAGE_SIZE)
  const hiddenCount = quarter.entries.length - PAGE_SIZE

  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
      <div className={cn(
        'rounded-lg border bg-slate-800 transition-colors duration-150',
        isOpen ? 'border-slate-600' : 'border-slate-700 hover:border-slate-500'
      )}>
        {/* Header — always visible */}
        <Collapsible.Trigger asChild>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer">
            <p className="text-sm font-semibold text-slate-100 flex-1">{quarter.quarterLabel}</p>
            <span className="flex items-center gap-1.5 text-xs font-semibold rounded px-2 py-0.5 bg-amber-400/10 text-amber-300 border border-amber-400/20 shrink-0">
              <Trophy className="h-3 w-3" />
              {quarter.champion}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </button>
        </Collapsible.Trigger>

        {/* Body — collapsible */}
        <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          {/* Awards row — shown above the table when the card is open */}
          {quarter.awards.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-t border-slate-700 px-3 py-2.5 scrollbar-hide">
              {quarter.awards.map(award => (
                <div
                  key={award.key}
                  className="flex-shrink-0 flex flex-col gap-0.5 bg-slate-700/50 border border-slate-600 rounded-lg px-2.5 py-2 min-w-[108px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{award.icon}</span>
                    <span className="text-[10px] font-bold tracking-wide uppercase text-indigo-400">
                      {award.nickname}
                    </span>
                  </div>
                  <span className="text-xs font-semibold text-slate-100">{award.player}</span>
                  <span className="text-[10px] text-slate-500">{award.stat}</span>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-slate-700 px-4 py-3">
            {/* Column headers */}
            <div className="flex items-center gap-1 pb-2 mb-1 border-b border-slate-700/40">
              <span className="flex-1 text-[10px] font-semibold uppercase text-slate-500">Player</span>
              <span className="w-[22px] text-center text-[10px] font-semibold uppercase text-slate-700">P</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">W</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">D</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">L</span>
              <span className="w-[28px] text-right text-[10px] font-semibold uppercase text-slate-500">Pts</span>
            </div>

            {/* Standings table */}
            <div className="flex flex-col gap-[2px]">
              {visibleEntries.map((e, i) => (
                <div
                  key={e.name}
                  className={cn(
                    'flex items-center gap-1 py-[3px]',
                    i === 0 ? '-mx-4 px-4 bg-sky-400/[0.06]' : '-mx-1 px-1'
                  )}
                >
                  <span className={cn(
                    'text-[11px] w-[14px] text-left shrink-0',
                    i === 0 ? 'font-bold text-sky-400' : 'text-slate-600'
                  )}>
                    {i + 1}
                  </span>
                  <span className={cn(
                    'text-[13px] flex-1 truncate',
                    i === 0 ? 'font-semibold text-slate-100' : 'text-slate-400'
                  )}>
                    {e.name}
                  </span>
                  <span className="text-xs text-slate-400 w-[22px] text-center shrink-0">{e.played}</span>
                  <span className="text-xs text-slate-400 w-[18px] text-center shrink-0">{e.won}</span>
                  <span className="text-xs text-slate-400 w-[18px] text-center shrink-0">{e.drew}</span>
                  <span className="text-xs text-slate-400 w-[18px] text-center shrink-0">{e.lost}</span>
                  <span className={cn(
                    'text-sm font-bold w-[28px] text-right shrink-0',
                    i === 0 ? 'text-sky-300' : 'text-slate-200'
                  )}>
                    {e.points}
                  </span>
                </div>
              ))}
            </div>

            {/* See more / See less */}
            {hiddenCount > 0 && (
              <div className="mt-3 flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAll(v => !v) }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600 rounded px-3 py-1 transition-colors"
                >
                  {showAll ? 'See Less' : `See All (${quarter.entries.length})`}
                </button>
              </div>
            )}
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}

export function HonoursSection({ data }: HonoursSectionProps) {
  // Build a flat key for each quarter to track which is open.
  // Default: open the very first quarter (most recent overall).
  const firstKey = data.length > 0 && data[0].quarters.length > 0
    ? `${data[0].year}-${data[0].quarters[0].q}`
    : null
  const [openKey, setOpenKey] = useState<string | null>(firstKey)

  if (data.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">No completed quarters yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {data.map((yearGroup) => (
        <div key={yearGroup.year} className="first:mt-0 mt-4">
          {/* Year divider — same style as MonthDivider */}
          <div className="flex items-center gap-3 px-1 py-1 mb-2">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-xs font-medium tracking-wider text-slate-600 uppercase">
              {yearGroup.year}
            </span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          <div className="flex flex-col gap-2">
            {yearGroup.quarters.map((quarter) => {
              const key = `${yearGroup.year}-${quarter.q}`
              return (
                <QuarterCard
                  key={key}
                  quarter={quarter}
                  isOpen={openKey === key}
                  onToggle={() => setOpenKey(openKey === key ? null : key)}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
