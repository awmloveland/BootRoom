'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuarterSummary, HonoursYear } from '@/lib/sidebar-stats'

interface HonoursSectionProps {
  data: HonoursYear[]
}

const PAGE_SIZE = 10

// ── Subtitle text ─────────────────────────────────────────────────────────────

function quarterSubtitle(quarter: QuarterSummary): string {
  const { weekRange, dateRange } = quarter
  if (!weekRange) {
    // Upcoming with no game data — show "Apr – Jun 2026" from the dateRange strings
    const [, fromMonth] = dateRange.from.split(' ')
    const [, toMonth, year] = dateRange.to.split(' ')
    return fromMonth === toMonth
      ? `${fromMonth} ${year}`
      : `${fromMonth} – ${toMonth} ${year}`
  }
  const weekLabel = weekRange.from === weekRange.to
    ? `Week ${weekRange.from}`
    : `Weeks ${weekRange.from}–${weekRange.to}`
  return `${weekLabel} · ${dateRange.from} – ${dateRange.to}`
}

// ── Q avatar ──────────────────────────────────────────────────────────────────

function QAvatar({ q, status }: { q: number; status: QuarterSummary['status'] }) {
  return (
    <div className={cn(
      'w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0',
      status === 'completed' && 'bg-slate-800 border-2 border-slate-700 text-slate-400',
      status === 'in_progress' && 'bg-blue-900 border-2 border-blue-700 text-blue-300',
      status === 'upcoming' && 'border-2 border-dashed border-slate-600 text-slate-600',
    )}>
      Q{q}
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: QuarterSummary['status'] }) {
  if (status === 'completed') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 bg-slate-700/50 text-slate-300 border border-slate-600 shrink-0">
        Completed
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 bg-blue-900/50 text-blue-300 border border-blue-700 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
        In progress
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 text-slate-600 border border-dashed border-slate-600 shrink-0">
      Upcoming
    </span>
  )
}

// ── Quarter card body (completed only) ────────────────────────────────────────

function CompletedCardBody({ quarter }: { quarter: QuarterSummary }) {
  const [showAll, setShowAll] = useState(false)
  const entries = quarter.entries ?? []
  const visibleEntries = showAll ? entries : entries.slice(0, PAGE_SIZE)
  const overflowCount = Math.max(0, entries.length - PAGE_SIZE)

  return (
    <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
      {quarter.awards && quarter.awards.length > 0 && (
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
        <div className="flex items-center gap-1 pb-2 mb-1 border-b border-slate-700/40">
          <span className="flex-1 text-[10px] font-semibold uppercase text-slate-500">Player</span>
          <span className="w-[22px] text-center text-[10px] font-semibold uppercase text-slate-700">P</span>
          <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">W</span>
          <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">D</span>
          <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">L</span>
          <span className="w-[28px] text-right text-[10px] font-semibold uppercase text-slate-500">Pts</span>
        </div>
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
        {overflowCount > 0 && (
          <div className="mt-3 flex justify-center">
            <button
              onClick={(e) => { e.stopPropagation(); setShowAll(v => !v) }}
              className="text-xs font-medium text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600 rounded px-3 py-1 transition-colors"
            >
              {showAll ? 'See Less' : `See All (${entries.length})`}
            </button>
          </div>
        )}
      </div>
    </Collapsible.Content>
  )
}

// ── Quarter card ──────────────────────────────────────────────────────────────

function QuarterCard({
  quarter,
  isOpen,
  onToggle,
}: {
  quarter: QuarterSummary
  isOpen: boolean
  onToggle: () => void
}) {
  const { status, q, seasonName, champion } = quarter
  const subtitle = quarterSubtitle(quarter)

  if (status === 'upcoming') {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800 opacity-60">
        <div className="w-full flex items-center gap-3 px-4 py-3">
          <QAvatar q={q} status={status} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-500 leading-snug">{seasonName} quarter</p>
            <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>
          </div>
          <StatusPill status={status} />
        </div>
      </div>
    )
  }

  if (status === 'in_progress') {
    return (
      <div className="rounded-lg border border-blue-900 bg-slate-800">
        <div className="w-full flex items-center gap-3 px-4 py-3">
          <QAvatar q={q} status={status} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-100 leading-snug">{seasonName} quarter</p>
            <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <StatusPill status={status} />
        </div>
        <div className="border-t border-dashed border-blue-900 px-4 py-2.5 flex items-center gap-3">
          <div className="w-[3px] h-7 rounded bg-blue-700 opacity-50 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Quarter in progress — final standings will appear here once all games are recorded
          </p>
        </div>
      </div>
    )
  }

  // Completed — collapsible
  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
      <div className={cn(
        'rounded-lg border bg-slate-800 transition-colors duration-150',
        isOpen ? 'border-slate-600' : 'border-slate-700 hover:border-slate-500'
      )}>
        <Collapsible.Trigger asChild>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer">
            <QAvatar q={q} status={status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-100 leading-snug">{seasonName} quarter</p>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
            <StatusPill status={status} />
            <ChevronDown className={cn(
              'h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200',
              isOpen && 'rotate-180'
            )} />
          </button>
        </Collapsible.Trigger>
        <CompletedCardBody quarter={quarter} />
      </div>
    </Collapsible.Root>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export function HonoursSection({ data }: HonoursSectionProps) {
  const [openKey, setOpenKey] = useState<string | null>(() => {
    for (const yearGroup of data) {
      for (const q of yearGroup.quarters) {
        if (q.status === 'completed') return `${q.year}-${q.q}`
      }
    }
    return null
  })

  if (data.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">No quarters to display yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {data.map((yearGroup) => (
        <div key={yearGroup.year} className="first:mt-0 mt-6">
          {/* Year header */}
          <div className="flex items-baseline justify-between px-1 mb-3">
            <span className="text-[16px] font-bold text-slate-100">
              {yearGroup.year} Season
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {yearGroup.completedCount} of 4 complete
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {yearGroup.quarters.map((quarter) => {
              const key = `${quarter.year}-${quarter.q}`
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
