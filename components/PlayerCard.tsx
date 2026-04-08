'use client'

import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import type { Player, SortKey } from '@/lib/types'
import { FormDots } from '@/components/FormDots'
import { cn } from '@/lib/utils'

interface PlayerCardProps {
  player: Player
  isOpen: boolean
  onToggle: () => void
  sortBy: SortKey
  /** Kept for API compatibility — no longer used internally */
  visibleStats?: string[]
  /** Whether to show the ATT/BAL/DEF/GK mentality badge — defaults to true */
  showMentality?: boolean
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

const FORM_CIRCLE: Record<string, { bg: string; text: string }> = {
  W: { bg: 'bg-sky-500',   text: 'text-slate-900' },
  D: { bg: 'bg-slate-700', text: 'text-slate-400' },
  L: { bg: 'bg-red-950',   text: 'text-red-300'   },
  '-': { bg: 'bg-slate-800', text: 'text-slate-600' },
}

export function PlayerCard({
  player,
  isOpen,
  onToggle,
  sortBy,
  showMentality = true,
}: PlayerCardProps) {
  const contentId = `player-${player.name.replace(/\s+/g, '-').toLowerCase()}-content`

  const borderClass = isOpen
    ? 'border-slate-600'
    : 'border-slate-700 hover:border-slate-500'

  // recentForm is stored newest-first; reverse so oldest is leftmost, newest is rightmost
  const formChars = [...player.recentForm].reverse()
  const lastIndex = formChars.length - 1

  // flex proportions for bars — guard against all-zero to avoid invisible bars
  const total    = player.won + player.drew + player.lost || 1
  const splitTotal = player.timesTeamA + player.timesTeamB || 1

  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
      <div className={cn('rounded-lg border bg-slate-800 transition-colors duration-150', borderClass)}>
        <Collapsible.Trigger asChild>
          <button
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer"
            aria-expanded={isOpen}
            aria-controls={contentId}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold text-slate-100">{player.name}</span>
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
          </button>
        </Collapsible.Trigger>

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
                  {player.winRate.toFixed(1)}%
                </p>
              </div>

              {/* Played + Last 5 */}
              <div className="flex items-start gap-5">
                {/* Played */}
                <div className="text-right">
                  <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-0.5">Played</p>
                  <p className="text-2xl font-extrabold text-slate-100 leading-none">{player.played}</p>
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
                            )}
                          >
                            {char === '-' ? '' : char}
                          </span>
                          {isMostRecent && (
                            <span className="w-3 h-0.5 rounded-full bg-sky-400" />
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
                <div className="text-left text-[11px] font-bold text-sky-400"
                     style={{ flex: player.won }}>
                  {player.won}
                </div>
                <div className="text-left text-[11px] font-bold text-slate-500"
                     style={{ flex: player.drew }}>
                  {player.drew}
                </div>
                <div className="text-left text-[11px] font-bold text-red-400"
                     style={{ flex: player.lost }}>
                  {player.lost}
                </div>
              </div>
              {/* Bar */}
              <div className="flex h-2 rounded overflow-hidden gap-px">
                <div className="bg-sky-500 rounded-l" style={{ flex: player.won / total }} />
                <div className="bg-slate-600"          style={{ flex: player.drew / total }} />
                <div className="bg-red-500 rounded-r"  style={{ flex: player.lost / total }} />
              </div>
              {/* Labels below bar */}
              <div className="flex mt-1 gap-px">
                <div className="text-left text-[9px] text-slate-500 uppercase tracking-wide"
                     style={{ flex: player.won }}>
                  Won
                </div>
                <div className="text-left text-[9px] text-slate-500 uppercase tracking-wide"
                     style={{ flex: player.drew }}>
                  Drawn
                </div>
                <div className="text-left text-[9px] text-slate-500 uppercase tracking-wide"
                     style={{ flex: player.lost }}>
                  Lost
                </div>
              </div>
            </div>

            {/* ── Section 3: Team Split bar ── */}
            <div className="border-t border-slate-700 pt-4">
              <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-2">Team Split</p>
              {/* Numbers above bar */}
              <div className="flex mb-1 gap-px">
                <div className="text-left text-[11px] font-bold text-blue-300"
                     style={{ flex: player.timesTeamA }}>
                  {player.timesTeamA}
                </div>
                <div className="text-right text-[11px] font-bold text-violet-300"
                     style={{ flex: player.timesTeamB }}>
                  {player.timesTeamB}
                </div>
              </div>
              {/* Bar */}
              <div className="flex h-2 rounded overflow-hidden gap-px">
                <div className="bg-blue-700 rounded-l"   style={{ flex: player.timesTeamA / splitTotal }} />
                <div className="bg-violet-700 rounded-r" style={{ flex: player.timesTeamB / splitTotal }} />
              </div>
              {/* Labels below bar */}
              <div className="flex mt-1 gap-px">
                <div className="text-left text-[9px] text-slate-500 uppercase tracking-wide"
                     style={{ flex: player.timesTeamA }}>
                  Team A
                </div>
                <div className="text-right text-[9px] text-slate-500 uppercase tracking-wide"
                     style={{ flex: player.timesTeamB }}>
                  Team B
                </div>
              </div>
            </div>

          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}
