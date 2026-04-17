'use client'

import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { useState, useMemo, useRef, useEffect } from 'react'
import type { Player, SortKey, Week, YearStats } from '@/lib/types'
import { FormDots } from '@/components/FormDots'
import { cn, computeYearStats } from '@/lib/utils'

interface PlayerCardProps {
  player: Player
  isOpen: boolean
  onToggle: () => void
  sortBy: SortKey
  /** Kept for API compatibility — no longer used internally */
  visibleStats?: string[]
  /** Whether to show the ATT/BAL/DEF/GK mentality badge — defaults to true */
  showMentality?: boolean
  weeks?: Week[]  // needed for year-filtered stats; undefined = no year toggle
}

const MENTALITY_LABEL: Record<string, string> = {
  goalkeeper: 'GK',
  defensive:  'DEF',
  balanced:   'BAL',
  attacking:  'ATT',
}

const HEADER_METRIC: Record<SortKey, (p: Player) => React.ReactNode> = {
  name:       (p) => `${p.played} games`,
  played:     (p) => `${p.played} games`,
  won:        (p) => (
    <>
      <span className="font-semibold text-slate-100">{p.won}</span>
      <span className="text-xs text-slate-400"> wins</span>
    </>
  ),
  winRate:    (p) => (
    <>
      <span className="font-semibold text-slate-100">{p.winRate.toFixed(1)}%</span>
      <span className="text-xs text-slate-400"> win rate</span>
    </>
  ),
  recentForm: (p) =>
    p.recentForm ? <FormDots form={p.recentForm} /> : `${p.played} games`,
}

const FORM_CIRCLE: Record<string, { bg: string; text: string; underline: string; extra?: string }> = {
  W:   { bg: 'bg-sky-500',     text: 'text-slate-900', underline: 'bg-sky-400'   },
  D:   { bg: 'bg-slate-700',   text: 'text-slate-400', underline: 'bg-slate-400' },
  L:   { bg: 'bg-red-950',     text: 'text-red-300',   underline: 'bg-red-400'   },
  '-': { bg: 'bg-transparent', text: 'text-slate-600', underline: 'bg-slate-600', extra: 'border border-dashed border-slate-600' },
}

export function PlayerCard({
  player,
  isOpen,
  onToggle,
  sortBy,
  showMentality = true,
  weeks,
}: PlayerCardProps) {
  const contentId = `player-${player.name.replace(/\s+/g, '-').toLowerCase()}-content`

  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const playerYears: string[] = useMemo(() => {
    if (!weeks) return []
    const years = new Set(
      weeks
        .filter(
          (w) =>
            w.status === 'played' &&
            (w.teamA.includes(player.name) || w.teamB.includes(player.name))
        )
        .map((w) => w.season)
    )
    return Array.from(years).sort()  // ascending: ['2025', '2026']
  }, [weeks, player.name])

  const showYearToggle = playerYears.length > 1

  const yearStats: YearStats | null = useMemo(() => {
    if (!selectedYear || !weeks) return null
    return computeYearStats(player.name, weeks, selectedYear)
  }, [selectedYear, weeks, player.name])

  const displayPlayer = yearStats
    ? { ...player, ...yearStats }
    : player

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const borderClass = isOpen
    ? 'border-slate-600'
    : 'border-slate-700 hover:border-slate-500'

  // recentForm is stored newest-first; pad to 5 chars, then reverse so oldest is leftmost, newest is rightmost
  const raw = displayPlayer.recentForm ?? ''
  const formChars = [...raw.padEnd(5, '-')].reverse()
  const lastIndex = formChars.length - 1  // always 4 when padded; underline on rightmost circle

  // Define bar segments; filter out zeros to avoid gap-px artefacts
  const resultSegments = [
    { count: displayPlayer.won,  barClass: 'bg-sky-500',   numClass: 'text-sky-400',   label: 'Won'   },
    { count: displayPlayer.drew, barClass: 'bg-slate-600', numClass: 'text-slate-500', label: 'Drawn' },
    { count: displayPlayer.lost, barClass: 'bg-red-500',   numClass: 'text-red-400',   label: 'Lost'  },
  ].filter(s => s.count > 0)

  const splitSegments = [
    { count: displayPlayer.timesTeamA, barClass: 'bg-blue-700',   numClass: 'text-blue-300',   label: 'Team A', align: 'text-left'  },
    { count: displayPlayer.timesTeamB, barClass: 'bg-violet-700', numClass: 'text-violet-300', label: 'Team B', align: 'text-right' },
  ]

  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
      <div className={cn('rounded-lg border bg-slate-800 transition-colors duration-150', borderClass)}>
        <div
          role="button"
          tabIndex={0}
          className="w-full flex items-center justify-between px-4 py-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={onToggle}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        >
          <div className="flex items-center gap-2.5">
            <div className="flex items-center min-w-0">
              <span className="text-sm font-semibold text-slate-100 shrink-0">{player.name}</span>
              {showYearToggle && (
                <span
                  className={cn(
                    'overflow-hidden transition-all duration-200 ease-in-out whitespace-nowrap',
                    isOpen ? 'max-w-[140px] opacity-100 ml-1.5' : 'max-w-0 opacity-0 ml-0',
                  )}
                >
                  <span className="text-slate-500 mr-1 text-sm font-normal">-</span>
                  <span className="relative inline-block" ref={dropdownRef}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDropdownOpen((o) => !o)
                      }}
                      className="text-sm font-semibold text-sky-400 hover:text-sky-300 inline-flex items-center gap-0.5 focus:outline-none"
                    >
                      {selectedYear ?? 'All Time'}
                      <ChevronDown
                        className={cn(
                          'h-3 w-3 text-sky-400 transition-transform duration-150',
                          dropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>
                    {dropdownOpen && (
                      <div className="absolute left-0 top-full mt-1 z-20 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden shadow-lg min-w-[100px]">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedYear(null); setDropdownOpen(false) }}
                          className={cn(
                            'w-full text-left px-3 py-2 text-sm hover:bg-slate-800 transition-colors',
                            selectedYear === null ? 'text-sky-400' : 'text-slate-400',
                          )}
                        >
                          All Time
                        </button>
                        {playerYears.map((year) => (
                          <button
                            key={year}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setSelectedYear(year); setDropdownOpen(false) }}
                            className={cn(
                              'w-full text-left px-3 py-2 text-sm hover:bg-slate-800 transition-colors',
                              selectedYear === year ? 'text-sky-400' : 'text-slate-400',
                            )}
                          >
                            {year}
                          </button>
                        ))}
                      </div>
                    )}
                  </span>
                </span>
              )}
            </div>
            {showMentality && (
              <span className="text-[10px] font-medium text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded">
                {MENTALITY_LABEL[player.mentality] ?? player.mentality}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              {HEADER_METRIC[sortBy](player)}
            </span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-slate-400 transition-transform duration-200 flex-shrink-0',
                isOpen && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </div>
        </div>

        <Collapsible.Content
          id={contentId}
          className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
        >
          <div className="border-t border-slate-700 p-4 flex flex-col gap-4">

            {/* ── Section 1: Win Rate · Played · Last 5 ── */}
            <div className="flex justify-between items-start">
              {/* Win Rate */}
              <div>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-0.5">Win Rate</p>
                <p className="text-2xl font-extrabold text-sky-400 leading-none">
                  {displayPlayer.winRate.toFixed(1)}%
                </p>
              </div>

              {/* Played + Last 5 */}
              <div className="flex items-start gap-5">
                {/* Played */}
                <div className="text-right">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-0.5">Played</p>
                  <p className="text-2xl font-extrabold text-slate-100 leading-none">{displayPlayer.played}</p>
                </div>

                {/* Last 5 form circles */}
                <div>
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1.5">Last 5</p>
                  <div className="flex gap-1">
                    {formChars.map((char, i) => {
                      const style = FORM_CIRCLE[char] ?? FORM_CIRCLE['-']
                      const isMostRecent = i === lastIndex
                      return (
                        <div key={i} className="flex flex-col items-center gap-0.5">
                          <span
                            className={cn(
                              'w-[22px] h-[22px] rounded-full flex items-center justify-center',
                              'text-[9px] font-bold font-mono',
                              style.bg,
                              style.text,
                              style.extra,
                            )}
                          >
                            {char === '-' ? '' : char}
                          </span>
                          {isMostRecent && (
                            <span className={cn('w-3 h-0.5 rounded-full', style.underline)} />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 2: Results bar ── */}
            <div className="border-t border-slate-700 pt-4">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">Results</p>
              {/* Numbers above bar */}
              <div className="flex mb-1 gap-px">
                {resultSegments.map(s => (
                  <div key={s.label} className={cn('text-left text-[11px] font-bold', s.numClass)} style={{ flex: s.count }}>
                    {s.count}
                  </div>
                ))}
              </div>
              {/* Bar */}
              <div className="flex h-2 rounded overflow-hidden gap-px">
                {resultSegments.map(s => (
                  <div key={s.label} className={s.barClass} style={{ flex: s.count }} />
                ))}
              </div>
              {/* Labels below bar */}
              <div className="flex mt-1 gap-px">
                {resultSegments.map(s => (
                  <div key={s.label} className="text-left text-[9px] text-slate-500 uppercase tracking-wide" style={{ flex: s.count }}>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section 3: Team Split bar ── */}
            <div className="border-t border-slate-700 pt-4">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">Team Split</p>
              {/* Numbers above bar — always 50/50 so zero-count side doesn't collapse */}
              <div className="flex mb-1">
                {splitSegments.map(s => (
                  <div key={s.label} className={cn(s.align, 'text-[11px] font-bold flex-1', s.numClass)}>
                    {s.count}
                  </div>
                ))}
              </div>
              {/* Bar — proportional to actual counts */}
              <div className="flex h-2 rounded overflow-hidden gap-px">
                {splitSegments.map(s => (
                  <div key={s.label} className={s.barClass} style={{ flex: s.count || 1 }} />
                ))}
              </div>
              {/* Labels below bar — always 50/50 to match numbers row */}
              <div className="flex mt-1">
                {splitSegments.map(s => (
                  <div key={s.label} className={cn(s.align, 'text-[9px] text-slate-500 uppercase tracking-wide flex-1')}>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}
