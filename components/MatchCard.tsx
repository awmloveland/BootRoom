'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, Pencil } from 'lucide-react'
import { Week } from '@/lib/types'
import type { Player, ScheduledWeek } from '@/lib/types'
import { WinnerBadge } from './WinnerBadge'
import { TeamList } from './TeamList'
import { cn, shouldShowMeta, isPastDeadline, buildResultShareText, buildDnfShareText, shareOrCopy } from '@/lib/utils'
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
  isMostRecent?: boolean
  onNameGuest?: (week: Week, guestName: string) => void
}

// ── Edit button helpers ───────────────────────────────────────────────────────

/** Small pencil icon used on non-expandable cards (cancelled, unrecorded). */
function EditIconButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="text-[#4f688a] hover:text-[#8ba4c4] p-1 rounded transition-colors"
      aria-label="Edit week"
    >
      <Pencil className="h-[13px] w-[13px]" />
    </button>
  )
}

/** Text button used inside expanded card bodies. */
function EditResultButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold hover:border-[#38bdf8] hover:text-white transition-colors"
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
      <div className="rounded-xl border border-[#17263c] bg-[#060b14] opacity-60">
        <div className="flex items-center justify-between gap-3 px-[18px] py-3">
          <div>
            <p className="text-sm font-bold tracking-[-.01em] text-[#8ba4c4]">Week {week.week}</p>
            <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">{week.date}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <WinnerBadge winner={null} cancelled />
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
      <div className="rounded-xl border border-dashed border-[#17263c] bg-[#060b14]">
        <div className="flex items-center justify-between gap-3 px-[18px] py-3">
          <div>
            <p className="text-sm font-bold tracking-[-.01em] text-[#8ba4c4]">Week {week.week}</p>
            <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">{week.date}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-plex text-[9px] font-bold uppercase tracking-[.14em] rounded px-2.5 py-[5px] whitespace-nowrap bg-transparent text-[#4f688a] border border-dashed border-[#223a5c]">
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
  leagueName?: string
  weeks?: Week[]
  onNameGuest?: (guestName: string) => void
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
  isMostRecent: boolean
  onNameGuest?: (guestName: string) => void
}

// ── DnfCard ───────────────────────────────────────────────────────────────────

interface DnfCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
  leagueName?: string
  leagueSlug?: string
  isMostRecent: boolean
  onNameGuest?: (guestName: string) => void
}

function DnfCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
  leagueName,
  leagueSlug,
  isMostRecent,
  onNameGuest,
}: DnfCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)
  const [copied, setCopied] = useState(false)

  const canShare = isMostRecent && !!(leagueName && leagueSlug)

  async function handleShare() {
    if (!canShare) return
    const shareText = buildDnfShareText({
      leagueName: leagueName!,
      leagueSlug: leagueSlug!,
      week: week.week,
      date: week.date,
      format: week.format ?? '',
      teamA: week.teamA ?? [],
      teamB: week.teamB ?? [],
      teamARating: week.team_a_rating ?? null,
      teamBRating: week.team_b_rating ?? null,
      notes: week.notes ?? '',
    })
    if (await shareOrCopy(shareText) === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <>
      <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
        <div
          className={cn(
            'rounded-xl border bg-[#0a1421] transition-colors duration-150',
            isOpen
              ? 'border-[#2c4a72] shadow-[0_18px_44px_rgba(0,0,0,.42)]'
              : 'border-[#1b2c46] hover:border-[#2c4a72]'
          )}
        >
          <Collapsible.Trigger asChild>
            <button
              className="w-full flex items-center justify-between gap-3 px-[18px] py-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] cursor-pointer"
              aria-expanded={isOpen}
              aria-controls={`week-${week.week}-dnf-content`}
            >
              <div className="text-left">
                <p className="text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">Week {week.week}</p>
                <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">
                  {week.date}
                  {week.format && <span> · {week.format}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <WinnerBadge winner={null} dnf />
                <ChevronDown
                  className={cn(
                    'h-[15px] w-[15px] text-[#6f88a8] transition-transform duration-200 flex-shrink-0',
                    isOpen && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
            </button>
          </Collapsible.Trigger>

          <Collapsible.Content
            id={`week-${week.week}-dnf-content`}
            className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
          >
            <div className="border-t border-[#1b2c46]">
              <div className="px-[18px] py-4">
                <div className="grid grid-cols-2 gap-4">
                  <TeamList
                    label="Team A"
                    players={week.teamA}
                    team="A"
                    rating={week.team_a_rating ?? null}
                    onNameGuest={onNameGuest}
                  />
                  <TeamList
                    label="Team B"
                    players={week.teamB}
                    team="B"
                    rating={week.team_b_rating ?? null}
                    onNameGuest={onNameGuest}
                  />
                </div>
                {week.notes?.trim() && (
                  <div className="border-t border-[#1b2c46] mt-3.5 pt-3.5">
                    <p className="rounded border border-[#1b2c46] bg-[#0c1728] px-3 py-[9px] font-inter-body text-xs italic leading-normal text-[#8ba4c4]">
                      {week.notes.trim()}
                    </p>
                  </div>
                )}
                {(isAdmin || canShare) && (
                  <div className="border-t border-[#1b2c46] mt-3.5 pt-3.5 flex justify-end items-center gap-2">
                    {isAdmin && (
                      <EditResultButton onClick={() => setShowEditModal(true)} />
                    )}
                    {canShare && (
                      <button
                        type="button"
                        onClick={handleShare}
                        className="h-8 px-3.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold transition-colors"
                      >
                        {copied ? 'Copied!' : 'Share'}
                      </button>
                    )}
                  </div>
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

function AwaitingResultCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  leagueSlug,
  allPlayers,
  onResultSaved,
  leagueName,
  weeks,
  onNameGuest,
}: AwaitingResultCardProps) {
  const [showResultModal, setShowResultModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  const scheduledWeek: ScheduledWeek = {
    id: week.id ?? '',
    season: week.season,
    week: week.week,
    date: week.date,
    format: week.format ?? null,
    teamA: week.teamA,
    teamB: week.teamB,
    status: 'scheduled',
    lineupMetadata: week.lineupMetadata ?? null,
    team_a_rating: week.team_a_rating ?? null,
    team_b_rating: week.team_b_rating ?? null,
  }

  return (
    <>
      <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
        <div
          className={cn(
            'rounded-xl border bg-[#0a1421] transition-colors duration-150',
            isOpen
              ? 'border-[#2c4a72] shadow-[0_18px_44px_rgba(0,0,0,.42)]'
              : 'border-[#1b2c46] hover:border-[#2c4a72]'
          )}
        >
          <Collapsible.Trigger asChild>
            <button
              className="w-full flex items-center justify-between gap-3 px-[18px] py-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] cursor-pointer"
              aria-expanded={isOpen}
              aria-controls={`week-${week.week}-awaiting-content`}
            >
              <div className="text-left">
                <p className="text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">Week {week.week}</p>
                <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">
                  {week.date}
                  {week.format && <span> · {week.format}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="font-plex text-[9px] font-bold uppercase tracking-[.14em] rounded px-2.5 py-[5px] whitespace-nowrap bg-transparent text-[#8ba4c4] border border-[#223a5c]">
                  Awaiting Result
                </span>
                <ChevronDown
                  className={cn(
                    'h-[15px] w-[15px] text-[#6f88a8] transition-transform duration-200 flex-shrink-0',
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
            <div className="border-t border-[#1b2c46]">
              <div className="px-[18px] py-4">
                <div className="grid grid-cols-2 gap-4">
                  <TeamList
                    label="Team A"
                    players={week.teamA}
                    team="A"
                    rating={week.team_a_rating ?? null}
                    onNameGuest={onNameGuest}
                  />
                  <TeamList
                    label="Team B"
                    players={week.teamB}
                    team="B"
                    rating={week.team_b_rating ?? null}
                    onNameGuest={onNameGuest}
                  />
                </div>
                {isAdmin && (
                  <div className="border-t border-[#1b2c46] mt-3.5 pt-3.5 flex justify-end gap-2">
                    <EditResultButton onClick={() => setShowEditModal(true)} />
                    <button
                      onClick={() => setShowResultModal(true)}
                      className="h-8 px-3.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold transition-colors"
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
          leagueName={leagueName ?? ''}
          weeks={weeks ?? []}
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
  isMostRecent,
  onNameGuest,
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
      if (await shareOrCopy(shareText) === 'copied') {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch { /* ignore share errors */ }
  }

  return (
    <>
      <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
        <div
          className={cn(
            'rounded-xl border bg-[#0a1421] transition-colors duration-150',
            isOpen
              ? 'border-[#2c4a72] shadow-[0_18px_44px_rgba(0,0,0,.42)]'
              : 'border-[#1b2c46] hover:border-[#2c4a72]'
          )}
        >
          <Collapsible.Trigger asChild>
            <button
              className="w-full flex items-center justify-between gap-3 px-[18px] py-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#38bdf8] cursor-pointer"
              aria-expanded={isOpen}
              aria-controls={`week-${week.week}-content`}
            >
              <div className="text-left">
                <p className="text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">Week {week.week}</p>
                <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">
                  {week.date}
                  {week.format && <span> · {week.format}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <WinnerBadge winner={week.winner} />
                <ChevronDown
                  className={cn(
                    'h-[15px] w-[15px] text-[#6f88a8] transition-transform duration-200 flex-shrink-0',
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
            <div className="border-t border-[#1b2c46]">
              <div className="px-[18px] py-4">
                <div className="grid grid-cols-2 gap-4">
                  <TeamList
                    label="Team A"
                    players={week.teamA}
                    team="A"
                    rating={week.team_a_rating}
                    goalkeepers={goalkeepers}
                    onNameGuest={onNameGuest}
                  />
                  <TeamList
                    label="Team B"
                    players={week.teamB}
                    team="B"
                    rating={week.team_b_rating}
                    goalkeepers={goalkeepers}
                    onNameGuest={onNameGuest}
                  />
                </div>

                {(shouldShowMeta(week.goal_difference, week.notes) || isAdmin || (isMostRecent && leagueName && leagueSlug && !!weeks)) && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 mt-3.5 pt-3.5 border-t border-[#1b2c46]">
                      {week.goal_difference != null && week.goal_difference !== 0 && (
                        <span className="rounded border border-[#1b2c46] bg-[#0c1728] px-2.5 py-1.5 font-plex text-[9.5px] font-bold uppercase tracking-[.14em] text-[#bef264] whitespace-nowrap">
                          Margin +{week.goal_difference} goals
                        </span>
                      )}
                      {week.notes?.trim() && (
                        <p className="w-full rounded border border-[#1b2c46] bg-[#0c1728] px-3 py-[9px] font-inter-body text-xs italic leading-normal text-[#8ba4c4]">
                          {week.notes.trim()}
                        </p>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        {isAdmin && (
                          <EditResultButton onClick={() => setShowEditModal(true)} />
                        )}
                        {isMostRecent && leagueName && leagueSlug && weeks && (
                          <button
                            type="button"
                            onClick={handleShare}
                            className="h-8 px-3.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold transition-colors"
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
  isMostRecent = false,
  onNameGuest,
}: MatchCardProps) {
  const nameGuestHandler =
    isAdmin && week.id && onNameGuest
      ? (guestName: string) => onNameGuest(week, guestName)
      : undefined

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
  if (week.status === 'dnf') {
    return (
      <DnfCard
        week={week}
        isOpen={isOpen}
        onToggle={onToggle}
        isAdmin={isAdmin}
        gameId={gameId}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
        leagueName={leagueName}
        leagueSlug={leagueSlug}
        isMostRecent={isMostRecent}
        onNameGuest={nameGuestHandler}
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
        leagueName={leagueName}
        weeks={weeks}
        onNameGuest={nameGuestHandler}
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
      isMostRecent={isMostRecent}
      onNameGuest={nameGuestHandler}
    />
  )
}
