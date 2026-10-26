'use client'

import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Share2 } from 'lucide-react'
import { isPastDeadline, buildShareText, shareOrCopy, fetchLineupShareUrl } from '@/lib/utils'
import type { Player, ScheduledWeek } from '@/lib/types'
import { FormatLabel } from '@/components/FormatLabel'
import { FaceOffLineup } from '@/components/TeamList'

/**
 * Sharing for the saved line-up. Pass the week only while its line-up is on
 * screen; null fetches nothing.
 */
export function useLineupShare({ gameId, leagueSlug, leagueName, week }: {
  gameId: string
  leagueSlug: string
  leagueName: string
  week: ScheduledWeek | null
}) {
  const [copied, setCopied] = useState(false)

  // Signed share link for the saved lineup, fetched before the tap: iOS
  // Safari drops navigator.share if it awaits a request after the click.
  // Keyed on the week and teams so an edit fetches a fresh link and a stale
  // one is never used.
  const [shareLink, setShareLink] = useState<{ key: string; url: string | null } | null>(null)
  const shareWeekId = week?.id ?? null
  const shareKey =
    week && week.teamA.length > 0 && week.teamB.length > 0
      ? JSON.stringify([week.id, week.teamA, week.teamB])
      : null
  useEffect(() => {
    if (!shareKey || !shareWeekId) return
    let cancelled = false
    fetchLineupShareUrl(gameId, shareWeekId).then((url) => {
      if (!cancelled) setShareLink({ key: shareKey, url })
    })
    return () => { cancelled = true }
  }, [gameId, shareKey, shareWeekId])
  const signedShareUrl = shareLink?.key === shareKey ? shareLink.url : null

  async function share() {
    if (!week || !leagueName) return
    const text = buildShareText({
      leagueName,
      leagueSlug,
      week: week.week,
      date: week.date,
      format: week.format ?? '',
      teamA: week.teamA,
      teamB: week.teamB,
      teamARating: week.team_a_rating ?? null,
      teamBRating: week.team_b_rating ?? null,
      shareUrl: signedShareUrl ?? undefined,
    })
    if (await shareOrCopy(text) === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return { share, copied }
}

interface LineupCardProps {
  week: ScheduledWeek
  allPlayers: Player[]
  kickoffTime: string | null
  canEdit: boolean
  /** The viewer's linked player, for the YOU tag. */
  linkedPlayerName: string | null
  copied: boolean
  onShare: () => void
  onCancelGame: () => void
  onEditLineup: () => void
  onResultGame: () => void
}

/** The Results tab's saved line-up: header, face-off and the admin actions. */
export function LineupCard({
  week,
  allPlayers,
  kickoffTime,
  canEdit,
  linkedPlayerName,
  copied,
  onShare,
  onCancelGame,
  onEditLineup,
  onResultGame,
}: LineupCardProps) {
  const goalkeepers = useMemo(
    () => allPlayers.filter((p) => p.mentality === 'goalkeeper').map((p) => p.name),
    [allPlayers]
  )

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-[18px] py-3 border-b border-[#1b2c46]">
        <div>
          <p className="text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">Week {week.week}</p>
          <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#6f88a8]">
            {week.date}
            {week.format && <span> · <FormatLabel format={week.format} /></span>}
          </p>
        </div>
        {isPastDeadline(week.date, kickoffTime) ? (
          <span className="px-2.5 py-[5px] rounded border border-[#223a5c] font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#8ba4c4] whitespace-nowrap">
            Awaiting Result
          </span>
        ) : (
          <span className="inline-flex items-center gap-[7px] px-2.5 py-[5px] rounded border border-[#38bdf8]/40 bg-[#38bdf8]/12 font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#7dd3fc] whitespace-nowrap">
            <span className="size-1.5 rounded-full bg-[#38bdf8] animate-cf-pulse motion-reduce:animate-none" />
            Upcoming
          </span>
        )}
      </div>

      <div className="px-[18px] py-4">
        <FaceOffLineup
          teamA={week.teamA}
          teamB={week.teamB}
          teamARating={week.team_a_rating}
          teamBRating={week.team_b_rating}
          winner={null}
          goalkeepers={goalkeepers}
          linkedPlayerName={linkedPlayerName}
        />
        {week.lineupMetadata?.autoPick?.edited && (
          <span className="mt-3 inline-block font-plex text-[9.5px] font-bold uppercase tracking-[.16em] text-[#8ba4c4] border border-[#223a5c] rounded px-1.5 py-0.5">
            Adjusted by hand
          </span>
        )}

        {week.teamA.length > 0 && week.teamB.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 mt-3.5 pt-3.5 border-t border-[#1b2c46]">
            {canEdit ? (
              <button
                type="button"
                onClick={onCancelGame}
                className="h-8 px-3 rounded border border-[#e2686f]/40 text-[#e2686f] text-xs font-bold whitespace-nowrap hover:bg-[#e2686f]/10 transition-colors"
              >
                Cancel Game
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={onEditLineup}
                    className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
                  >
                    <span className="sm:hidden">Edit</span>
                    <span className="hidden sm:inline">Edit Lineups</span>
                  </button>
                  <button
                    type="button"
                    onClick={onResultGame}
                    className="h-8 px-3.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold whitespace-nowrap transition-colors"
                  >
                    <span className="sm:hidden">Result</span>
                    <span className="hidden sm:inline">Result Game</span>
                  </button>
                </>
              )}
              <ShareButton copied={copied} onShare={onShare} />
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function ShareButton({ copied, onShare }: { copied: boolean; onShare: () => void }) {
  return (
    <button
      type="button"
      onClick={onShare}
      aria-label="Share"
      className="inline-flex items-center h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
    >
      <Share2 className="size-[15px] sm:hidden" aria-hidden="true" />
      <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
    </button>
  )
}

interface CancelGameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  week: number
  date: string
  saving: boolean
  error: string | null
  onConfirm: () => void
}

/** Confirms cancelling the next match, from the idle card or a saved line-up. */
export function CancelGameDialog({ open, onOpenChange, week, date, saving, error, onConfirm }: CancelGameDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[#030710]/80 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-[calc(100%-32px)] sm:max-w-sm rounded-[14px] bg-[#0a1421] border border-[#1b2c46] p-5 shadow-[0_34px_80px_rgba(0,0,0,.65)] focus:outline-none">
          <Dialog.Title className="text-base font-bold tracking-[-.02em] text-[#f4f9ff] mb-2.5">
            Cancel Week {week}?
          </Dialog.Title>
          <Dialog.Description className="font-inter-body text-[13px] leading-[1.55] text-[#8ba4c4] mb-5">
            This will mark the game as cancelled. You can reactivate it before {date} at 8 pm if plans change.
          </Dialog.Description>
          {error && <p className="font-inter-body text-xs text-[#e2686f] mb-4">{error}</p>}
          <div className="flex gap-2 justify-end">
            <Dialog.Close asChild>
              <button
                type="button"
                className="h-9 px-3.5 rounded border border-[#223a5c] text-[#cfe0f4] text-[13px] font-semibold hover:border-[#38bdf8] hover:text-white transition-colors"
              >
                Keep it
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={saving}
              className="h-9 px-4 rounded border border-[#e2686f]/40 text-[#e2686f] text-[13px] font-bold hover:bg-[#e2686f]/10 transition-colors disabled:opacity-50"
            >
              {saving ? 'Cancelling…' : 'Confirm Cancellation'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
