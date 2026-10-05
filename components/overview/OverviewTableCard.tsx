import { cn } from '@/lib/utils'
import type { QuarterlyTableResult, QuarterStanding } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'
import { EmptyState, WIDGET_CLASS, WIDGET_TITLE_CLASS } from '@/components/StatsSidebar'
import {
  buildQuarterTableRows,
  ChampionBox,
  QuarterProgress,
  QuarterTableColumnLabels,
  QuarterTableRows,
} from '@/components/QuarterTable'

interface OverviewTableCardProps {
  table: QuarterlyTableResult
  /** The linked viewer's place in the table, or null for guests and unlinked viewers. */
  standing: QuarterStanding | null
  /** Most recent result, or null to leave the strip out (no results, or the tier cannot see match history). */
  lastResult: Week | null
}

type ResultKind = 'teamA' | 'teamB' | 'draw' | 'dnf'

const RESULT_STYLE: Record<ResultKind, { label: string; text: string; wash: string | null }> = {
  teamA: {
    label: 'Team A won',
    text: 'text-[#7dd3fc]',
    wash: 'bg-[linear-gradient(90deg,rgba(56,189,248,.12),transparent_55%)]',
  },
  teamB: {
    label: 'Team B won',
    text: 'text-[#c4b5fd]',
    wash: 'bg-[linear-gradient(90deg,rgba(167,139,250,.12),transparent_55%)]',
  },
  draw: { label: 'Drawn', text: 'text-[#8ba4c4]', wash: null },
  dnf: { label: 'Did not finish', text: 'text-[#8ba4c4]', wash: null },
}

function resultKind(week: Week): ResultKind | null {
  if (week.status === 'dnf') return 'dnf'
  return week.winner
}

function LastResultStrip({ week }: { week: Week }) {
  const kind = resultKind(week)
  if (!kind) return null
  const style = RESULT_STYLE[kind]
  const decided = kind === 'teamA' || kind === 'teamB'
  const margin = decided && week.goal_difference ? week.goal_difference : null

  return (
    <div className="relative border-b border-[#17263c] bg-[#0c1728]">
      {style.wash && <div aria-hidden className={cn('pointer-events-none absolute inset-0', style.wash)} />}
      <div className="relative flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className={WIDGET_TITLE_CLASS}>Last result · Week {week.week}</p>
          <p className={cn('mt-1.5 text-lg font-bold leading-none tracking-[-.025em]', style.text)}>
            {style.label}
          </p>
          <p className="mt-1.5 font-plex text-[9.5px] uppercase tracking-[.14em] text-[#8ba4c4]">
            {week.date}{week.format ? ` · ${week.format}` : ''}
          </p>
        </div>
        {margin !== null && (
          <div className="shrink-0 text-right">
            <p className="font-plex text-[28px] font-bold leading-none tracking-[-.04em] text-[#f4f9ff]">
              +{margin}
            </p>
            <p className="mt-1 font-plex text-[8px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">
              {margin === 1 ? 'Goal' : 'Goals'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Overview card 3: last result strip, quarterly league table, previous champion. */
export function OverviewTableCard({ table, standing, lastResult }: OverviewTableCardProps) {
  const rows = buildQuarterTableRows(table.entries, standing)
  const showProgress = table.entries.length > 0 && (table.gamesLeft > 0 || table.isHoldover)

  return (
    <div className={WIDGET_CLASS}>
      {lastResult && <LastResultStrip week={lastResult} />}

      <div className="flex items-center gap-1 border-b border-[#17263c] px-4 py-2 font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#4f688a]">
        <span className={cn(WIDGET_TITLE_CLASS, 'flex-1 min-w-0 truncate')}>
          League table · Q{table.displayQ} {table.displayYear}
        </span>
        <QuarterTableColumnLabels size="page" />
      </div>

      <div className="px-4 py-3">
        {rows.length === 0 ? (
          <EmptyState message={table.isHoldover ? 'No data yet' : 'Quarter just started'} />
        ) : (
          <QuarterTableRows rows={rows} highlightName={standing ? standing.entry.name : null} size="page" />
        )}

        {showProgress && <QuarterProgress gamesLeft={table.gamesLeft} gamesTotal={table.gamesTotal} />}

        {table.lastChampion && table.lastQ !== null && table.lastYear !== null && (
          <>
            <div className="h-px bg-[#17263c] mt-2.5 mb-3" />
            <ChampionBox
              label={`Q${table.lastQ} ${table.lastYear} Champion`}
              name={table.lastChampion}
              points={table.lastChampionPoints}
            />
          </>
        )}
      </div>
    </div>
  )
}
