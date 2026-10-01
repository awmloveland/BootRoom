import { Fragment } from 'react'
import { Trophy } from 'lucide-react'
import { cn, formatGoalDiff } from '@/lib/utils'
import type { QuarterlyEntry, QuarterStanding } from '@/lib/sidebar-stats'

/** 'sidebar' is the 288px stats sidebar; 'page' is the Overview tab content column. */
export type WidgetSize = 'sidebar' | 'page'

const NUM_CLASS = 'font-plex text-[10.5px] text-[#4f688a] text-center shrink-0'

/**
 * The P / W / D / L / GD / Pts labels. Render inside a flex header row that sets
 * the font and uses gap-1, the same gap as the rows, so the columns line up.
 */
export function QuarterTableColumnLabels() {
  return (
    <>
      <span className="w-[22px] text-center">P</span>
      <span className="w-[18px] text-center">W</span>
      <span className="w-[18px] text-center">D</span>
      <span className="w-[18px] text-center">L</span>
      <span className="w-[26px] text-center">GD</span>
      <span className="w-[26px] text-right text-[#6f88a8]">Pts</span>
    </>
  )
}

export interface QuarterTableRow {
  entry: QuarterlyEntry
  rank: number
}

/**
 * Ranked rows for the top-of-table slice. A viewer ranked below the cut still
 * gets their row appended, with its true rank.
 */
export function buildQuarterTableRows(entries: QuarterlyEntry[], standing: QuarterStanding | null): QuarterTableRow[] {
  const rows: QuarterTableRow[] = entries.map((entry, i) => ({ entry, rank: i + 1 }))
  if (standing && standing.rank > entries.length) {
    rows.push({ entry: standing.entry, rank: standing.rank })
  }
  return rows
}

interface QuarterTableRowsProps {
  rows: QuarterTableRow[]
  /** Name of the row to highlight, or null for none. */
  highlightName: string | null
  /** 'page' adds the YOU tag to the highlighted row. */
  size?: WidgetSize
}

export function QuarterTableRows({ rows, highlightName, size = 'sidebar' }: QuarterTableRowsProps) {
  const page = size === 'page'
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map(({ entry: e, rank }, i) => {
        const on = e.name === highlightName
        // A skip in rank (the viewer's row below the top 10) gets a divider above it.
        const gap = i > 0 && rank !== rows[i - 1].rank + 1
        return (
          <Fragment key={e.name}>
            {gap && <div aria-hidden className="my-1.5 border-t border-dashed border-[#223a5c]" />}
            <div
              className={cn(
                'flex items-center gap-1 px-1 -mx-1 rounded',
                page ? 'py-1' : 'py-[3px]',
                on && (page ? 'bg-[#38bdf8]/10' : 'bg-[#38bdf8]/7')
              )}
            >
              <span className={cn(
                'font-plex text-[10px] font-bold w-3.5 text-left shrink-0',
                on ? 'text-[#38bdf8]' : 'text-[#4f688a]'
              )}>
                {rank}
              </span>
              <span className={cn(
                'font-inter-body text-[12.5px] flex-1 truncate',
                on ? 'font-bold text-[#f4f9ff]' : 'font-medium text-[#8ba4c4]'
              )}>
                {e.name}
              </span>
              {on && page && (
                <span className="font-plex text-[7.5px] font-bold uppercase tracking-[.14em] px-[5px] py-0.5 mr-1 rounded-[3px] bg-[#38bdf8] text-[#05101d] shrink-0">
                  You
                </span>
              )}
              <span className={cn(NUM_CLASS, 'w-[22px]')}>{e.played}</span>
              <span className={cn(NUM_CLASS, 'w-[18px]')}>{e.won}</span>
              <span className={cn(NUM_CLASS, 'w-[18px]')}>{e.drew}</span>
              <span className={cn(NUM_CLASS, 'w-[18px]')}>{e.lost}</span>
              <span className={cn(NUM_CLASS, 'w-[26px]')}>{formatGoalDiff(e.goalDiff)}</span>
              <span className={cn(
                'font-plex text-xs font-bold w-[26px] text-right shrink-0',
                on ? 'text-[#38bdf8]' : 'text-[#dff1ff]'
              )}>
                {e.points}
              </span>
            </div>
          </Fragment>
        )
      })}
    </div>
  )
}

/** "1 of 13 played" on the left; games left, or Final once the quarter is complete. */
export function QuarterProgress({ gamesLeft, gamesTotal }: { gamesLeft: number; gamesTotal: number }) {
  return (
    <div className="flex items-center justify-between gap-2 mt-2.5 pt-[9px] border-t border-[#17263c] font-plex text-[8.5px] uppercase tracking-[.14em] text-[#6f88a8]">
      <span>{gamesTotal - gamesLeft} of {gamesTotal} played</span>
      <span className="font-bold text-[#8ba4c4]">
        {gamesLeft > 0 ? `${gamesLeft} ${gamesLeft === 1 ? 'game' : 'games'} left` : 'Final'}
      </span>
    </div>
  )
}

/** Lime box naming the previous quarter's champion. */
export function ChampionBox({ label, name, points }: { label: string; name: string; points?: number | null }) {
  return (
    <div className="flex items-center justify-between gap-2.5 bg-[#bef264]/7 border border-[#bef264]/30 rounded-lg px-3 py-[9px]">
      <div>
        <p className="font-plex text-[8.5px] font-bold uppercase tracking-[.18em] text-[#bef264]">
          {label}
        </p>
        <p className="mt-1 text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">
          {name}
          {points != null && (
            <span className="ml-1.5 font-plex text-[9.5px] font-normal uppercase tracking-[.12em] text-[#8ba4c4]">
              {`${points} pts`}
            </span>
          )}
        </p>
      </div>
      <Trophy className="size-[18px] shrink-0 text-[#bef264]" strokeWidth={1.8} aria-hidden />
    </div>
  )
}
