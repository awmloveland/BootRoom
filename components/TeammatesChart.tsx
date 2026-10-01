'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { TeammateStat } from '@/lib/sidebar-stats'

export type TeammatesChartSize = 'large' | 'small'

/** With more qualifiers than twice this, only the best and worst this many show. */
const GROUP_SIZE = 5

const SIZES = {
  large: {
    plot: 'h-[110px]',
    tick50: 'bottom-[48px]',
    tick100: 'bottom-[96px]',
    scale: 0.96,
    plotPx: 110,
    labelPx: 18, // value label line plus its gap, above the bar
    bar: 'max-w-[28px]',
    gap: 'gap-1.5',
    axis: 'w-[22px]',
    value: 'text-[9px]',
    name: 'text-[8.5px] [transform:rotate(-45deg)_translateX(-4px)]',
    nameRow: 'h-[34px]',
    tick: 'text-[8.5px]',
    group: 'text-[8px]',
  },
  small: {
    plot: 'h-[90px]',
    tick50: 'bottom-[39px]',
    tick100: 'bottom-[78px]',
    scale: 0.78,
    plotPx: 90,
    labelPx: 16,
    bar: 'max-w-[22px]',
    gap: 'gap-1',
    axis: 'w-5',
    value: 'text-[8px]',
    name: 'text-[7.5px] [transform:rotate(-45deg)_translateX(-3px)]',
    nameRow: 'h-[30px]',
    tick: 'text-[7.5px]',
    group: 'text-[7px]',
  },
} as const

type Tone = 'best' | 'worst' | 'mid'

const TONE_CLASSES: Record<Tone, { bar: string; text: string; tip: string }> = {
  best:  { bar: 'bg-[#38bdf8]', text: 'text-[#7dd3fc]', tip: 'text-[#7dd3fc]' },
  worst: { bar: 'bg-[#e2686f]', text: 'text-[#e2686f]', tip: 'text-[#e2686f]' },
  mid:   { bar: 'bg-[#22405f]', text: 'text-[#8ba4c4]', tip: 'text-[#f4f9ff]' },
}

const TONE_NOTE: Record<Tone, string | null> = {
  best: 'Best pairing',
  worst: 'Weakest pairing',
  mid: null,
}

type Column =
  | { kind: 'bar'; teammate: TeammateStat; tone: Tone }
  | { kind: 'divider'; hidden: number }

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Bars in display order; past twice GROUP_SIZE the middle collapses into one divider. */
export function buildTeammateColumns(teammates: TeammateStat[]): Column[] {
  const n = teammates.length
  const toneAt = (i: number): Tone => (n > 1 && i === 0 ? 'best' : n > 1 && i === n - 1 ? 'worst' : 'mid')
  const bars = teammates.map((teammate, i): Column => ({ kind: 'bar', teammate, tone: toneAt(i) }))
  if (n <= GROUP_SIZE * 2) return bars
  return [
    ...bars.slice(0, GROUP_SIZE),
    { kind: 'divider', hidden: n - GROUP_SIZE * 2 },
    ...bars.slice(n - GROUP_SIZE),
  ]
}

function barHeight(teammate: TeammateStat, scale: number): number {
  return Math.max(2, Math.round(teammate.winRate * scale))
}

function firstName(name: string): string {
  return name.split(' ')[0]
}

function columnLabel(c: Column): string {
  if (c.kind === 'divider') return `${plural(c.hidden, 'more teammate')} in the middle`
  const { name, won, played, winRate } = c.teammate
  return `${name}: ${winRate}% win rate, ${plural(won, 'win')} from ${played} together`
}

/** Keeps the tooltip inside the chart: edge columns anchor it to their outer side. */
function tooltipAlign(index: number, count: number): string {
  if (count === 1) return 'left-1/2 -translate-x-1/2'
  if (index < count / 3) return 'left-0'
  if (index >= (count * 2) / 3) return 'right-0'
  return 'left-1/2 -translate-x-1/2'
}

/** Floats `bottom` px above the plot floor, with a caret pointing down at its column. */
function ChartTooltip({ column, align, bottom }: { column: Column; align: string; bottom: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 animate-in fade-in-0 duration-100">
      <div
        className={cn(
          'absolute z-20 w-max max-w-[180px]',
          'rounded border border-[#223a5c] bg-[#0c1728] px-2.5 py-2 text-left',
          'shadow-[0_18px_44px_rgba(0,0,0,.42)]',
          align,
        )}
        style={{ bottom: bottom + 6 }}
      >
        {column.kind === 'divider' ? (
          <p className="font-plex text-[9px] uppercase tracking-[.12em] text-[#8ba4c4] whitespace-nowrap">
            {plural(column.hidden, 'more teammate')} in the middle
          </p>
        ) : (
          <TeammateTooltipBody teammate={column.teammate} tone={column.tone} />
        )}
      </div>
      <span
        className="absolute left-1/2 z-30 size-2 -translate-x-1/2 rotate-45 border-r border-b border-[#223a5c] bg-[#0c1728]"
        style={{ bottom: bottom + 2 }}
      />
    </div>
  )
}

function TeammateTooltipBody({ teammate, tone }: { teammate: TeammateStat; tone: Tone }) {
  const lost = teammate.played - teammate.won - teammate.drew
  const note = TONE_NOTE[tone]
  return (
    <>
      {note && (
        <p className={cn('mb-1 font-plex text-[7.5px] font-bold uppercase tracking-[.16em]', TONE_CLASSES[tone].text)}>
          {note}
        </p>
      )}
      <p className="font-inter-body text-[11.5px] font-bold leading-tight text-[#f4f9ff] truncate">{teammate.name}</p>
      <div className="mt-1.5 flex items-baseline gap-1.5 font-plex">
        <span className={cn('text-[17px] font-bold leading-none tracking-[-.03em]', TONE_CLASSES[tone].tip)}>
          {teammate.winRate}<span className="text-[9px]">%</span>
        </span>
        <span className="text-[7.5px] font-bold uppercase tracking-[.16em] text-[#6f88a8]">Win rate</span>
      </div>
      <p className="mt-1.5 border-t border-[#17263c] pt-1.5 font-plex text-[8.5px] uppercase tracking-[.1em] text-[#8ba4c4] whitespace-nowrap">
        {teammate.won}W · {teammate.drew}D · {lost}L
        <span className="text-[#4f688a]"> · </span>
        <span className="text-[#f4f9ff] font-bold">{teammate.played}</span> together
      </p>
    </>
  )
}

/** Vertical bars of a player's win % alongside each regular teammate, best to worst. */
export function TeammatesChart({ teammates, size }: { teammates: TeammateStat[]; size: TeammatesChartSize }) {
  const s = SIZES[size]
  const columns = buildTeammateColumns(teammates)
  const trimmed = columns.some((c) => c.kind === 'divider')

  // Index of the column whose tooltip is showing. Hover, tap and focus all set it straight away.
  const [active, setActive] = useState<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // A tap anywhere else, or Escape, closes the tooltip (touch has no mouseleave to rely on)
  useEffect(() => {
    if (active === null) return
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setActive(null)
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setActive(null)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [active])

  const dimmed = (i: number) => active !== null && active !== i

  return (
    <div ref={rootRef} className="flex gap-2 font-plex">
      {/* Y axis */}
      <div aria-hidden className={cn('relative shrink-0 text-right text-[#4f688a]', s.axis, s.plot, s.tick)}>
        <span className={cn('absolute right-0 translate-y-1/2', s.tick100)}>100</span>
        <span className={cn('absolute right-0 translate-y-1/2', s.tick50)}>50</span>
        <span className="absolute right-0 bottom-0 translate-y-1/2">0</span>
      </div>

      <div className="flex-1 min-w-0">
        {/* Plot */}
        <div
          className={cn('relative flex items-end border-b border-[#223a5c]', s.plot, s.gap)}
          onMouseLeave={() => setActive(null)}
        >
          <div aria-hidden className={cn('absolute inset-x-0 border-t border-dashed border-[#17263c]', s.tick50)} />
          <div aria-hidden className={cn('absolute inset-x-0 border-t border-dashed border-[#17263c]', s.tick100)} />
          {columns.map((c, i) => (
            <div
              key={c.kind === 'divider' ? 'divider' : c.teammate.name}
              className={cn('relative min-w-0 self-stretch flex', c.kind === 'divider' ? 'flex-[0.6]' : 'flex-1')}
            >
              <button
                type="button"
                data-testid={c.kind === 'divider' ? 'teammates-divider' : 'teammates-bar'}
                aria-label={columnLabel(c)}
                aria-pressed={active === i}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive((prev) => (prev === i ? null : prev))}
                className={cn(
                  'w-full flex flex-col items-center justify-end gap-[3px] cursor-default rounded-t-[2px]',
                  'transition-opacity duration-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]',
                  dimmed(i) && 'opacity-40',
                )}
              >
                {c.kind === 'divider' ? (
                  <span className={cn('w-px border-l border-dashed border-[#2c4a72]', s.plot)} />
                ) : (
                  <>
                    <span className={cn('font-bold', s.value, TONE_CLASSES[c.tone].text)}>{c.teammate.winRate}</span>
                    <span
                      className={cn('w-full rounded-t-[2px]', s.bar, TONE_CLASSES[c.tone].bar)}
                      style={{ height: barHeight(c.teammate, s.scale) }}
                    />
                  </>
                )}
              </button>
              {active === i && (
                <ChartTooltip
                  column={c}
                  align={c.kind === 'divider' ? 'left-1/2 -translate-x-1/2' : tooltipAlign(i, columns.length)}
                  bottom={c.kind === 'divider' ? s.plotPx : barHeight(c.teammate, s.scale) + s.labelPx}
                />
              )}
            </div>
          ))}
        </div>

        {/* Names, angled so full first names fit under narrow columns */}
        <div aria-hidden className={cn('mt-1 flex', s.gap)}>
          {columns.map((c, i) =>
            c.kind === 'divider' ? (
              <span key="divider" className={cn('relative flex-[0.6] min-w-0', s.nameRow)} />
            ) : (
              <span key={c.teammate.name} className={cn('relative flex-1 min-w-0', s.nameRow)}>
                <span
                  className={cn(
                    'absolute top-[2px] right-1/2 origin-top-right whitespace-nowrap leading-none tracking-[.04em]',
                    'transition-opacity duration-100',
                    s.name,
                    TONE_CLASSES[c.tone].text,
                    dimmed(i) && 'opacity-40',
                  )}
                >
                  {firstName(c.teammate.name)}
                </span>
              </span>
            )
          )}
        </div>

        {trimmed && (
          <div className={cn('mt-0.5 flex font-bold uppercase tracking-[.14em] text-center whitespace-nowrap', s.gap, s.group)}>
            <span className="flex-[5] min-w-0 truncate border-t border-[#38bdf8]/45 pt-[5px] text-[#7dd3fc]">
              Best {GROUP_SIZE}
            </span>
            <span className="flex-[0.6] min-w-0" />
            <span className="flex-[5] min-w-0 truncate border-t border-[#e2686f]/45 pt-[5px] text-[#e2686f]">
              Worst {GROUP_SIZE}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
