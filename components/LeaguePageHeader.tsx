import Link from 'next/link'
import { Settings, ClipboardList, Users, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { LeagueInfoBar } from '@/components/LeagueInfoBar'
import type { LeagueDetails } from '@/lib/types'

interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  playedCount: number
  totalWeeks: number
  pct: number
  currentTab: 'results' | 'players' | 'lineup-lab'
  isAdmin: boolean
  showLineupLabTab?: boolean
  details?: LeagueDetails | null
}

export function LeaguePageHeader({
  leagueName,
  leagueId,
  playedCount,
  totalWeeks,
  pct,
  currentTab,
  isAdmin,
  showLineupLabTab,
  details,
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
        {isAdmin && (
          <Button asChild variant="ghost" size="icon" className="text-slate-500 hover:text-slate-400">
            <Link href={`/${leagueId}/settings`} aria-label="League settings">
              <Settings className="size-4" />
            </Link>
          </Button>
        )}
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
              : 'border-transparent text-slate-700 hover:text-slate-400'
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
              : 'border-transparent text-slate-700 hover:text-slate-400'
          )}
        >
          <Users className="size-3.5" />
          Players
        </Link>
        {showLineupLabTab && (
          <Link
            href={`/${leagueId}/lineup-lab`}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 pb-2 text-sm font-medium',
              currentTab === 'lineup-lab'
                ? 'border-slate-200 text-slate-200'
                : 'border-transparent text-slate-700 hover:text-slate-400'
            )}
          >
            <FlaskConical className="size-3.5" />
            Lineup Lab
          </Link>
        )}
      </nav>
    </div>
  )
}
