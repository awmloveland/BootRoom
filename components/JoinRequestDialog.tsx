'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import PlayerClaimPicker from '@/components/PlayerClaimPicker'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const RECAP_LABEL = 'shrink-0 font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]'

interface JoinRequestDialogProps {
  leagueId: string
  leagueName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function JoinRequestDialog({
  leagueId,
  leagueName,
  open,
  onOpenChange,
  onSuccess,
}: JoinRequestDialogProps) {
  const router = useRouter()
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [claimChoice, setClaimChoice] = useState<'yes' | 'no' | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  // "Yes, but I can't find my name": send without one, the admin sorts it.
  const [cantFind, setCantFind] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      // Reset state when dialog closes
      setMessage('')
      setLoading(false)
      setError(null)
      setSubmitted(false)
      setClaimChoice(null)
      setSelectedPlayer(null)
      setCantFind(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/league/${leagueId}/join-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim() || null,
          player_name: claimChoice === 'yes' ? selectedPlayer : null,
          played_before: claimChoice === 'yes' ? true : claimChoice === 'no' ? false : null,
        }),
      })

      if (res.status === 201) {
        setSubmitted(true)
        return
      }

      if (res.status === 409) {
        setError("You've already sent a request to this league.")
        return
      }

      if (res.status === 422) {
        setError("Your profile isn't set up yet. Try signing out and back in.")
        return
      }

      setError('Something went wrong. Please try again.')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleDone() {
    handleOpenChange(false)
    router.refresh()
    onSuccess()
  }

  // What they sent, played back on the confirmation.
  const note = message.trim()
  const playingAs =
    claimChoice === 'yes' ? (selectedPlayer ?? 'The admin will match you')
    : claimChoice === 'no' ? 'New player'
    : null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {submitted ? (
          <>
            <DialogHeader className="items-center pt-2 sm:text-center">
              <span className="mb-2 flex size-12 items-center justify-center rounded-full border border-[#bef264]/40 bg-[#bef264]/12">
                <Check className="size-6 text-[#bef264]" strokeWidth={2.5} aria-hidden />
              </span>
              <DialogTitle>Request sent</DialogTitle>
              <DialogDescription>
                The admins of {leagueName} have been told. We&apos;ll email you as soon as they decide.
              </DialogDescription>
            </DialogHeader>
            {(playingAs || note) && (
              <dl className="divide-y divide-[#17263c] rounded-lg border border-[#1b2c46] bg-[#0c1728] px-3">
                {playingAs && (
                  <div className="flex items-baseline justify-between gap-4 py-2.5">
                    <dt className={RECAP_LABEL}>Playing as</dt>
                    <dd className="font-inter-body text-[13px] font-semibold text-[#f4f9ff]">{playingAs}</dd>
                  </div>
                )}
                {note && (
                  <div className="py-2.5">
                    <dt className={RECAP_LABEL}>Your note</dt>
                    <dd className="mt-1 break-words font-inter-body text-[13px] leading-[1.55] text-[#cfe0f4]">{note}</dd>
                  </div>
                )}
              </dl>
            )}
            <Button
              type="button"
              onClick={handleDone}
              className="w-full py-2 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] font-bold transition-colors"
            >
              Done
            </Button>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Request to join {leagueName}</DialogTitle>
              <DialogDescription>
                Your request will be reviewed by a league admin.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-2">
              <div>
                <label
                  htmlFor="join-request-message"
                  className="block text-sm text-[#8ba4c4] mb-1"
                >
                  Add a note (optional)
                </label>
                <textarea
                  id="join-request-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. I play on Tuesdays with the 5-a-side crew"
                  rows={3}
                  maxLength={500}
                  className={cn(
                    'w-full px-4 py-2 rounded-lg resize-none',
                    'bg-[#0a1421] border border-[#1b2c46]',
                    'text-[#f4f9ff] placeholder:text-[#4f688a]',
                    'focus:outline-none focus:ring-0 focus:border-[#38bdf8]',
                  )}
                />
                <p className="mt-1 text-xs text-[#6f88a8]">
                  Visible to the admin when reviewing your request.
                </p>
              </div>

              {/* Claim step */}
              <div className="border-t border-[#1b2c46] pt-4">
                <p className="text-sm text-[#cfe0f4] font-medium mb-3">
                  Have you played in this league before?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setClaimChoice('yes')
                      setSelectedPlayer(null)
                      setCantFind(false)
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left transition-colors',
                      claimChoice === 'yes'
                        ? 'border-[#38bdf8]/50 bg-[#38bdf8]/8'
                        : 'border-[#1b2c46] bg-[#0c1728] hover:border-[#223a5c]'
                    )}
                  >
                    <p className={cn(
                      'text-sm font-medium',
                      claimChoice === 'yes' ? 'text-[#7dd3fc]' : 'text-[#dff1ff]'
                    )}>
                      Yes
                    </p>
                    <p className="text-xs text-[#8ba4c4] mt-0.5">Link my player profile</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setClaimChoice('no')
                      setSelectedPlayer(null)
                      setCantFind(false)
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left transition-colors',
                      claimChoice === 'no'
                        ? 'border-[#2c4a72] bg-[#101d31]'
                        : 'border-[#1b2c46] bg-[#0c1728] hover:border-[#223a5c]'
                    )}
                  >
                    <p className={cn(
                      'text-sm font-medium',
                      claimChoice === 'no' ? 'text-[#dff1ff]' : 'text-[#dff1ff]'
                    )}>
                      No
                    </p>
                    <p className="text-xs text-[#8ba4c4] mt-0.5">I&apos;m new to this league</p>
                  </button>
                </div>

                {claimChoice === 'yes' && (
                  <div className="mt-3">
                    {selectedPlayer ? (
                      <div className="flex items-center justify-between rounded-lg border border-[#38bdf8]/50 bg-[#38bdf8]/8 px-3 py-2">
                        <span className="text-sm text-[#7dd3fc]">{selectedPlayer}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedPlayer(null)}
                          className="text-xs text-[#8ba4c4] hover:text-[#dff1ff] transition-colors ml-2"
                        >
                          Change
                        </button>
                      </div>
                    ) : cantFind ? (
                      <div className="rounded-lg border border-[#1b2c46] bg-[#0c1728] px-3 py-2.5">
                        <p className="text-xs text-[#8ba4c4] leading-relaxed">
                          No problem, the admin will find you or add you when they approve.
                        </p>
                        <button
                          type="button"
                          onClick={() => setCantFind(false)}
                          className="mt-1.5 text-xs text-[#38bdf8] hover:text-[#7dd3fc] transition-colors"
                        >
                          Pick my name
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-[#8ba4c4] mb-2">
                          Select your name to link your match history to your account.
                        </p>
                        <PlayerClaimPicker
                          leagueId={leagueId}
                          selectionOnly
                          footerText={
                            <>
                              Can&apos;t find your name?{' '}
                              <button
                                type="button"
                                onClick={() => setCantFind(true)}
                                className="text-[#38bdf8] hover:text-[#7dd3fc] transition-colors"
                              >
                                Send without it
                              </button>
                            </>
                          }
                          onClaim={(name) => setSelectedPlayer(name)}
                          onCancel={() => {
                            setClaimChoice(null)
                            setSelectedPlayer(null)
                          }}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Pinned to the bottom of the dialog, so Send stays in reach when the name list makes the form scroll. */}
              {/* -bottom-6, not bottom-0: sticky measures from inside the dialog's padding, which this bar covers. */}
              <div className="sticky -bottom-6 -mx-6 -mb-6 -mt-3 bg-[#0a1421] px-6 pb-6 pt-3">
                {error && (
                  <p role="alert" className="mb-3 text-sm text-[#e2686f]">{error}</p>
                )}
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] font-bold transition-colors"
                >
                  {loading ? 'Sending\u2026' : 'Send request'}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
