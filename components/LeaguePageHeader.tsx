import { LeagueInfoBar } from '@/components/LeagueInfoBar'
import { LeagueJoinArea } from '@/components/LeagueJoinArea'
import { LeagueTabNav } from '@/components/LeagueTabNav'
import type { LeagueDetails, JoinRequestStatus } from '@/lib/types'

interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  leagueSlug: string
  playedCount: number
  totalWeeks: number
  pct: number
  /** Season year shown in the eyebrow above the league name, e.g. '2026'. */
  season?: string
  isAdmin: boolean
  details?: LeagueDetails | null
  joinStatus?: JoinRequestStatus | 'member' | 'not-member' | null
  pendingRequestCount?: number
  /** Signed league token for the Share button; null for the public. */
  shareToken?: string | null
}

export function LeaguePageHeader({
  leagueName,
  leagueId,
  leagueSlug,
  playedCount,
  totalWeeks,
  pct,
  season,
  isAdmin,
  details,
  joinStatus = null,
  pendingRequestCount = 0,
  shareToken = null,
}: LeaguePageHeaderProps) {
  return (
    <div className="mb-[18px]">
      <div className="flex items-start justify-between gap-3.5">
        <div>
          <p className="inline-flex items-center gap-2 font-plex text-[9px] font-bold uppercase tracking-[.2em] text-[#bef264]">
            <span className="h-0.5 w-[18px] bg-[#bef264]" />
            Season {season ?? new Date().getFullYear()}
          </p>
          <h1 className="mt-2 text-[26px] sm:text-[30px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">{leagueName}</h1>
          <p className="mt-2 font-plex text-[10px] uppercase tracking-[.14em] text-[#6f88a8]">
            {playedCount} of {totalWeeks} weeks · {pct}% complete
          </p>
        </div>
        <div className="shrink-0 pt-[22px]">
          <LeagueJoinArea
            leagueId={leagueId}
            leagueSlug={leagueSlug}
            leagueName={leagueName}
            joinStatus={joinStatus}
            isAdmin={isAdmin}
            pendingRequestCount={pendingRequestCount}
            shareToken={shareToken}
          />
        </div>
      </div>
      <div className="mt-3.5">
        <LeagueInfoBar details={details} leagueSlug={leagueSlug} isAdmin={isAdmin} />
      </div>
      <LeagueTabNav leagueSlug={leagueSlug} isAdmin={isAdmin} />
    </div>
  )
}
