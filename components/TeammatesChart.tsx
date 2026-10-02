'use client'

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { TeammateStat } from '@/lib/sidebar-stats'

export type TeammatesChartSize = 'large' | 'small'

/** The chart shows this many of the best teammates; See all lists everyone. */
const CHART_LIMIT = 8

const SIZES = {
  large: {
    plot: 'h-[110px]',
    tick50: 'bottom-[48px]',
    tick100: 'bottom-[96px]',
    scale: 0.96,
    labelPx: 18, // value label line plus its gap, above the bar
    bar: 'max-w-[28px]',
    gap: 'gap-1.5',
    axis: 'w-[22px]',
    value: 'text-[9px]',
    name: 'text-[8.5px] [transform:rotate(-45deg)_translateX(-4px)]',
    nameRow: 'h-[34px]',
    tick: 'text-[8.5px]',
  },
  small: {
    plot: 'h-[90px]',
    tick50: 'bottom-[39px]',
    tick100: 'bottom-[78px]',
    scale: 0.78,
    labelPx: 16,
    bar: 'max-w-[22px]',
    gap: 'gap-1',
    axis: 'w-5',
    value: 'text-[8px]',
    name: 'text-[7.5px] [transform:rotate(-45deg)_translateX(-3px)]',
    nameRow: 'h-[30px]',
    tick: 'text-[7.5px]',
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

type Column = { teammate: TeammateStat; tone: Tone }

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** The strongest and weakest of two or more stand out; everyone else is mid. */
function toneAt(i: number, n: number): Tone {
  return n > 1 && i === 0 ? 'best' : n > 1 && i === n - 1 ? 'worst' : 'mid'
}

/** The best CHART_LIMIT bars, toned against the whole list so the red bar only shows when the weakest makes the cut. */
export function buildTeammateColumns(teammates: TeammateStat[]): Column[] {
  const n = teammates.length
  return teammates.slice(0, CHART_LIMIT).map((teammate, i) => ({ teammate, tone: toneAt(i, n) }))
}

function barHeight(teammate: TeammateStat, scale: number): number {
  return Math.max(2, Math.round(teammate.winRate * scale))
}

function firstName(name: string): string {
  return name.split(' ')[0]
}

function columnLabel(c: Column): string {
  const { name, won, played, winRate } = c.teammate
  return `${name}: ${winRate}% win rate, ${plural(won, 'win')} from ${played} together`
}

/**
 * Floats `bottom` px above the plot floor, with a caret pointing down at its column.
 * Centred on the column, then nudged sideways so it never pokes out of `boundsRef`.
 */
function ChartTooltip({ column, bottom, boundsRef }: { column: Column; bottom: number; boundsRef: RefObject<HTMLElement | null> }) {
  const boxRef = useRef<HTMLDivElement>(null)

  // Measured before paint, so the tooltip never flashes in its unclamped spot
  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el || !boundsRef.current) return
    el.style.marginLeft = '0px'
    const box = el.getBoundingClientRect()
    const bounds = boundsRef.current.getBoundingClientRect()
    const shift = box.left < bounds.left ? bounds.left - box.left : box.right > bounds.right ? bounds.right - box.right : 0
    el.style.marginLeft = `${shift}px`
  }, [column, boundsRef])

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 animate-in fade-in-0 duration-100">
      <div
        ref={boxRef}
        data-testid="teammates-tooltip"
        className={cn(
          'absolute left-1/2 z-20 w-max max-w-[220px] -translate-x-1/2',
          'rounded border border-[#223a5c] bg-[#0c1728] px-2.5 py-2 text-left',
          'shadow-[0_18px_44px_rgba(0,0,0,.42)]',
        )}
        style={{ bottom: bottom + 6 }}
      >
        <TeammateTooltipBody teammate={column.teammate} tone={column.tone} />
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

/** Every qualifying teammate as a ranked list, for when the chart only has room for the best. */
export function TeammatesDialog({
  playerName,
  teammates,
  open,
  onOpenChange,
}: {
  playerName: string
  teammates: TeammateStat[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const n = teammates.length
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-2 border-b border-[#17263c] bg-[#0c1728] px-5 py-4 pr-12 text-left sm:text-left">
          <DialogTitle>Win % with teammates</DialogTitle>
          <DialogDescription className="font-plex text-[8.5px] uppercase tracking-[.14em] text-[#6f88a8]">
            {playerName} · {plural(n, 'teammate')} · Min 5 together
          </DialogDescription>
        </DialogHeader>
        <ol className="max-h-[min(60vh,480px)] overflow-y-auto px-5 py-1">
          {teammates.map((t, i) => {
            const tone = toneAt(i, n)
            const lost = t.played - t.won - t.drew
            return (
              <li
                key={t.name}
                data-testid="teammates-row"
                className="flex items-center gap-3 border-b border-[#17263c] py-2.5 last:border-b-0"
              >
                <span className="w-5 shrink-0 text-right font-plex text-[10px] text-[#4f688a]">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-inter-body text-[13px] font-semibold text-[#f4f9ff]">{t.name}</p>
                  <p className="mt-0.5 font-plex text-[8.5px] uppercase tracking-[.1em] text-[#6f88a8]">
                    {t.won}W · {t.drew}D · {lost}L
                    <span className="text-[#4f688a]"> · </span>
                    <span className="font-bold text-[#8ba4c4]">{t.played}</span> together
                  </p>
                </div>
                <div aria-hidden className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-[#060b14] sm:w-24">
                  <div className={cn('h-full rounded-full', TONE_CLASSES[tone].bar)} style={{ width: `${t.winRate}%` }} />
                </div>
                <span className={cn('w-10 shrink-0 text-right font-plex text-sm font-bold tracking-[-.03em]', TONE_CLASSES[tone].text)}>
                  {t.winRate}<span className="text-[9px]">%</span>
                </span>
              </li>
            )
          })}
        </ol>
      </DialogContent>
    </Dialog>
  )
}

/** Vertical bars of a player's win % alongside each regular teammate, best to worst. */
export function TeammatesChart({
  playerName,
  teammates,
  size,
}: {
  playerName: string
  teammates: TeammateStat[]
  size: TeammatesChartSize
}) {
  const s = SIZES[size]
  const columns = buildTeammateColumns(teammates)
  const trimmed = teammates.length > columns.length

  // Index of the column whose tooltip is showing. Hover, tap and focus all set it straight away.
  const [active, setActive] = useState<number | null>(null)
  const [showAll, setShowAll] = useState(false)
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
    <div ref={rootRef} className="font-plex">
      <div className="flex gap-2">
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
              <div key={c.teammate.name} className="relative flex-1 min-w-0 self-stretch flex">
                <button
                  type="button"
                  data-testid="teammates-bar"
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
                  <span className={cn('font-bold', s.value, TONE_CLASSES[c.tone].text)}>{c.teammate.winRate}</span>
                  <span
                    className={cn('w-full rounded-t-[2px]', s.bar, TONE_CLASSES[c.tone].bar)}
                    style={{ height: barHeight(c.teammate, s.scale) }}
                  />
                </button>
                {active === i && (
                  <ChartTooltip
                    column={c}
                    bottom={barHeight(c.teammate, s.scale) + s.labelPx}
                    boundsRef={rootRef}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Names, angled so full first names fit under narrow columns */}
          <div aria-hidden className={cn('mt-1 flex', s.gap)}>
            {columns.map((c, i) => (
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
            ))}
          </div>
        </div>
      </div>

      {trimmed && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className={cn(
            'mt-3 h-8 w-full rounded border border-[#223a5c] font-plex text-[9.5px] font-bold uppercase tracking-[.12em] text-[#8ba4c4]',
            'transition-colors hover:border-[#38bdf8] hover:text-white',
            'focus:outline-none focus-visible:ring-1 focus-visible:ring-[#38bdf8]',
          )}
        >
          See all ({teammates.length})
        </button>
      )}

      {trimmed && (
        <TeammatesDialog playerName={playerName} teammates={teammates} open={showAll} onOpenChange={setShowAll} />
      )}
    </div>
  )
}
