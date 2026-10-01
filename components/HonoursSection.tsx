'use client'

import { useEffect, useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { cn, buildQuarterShareText, shareOrCopy, formatGoalDiff } from '@/lib/utils'
import type { QuarterSummary, HonoursYear, QuarterlyTableResult, QuarterStanding } from '@/lib/sidebar-stats'
import {
  buildQuarterTableRows,
  QuarterProgress,
  QuarterTableColumnLabels,
  QuarterTableRows,
} from '@/components/QuarterTable'

interface HonoursSectionProps {
  data: HonoursYear[]
  leagueName: string
  leagueSlug: string
  /** The sidebar's quarterly table, shown on the in-progress quarter card. */
  liveTable?: QuarterlyTableResult | null
  /** The linked viewer's place in the live table, or null for unlinked viewers. */
  standing?: QuarterStanding | null
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
      'w-[42px] h-[42px] rounded-full border flex items-center justify-center font-plex text-xs font-bold shrink-0',
      status === 'completed' && 'bg-[#0c1728] border-[#223a5c] text-[#8ba4c4]',
      status === 'in_progress' && 'bg-[#38bdf8]/12 border-[#38bdf8]/50 text-[#7dd3fc]',
      status === 'upcoming' && 'bg-[#0c1728] border-dashed border-[#223a5c] text-[#4f688a]',
    )}>
      Q{q}
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: QuarterSummary['status'] }) {
  const base = 'inline-flex items-center gap-1.5 font-plex text-[9px] font-bold uppercase tracking-[.14em] rounded border px-2.5 py-[5px] whitespace-nowrap shrink-0'
  if (status === 'completed') {
    return (
      <span className={cn(base, 'border-[#223a5c] text-[#8ba4c4]')}>
        Completed
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span className={cn(base, 'bg-[#38bdf8]/12 border-[#38bdf8]/40 text-[#7dd3fc]')}>
        <span className="w-1.5 h-1.5 rounded-full bg-[#38bdf8] shrink-0 animate-cf-pulse motion-reduce:animate-none" />
        In progress
      </span>
    )
  }
  return (
    <span className={cn(base, 'border-dashed border-[#223a5c] text-[#4f688a]')}>
      Upcoming
    </span>
  )
}

// ── Quarter card body (completed only) ────────────────────────────────────────

function CompletedCardBody({
  quarter,
  leagueName,
  leagueSlug,
}: {
  quarter: QuarterSummary
  leagueName: string
  leagueSlug: string
}) {
  const [showAll, setShowAll] = useState(false)
  const [copied, setCopied] = useState(false)
  const entries = quarter.entries ?? []
  const visibleEntries = showAll ? entries : entries.slice(0, PAGE_SIZE)
  const overflowCount = Math.max(0, entries.length - PAGE_SIZE)

  async function handleShare() {
    const text = buildQuarterShareText({ leagueName, leagueSlug, quarter })
    const result = await shareOrCopy(text)
    if (result === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
      {quarter.awards && quarter.awards.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-[#1b2c46] px-3.5 py-3 scrollbar-hide">
          {quarter.awards.map(award => (
            <div
              key={award.key}
              className="flex-shrink-0 flex flex-col gap-1 min-w-[124px] rounded-lg border border-[#1b2c46] bg-[#0c1728] px-3 py-2.5"
            >
              <span className="font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#a78bfa]">
                {award.nickname}
              </span>
              <span className="font-inter-body text-xs font-bold text-[#f4f9ff]">{award.player}</span>
              <span className="font-plex text-[9px] uppercase tracking-[.08em] text-[#6f88a8]">{award.stat}</span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-[#1b2c46] px-4 py-3">
        <div className="flex items-center gap-1 pb-2 mb-1 border-b border-[#17263c] font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#4f688a]">
          <span className="flex-1">Player</span>
          <span className="w-6 text-center">P</span>
          <span className="w-5 text-center">W</span>
          <span className="w-5 text-center">D</span>
          <span className="w-5 text-center">L</span>
          <span className="w-7 text-center">GD</span>
          <span className="w-[30px] text-right text-[#6f88a8]">Pts</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {visibleEntries.map((e, i) => (
            <div
              key={e.name}
              className={cn(
                'flex items-center gap-1 p-1 -mx-1 rounded',
                i === 0 && 'bg-[#38bdf8]/7'
              )}
            >
              <span className={cn(
                'font-plex text-[10px] font-bold w-4 text-left shrink-0',
                i === 0 ? 'text-[#38bdf8]' : 'text-[#4f688a]'
              )}>
                {i + 1}
              </span>
              <span className={cn(
                'font-inter-body text-[13px] flex-1 truncate',
                i === 0 ? 'font-bold text-[#f4f9ff]' : 'font-medium text-[#8ba4c4]'
              )}>
                {e.name}
              </span>
              <span className="font-plex text-[11px] text-[#6f88a8] w-6 text-center shrink-0">{e.played}</span>
              <span className="font-plex text-[11px] text-[#6f88a8] w-5 text-center shrink-0">{e.won}</span>
              <span className="font-plex text-[11px] text-[#6f88a8] w-5 text-center shrink-0">{e.drew}</span>
              <span className="font-plex text-[11px] text-[#6f88a8] w-5 text-center shrink-0">{e.lost}</span>
              <span className="font-plex text-[11px] text-[#6f88a8] w-7 text-center shrink-0">{formatGoalDiff(e.goalDiff)}</span>
              <span className={cn(
                'font-plex text-[13px] font-bold w-[30px] text-right shrink-0',
                i === 0 ? 'text-[#38bdf8]' : 'text-[#dff1ff]'
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
              className="h-7 px-3 rounded border border-[#223a5c] font-plex text-[9.5px] font-bold uppercase tracking-[.12em] text-[#8ba4c4] hover:border-[#38bdf8] hover:text-white transition-colors"
            >
              {showAll ? 'See Less' : `See All (${entries.length})`}
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-[#1b2c46] px-4 py-3.5">
        <button
          type="button"
          onClick={handleShare}
          className="w-full h-[38px] rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-[13px] font-bold transition-colors"
        >
          {copied ? 'Copied. Go and brag' : 'Share the glory'}
        </button>
      </div>
    </Collapsible.Content>
  )
}

// ── Quarter card body (in progress only) ──────────────────────────────────────

function LiveCardBody({
  table,
  standing,
}: {
  table: QuarterlyTableResult | null
  standing: QuarterStanding | null
}) {
  if (!table || table.entries.length === 0) {
    return (
      <div className="border-t border-dashed border-[#223a5c] px-4 py-2.5 flex items-center gap-3">
        <div className="w-[3px] h-[26px] rounded-sm bg-[#38bdf8] opacity-50 shrink-0" />
        <p className="font-inter-body text-xs leading-normal text-[#6f88a8]">
          The live table will appear here once the first game is played
        </p>
      </div>
    )
  }

  return (
    <div className="border-t border-[#1b2c46] px-4 py-3">
      <div className="flex items-center gap-1 pb-2 mb-1 border-b border-[#17263c] font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#4f688a]">
        <span className="flex-1">Player</span>
        <QuarterTableColumnLabels />
      </div>
      <QuarterTableRows
        rows={buildQuarterTableRows(table.entries, standing)}
        highlightName={standing ? standing.entry.name : null}
        size="page"
      />
      {table.gamesLeft > 0 && <QuarterProgress gamesLeft={table.gamesLeft} gamesTotal={table.gamesTotal} />}
    </div>
  )
}

// ── Quarter card ──────────────────────────────────────────────────────────────

function QuarterCard({
  quarter,
  anchorId,
  isOpen,
  onToggle,
  leagueName,
  leagueSlug,
  liveTable,
  standing,
}: {
  quarter: QuarterSummary
  anchorId: string
  isOpen: boolean
  onToggle: () => void
  leagueName: string
  leagueSlug: string
  liveTable: QuarterlyTableResult | null
  standing: QuarterStanding | null
}) {
  const { status, q, seasonName, champion } = quarter
  const subtitle = quarterSubtitle(quarter)

  if (status === 'upcoming') {
    return (
      <div id={anchorId} className="rounded-xl border border-dashed border-[#1b2c46] bg-[#060b14] opacity-55">
        <div className="w-full flex items-center gap-3 px-4 py-3">
          <QAvatar q={q} status={status} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold tracking-[-.01em] text-[#8ba4c4]">{seasonName} quarter</p>
            <p className="mt-[3px] font-plex text-[9px] uppercase tracking-[.12em] text-[#6f88a8] truncate">{subtitle}</p>
          </div>
          <StatusPill status={status} />
        </div>
      </div>
    )
  }

  if (status === 'in_progress') {
    // During holdover the sidebar table shows last quarter, so only use it when
    // it is this quarter's.
    const table = liveTable && !liveTable.isHoldover
      && liveTable.displayQ === q && liveTable.displayYear === quarter.year
      ? liveTable
      : null
    return (
      <div id={anchorId} className="rounded-xl border border-[#38bdf8]/35 bg-[#0a1421] shadow-[0_18px_44px_rgba(0,0,0,.42)]">
        <div className="w-full flex items-center gap-3 px-4 py-3">
          <QAvatar q={q} status={status} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">{seasonName} quarter</p>
            <p className="mt-[3px] font-plex text-[9px] uppercase tracking-[.12em] text-[#6f88a8] truncate">{subtitle}</p>
          </div>
          <StatusPill status={status} />
        </div>
        <LiveCardBody table={table} standing={standing} />
      </div>
    )
  }

  // Completed — collapsible
  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
      <div id={anchorId} className={cn(
        'rounded-xl border bg-[#0a1421] transition-colors duration-150 scroll-mt-4',
        isOpen
          ? 'border-[#2c4a72] shadow-[0_18px_44px_rgba(0,0,0,.42)]'
          : 'border-[#1b2c46] hover:border-[#2c4a72]'
      )}>
        <Collapsible.Trigger asChild>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] cursor-pointer">
            <QAvatar q={q} status={status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">{seasonName} quarter</p>
              <p className="mt-[3px] font-plex text-[9px] uppercase tracking-[.12em] text-[#6f88a8] truncate">{subtitle}</p>
            </div>
            <StatusPill status={status} />
            <ChevronDown className={cn(
              'h-[15px] w-[15px] text-[#6f88a8] shrink-0 transition-transform duration-200',
              isOpen && 'rotate-180'
            )} />
          </button>
        </Collapsible.Trigger>
        <CompletedCardBody quarter={quarter} leagueName={leagueName} leagueSlug={leagueSlug} />
      </div>
    </Collapsible.Root>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export function HonoursSection({ data, leagueName, leagueSlug, liveTable = null, standing = null }: HonoursSectionProps) {
  const [openKey, setOpenKey] = useState<string | null>(() => {
    for (const yearGroup of data) {
      for (const q of yearGroup.quarters) {
        if (q.status === 'completed') return `${q.year}-${q.q}`
      }
    }
    return null
  })

  // Deep-link: a shared quarter link (…/honours#q-<year>-<q>) opens that
  // quarter card expanded and scrolls it into view on load.
  useEffect(() => {
    const match = window.location.hash.replace(/^#/, '').match(/^q-(\d+)-(\d+)$/)
    if (!match) return
    const key = `${match[1]}-${match[2]}`
    const exists = data.some((yearGroup) =>
      yearGroup.quarters.some((q) => `${q.year}-${q.q}` === key)
    )
    if (!exists) return
    setOpenKey(key)
    // Wait a frame so the card is rendered/expanded before scrolling to it.
    requestAnimationFrame(() => {
      document.getElementById(`q-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [data])

  if (data.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-inter-body text-[13px] text-[#6f88a8]">No quarters to display yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {data.map((yearGroup) => (
        <div key={yearGroup.year} className="first:mt-0 mt-[26px]">
          {/* Year header */}
          <div className="flex items-baseline justify-between px-1 mb-2.5">
            <span className="text-[17px] font-bold tracking-[-.02em] text-[#f4f9ff]">
              {yearGroup.year} Season
            </span>
            <span className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">
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
                  anchorId={`q-${key}`}
                  isOpen={openKey === key}
                  onToggle={() => setOpenKey(openKey === key ? null : key)}
                  leagueName={leagueName}
                  leagueSlug={leagueSlug}
                  liveTable={liveTable}
                  standing={standing}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
