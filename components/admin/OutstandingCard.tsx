'use client'

import { useState } from 'react'
import { Pencil, Share } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMoney } from '@/lib/fees'
import { plural } from '@/components/admin/MoneyGroup'
import type { AdminMoneyData } from '@/lib/types'

const STAT_LABEL = 'font-plex text-[8px] font-bold uppercase tracking-[.16em] text-[#4f688a]'
const STAT_VALUE = 'mt-[5px] text-lg font-bold tracking-[-.02em]'

interface OutstandingCardProps {
  data: AdminMoneyData
  onShare: () => void
  /** Called with each valid amount as it is typed; the parent debounces the save. */
  onDefaultFeeChange: (fee: number) => void
}

/** Total owed in range, the share button, games / collected / per-player cost and a collected bar. */
export function OutstandingCard({ data, onShare, onDefaultFeeChange }: OutstandingCardProps) {
  const { owed, collected, expected, playedGames } = data.totals
  const debtors = data.debtors.length
  const pct = expected > 0 ? Math.round((collected / expected) * 100) : 0

  return (
    <div className="mt-3.5 rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden">
      <div className="flex items-center justify-between gap-2.5 border-b border-[#17263c] bg-[#0c1728] px-3.5 py-2.5">
        <span className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">Outstanding</span>
        <span className="text-right font-plex text-[8.5px] font-bold uppercase tracking-[.14em] text-[#4f688a]">{data.span}</span>
      </div>
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p
              className={cn(
                'text-[40px] leading-none font-bold tracking-[-.04em] tabular-nums',
                owed > 0 ? 'text-[#e2686f]' : 'text-[#bef264]'
              )}
            >
              {formatMoney(owed)}
            </p>
            <p className="mt-2 font-plex text-[9.5px] uppercase tracking-[.12em] text-[#6f88a8]">
              {debtors > 0 ? `Owed by ${plural(debtors, 'player')}` : 'Everyone is square'}
            </p>
          </div>
          <button
            type="button"
            onClick={onShare}
            className="inline-flex h-9 shrink-0 items-center gap-[7px] rounded bg-[#38bdf8] px-3.5 text-xs font-bold text-[#05101d] transition-colors hover:bg-[#7dd3fc] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7dd3fc] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1421]"
          >
            <Share className="size-[13px]" strokeWidth={2.2} />
            Share breakdown
          </button>
        </div>

        <div className="mt-3.5 mb-3 h-px bg-[#17263c]" />

        <div className="grid grid-cols-3 gap-2.5">
          <div>
            <p className={STAT_LABEL}>Games</p>
            <p className={cn(STAT_VALUE, 'text-[#f4f9ff]')}>{playedGames}</p>
          </div>
          <div className="min-w-0">
            <p className={STAT_LABEL}>Collected</p>
            <p className={cn(STAT_VALUE, 'text-[#bef264]')}>
              {formatMoney(collected)}
              <span className="ml-1 inline-block whitespace-nowrap text-[11px] font-medium text-[#6f88a8]">of {formatMoney(expected)}</span>
            </p>
          </div>
          <div>
            <p className={STAT_LABEL}>Per player</p>
            <DefaultFeeInput defaultFee={data.defaultFee} onChange={onDefaultFeeChange} />
          </div>
        </div>

        <div className="mt-3.5 flex h-1.5 overflow-hidden rounded-[3px] bg-[#17263c]">
          <span className="bg-[#bef264] transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

/** The league default cost per player per game. Keeps its own text so a half-typed '6.' survives re-renders. */
function DefaultFeeInput({ defaultFee, onChange }: { defaultFee: number; onChange: (fee: number) => void }) {
  const [text, setText] = useState(String(defaultFee))
  const [seen, setSeen] = useState(defaultFee)
  // A refresh with a different saved value (another admin's edit) replaces the text.
  if (seen !== defaultFee) {
    setSeen(defaultFee)
    if (Number(text) !== defaultFee) setText(String(defaultFee))
  }

  return (
    <label className="mt-1 inline-flex h-[30px] cursor-text items-center gap-1 rounded border border-[#2c4a72] bg-[#0c1728] pl-2.5 pr-2 transition-colors hover:border-[#38bdf8] focus-within:border-[#38bdf8]">
      <span className="font-plex text-[13px] font-bold text-[#6f88a8]">£</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.5}
        aria-label="Cost per player per game"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const fee = Number(e.target.value)
          if (e.target.value !== '' && Number.isFinite(fee) && fee >= 0) onChange(fee)
        }}
        className="h-7 w-10 border-0 bg-transparent p-0 font-plex text-[15px] font-bold text-[#f4f9ff] outline-none focus:ring-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <Pencil className="size-[11px] text-[#6f88a8]" strokeWidth={2.2} />
    </label>
  )
}
