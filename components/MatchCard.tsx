'use client'

import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { Week } from '@/lib/types'
import { WinnerBadge } from './WinnerBadge'
import { TeamList } from './TeamList'
import { cn, shouldShowMeta } from '@/lib/utils'

interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
}

/** Cancelled card — muted, non-interactive. */
function CancelledCard({ week }: { week: Week }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 opacity-60">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Week {week.week}</p>
          <p className="text-xs text-slate-600">{week.date}</p>
        </div>
        <WinnerBadge winner={null} cancelled />
      </div>
    </div>
  )
}

/** Played card — collapsible accordion entry. */
function PlayedCard({ week, isOpen, onToggle, goalkeepers }: MatchCardProps) {
  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
      <div
        className={cn(
          'rounded-lg border bg-slate-800 transition-colors duration-150',
          isOpen ? 'border-slate-600' : 'border-slate-700 hover:border-slate-500'
        )}
      >
        {/* Header row — always visible */}
        <Collapsible.Trigger asChild>
          <button
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer"
            aria-expanded={isOpen}
            aria-controls={`week-${week.week}-content`}
          >
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-100">Week {week.week}</p>
              <p className="text-xs text-slate-400">
                {week.date}
                {week.format && (
                  <span className="ml-2 text-slate-400">· {week.format}</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <WinnerBadge winner={week.winner} />
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-slate-400 transition-transform duration-200 flex-shrink-0',
                  isOpen && 'rotate-180'
                )}
                aria-hidden="true"
              />
            </div>
          </button>
        </Collapsible.Trigger>

        {/* Expanded body */}
        <Collapsible.Content
          id={`week-${week.week}-content`}
          className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
        >
          <div className="border-t border-slate-700">
            <div className="p-4">
              {/* Team line-ups — 2 cols on sm+, 1 col on mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TeamList
                  label="Team A"
                  players={week.teamA}
                  team="A"
                  rating={week.team_a_rating}
                  goalkeepers={goalkeepers}
                />
                <TeamList
                  label="Team B"
                  players={week.teamB}
                  team="B"
                  rating={week.team_b_rating}
                  goalkeepers={goalkeepers}
                />
              </div>

              {/* Meta row — margin of victory + notes pills */}
              {shouldShowMeta(week.goal_difference, week.notes) && (
                <>
                  <div className="border-t border-slate-700 mt-3" />
                  <div className="flex flex-wrap gap-2 mt-3">
                    {week.goal_difference != null && week.goal_difference !== 0 && (
                      <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1">
                          Margin
                        </span>
                        +{week.goal_difference} goals
                      </div>
                    )}
                    {week.notes && week.notes.trim() !== '' && (
                      <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1">
                          Notes
                        </span>
                        {week.notes}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}

export function MatchCard({ week, isOpen, onToggle, goalkeepers }: MatchCardProps) {
  if (week.status === 'cancelled') {
    return <CancelledCard week={week} />
  }
  return <PlayedCard week={week} isOpen={isOpen} onToggle={onToggle} goalkeepers={goalkeepers} />
}
