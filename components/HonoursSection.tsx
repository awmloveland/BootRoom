'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompletedQuarter, HonoursYear } from '@/lib/sidebar-stats'

interface HonoursSectionProps {
  data: HonoursYear[]
}

function QuarterCard({
  quarter,
  isOpen,
  onToggle,
}: {
  quarter: CompletedQuarter
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        {/* Header — always visible */}
        <Collapsible.Trigger asChild>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 shrink-0">
              {quarter.quarterLabel}
            </span>
            <span className="text-sm font-bold text-amber-300 uppercase flex-1 truncate">
              {quarter.champion}
            </span>
            <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
            <ChevronDown
              className={cn(
                'h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </button>
        </Collapsible.Trigger>

        {/* Body — collapsible */}
        <Collapsible.Content>
          <div className="border-t border-slate-700/40 px-3 py-3">
            {/* Column headers */}
            <div className="flex items-center gap-1 pb-2 mb-1 border-b border-slate-700/40">
              <span className="flex-1 text-[10px] font-semibold uppercase text-slate-500">Player</span>
              <span className="w-[22px] text-center text-[10px] font-semibold uppercase text-slate-700">P</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">W</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">D</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">L</span>
              <span className="w-[28px] text-right text-[10px] font-semibold uppercase text-slate-500">Pts</span>
            </div>

            {/* Full standings table */}
            <div className="flex flex-col gap-[2px]">
              {quarter.entries.map((e, i) => (
                <div
                  key={e.name}
                  className={cn(
                    'flex items-center gap-1 py-[3px]',
                    i === 0 ? '-mx-3 px-3 bg-sky-400/[0.06]' : '-mx-1 px-1'
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
                  <span className="text-[11px] text-slate-600 w-[22px] text-center shrink-0">{e.played}</span>
                  <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">{e.won}</span>
                  <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">{e.drew}</span>
                  <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">{e.lost}</span>
                  <span className={cn(
                    'text-[12px] font-bold w-[28px] text-right shrink-0',
                    i === 0 ? 'text-sky-300' : 'text-slate-300'
                  )}>
                    {e.points}
                  </span>
                </div>
              ))}
            </div>

            {/* Champion banner */}
            <div className="border-t border-slate-700/40 mt-3 pt-3">
              <div className="flex items-center justify-between bg-amber-400/[0.07] border border-amber-400/[0.14] rounded-md px-[10px] py-[6px]">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-600">
                    {quarter.quarterLabel} Champion
                  </p>
                  <p className="text-[13px] font-bold text-yellow-200 uppercase">{quarter.champion}</p>
                </div>
                <Trophy className="h-5 w-5 text-amber-400" />
              </div>
            </div>
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
