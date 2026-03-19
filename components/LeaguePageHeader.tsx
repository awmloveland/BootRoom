import Link from 'next/link'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  playedCount: number
  totalWeeks: number
  pct: number
  currentTab: 'results' | 'players'
  isAdmin: boolean
}

export function LeaguePageHeader({
  leagueName,
  leagueId,
  playedCount,
  totalWeeks,
  pct,
  currentTab,
  isAdmin,
}: LeaguePageHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{leagueName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {playedCount} of {totalWeeks} weeks ({pct}% complete)
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="ghost" size="icon">
            <Link href={`/${leagueId}/settings`}>
              <Settings className="size-4" />
            </Link>
          </Button>
        )}
      </div>
      <nav className="flex gap-6 border-b border-slate-700 pt-4">
        <Link
          href={`/${leagueId}/results`}
          className={cn(
            '-mb-px border-b-2 pb-2 text-sm font-medium',
            currentTab === 'results'
              ? 'border-slate-100 text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          Results
        </Link>
        <Link
          href={`/${leagueId}/players`}
          className={cn(
            '-mb-px border-b-2 pb-2 text-sm font-medium',
            currentTab === 'players'
              ? 'border-slate-100 text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          Players
        </Link>
      </nav>
    </div>
  )
}
