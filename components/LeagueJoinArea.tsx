'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Settings, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'
import type { JoinRequestStatus } from '@/lib/types'

interface LeagueJoinAreaProps {
  leagueId: string
  leagueName: string
  joinStatus: JoinRequestStatus | 'member' | 'not-member' | null
  isAdmin: boolean
}

function isMemberStatus(s: JoinRequestStatus | 'member' | 'not-member' | null): boolean {
  return s === 'member' || s === 'approved' || s === 'creator' || s === 'admin'
}

export function LeagueJoinArea({ leagueId, leagueName, joinStatus, isAdmin }: LeagueJoinAreaProps) {
  const [showToast, setShowToast] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

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

  const showJoin = joinStatus === null || joinStatus === 'not-member' || joinStatus === 'none'
  const showPending = joinStatus === 'pending'
  const showShare = isMemberStatus(joinStatus)

  return (
    <>
      <div className="flex items-center gap-2">
        {showJoin && (
          <Button
            size="xs"
            className="h-7 bg-sky-600 text-white hover:bg-sky-500"
            onClick={() => setDialogOpen(true)}
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
            <Share2 className="mr-1.5 size-3.5" />
            Share
          </Button>
        )}
        {isAdmin && (
          <Button
            asChild
            variant="ghost"
            className="h-7 w-7 border border-slate-700 text-slate-500 hover:bg-slate-800 hover:text-slate-400"
          >
            <Link href={`/${leagueId}/settings`} aria-label="League settings">
              <Settings className="size-4" />
            </Link>
          </Button>
        )}
      </div>

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
