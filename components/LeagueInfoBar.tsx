'use client'

import Link from 'next/link'
import { buildLeagueInfoFacts, isLeagueDetailsFilled } from '@/lib/utils'
import type { LeagueDetails } from '@/lib/types'

interface LeagueInfoBarProps {
  details: LeagueDetails | null | undefined
  leagueId: string
  isAdmin: boolean
}

export function LeagueInfoBar({ details, leagueId, isAdmin }: LeagueInfoBarProps) {
  const filled = isLeagueDetailsFilled(details)

  // Hide from non-admins when empty
  if (!filled && !isAdmin) return null

  // Admin empty-state prompt
  if (!filled && isAdmin) {
    return (
      <div className="border border-dashed border-slate-700 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          Add your league details — location, schedule, and a short bio.
        </p>
        <Link
          href={`/${leagueId}/settings?tab=details`}
          className="text-sm text-slate-400 hover:text-slate-200 underline underline-offset-2 whitespace-nowrap transition-colors"
        >
          Add details
        </Link>
      </div>
    )
  }

  // Filled state
  const facts = buildLeagueInfoFacts(details!)

  return (
    <div className="space-y-2">
      {facts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {facts.map((fact) => (
            <span
              key={fact}
              className="inline-flex items-center gap-1.5 text-sm text-slate-300 bg-slate-800 border border-slate-700 rounded-full px-3 py-1"
            >
              {fact}
            </span>
          ))}
        </div>
      )}
      {details!.bio && (
        <p className="text-sm text-slate-400 leading-relaxed">{details!.bio}</p>
      )}
    </div>
  )
}
