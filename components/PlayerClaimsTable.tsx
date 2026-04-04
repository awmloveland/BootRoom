'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import PlayerClaimPicker from '@/components/PlayerClaimPicker'
import type { PlayerClaim } from '@/lib/types'

interface PlayerClaimsTableProps {
  leagueId: string
  initialClaims: PlayerClaim[]
  onChanged: () => void
}

export function PlayerClaimsTable({ leagueId, initialClaims, onChanged }: PlayerClaimsTableProps) {
  const [claims, setClaims] = useState<PlayerClaim[]>(initialClaims)
  const [processing, setProcessing] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [submittingOverride, setSubmittingOverride] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReview(
    claimId: string,
    action: 'approved' | 'rejected',
    overrideName?: string,
  ) {
    setProcessing(claimId)
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
      setExpandedId(null)
      onChanged()
    } catch {
      setError('Something went wrong')
    } finally {
      setProcessing(null)
      setSubmittingOverride(false)
    }
  }

  function toggleExpand(claimId: string) {
    setExpandedId((prev) => (prev === claimId ? null : claimId))
  }

  if (claims.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <p className="text-sm font-medium text-slate-200">
          Player identity claims{' '}
          <span className="text-slate-500 font-normal">({claims.length})</span>
        </p>
      </div>

      <ul className="divide-y divide-slate-700/40">
        {claims.map((claim) => {
          const isExpanded = expandedId === claim.id
          const isBusy = processing === claim.id
          const displayName = claim.display_name ?? claim.email ?? 'Unknown'

          return (
            <li key={claim.id}>
              <div className="px-4 py-3 flex items-start gap-4">
                {/* Member info + claim chip */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 truncate">{displayName}</p>
                  {claim.display_name && (
                    <p className="text-xs text-slate-500 truncate">{claim.email}</p>
                  )}
                  <div className="mt-1.5">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border bg-amber-900/40 text-amber-300 border-amber-700/50">
                      <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
                      Claims: {claim.player_name}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3 shrink-0 pt-0.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleReview(claim.id, 'rejected')}
                    className="text-xs font-medium text-slate-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => toggleExpand(claim.id)}
                    className={cn(
                      'flex items-center gap-0.5 text-xs font-medium text-sky-400 hover:text-sky-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
                    )}
                  >
                    Link to different player
                    <ChevronRight
                      className={cn(
                        'size-3.5 transition-transform',
                        isExpanded && 'rotate-90',
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleReview(claim.id, 'approved')}
                    className="text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isBusy && !isExpanded ? '…' : 'Approve'}
                  </button>
                </div>
              </div>

              {/* Inline override picker */}
              {isExpanded && (
                <PlayerClaimPicker
                  leagueId={leagueId}
                  submitting={submittingOverride}
                  footerText="Select the player name this member should be linked to."
                  onClaim={(overrideName) => {
                    setSubmittingOverride(true)
                    handleReview(claim.id, 'approved', overrideName)
                  }}
                  onCancel={() => setExpandedId(null)}
                />
              )}
            </li>
          )
        })}
      </ul>

      {error && (
        <p className="px-4 py-2 text-xs text-red-400 border-t border-slate-700">{error}</p>
      )}
    </div>
  )
}
