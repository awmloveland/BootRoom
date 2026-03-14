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
  /** Stat keys to show in the expanded body — undefined means show all */
  visibleStats?: string[]
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

const STAT_ROWS: { key: string; label: string; render: (p: Player) => React.ReactNode }[] = [
  { key: 'played',     label: 'Games Played',        render: (p) => p.played },
  { key: 'won',        label: 'Won',                 render: (p) => p.won },
  { key: 'drew',       label: 'Drawn',               render: (p) => p.drew },
  { key: 'lost',       label: 'Lost',                render: (p) => p.lost },
  { key: 'winRate',    label: 'Win Rate',            render: (p) => `${p.winRate.toFixed(1)}%` },
  { key: 'timesTeamA', label: 'Team A Appearances',  render: (p) => p.timesTeamA },
  { key: 'timesTeamB', label: 'Team B Appearances',  render: (p) => p.timesTeamB },
  { key: 'recentForm', label: 'Recent Form',         render: (p) => <RecentForm form={p.recentForm} /> },
]

export function PlayerCard({
  player,
  isOpen,
  onToggle,
  teamAssignment = null,
  onAssignCycle,
  builderMode = false,
  onDragStart,
  visibleStats,
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
              {STAT_ROWS
                .filter((row) => !visibleStats || visibleStats.includes(row.key))
                .map((row) => (
                  <StatRow key={row.key} label={row.label} value={row.render(player)} />
                ))
              }
            </div>
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}
