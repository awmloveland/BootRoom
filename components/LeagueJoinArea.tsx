'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SlidersHorizontal, Link as LinkIcon, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'
import { AuthDialog } from '@/components/AuthDialog'
import type { JoinRequestStatus } from '@/lib/types'

interface LeagueJoinAreaProps {
  leagueId: string
  leagueSlug: string
  leagueName: string
  joinStatus: JoinRequestStatus | 'member' | 'not-member' | null
  isAdmin: boolean
  pendingRequestCount?: number
}

function isMemberStatus(s: JoinRequestStatus | 'member' | 'not-member' | null): boolean {
  return s === 'member' || s === 'approved'
}

function SearchParamsReader({
  joinStatus,
  onAutoOpen,
}: {
  joinStatus: JoinRequestStatus | 'member' | 'not-member' | null
  onAutoOpen: () => void
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (searchParams.get('open_join') !== '1') return
    // Only auto-open if the user is not already a member or pending
    const isJoinable =
      joinStatus === null ||
      joinStatus === 'none' ||
      joinStatus === 'declined' ||
      joinStatus === 'not-member'
    if (isJoinable) {
      onAutoOpen()
    }
    // Clean the URL regardless (remove the param)
    router.replace(pathname)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

export function LeagueJoinArea({ leagueId, leagueSlug, leagueName, joinStatus, isAdmin, pendingRequestCount = 0 }: LeagueJoinAreaProps) {
  const [showToast, setShowToast] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const pathname = usePathname()

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
      setAuthDialogOpen(true)
    } else {
      setDialogOpen(true)
    }
  }

  const showJoin = joinStatus === null || joinStatus === 'not-member' || joinStatus === 'none' || joinStatus === 'declined'
  const showPending = joinStatus === 'pending'
  const showShare = isMemberStatus(joinStatus)

  // Redirect destination after signup: return to this league page and auto-open join dialog
  const joinRedirect = `${pathname}?open_join=1`

  return (
    <>
      <div className="flex items-center gap-2">
        {showJoin && (
          <Button
            size="xs"
            onClick={handleJoinClick}
          >
            <UserPlus className="mr-[7px] size-[13px]" />
            Join League
          </Button>
        )}
        {showPending && (
          <Button
            size="xs"
            variant="ghost"
            disabled
            className="cursor-default text-[#8ba4c4]"
          >
            Request pending
          </Button>
        )}
        {showShare && (
          <Button
            size="xs"
            variant="outline"
            onClick={handleShareClick}
          >
            <LinkIcon className="mr-[7px] size-[13px]" />
            Share
          </Button>
        )}
        {isAdmin && (
          <div className="relative">
            <Button
              asChild
              size="xs"
              variant="outline"
              className="w-8 p-0 text-[#8ba4c4]"
            >
              <Link href={`/${leagueSlug}/settings`} aria-label="League settings">
                <SlidersHorizontal className="size-3.5" />
              </Link>
            </Button>
            {pendingRequestCount > 0 && (
              <span
                aria-label={`${pendingRequestCount} pending request${pendingRequestCount === 1 ? '' : 's'}`}
                className="pointer-events-none absolute right-[3px] top-[3px] size-[7px] rounded-full bg-[#e2686f] ring-2 ring-[#060b14]"
              />
            )}
          </div>
        )}
      </div>

      {/* Detect ?open_join=1 after signup and auto-open the join dialog */}
      <Suspense fallback={null}>
        <SearchParamsReader
          joinStatus={joinStatus}
          onAutoOpen={() => setDialogOpen(true)}
        />
      </Suspense>

      <AuthDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        redirect={joinRedirect}
        initialMode="signup"
        leagueName={leagueName}
      />

      <JoinRequestDialog
        leagueId={leagueId}
        leagueName={leagueName}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setDialogOpen(false)}
      />

      {showToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded border border-[#223a5c] bg-[#0c1728] px-4 py-2.5 font-plex text-[10px] font-bold uppercase tracking-[.14em] text-[#f4f9ff] shadow-[0_18px_44px_rgba(0,0,0,.42)]">
          <span className="size-1.5 rounded-full bg-[#38bdf8]" />
          Link copied
        </div>
      )}
    </>
  )
}
