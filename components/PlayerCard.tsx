'use client'

import * as Collapsible from '@radix-ui/react-collapsible'
import { Check, ChevronDown } from 'lucide-react'
import { Player } from '@/lib/types'
import { RecentForm } from './RecentForm'
import { cn } from '@/lib/utils'

interface PlayerCardProps {
  player: Player
  isOpen: boolean
  onToggle: () => void
  rank?: number
  compareMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
}

interface StatRowProps {
  label: string
  value: React.ReactNode
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <div>
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <div className="text-sm font-medium text-slate-100 mt-0.5">{value}</div>
    </div>
  )
}

export function PlayerCard({
  player,
  isOpen,
  onToggle,
  rank,
  compareMode = false,
  isSelected = false,
  onSelect,
}: PlayerCardProps) {
  const contentId = `player-${player.name.replace(/\s+/g, '-').toLowerCase()}-content`

  const handleOpenChange = (_open: boolean) => {
    if (compareMode) {
      onSelect?.()
    } else {
      onToggle()
    }
  }

  return (
    <Collapsible.Root open={compareMode ? false : isOpen} onOpenChange={handleOpenChange}>
      <div
        className={cn(
          'rounded-lg border bg-slate-800 transition-colors duration-150',
          compareMode && isSelected
            ? 'border-sky-500'
            : isOpen
              ? 'border-slate-600'
              : 'border-slate-700 hover:border-slate-500',
        )}
      >
        {/* Collapsed header */}
        <Collapsible.Trigger asChild>
          <button
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer"
            aria-expanded={compareMode ? isSelected : isOpen}
            aria-controls={contentId}
          >
            <div className="flex items-center gap-2.5">
              {compareMode ? (
                <span
                  className={cn(
                    'flex items-center justify-center h-4 w-4 rounded-full border transition-colors shrink-0',
                    isSelected ? 'bg-sky-500 border-sky-500' : 'border-slate-500',
                  )}
                >
                  {isSelected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                </span>
              ) : (
                rank !== undefined && (
                  <span
                    className={cn(
                      'text-xs font-mono font-medium tabular-nums w-6 text-right shrink-0',
                      !player.qualified
                        ? 'text-slate-600'
                        : rank === 1
                          ? 'text-amber-400'
                          : rank <= 3
                            ? 'text-slate-300'
                            : 'text-slate-500',
                    )}
                  >
                    #{rank}
                  </span>
                )
              )}
              <span
                className={cn(
                  'text-sm font-semibold',
                  !player.qualified && rank !== undefined && !compareMode
                    ? 'text-slate-500'
                    : 'text-slate-100',
                )}
              >
                {player.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {!compareMode && rank !== undefined && !player.qualified && (
                <span className="text-xs text-slate-600">few games</span>
              )}
              <span className="text-xs text-slate-400">{player.played} games played</span>
              {!compareMode && (
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-slate-400 transition-transform duration-200 flex-shrink-0',
                    isOpen && 'rotate-180',
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
          </button>
        </Collapsible.Trigger>

        {/* Expanded body */}
        <Collapsible.Content
          id={contentId}
          className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
        >
          <div className="border-t border-slate-700 p-4">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              <StatRow label="Games Played" value={player.played} />
              <StatRow label="Won" value={player.won} />
              <StatRow label="Drawn" value={player.drew} />
              <StatRow label="Lost" value={player.lost} />
              <StatRow label="Win Rate" value={`${player.winRate.toFixed(1)}%`} />
              <StatRow label="Team A Appearances" value={player.timesTeamA} />
              <StatRow label="Team B Appearances" value={player.timesTeamB} />
              <StatRow label="Recent Form" value={<RecentForm form={player.recentForm} />} />
            </div>
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}
