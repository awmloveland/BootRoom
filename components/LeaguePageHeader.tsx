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
  currentTab: 'results' | 'players' | 'honours' | 'lineup-lab'
  isAdmin: boolean
  details?: LeagueDetails | null
  joinStatus?: JoinRequestStatus | 'member' | 'not-member' | null
  pendingRequestCount?: number
}

export function LeaguePageHeader({
  leagueName,
  leagueId,
  leagueSlug,
  playedCount,
  totalWeeks,
  pct,
  currentTab,
  isAdmin,
  details,
  joinStatus = null,
  pendingRequestCount = 0,
}: LeaguePageHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-100">{leagueName}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {playedCount} of {totalWeeks} weeks · {pct}% complete
          </p>
        </div>
        <LeagueJoinArea
          leagueId={leagueId}
          leagueSlug={leagueSlug}
          leagueName={leagueName}
          joinStatus={joinStatus}
          isAdmin={isAdmin}
          pendingRequestCount={pendingRequestCount}
        />
      </div>
      <div className="mt-3">
        <LeagueInfoBar details={details} leagueSlug={leagueSlug} isAdmin={isAdmin} />
      </div>
      <nav className="flex gap-6 overflow-x-auto border-b border-slate-700 pt-5 -mx-4 px-4 sm:mx-0 sm:px-0 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href={`/${leagueSlug}/results`}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2 text-sm font-medium whitespace-nowrap',
            currentTab === 'results'
              ? 'border-slate-200 text-slate-200'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          )}
        >
          <ScrollTabIntoView active={currentTab === 'results'} />
          <ClipboardList className="size-3.5" />
          Results
        </Link>
        <Link
          href={`/${leagueSlug}/players`}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2 text-sm font-medium whitespace-nowrap',
            currentTab === 'players'
              ? 'border-slate-200 text-slate-200'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          )}
        >
          <ScrollTabIntoView active={currentTab === 'players'} />
          <Users className="size-3.5" />
          Players
        </Link>
        <Link
          href={`/${leagueSlug}/honours`}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2 text-sm font-medium whitespace-nowrap',
            currentTab === 'honours'
              ? 'border-slate-200 text-slate-200'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          )}
        >
          <ScrollTabIntoView active={currentTab === 'honours'} />
          <Trophy className="size-3.5" />
          Honours
        </Link>
        <Link
          href={`/${leagueSlug}/lineup-lab`}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 pb-2 text-sm font-medium whitespace-nowrap',
            currentTab === 'lineup-lab'
              ? 'border-slate-200 text-slate-200'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          )}
        >
          <ScrollTabIntoView active={currentTab === 'lineup-lab'} />
          <FlaskConical className="size-3.5" />
          Lineup Lab
        </Link>
      </nav>
    </div>
  )
}
