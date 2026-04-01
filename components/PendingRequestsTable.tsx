'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { PendingJoinRequest } from '@/lib/types'

interface PendingRequestsTableProps {
  leagueId: string
  initialRequests: PendingJoinRequest[]
}

export function PendingRequestsTable({ leagueId, initialRequests }: PendingRequestsTableProps) {
  const [requests, setRequests] = useState<PendingJoinRequest[]>(initialRequests)
  const [processing, setProcessing] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

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
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <p className="text-sm font-medium text-slate-200">
          Pending requests{' '}
          <span className="text-slate-500 font-normal">({requests.length})</span>
        </p>
      </div>
      <ul className="divide-y divide-slate-700/40">
        {requests.map((req) => {
          const isExpanded = expandedIds.has(req.id)
          return (
            <li key={req.id} className="px-4 py-3 flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-100 truncate">{req.display_name}</p>
                <p className="text-xs text-slate-500 truncate">{req.email}</p>
                {req.message && (
                  <button
                    type="button"
                    className="text-left mt-1 w-full"
                    onClick={() => toggleExpand(req.id)}
                  >
                    <p className={cn(
                      'text-xs text-slate-400 italic',
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
                  className="text-xs font-medium text-slate-500 hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Decline
                </button>
                <button
                  type="button"
                  disabled={processing === req.id}
                  onClick={() => handleReview(req.id, 'approved')}
                  className="text-xs font-medium text-sky-400 hover:text-sky-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {processing === req.id ? '…' : 'Approve'}
                </button>
              </div>
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
