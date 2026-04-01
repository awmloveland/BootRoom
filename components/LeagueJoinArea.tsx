'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { SlidersHorizontal, Link as LinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'
import { AuthDialog } from '@/components/AuthDialog'
import type { JoinRequestStatus } from '@/lib/types'

interface LeagueJoinAreaProps {
  leagueId: string
  leagueName: string
  joinStatus: JoinRequestStatus | 'member' | 'not-member' | null
  isAdmin: boolean
  pendingRequestCount?: number
}

function isMemberStatus(s: JoinRequestStatus | 'member' | 'not-member' | null): boolean {
  return s === 'member' || s === 'approved'
}

export function LeagueJoinArea({ leagueId, leagueName, joinStatus, isAdmin, pendingRequestCount = 0 }: LeagueJoinAreaProps) {
  const [showToast, setShowToast] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)

  useEffect(() => {
    if (showToast) {
      const id = setTimeout(() => setShowToast(false), 2000)
      return () => clearTimeout(id)
    }
  }, [showToast])

  function handleShareClick() {
    navigator.clipboard.writeText(window.location.href).catch(() => {})
    setShowToast(true)
  }

  function handleJoinClick() {
    if (joinStatus === null) {
      // Unauthenticated — open signup flow first
      setAuthDialogOpen(true)
    } else {
      // Authenticated, not a member — open join request directly
      setDialogOpen(true)
    }
  }

  const showJoin = joinStatus === null || joinStatus === 'not-member' || joinStatus === 'none' || joinStatus === 'declined'
  const showPending = joinStatus === 'pending'
  const showShare = isMemberStatus(joinStatus)

  return (
    <>
      <div className="flex items-center gap-2">
        {showJoin && (
          <Button
            size="xs"
            className="h-7 bg-sky-600 text-white hover:bg-sky-500"
            onClick={handleJoinClick}
          >
            Join
          </Button>
        )}
        {showPending && (
          <Button
            size="xs"
            variant="ghost"
            disabled
            className="h-7 cursor-default text-slate-400"
          >
            Request pending
          </Button>
        )}
        {showShare && (
          <Button
            size="xs"
            variant="ghost"
            className="h-7 border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-300"
            onClick={handleShareClick}
          >
            <LinkIcon className="mr-1.5 size-3.5" />
            Share
          </Button>
        )}
        {isAdmin && (
          <div className="relative">
            <Button
              asChild
              size="xs"
              variant="ghost"
              className="w-7 p-0 border border-slate-700 text-slate-500 hover:bg-slate-800 hover:text-slate-400"
            >
              <Link href={`/${leagueId}/settings`} aria-label="League settings">
                <SlidersHorizontal className="size-4" />
              </Link>
            </Button>
            {pendingRequestCount > 0 && (
              <span
                aria-label={`${pendingRequestCount} pending request${pendingRequestCount === 1 ? '' : 's'}`}
                className="pointer-events-none absolute right-0.5 top-0.5 size-2 rounded-full bg-red-500 ring-1 ring-slate-900"
              />
            )}
          </div>
        )}
      </div>

      <AuthDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        initialMode="signup"
        leagueName={leagueName}
        onSignedUp={() => {
          setAuthDialogOpen(false)
          setDialogOpen(true)
        }}
      />

      <JoinRequestDialog
        leagueId={leagueId}
        leagueName={leagueName}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setDialogOpen(false)}
      />

      {showToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 shadow-lg">
          <span className="size-2 rounded-full bg-sky-500" />
          Link copied
        </div>
      )}
    </>
  )
}
