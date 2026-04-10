'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, Pencil, Share2 } from 'lucide-react'
import { Week } from '@/lib/types'
import type { Player, ScheduledWeek } from '@/lib/types'
import { WinnerBadge } from './WinnerBadge'
import { TeamList } from './TeamList'
import { cn, shouldShowMeta, isPastDeadline, parseWeekDate } from '@/lib/utils'
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
  shareGameId?: string
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
  shareGameId?: string
}

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
  shareGameId,
}: PlayedCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)
  const [copied, setCopied] = useState(false)

  function buildRetroShareText(): string {
    if (!leagueName || !shareGameId || !week.winner) return ''
    const parsed = parseWeekDate(week.date)
    const [dd, mmm] = week.date.split(' ')
    const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
    const shortDate = `${DAY_SHORT[parsed.getDay()]} ${dd} ${mmm}`
    const resultLine =
      week.winner === 'draw'
        ? '🤝 Draw!'
        : week.winner === 'teamA'
          ? `🏆 Team A win!${week.goal_difference ? ` (+${week.goal_difference} goals)` : ''}`
          : `🏆 Team B win!${week.goal_difference ? ` (+${week.goal_difference} goals)` : ''}`

    const upset =
      week.winner !== 'draw' &&
      week.team_a_rating != null && week.team_b_rating != null &&
      ((week.winner === 'teamA' && week.team_b_rating > week.team_a_rating) ||
       (week.winner === 'teamB' && week.team_a_rating > week.team_b_rating))

    const upsetLine = upset
      ? `😱 Upset! ${week.winner === 'teamA' ? 'Team B' : 'Team A'} were stronger on paper (${
          week.winner === 'teamA'
            ? `${week.team_b_rating!.toFixed(1)} vs ${week.team_a_rating!.toFixed(1)}`
            : `${week.team_a_rating!.toFixed(1)} vs ${week.team_b_rating!.toFixed(1)}`
        })`
      : null

    const parts: string[] = [
      `⚽ ${leagueName} — Week ${week.week}`,
      `📅 ${shortDate}${week.format ? ` · ${week.format}` : ''}`,
      '',
      resultLine,
      '',
      '🔵 Team A',
      (week.teamA ?? []).join(', '),
      '',
      '🟣 Team B',
      (week.teamB ?? []).join(', '),
    ]

    if (upsetLine) { parts.push(''); parts.push(upsetLine) }
    if (week.notes?.trim()) {
      const separator = '\n\n'
      const idx = week.notes.indexOf(separator)
      const userNotes = idx > -1 ? week.notes.slice(0, idx).trim() : week.notes.trim()
      if (userNotes) { parts.push(''); parts.push(userNotes) }
    }
    parts.push(''); parts.push(`🔗 https://craft-football.com/${shareGameId}`)
    return parts.join('\n')
  }

  async function handleShare() {
    const text = buildRetroShareText()
    if (!text) return
    if (navigator.share && window.innerWidth < 768) {
      try {
        await navigator.share({ text })
      } catch (err) {
        if (err instanceof DOMException && err.name !== 'AbortError') {
          try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
        }
      }
    } else {
      try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
    }
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

                {(shouldShowMeta(week.goal_difference, week.notes) || isAdmin || (leagueName && shareGameId)) && (
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
                      {week.notes && week.notes.trim() !== '' && (() => {
                        const separator = '\n\n'
                        const idx = week.notes!.indexOf(separator)
                        const userNotes = idx > -1 ? week.notes!.slice(0, idx).trim() : week.notes!.trim()
                        const autoHighlights = idx > -1 ? week.notes!.slice(idx + separator.length).trim() : null
                        return (
                          <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-400 w-full">
                            {userNotes && (
                              <p className="italic mb-1">{userNotes}</p>
                            )}
                            {userNotes && autoHighlights && (
                              <div className="border-t border-slate-800 my-1.5" />
                            )}
                            {autoHighlights && (
                              <div className="flex flex-col gap-0.5 not-italic">
                                {autoHighlights.split('\n').filter(Boolean).map((line) => (
                                  <p key={line} className="text-slate-400">{line}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      <div className="ml-auto flex items-center gap-2">
                        {leagueName && shareGameId && (
                          <button
                            type="button"
                            onClick={handleShare}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-700 text-slate-400 text-xs hover:border-slate-500 hover:text-slate-300 transition-colors"
                          >
                            <Share2 className="h-3 w-3" />
                            {copied ? 'Copied!' : 'Share'}
                          </button>
                        )}
                        {isAdmin && (
                          <EditResultButton onClick={() => setShowEditModal(true)} />
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
  shareGameId,
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
      shareGameId={shareGameId}
    />
  )
}
