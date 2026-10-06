'use client'

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Calendar, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { plural } from '@/components/admin/MoneyGroup'
import { CUSTOM_RANGE_LABEL, type FeeRangeInput, type PresetSummary } from '@/lib/fees'
import type { FeeRange } from '@/lib/types'

interface RangeControlProps {
  range: FeeRange
  span: string
  playedGames: number
  presets: PresetSummary[]
  /** Dates the custom inputs show: the current range's, or a sensible default for All time. */
  customFrom: string
  customTo: string
  onChange: (range: FeeRangeInput) => void
}

/** 16px radio ring with an 8px sky dot when selected. */
function RadioRing({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-full border',
        selected ? 'border-[#38bdf8]' : 'border-[#2c4a72]'
      )}
    >
      <span className={cn('size-2 rounded-full', selected && 'bg-[#38bdf8]')} />
    </span>
  )
}

const DATE_INPUT =
  'min-w-0 h-[34px] rounded-md border border-[#223a5c] bg-[#0a1421] px-2.5 py-0 font-plex text-[11px] text-[#dff1ff] outline-none [color-scheme:dark] focus:border-[#38bdf8] focus:ring-0'

/**
 * Date range picker for the Admin tab: four presets, each with the span and
 * played-game count it covers, plus a custom from/to. Picking a preset closes
 * the menu; the custom dates stay open while being edited.
 */
export function RangeControl({ range, span, playedGames, presets, customFrom, customTo, onChange }: RangeControlProps) {
  const isCustom = range.preset === 'custom'

  function setCustom(from: string, to: string) {
    if (!from || !to) return
    onChange({ preset: 'custom', from, to })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group flex h-12 w-full items-center gap-3 rounded-xl border border-[#1b2c46] bg-[#0a1421] px-3.5 text-left transition-colors hover:border-[#2c4a72] data-[state=open]:border-[#38bdf8] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8]"
        >
          <Calendar className="size-[15px] shrink-0 text-[#38bdf8]" />
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5">
            <span className="whitespace-nowrap text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">{range.label}</span>
            <span className="whitespace-nowrap font-plex text-[9.5px] uppercase tracking-[.12em] text-[#6f88a8]">{span}</span>
          </span>
          <span className="shrink-0 font-plex text-[9px] font-bold uppercase tracking-[.14em] text-[#8ba4c4]">
            {plural(playedGames, 'game')}
          </span>
          <ChevronDown className="size-[15px] shrink-0 text-[#6f88a8] transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-xl border-[#223a5c] bg-[#0a1421] p-0 shadow-[0_24px_60px_rgba(0,0,0,.6)]"
      >
        <DropdownMenuPrimitive.RadioGroup
          value={range.preset}
          onValueChange={(preset) => onChange({ preset: preset as FeeRangeInput['preset'] })}
          className="flex flex-col p-1.5"
        >
          {presets.map((p) => {
            const selected = p.preset === range.preset
            return (
              <DropdownMenuPrimitive.RadioItem
                key={p.preset}
                value={p.preset}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg p-2.5 outline-none transition-colors hover:bg-[#101d31] focus:bg-[#101d31]',
                  selected && 'bg-[#38bdf8]/8'
                )}
              >
                <RadioRing selected={selected} />
                <span
                  className={cn(
                    'min-w-0 flex-1 text-[13.5px]',
                    selected ? 'font-bold text-[#f4f9ff]' : 'font-medium text-[#8ba4c4]'
                  )}
                >
                  {p.label}
                </span>
                <span className="whitespace-nowrap font-plex text-[9px] tracking-[.1em] text-[#6f88a8]">{p.span}</span>
                <span
                  className={cn(
                    'w-[52px] shrink-0 text-right font-plex text-[9px] font-bold uppercase tracking-[.1em]',
                    selected ? 'text-[#7dd3fc]' : 'text-[#4f688a]'
                  )}
                >
                  {plural(p.games, 'game')}
                </span>
              </DropdownMenuPrimitive.RadioItem>
            )
          })}
        </DropdownMenuPrimitive.RadioGroup>
        <div className="border-t border-[#17263c] bg-[#0c1728] px-4 pt-3 pb-3.5">
          <div className="mb-2.5 flex items-center gap-3">
            <RadioRing selected={isCustom} />
            <span
              className={cn('flex-1 text-[13.5px]', isCustom ? 'font-bold text-[#f4f9ff]' : 'font-medium text-[#8ba4c4]')}
            >
              {CUSTOM_RANGE_LABEL}
            </span>
          </div>
          {/* Inputs inside a menu: stop the menu's typeahead and arrow keys from eating keystrokes. */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pl-7" onKeyDown={(e) => e.stopPropagation()}>
            <input
              type="date"
              aria-label="From"
              value={customFrom}
              max={customTo || undefined}
              onFocus={() => !isCustom && setCustom(customFrom, customTo)}
              onChange={(e) => setCustom(e.target.value, customTo)}
              className={DATE_INPUT}
            />
            <span className="font-plex text-[9px] font-bold uppercase tracking-[.14em] text-[#4f688a]">to</span>
            <input
              type="date"
              aria-label="To"
              value={customTo}
              min={customFrom || undefined}
              onFocus={() => !isCustom && setCustom(customFrom, customTo)}
              onChange={(e) => setCustom(customFrom, e.target.value)}
              className={DATE_INPUT}
            />
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
