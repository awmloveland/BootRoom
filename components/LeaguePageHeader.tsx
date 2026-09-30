import Link from 'next/link'
import { ClipboardList, Users, Trophy, FlaskConical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LeagueInfoBar } from '@/components/LeagueInfoBar'
import { LeagueJoinArea } from '@/components/LeagueJoinArea'
import { ScrollTabIntoView } from '@/components/ScrollTabIntoView'
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
  currentTab: 'results' | 'players' | 'honours' | 'lineup-lab'
  isAdmin: boolean
  details?: LeagueDetails | null
  joinStatus?: JoinRequestStatus | 'member' | 'not-member' | null
  pendingRequestCount?: number
}

const TABS = [
  { key: 'results', label: 'Results', icon: ClipboardList },
  { key: 'players', label: 'Players', icon: Users },
  { key: 'honours', label: 'Honours', icon: Trophy },
  { key: 'lineup-lab', label: 'Lineup Lab', icon: FlaskConical },
] as const

export function LeaguePageHeader({
  leagueName,
  leagueId,
  leagueSlug,
  playedCount,
  totalWeeks,
  pct,
  season,
  currentTab,
  isAdmin,
  details,
  joinStatus = null,
  pendingRequestCount = 0,
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
          />
        </div>
      </div>
      <div className="mt-3.5">
        <LeagueInfoBar details={details} leagueSlug={leagueSlug} isAdmin={isAdmin} />
      </div>
      <nav className="flex gap-1 overflow-x-auto border-b border-[#17263c] mt-5 -mx-4 px-4 sm:mx-0 sm:px-0 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/${leagueSlug}/${key}`}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 pb-[11px] font-plex text-[10.5px] font-bold uppercase tracking-[.14em] whitespace-nowrap transition-colors',
              currentTab === key
                ? 'border-[#38bdf8] text-[#f4f9ff]'
                : 'border-transparent text-[#8ba4c4] hover:text-[#f4f9ff]'
            )}
          >
            <ScrollTabIntoView active={currentTab === key} />
            <Icon className="size-[13px]" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
