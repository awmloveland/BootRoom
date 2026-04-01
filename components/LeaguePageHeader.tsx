'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Settings, ClipboardList, Users, FlaskConical, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LeagueInfoBar } from '@/components/LeagueInfoBar'
import type { LeagueDetails, JoinRequestStatus } from '@/lib/types'

interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  playedCount: number
  totalWeeks: number
  pct: number
  currentTab: 'results' | 'players' | 'lineup-lab'
  isAdmin: boolean
  details?: LeagueDetails | null
  joinStatus?: JoinRequestStatus | 'member' | 'not-member' | null
  onJoinClick?: () => void
}

function isMemberStatus(status: JoinRequestStatus | 'member' | 'not-member' | null): boolean {
  return status === 'member' || status === 'approved' || status === 'creator' || status === 'admin'
}

export function LeaguePageHeader({
  leagueName,
  leagueId,
  playedCount,
  totalWeeks,
  pct,
  currentTab,
  isAdmin,
  details,
  joinStatus = null,
  onJoinClick,
}: LeaguePageHeaderProps) {
  const [showToast, setShowToast] = useState(false)

  function handleShareClick() {
    navigator.clipboard.writeText(window.location.href).catch(() => {})
    setShowToast(true)
    setTimeout(() => setShowToast(false), 2000)
  }

  const showJoin = joinStatus === null || joinStatus === 'not-member' || joinStatus === 'none'
  const showPending = joinStatus === 'pending'
  const showShare = isMemberStatus(joinStatus)

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">{leagueName}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {playedCount} of {totalWeeks} weeks · {pct}% complete
          </p>
        </div>
        <div className="flex items-center gap-2">
          {showJoin && (
            <Button
              size="xs"
              className="h-7 bg-sky-600 text-white hover:bg-sky-500"
              onClick={onJoinClick}
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
      </div>
      <div className="mt-3">
        <LeagueInfoBar details={details} leagueId={leagueId} isAdmin={isAdmin} />
      </div>
      <nav className="flex gap-6 border-b border-slate-700 pt-5">
        <Link
          href={`/${leagueId}/results`}
          className={cn(
            '-mb-px flex items-center gap-2 border-b-2 pb-2 text-sm font-medium',
            currentTab === 'results'
              ? 'border-slate-200 text-slate-200'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          )}
        >
          <ClipboardList className="size-3.5" />
          Results
        </Link>
        <Link
          href={`/${leagueId}/players`}
          className={cn(
            '-mb-px flex items-center gap-2 border-b-2 pb-2 text-sm font-medium',
            currentTab === 'players'
              ? 'border-slate-200 text-slate-200'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          )}
        >
          <Users className="size-3.5" />
          Players
        </Link>
        <Link
          href={`/${leagueId}/lineup-lab`}
          className={cn(
            '-mb-px flex items-center gap-2 border-b-2 pb-2 text-sm font-medium',
            currentTab === 'lineup-lab'
              ? 'border-slate-200 text-slate-200'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          )}
        >
          <FlaskConical className="size-3.5" />
          Lineup Lab
        </Link>
      </nav>

      {showToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 shadow-lg">
          <span className="size-2 rounded-full bg-green-500" />
          Link copied
        </div>
      )}
    </div>
  )
}
