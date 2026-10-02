'use client'

import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { useState, useMemo, useRef, useEffect } from 'react'
import type { Player, SortKey, Week, YearStats } from '@/lib/types'
import { FormDots } from '@/components/FormDots'
import { TeammatesChart } from '@/components/TeammatesChart'
import { computeTeammates } from '@/lib/sidebar-stats'
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

/** Number + label shown on the right of the collapsed row, e.g. "42 GAMES". */
function MetricText({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <span className="font-plex text-[10px] uppercase tracking-[.1em] text-[#8ba4c4]">
      <span className="text-[13px] font-bold text-[#f4f9ff]">{value}</span> {label}
    </span>
  )
}

const HEADER_METRIC: Record<SortKey, (p: Player) => React.ReactNode> = {
  name:       (p) => <MetricText value={p.played} label="games" />,
  played:     (p) => <MetricText value={p.played} label="games" />,
  won:        (p) => <MetricText value={p.won} label="wins" />,
  winRate:    (p) => <MetricText value={`${p.winRate.toFixed(1)}%`} label="win rate" />,
  recentForm: (p) =>
    p.recentForm ? <FormDots form={p.recentForm} /> : <MetricText value={p.played} label="games" />,
}

const FORM_CIRCLE: Record<string, { circle: string; underline: string }> = {
  W:   { circle: 'bg-[#38bdf8] border-[#38bdf8] text-[#05101d]',         underline: 'bg-[#38bdf8]' },
  D:   { circle: 'bg-[#22405f] border-[#22405f] text-[#8ba4c4]',         underline: 'bg-[#22405f]' },
  L:   { circle: 'bg-[#e2686f]/18 border-[#e2686f]/40 text-[#e2686f]',   underline: 'bg-[#e2686f]/40' },
  '-': { circle: 'bg-transparent border-dashed border-[#223a5c] text-[#4f688a]', underline: 'bg-[#223a5c]' },
}

const STAT_LABEL_CLASS = 'font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]'
const STAT_VALUE_CLASS = 'font-plex text-[30px] font-bold leading-none tracking-[-.03em]'

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

  // All-time, whatever the year dropdown says
  const teammates = useMemo(
    () => (weeks ? computeTeammates(player.name, weeks) : null),
    [weeks, player.name]
  )

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

  useEffect(() => {
    if (!isOpen) setDropdownOpen(false)
  }, [isOpen])

  const borderClass = isOpen
    ? 'border-[#2c4a72] shadow-[0_18px_44px_rgba(0,0,0,.42)]'
    : 'border-[#1b2c46] hover:border-[#2c4a72]'

  // recentForm is stored newest-first; pad to 5 chars, then reverse so oldest is leftmost, newest is rightmost
  const raw = displayPlayer.recentForm ?? ''
  const formChars = [...raw.padEnd(5, '-')].reverse()
  const lastIndex = formChars.length - 1  // always 4 when padded; underline on rightmost circle

  // Define bar segments; filter out zeros to avoid gap-px artefacts
  const resultSegments = [
    { count: displayPlayer.won,  barClass: 'bg-[#38bdf8]', numClass: 'text-[#38bdf8]', label: 'Won'   },
    { count: displayPlayer.drew, barClass: 'bg-[#3d5578]', numClass: 'text-[#8ba4c4]', label: 'Drawn' },
    { count: displayPlayer.lost, barClass: 'bg-[#e2686f]', numClass: 'text-[#e2686f]', label: 'Lost'  },
  ].filter(s => s.count > 0)

  const splitSegments = [
    { count: displayPlayer.timesTeamA, barClass: 'bg-[#38bdf8]', numClass: 'text-[#7dd3fc]', label: 'Team A', align: 'text-left'  },
    { count: displayPlayer.timesTeamB, barClass: 'bg-[#a78bfa]', numClass: 'text-[#c4b5fd]', label: 'Team B', align: 'text-right' },
  ]

  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
      <div className={cn('rounded-xl border bg-[#0a1421] transition-colors duration-150', borderClass)}>
        <div
          role="button"
          tabIndex={0}
          className="w-full flex items-center justify-between gap-3 px-[18px] py-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] cursor-pointer"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={onToggle}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center min-w-0">
              <span className="font-inter-body text-sm font-bold text-[#f4f9ff] whitespace-nowrap shrink-0">{player.name}</span>
              {showYearToggle && (
                <div className="relative inline-flex items-center" ref={dropdownRef}>
                  {/* Animated container — overflow-hidden clips only the trigger text */}
                  <span
                    className={cn(
                      'overflow-hidden transition-all duration-200 ease-in-out whitespace-nowrap inline-flex items-center',
                      isOpen ? 'max-w-[140px] opacity-100 ml-1.5' : 'max-w-0 opacity-0 ml-0',
                    )}
                  >
                    <span className="text-[#4f688a] mr-1.5 text-sm font-normal">·</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDropdownOpen((o) => !o)
                      }}
                      className="font-plex text-[9.5px] font-bold uppercase tracking-[.12em] text-[#38bdf8] hover:text-[#7dd3fc] inline-flex items-center gap-1 focus:outline-none cursor-pointer"
                    >
                      {selectedYear ?? 'All Time'}
                      <ChevronDown
                        className={cn(
                          'h-3 w-3 transition-transform duration-150',
                          dropdownOpen && 'rotate-180',
                        )}
                      />
                    </button>
                  </span>
                  {/* Dropdown outside overflow-hidden so it isn't clipped */}
                  {dropdownOpen && (
                    <div className="absolute left-0 top-full mt-1.5 z-20 bg-[#0c1728] border border-[#223a5c] rounded overflow-hidden shadow-[0_18px_44px_rgba(0,0,0,.42)] min-w-[110px]">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedYear(null); setDropdownOpen(false) }}
                        className={cn(
                          'w-full text-left px-3 py-2 font-plex text-[9.5px] font-bold uppercase tracking-[.12em] hover:bg-[#101d31] transition-colors',
                          selectedYear === null ? 'text-[#38bdf8]' : 'text-[#8ba4c4]',
                        )}
                      >
                        All Time
                      </button>
                      {[...playerYears].reverse().map((year) => (
                        <button
                          key={year}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSelectedYear(year); setDropdownOpen(false) }}
                          className={cn(
                            'w-full text-left px-3 py-2 font-plex text-[9.5px] font-bold uppercase tracking-[.12em] hover:bg-[#101d31] transition-colors',
                            selectedYear === year ? 'text-[#38bdf8]' : 'text-[#8ba4c4]',
                          )}
                        >
                          {year}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {showMentality && (
              <span className="font-plex text-[8.5px] font-bold tracking-[.16em] text-[#6f88a8] bg-[#0c1728] border border-[#1b2c46] px-1.5 py-[3px] rounded-[3px]">
                {MENTALITY_LABEL[player.mentality] ?? player.mentality}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {HEADER_METRIC[sortBy](player)}
            <ChevronDown
              className={cn(
                'h-[15px] w-[15px] text-[#6f88a8] transition-transform duration-200 flex-shrink-0',
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
          <div className="border-t border-[#1b2c46] px-[18px] py-4 flex flex-col gap-4">

            {/* ── Section 1: Win Rate · Played · Last 5 ── */}
            <div className="flex flex-wrap justify-between items-start gap-x-5 gap-y-3.5">
              {/* Win Rate */}
              <div>
                <p className={cn(STAT_LABEL_CLASS, 'mb-1.5')}>Win Rate</p>
                <p className={cn(STAT_VALUE_CLASS, 'text-[#38bdf8]')}>
                  {displayPlayer.winRate.toFixed(1)}<span className="text-sm">%</span>
                </p>
              </div>

              {/* Played + Last 5 */}
              <div className="flex items-start gap-[22px]">
                {/* Played */}
                <div className="text-right">
                  <p className={cn(STAT_LABEL_CLASS, 'mb-1.5')}>Played</p>
                  <p className={cn(STAT_VALUE_CLASS, 'text-[#f4f9ff]')}>{displayPlayer.played}</p>
                </div>

                {/* Last 5 form circles */}
                <div>
                  <p className={cn(STAT_LABEL_CLASS, 'mb-2')}>Last 5</p>
                  <div className="flex gap-1">
                    {formChars.map((char, i) => {
                      const style = FORM_CIRCLE[char] ?? FORM_CIRCLE['-']
                      const isMostRecent = i === lastIndex
                      return (
                        <div key={i} className="flex flex-col items-center gap-[3px]">
                          <span
                            className={cn(
                              'w-[22px] h-[22px] rounded-full border flex items-center justify-center',
                              'font-plex text-[9px] font-bold',
                              style.circle,
                            )}
                          >
                            {char === '-' ? '' : char}
                          </span>
                          <span className={cn('w-3 h-0.5 rounded-[1px]', isMostRecent ? style.underline : 'bg-transparent')} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* ── Section 2: Results bar ── */}
            <div className="border-t border-[#1b2c46] pt-3.5">
              <p className={cn(STAT_LABEL_CLASS, 'mb-2')}>Results</p>
              {/* Numbers above bar */}
              <div className="flex mb-1 gap-0.5">
                {resultSegments.map(s => (
                  <div key={s.label} className={cn('text-left font-plex text-[11px] font-bold', s.numClass)} style={{ flex: s.count }}>
                    {s.count}
                  </div>
                ))}
              </div>
              {/* Bar */}
              <div className="flex h-2 rounded-sm overflow-hidden gap-0.5">
                {resultSegments.map(s => (
                  <div key={s.label} className={s.barClass} style={{ flex: s.count }} />
                ))}
              </div>
              {/* Labels below bar */}
              <div className="flex mt-[5px] gap-0.5">
                {resultSegments.map(s => (
                  <div key={s.label} className="text-left font-plex text-[8.5px] text-[#6f88a8] uppercase tracking-[.14em]" style={{ flex: s.count }}>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section 3: Team Split bar ── */}
            <div className="border-t border-[#1b2c46] pt-3.5">
              <p className={cn(STAT_LABEL_CLASS, 'mb-2')}>Team Split</p>
              {/* Numbers above bar — always 50/50 so zero-count side doesn't collapse */}
              <div className="flex mb-1">
                {splitSegments.map(s => (
                  <div key={s.label} className={cn(s.align, 'font-plex text-[11px] font-bold flex-1', s.numClass)}>
                    {s.count}
                  </div>
                ))}
              </div>
              {/* Bar — proportional to actual counts */}
              <div className="flex h-2 rounded-sm overflow-hidden gap-0.5">
                {splitSegments.map(s => (
                  <div key={s.label} className={s.barClass} style={{ flex: s.count || 1 }} />
                ))}
              </div>
              {/* Labels below bar — always 50/50 to match numbers row */}
              <div className="flex mt-[5px]">
                {splitSegments.map(s => (
                  <div key={s.label} className={cn(s.align, 'font-plex text-[8.5px] text-[#6f88a8] uppercase tracking-[.14em] flex-1')}>
                    {s.label}
                  </div>
                ))}
              </div>
            </div>

            {/* ── Section 4: Win % with teammates ── */}
            {teammates && (
              <div className="border-t border-[#1b2c46] pt-3.5">
                <div className="flex flex-wrap justify-between items-baseline gap-x-3 gap-y-1 mb-2.5">
                  <p className={STAT_LABEL_CLASS}>Win % with teammates</p>
                  <p className="font-plex text-[8.5px] uppercase tracking-[.14em] text-[#4f688a]">Min 5 together</p>
                </div>
                {teammates.length > 0 ? (
                  <TeammatesChart playerName={player.name} teammates={teammates} size="large" />
                ) : (
                  <p className="px-3 py-4 border border-dashed border-[#223a5c] rounded text-center font-inter-body text-xs text-[#6f88a8]">
                    Nobody has played 5 games with {player.name.split(' ')[0]} yet.
                  </p>
                )}
              </div>
            )}

          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}
