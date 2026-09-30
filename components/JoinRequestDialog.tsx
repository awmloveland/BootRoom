'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
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

const JOIN_CLAIM_FOOTER =
  "Can't find your name? You may have played before records began. Mention it in your note above and the admin will sort it out."

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
          player_name: selectedPlayer ?? undefined,
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {submitted ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <CheckCircle2 className="h-6 w-6 text-[#38bdf8] shrink-0" />
                <DialogTitle>Request sent!</DialogTitle>
              </div>
              <DialogDescription>
                We&apos;ve notified the league admin. You&apos;ll get access once they approve your request.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-2">
              <Button
                type="button"
                onClick={handleDone}
                className="w-full py-2 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] font-bold transition-colors"
              >
                Done
              </Button>
            </div>
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
                    ) : (
                      <>
                        <p className="text-xs text-[#8ba4c4] mb-2">
                          Select your name to link your match history to your account.
                        </p>
                        <PlayerClaimPicker
                          leagueId={leagueId}
                          selectionOnly
                          footerText={JOIN_CLAIM_FOOTER}
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

              {error && (
                <p role="alert" className="text-sm text-[#e2686f]">{error}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] font-bold transition-colors"
              >
                {loading ? 'Sending\u2026' : 'Send request'}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
