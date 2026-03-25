'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { Week } from '@/lib/types'
import type { Player, ScheduledWeek } from '@/lib/types'
import { WinnerBadge } from './WinnerBadge'
import { TeamList } from './TeamList'
import { cn, shouldShowMeta, isPastDeadline } from '@/lib/utils'
import { ResultModal } from '@/components/ResultModal'

interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
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

/** Unrecorded card — game day passed with no lineup built. Non-interactive. */
function UnrecordedCard({ week }: { week: Week }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-[#131c2e]">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Week {week.week}</p>
          <p className="text-xs text-slate-600">{week.date}</p>
        </div>
        <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap bg-[#131c2e] text-slate-600 border border-dashed border-slate-700">
          Unrecorded
        </span>
      </div>
    </div>
  )
}

interface AwaitingResultCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
}

/** Awaiting Result card — lineup was built but game day passed without a result. */
function AwaitingResultCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
}: AwaitingResultCardProps) {
  const [showResultModal, setShowResultModal] = useState(false)

  const scheduledWeek: ScheduledWeek = {
    id: week.id ?? '',
    week: week.week,
    date: week.date,
    format: week.format ?? null,
    teamA: week.teamA,
    teamB: week.teamB,
    status: 'scheduled',
    lineupMetadata: week.lineupMetadata ?? null,
  }

  return (
    <>
      <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
        <div
          className={cn(
            'rounded-lg border bg-slate-800 transition-colors duration-150',
            isOpen ? 'border-slate-600' : 'border-slate-700 hover:border-slate-500'
          )}
        >
          <Collapsible.Trigger asChild>
            <button
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer"
              aria-expanded={isOpen}
              aria-controls={`week-${week.week}-awaiting-content`}
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">Week {week.week}</p>
                <p className="text-xs text-slate-400">
                  {week.date}
                  {week.format && <span className="ml-2 text-slate-400">· {week.format}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap bg-slate-800 text-slate-400 border border-slate-600">
                  Awaiting Result
                </span>
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

          <Collapsible.Content
            id={`week-${week.week}-awaiting-content`}
            className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
          >
            <div className="border-t border-slate-700">
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <TeamList label="Team A" players={week.teamA} team="A" />
                  <TeamList label="Team B" players={week.teamB} team="B" />
                </div>
                {isAdmin && (
                  <div className="border-t border-slate-700 mt-4 pt-4 flex justify-end">
                    <button
                      onClick={() => setShowResultModal(true)}
                      className="px-4 py-2 rounded-md bg-slate-100 text-slate-900 text-sm font-semibold hover:bg-white transition-colors"
                    >
                      Record Result
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {showResultModal && (
        <ResultModal
          scheduledWeek={scheduledWeek}
          lineupMetadata={week.lineupMetadata ?? null}
          allPlayers={allPlayers}
          gameId={gameId}
          publicMode={false}
          onSaved={() => {
            setShowResultModal(false)
            onResultSaved()
          }}
          onClose={() => setShowResultModal(false)}
        />
      )}
    </>
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
              {/* Team line-ups — 2 cols always */}
              <div className="grid grid-cols-2 gap-4">
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

export function MatchCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin = false,
  gameId = '',
  allPlayers = [],
  onResultSaved = () => {},
}: MatchCardProps) {
  if (week.status === 'cancelled') return <CancelledCard week={week} />
  if (week.status === 'unrecorded') return <UnrecordedCard week={week} />
  // Current (not-past-deadline) scheduled weeks belong to NextMatchCard, not the history list
  if (week.status === 'scheduled' && !isPastDeadline(week.date)) return null
  if (week.status === 'scheduled' && isPastDeadline(week.date)) {
    return (
      <AwaitingResultCard
        week={week}
        isOpen={isOpen}
        onToggle={onToggle}
        isAdmin={isAdmin}
        gameId={gameId}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
      />
    )
  }
  return <PlayedCard week={week} isOpen={isOpen} onToggle={onToggle} goalkeepers={goalkeepers} />
}
