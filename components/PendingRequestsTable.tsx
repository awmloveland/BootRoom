'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import PlayerClaimPicker from '@/components/PlayerClaimPicker'
import type { PendingJoinRequest, PlayerClaim } from '@/lib/types'

interface PendingRequestsTableProps {
  leagueId: string
  initialRequests: PendingJoinRequest[]
  /** Pending player claims — matched to requests by user_id for inline chip display. */
  pendingClaims?: PlayerClaim[]
}

export function PendingRequestsTable({ leagueId, initialRequests, pendingClaims = [] }: PendingRequestsTableProps) {
  const [requests, setRequests] = useState<PendingJoinRequest[]>(initialRequests)
  const [claims, setClaims] = useState<PlayerClaim[]>(pendingClaims)
  const [processing, setProcessing] = useState<string | null>(null)
  const [claimProcessing, setClaimProcessing] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Build a lookup: user_id → pending claim (for requests that have an attached claim)
  const claimByUser = Object.fromEntries(claims.map((c) => [c.user_id, c]))

  async function handleReview(requestId: string, action: 'approved' | 'declined') {
    setProcessing(requestId)
    setError(null)
    try {
      const res = await fetch(
        `/api/league/${leagueId}/join-requests/${requestId}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong')
        return
      }
      // Optimistic removal
      setRequests((prev) => prev.filter((r) => r.id !== requestId))
    } catch {
      setError('Something went wrong')
    } finally {
      setProcessing(null)
    }
  }

  async function handleReviewClaim(
    claimId: string,
    action: 'approved' | 'rejected',
    overrideName?: string,
  ) {
    setClaimProcessing(claimId)
    setError(null)
    try {
      const body: Record<string, string> = { action }
      if (overrideName) body.override_name = overrideName
      const res = await fetch(
        `/api/league/${leagueId}/player-claims/${claimId}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'include',
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong')
        return
      }
      setClaims((prev) => prev.filter((c) => c.id !== claimId))
      setExpandedClaimId(null)
    } catch {
      setError('Something went wrong')
    } finally {
      setClaimProcessing(null)
    }
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (requests.length === 0) return null

  return (
    <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1b2c46] bg-[#0c1728]">
        <p className="text-sm font-medium text-[#dff1ff]">
          Pending requests{' '}
          <span className="text-[#6f88a8] font-normal">({requests.length})</span>
        </p>
      </div>
      <ul className="divide-y divide-[#1b2c46]">
        {requests.map((req) => {
          const isExpanded = expandedIds.has(req.id)
          const attachedClaim = claimByUser[req.user_id] ?? null
          const claimId = attachedClaim?.id ?? null
          const isBusyClaim = claimId !== null && claimProcessing === claimId
          const isOverrideExpanded = claimId !== null && expandedClaimId === claimId
          return (
            <li key={req.id} className="divide-y divide-[#1b2c46]">
              <div className="px-4 py-3 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#f4f9ff] truncate">{req.display_name}</p>
                  <p className="text-xs text-[#6f88a8] truncate">{req.email}</p>
                  {req.message && (
                    <button
                      type="button"
                      className="text-left mt-1 w-full"
                      onClick={() => toggleExpand(req.id)}
                    >
                      <p className={cn(
                        'text-xs text-[#8ba4c4] italic',
                        !isExpanded && 'line-clamp-2'
                      )}>
                        &ldquo;{req.message}&rdquo;
                      </p>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  <button
                    type="button"
                    disabled={processing === req.id}
                    onClick={() => handleReview(req.id, 'declined')}
                    className="text-xs font-medium text-[#6f88a8] hover:text-[#e2686f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={processing === req.id}
                    onClick={() => handleReview(req.id, 'approved')}
                    className="text-xs font-medium text-[#38bdf8] hover:text-[#7dd3fc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {processing === req.id ? '…' : 'Approve'}
                  </button>
                </div>
              </div>

              {/* Attached claim chip — independent of the join approve/decline */}
              {attachedClaim && (
                <div className="mx-4 my-2.5 rounded-lg border border-[#38bdf8]/35 bg-[#38bdf8]/8 overflow-hidden">
                  <div className="px-3 py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="size-1.5 rounded-full bg-[#f5c04a] shrink-0" />
                        <span className="text-xs text-[#dff1ff] font-medium">
                          Claims to be: {attachedClaim.player_name}
                        </span>
                        <span className="text-xs text-[#6f88a8]">
                          · Player identity pending approval
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="px-3 pb-2.5 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={isBusyClaim}
                      onClick={() => handleReviewClaim(attachedClaim.id, 'rejected')}
                      className="text-xs font-medium text-[#6f88a8] hover:text-[#e2686f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Reject claim
                    </button>
                    <button
                      type="button"
                      disabled={isBusyClaim}
                      onClick={() =>
                        setExpandedClaimId((prev) =>
                          prev === attachedClaim.id ? null : attachedClaim.id
                        )
                      }
                      className="flex items-center gap-0.5 text-xs font-medium text-[#38bdf8] hover:text-[#7dd3fc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      Link to different player
                      <ChevronRight
                        className={cn('size-3.5 transition-transform', isOverrideExpanded && 'rotate-90')}
                      />
                    </button>
                    <button
                      type="button"
                      disabled={isBusyClaim}
                      onClick={() => handleReviewClaim(attachedClaim.id, 'approved')}
                      className="text-xs font-medium text-[#bef264] hover:text-[#bef264] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isBusyClaim && !isOverrideExpanded ? '…' : 'Approve claim'}
                    </button>
                  </div>
                  {isOverrideExpanded && (
                    <PlayerClaimPicker
                      leagueId={leagueId}
                      submitting={isBusyClaim}
                      footerText="Select the player name this member should be linked to."
                      onClaim={(overrideName) =>
                        handleReviewClaim(attachedClaim.id, 'approved', overrideName)
                      }
                      onCancel={() => setExpandedClaimId(null)}
                    />
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {error && (
        <p className="px-4 py-2 text-xs text-[#e2686f] border-t border-[#1b2c46]">{error}</p>
      )}
    </div>
  )
}
