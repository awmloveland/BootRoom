'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney, isChargeable, longWeekDate } from '@/lib/fees'
import { MoneyGroup, plural } from '@/components/admin/MoneyGroup'
import { WIDGET_CLASS, WIDGET_TITLE_CLASS } from '@/components/StatsSidebar'
import type { WeekFeeRow } from '@/lib/types'

interface GamesListProps {
  games: WeekFeeRow[]
  /** A new per-player cost for one week, or null to clear its override. */
  onCostChange: (weekId: string, fee: number | null) => void
}

export function gamesMeta(games: WeekFeeRow[]): string {
  const played = games.filter((g) => isChargeable(g.status)).length
  const cancelled = games.length - played
  return `${played} played` + (cancelled > 0 ? ` · ${cancelled} cancelled` : '')
}

function gameSub(g: WeekFeeRow): string {
  if (!isChargeable(g.status)) return `Week ${g.week} · cancelled`
  return (
    `Week ${g.week} · ${plural(g.players, 'player')}` +
    (g.guests > 0 ? ` + ${plural(g.guests, 'guest')}` : '') +
    (g.status === 'dnf' ? ' · DNF' : '')
  )
}

function paidTone(g: WeekFeeRow) {
  const complete = g.payers > 0 && g.paid === g.payers
  return {
    text: complete ? 'text-[#bef264]' : g.paid === 0 ? 'text-[#e2686f]' : 'text-[#f4f9ff]',
    bar: complete ? 'bg-[#bef264]' : 'bg-[#38bdf8]',
    pct: g.payers > 0 ? Math.round((g.paid / g.payers) * 100) : 0,
  }
}

function PaidBar({ g }: { g: WeekFeeRow }) {
  const { bar, pct } = paidTone(g)
  return (
    <div className="flex h-1 flex-1 overflow-hidden rounded-sm bg-[#17263c]">
      <span className={bar} style={{ width: `${pct}%` }} />
    </div>
  )
}

/**
 * A week's per-player cost. Dashed when it uses the league default, sky when
 * overridden. Click to edit; Enter, Escape or blur commits, and an empty
 * field clears the override.
 */
function CostButton({ g, onCostChange }: { g: WeekFeeRow; onCostChange: GamesListProps['onCostChange'] }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')

  function commit() {
    setEditing(false)
    const trimmed = text.trim()
    if (trimmed === '') {
      if (g.overridden) onCostChange(g.weekId, null)
      return
    }
    const fee = Number(trimmed)
    if (!Number.isFinite(fee) || fee < 0) return
    if (!g.overridden || fee !== g.cost) onCostChange(g.weekId, fee)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-0.5">
        <span className="font-plex text-xs font-bold text-[#f4f9ff]">£</span>
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.5}
          autoFocus
          aria-label={`Cost per player for week ${g.week}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
          }}
          className="h-7 w-12 rounded border border-[#38bdf8] bg-[#0c1728] px-1.5 py-0 font-plex text-xs font-bold text-[#f4f9ff] outline-none focus:border-[#38bdf8] focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    )
  }

  return (
    <button
      type="button"
      title="Override cost for this game"
      aria-label={`Cost per player for week ${g.week}: ${formatMoney(g.cost)}${g.overridden ? ', overridden' : ''}. Edit`}
      onClick={() => {
        setText(g.overridden ? String(g.cost) : '')
        setEditing(true)
      }}
      className={cn(
        'inline-flex h-7 items-center gap-[5px] rounded border px-2 font-plex text-xs font-bold transition-colors hover:border-[#38bdf8] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]',
        g.overridden
          ? 'border-solid border-[#38bdf8]/50 bg-[#38bdf8]/10 text-[#7dd3fc]'
          : 'border-dashed border-[#223a5c] text-[#8ba4c4]'
      )}
    >
      {formatMoney(g.cost)}
      <Pencil className="size-2.5" strokeWidth={2.2} />
    </button>
  )
}

/** Desktop sidebar widget: every game in range with its paid progress and cost. */
export function GamesWidget({ games, onCostChange }: GamesListProps) {
  return (
    <div className={WIDGET_CLASS}>
      <div className="flex items-center justify-between gap-2 rounded-t-[11px] border-b border-[#17263c] bg-[#0c1728] px-3.5 py-2.5">
        <span className={cn(WIDGET_TITLE_CLASS, 'whitespace-nowrap')}>Games</span>
        <span className="font-plex text-[8px] font-bold uppercase tracking-[.12em] text-[#4f688a]">{gamesMeta(games)}</span>
      </div>
      <div className="flex flex-col">
        {games.length === 0 && (
          <p className="px-3.5 py-4 text-center font-inter-body text-xs text-[#6f88a8]">No games in this range.</p>
        )}
        {games.map((g, i) => {
          const played = isChargeable(g.status)
          const tone = paidTone(g)
          return (
            <div
              key={g.weekId}
              className={cn('flex items-center gap-2.5 px-3.5 py-2.5', i > 0 && 'border-t border-[#1b2c46]', !played && 'opacity-55')}
            >
              <div className="min-w-0 flex-1">
                <p className="whitespace-nowrap text-[13px] font-bold tracking-[-.01em] text-[#f4f9ff]">{longWeekDate(g.date)}</p>
                <p className="mt-[3px] truncate font-plex text-[8.5px] uppercase tracking-[.08em] text-[#6f88a8]">{gameSub(g)}</p>
                {played && (
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <PaidBar g={g} />
                    <span className={cn('whitespace-nowrap font-plex text-[9px] font-bold uppercase', tone.text)}>
                      {g.paid} / {g.payers} paid
                    </span>
                  </div>
                )}
              </div>
              {played && <CostButton g={g} onCostChange={onCostChange} />}
            </div>
          )
        })}
      </div>
      <p className="border-t border-[#17263c] px-3.5 pt-2.5 pb-3 font-inter-body text-[11px] leading-normal text-[#6f88a8]">
        Tap a cost to override it for that game. Overrides show in sky.
      </p>
    </div>
  )
}

/** Below lg: the same games as a group in the content column, after Settled. */
export function GamesColumn({ games, onCostChange }: GamesListProps) {
  return (
    <MoneyGroup
      title="Games"
      meta={gamesMeta(games)}
      footnote="Games use the league default unless overridden. Overridden games show in sky; set a game back to the default by clearing the field."
    >
      <div className="flex items-center gap-2.5 border-b border-[#17263c] bg-[#0c1728] px-3.5 py-2.5 font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#4f688a]">
        <span className="flex-1">Game</span>
        <span className="w-[84px]">Paid</span>
        <span className="w-[72px] text-right">Per player</span>
      </div>
      {games.length === 0 && (
        <p className="px-3.5 py-4 text-center font-inter-body text-xs text-[#6f88a8]">No games in this range.</p>
      )}
      {games.map((g, i) => {
        const played = isChargeable(g.status)
        const tone = paidTone(g)
        return (
          <div
            key={g.weekId}
            className={cn('flex items-center gap-2.5 px-3.5 py-2.5', i > 0 && 'border-t border-[#1b2c46]', !played && 'opacity-55')}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold tracking-[-.01em] text-[#f4f9ff]">{longWeekDate(g.date)}</p>
              <p className="mt-[3px] font-plex text-[9px] uppercase tracking-[.1em] text-[#6f88a8]">{gameSub(g)}</p>
            </div>
            <div className="w-[84px] shrink-0">
              {played && (
                <>
                  <p className={cn('font-plex text-[10px] font-bold', tone.text)}>
                    {g.paid} / {g.payers}
                  </p>
                  <div className="mt-[5px] flex">
                    <PaidBar g={g} />
                  </div>
                </>
              )}
            </div>
            <div className="flex w-[72px] shrink-0 justify-end">
              {played && <CostButton g={g} onCostChange={onCostChange} />}
            </div>
          </div>
        )
      })}
    </MoneyGroup>
  )
}
