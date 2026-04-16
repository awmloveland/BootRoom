'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, Pencil } from 'lucide-react'
import { Week } from '@/lib/types'
import type { Player, ScheduledWeek } from '@/lib/types'
import { WinnerBadge } from './WinnerBadge'
import { TeamList } from './TeamList'
import { cn, shouldShowMeta, isPastDeadline, buildResultShareText } from '@/lib/utils'
import { ResultModal } from '@/components/ResultModal'
import { EditWeekModal } from '@/components/EditWeekModal'

interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
  leagueName?: string
  leagueSlug?: string
  weeks?: Week[]
}

// ── Edit button helpers ───────────────────────────────────────────────────────

/** Small pencil icon used on non-expandable cards (cancelled, unrecorded). */
function EditIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="text-slate-600 hover:text-slate-400 p-1 rounded transition-colors"
      aria-label="Edit week"
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  )
}

/** Text button used inside expanded card bodies. */
function EditResultButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-md border border-slate-700 text-slate-400 text-sm hover:border-slate-500 hover:text-slate-300 transition-colors"
    >
      Edit result
    </button>
  )
}

// ── CancelledCard ─────────────────────────────────────────────────────────────

interface NonExpandableCardProps {
  week: Week
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
}

function CancelledCard({
  week,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
}: NonExpandableCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)

  return (
    <>
      <div className="rounded-lg border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="opacity-60">
            <p className="text-sm font-medium text-slate-500">Week {week.week}</p>
            <p className="text-xs text-slate-600">{week.date}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="opacity-60">
              <WinnerBadge winner={null} cancelled />
            </div>
            {isAdmin && (
              <EditIconButton onClick={() => setShowEditModal(true)} />
            )}
          </div>
        </div>
      </div>
      {showEditModal && (
        <EditWeekModal
          week={week}
          gameId={gameId}
          allPlayers={allPlayers}
          onSaved={() => { setShowEditModal(false); onResultSaved() }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  )
}

// ── UnrecordedCard ────────────────────────────────────────────────────────────

function UnrecordedCard({
  week,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
}: NonExpandableCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)

  return (
    <>
      <div className="rounded-lg border border-dashed border-slate-700 bg-[#131c2e]">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-500">Week {week.week}</p>
            <p className="text-xs text-slate-600">{week.date}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap bg-[#131c2e] text-slate-600 border border-dashed border-slate-700">
              Unrecorded
            </span>
            {isAdmin && (
              <EditIconButton onClick={() => setShowEditModal(true)} />
            )}
          </div>
        </div>
      </div>
      {showEditModal && (
        <EditWeekModal
          week={week}
          gameId={gameId}
          allPlayers={allPlayers}
          onSaved={() => { setShowEditModal(false); onResultSaved() }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  )
}

// ── AwaitingResultCard ────────────────────────────────────────────────────────

interface AwaitingResultCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  gameId: string
  leagueSlug?: string
  allPlayers: Player[]
  onResultSaved: () => void
}

interface PlayedCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
  leagueName?: string
  leagueSlug?: string
  weeks?: Week[]
}

function AwaitingResultCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  leagueSlug,
  allPlayers,
  onResultSaved,
}: AwaitingResultCardProps) {
  const [showResultModal, setShowResultModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

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
                  <TeamList
                    label="Team A"
                    players={week.teamA}
                    team="A"
                    rating={week.team_a_rating ?? null}
                  />
                  <TeamList
                    label="Team B"
                    players={week.teamB}
                    team="B"
                    rating={week.team_b_rating ?? null}
                  />
                </div>
                {isAdmin && (
                  <div className="border-t border-slate-700 mt-4 pt-4 flex justify-end gap-2">
                    <EditResultButton onClick={() => setShowEditModal(true)} />
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
          leagueSlug={leagueSlug ?? ''}
          leagueName=""
          weeks={[]}
          publicMode={false}
          onSaved={() => {
            setShowResultModal(false)
            onResultSaved()
          }}
          onClose={() => setShowResultModal(false)}
        />
      )}
      {showEditModal && (
        <EditWeekModal
          week={week}
          gameId={gameId}
          allPlayers={allPlayers}
          onSaved={() => { setShowEditModal(false); onResultSaved() }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  )
}

// ── PlayedCard ────────────────────────────────────────────────────────────────

function PlayedCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
  leagueName,
  leagueSlug,
  weeks,
}: PlayedCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleShare() {
    if (!leagueName || !leagueSlug || !weeks || !week.winner) return
    try {
      const { shareText } = buildResultShareText({
        leagueName,
        leagueSlug,
        week: week.week,
        date: week.date,
        format: week.format ?? '',
        teamA: week.teamA ?? [],
        teamB: week.teamB ?? [],
        winner: week.winner,
        goalDifference: week.goal_difference ?? 0,
        teamARating: week.team_a_rating ?? 0,
        teamBRating: week.team_b_rating ?? 0,
        players: allPlayers,
        weeks,
      })
      if (navigator.share && window.innerWidth < 768) {
        try {
          await navigator.share({ text: shareText })
        } catch (err) {
          if (err instanceof DOMException && err.name !== 'AbortError') {
            try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
          }
        }
      } else {
        try { await navigator.clipboard.writeText(shareText); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
      }
    } catch { /* ignore share errors */ }
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

          <Collapsible.Content
            id={`week-${week.week}-content`}
            className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
          >
            <div className="border-t border-slate-700">
              <div className="p-4">
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

                {(shouldShowMeta(week.goal_difference, week.notes) || isAdmin || (leagueName && leagueSlug && !!weeks)) && (
                  <>
                    <div className="border-t border-slate-700 mt-3" />
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      {week.goal_difference != null && week.goal_difference !== 0 && (
                        <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1">
                            Margin
                          </span>
                          +{week.goal_difference} goals
                        </div>
                      )}
                      {week.notes?.trim() && (
                        <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-400 italic w-full">
                          {week.notes.trim()}
                        </div>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        {isAdmin && (
                          <EditResultButton onClick={() => setShowEditModal(true)} />
                        )}
                        {leagueName && leagueSlug && weeks && (
                          <button
                            type="button"
                            onClick={handleShare}
                            className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
                          >
                            {copied ? 'Copied!' : 'Share'}
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {showEditModal && (
        <EditWeekModal
          week={week}
          gameId={gameId}
          allPlayers={allPlayers}
          onSaved={() => { setShowEditModal(false); onResultSaved() }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  )
}

// ── MatchCard (public export) ─────────────────────────────────────────────────

export function MatchCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin = false,
  gameId = '',
  allPlayers = [],
  onResultSaved = () => {},
  leagueName,
  leagueSlug,
  weeks,
}: MatchCardProps) {
  if (week.status === 'cancelled') {
    return (
      <CancelledCard
        week={week}
        isAdmin={isAdmin}
        gameId={gameId}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
      />
    )
  }
  if (week.status === 'unrecorded') {
    return (
      <UnrecordedCard
        week={week}
        isAdmin={isAdmin}
        gameId={gameId}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
      />
    )
  }
  if (week.status === 'scheduled' && !isPastDeadline(week.date)) return null
  if (week.status === 'scheduled' && isPastDeadline(week.date)) {
    return (
      <AwaitingResultCard
        week={week}
        isOpen={isOpen}
        onToggle={onToggle}
        isAdmin={isAdmin}
        gameId={gameId}
        leagueSlug={leagueSlug}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
      />
    )
  }
  return (
    <PlayedCard
      week={week}
      isOpen={isOpen}
      onToggle={onToggle}
      goalkeepers={goalkeepers}
      isAdmin={isAdmin}
      gameId={gameId}
      allPlayers={allPlayers}
      onResultSaved={onResultSaved}
      leagueName={leagueName}
      leagueSlug={leagueSlug}
      weeks={weeks}
    />
  )
}
