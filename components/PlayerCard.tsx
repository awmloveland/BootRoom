'use client'

import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { Player } from '@/lib/types'
import { RecentForm } from './RecentForm'
import { cn } from '@/lib/utils'

interface PlayerCardProps {
  player: Player
  isOpen: boolean
  onToggle: () => void
  /** In builder mode: which team the player is assigned to, or null if unassigned */
  teamAssignment?: 'A' | 'B' | null
  /** Called in builder mode when the card is tapped */
  onAssignCycle?: () => void
  /** When true, card is draggable and tap cycles assignment instead of expanding */
  builderMode?: boolean
  onDragStart?: (playerName: string) => void
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

const MENTALITY_LABEL: Record<string, string> = {
  goalkeeper: 'GK',
  defensive: 'DEF',
  balanced: 'BAL',
  attacking: 'ATT',
}

export function PlayerCard({
  player,
  isOpen,
  onToggle,
  teamAssignment = null,
  onAssignCycle,
  builderMode = false,
  onDragStart,
}: PlayerCardProps) {
  const contentId = `player-${player.name.replace(/\s+/g, '-').toLowerCase()}-content`

  const borderClass = builderMode
    ? teamAssignment === 'A'
      ? 'border-sky-500'
      : teamAssignment === 'B'
        ? 'border-violet-500'
        : 'border-slate-700 hover:border-slate-500'
    : isOpen
      ? 'border-slate-600'
      : 'border-slate-700 hover:border-slate-500'

  const handleOpenChange = () => {
    if (builderMode) {
      onAssignCycle?.()
    } else {
      onToggle()
    }
  }

  return (
    <Collapsible.Root open={builderMode ? false : isOpen} onOpenChange={handleOpenChange}>
      <div
        className={cn('rounded-lg border bg-slate-800 transition-colors duration-150', borderClass)}
        draggable={builderMode}
        onDragStart={
          builderMode
            ? (e) => {
                e.dataTransfer.setData('text/plain', player.name)
                e.dataTransfer.effectAllowed = 'move'
                onDragStart?.(player.name)
              }
            : undefined
        }
      >
        <Collapsible.Trigger asChild>
          <button
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer"
            aria-expanded={builderMode ? false : isOpen}
            aria-controls={contentId}
          >
            <div className="flex items-center gap-2.5">
              {/* Team assignment indicator (builder mode) */}
              {builderMode && (
                <span
                  className={cn(
                    'flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold shrink-0 transition-colors',
                    teamAssignment === 'A'
                      ? 'bg-sky-500 text-white'
                      : teamAssignment === 'B'
                        ? 'bg-violet-500 text-white'
                        : 'border border-slate-600 text-slate-600',
                  )}
                >
                  {teamAssignment ?? ''}
                </span>
              )}
              <span className="text-sm font-semibold text-slate-100">{player.name}</span>
              {/* Mentality pill */}
              <span className="text-[10px] font-medium text-slate-500 bg-slate-700/60 px-1.5 py-0.5 rounded">
                {MENTALITY_LABEL[player.mentality] ?? player.mentality}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{player.played} games</span>
              {!builderMode && (
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

        {/* Expanded body — only in normal mode */}
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
