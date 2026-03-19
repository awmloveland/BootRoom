import Link from 'next/link'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  playedCount: number
  totalWeeks?: number
  currentTab: 'results' | 'players'
  isAdmin: boolean
}

export function LeaguePageHeader({
  leagueName,
  leagueId,
  playedCount,
  totalWeeks = 52,
  currentTab,
  isAdmin,
}: LeaguePageHeaderProps) {
  const pct = Math.round((playedCount / totalWeeks) * 100)

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{leagueName}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {playedCount} of {totalWeeks} weeks ({pct}% complete)
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="secondary" size="icon">
            <Link href={`/${leagueId}/settings`} aria-label="League settings">
              <Settings className="size-4" />
            </Link>
          </Button>
        )}
      </div>

      <div className="flex gap-1 border-b border-slate-700">
        <Link
          href={`/${leagueId}/results`}
          className={cn(
            'px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            currentTab === 'results'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          Results
        </Link>
        <Link
          href={`/${leagueId}/players`}
          className={cn(
            'px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            currentTab === 'players'
              ? 'border-sky-500 text-sky-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          Players
        </Link>
      </div>
    </div>
  )
}
