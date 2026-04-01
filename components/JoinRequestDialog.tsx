'use client'

import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

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
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen)
    if (!nextOpen) {
      // Reset state when dialog closes
      setMessage('')
      setLoading(false)
      setError(null)
      setSubmitted(false)
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
        body: JSON.stringify({ message: message.trim() || null }),
      })

      if (res.status === 201) {
        setSubmitted(true)
        return
      }

      if (res.status === 409) {
        setError("You've already sent a request to this league.")
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
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {submitted ? (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3 mb-1">
                <CheckCircle2 className="h-6 w-6 text-sky-400 shrink-0" />
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
                className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
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
                  className="block text-sm text-slate-400 mb-1"
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
                    'bg-slate-800 border border-slate-700',
                    'text-slate-100 placeholder-slate-500',
                    'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent',
                  )}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Visible to the admin when reviewing your request.
                </p>
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-400">{error}</p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
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
