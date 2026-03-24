'use client'

import Link from 'next/link'
import { MapPin, Calendar, Users } from 'lucide-react'
import { isLeagueDetailsFilled } from '@/lib/utils'
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

  // Build pills inline — bypasses buildLeagueInfoFacts (incompatible: returns string[], not JSX)
  const d = details!
  const dayTime = d.day && d.kickoff_time
    ? `${d.day} ${d.kickoff_time}`
    : d.day ?? d.kickoff_time ?? null

  const pillClass = 'inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 border border-slate-800 rounded px-2 py-0.5'
  const iconClass = 'size-[11px] shrink-0'  // shrink-0 prevents flex compression on narrow screens

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {d.location && (
          <span className={pillClass}>
            <MapPin className={iconClass} />
            {d.location}
          </span>
        )}
        {dayTime && (
          <span className={pillClass}>
            <Calendar className={iconClass} />
            {dayTime}
          </span>
        )}
        {d.player_count != null && (
          <span className={pillClass}>
            <Users className={iconClass} />
            {d.player_count} players
          </span>
        )}
      </div>
      {d.bio && (
        <p className="text-xs text-slate-500 leading-relaxed">{d.bio}</p>
      )}
    </div>
  )
}
