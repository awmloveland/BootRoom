'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type PublicPage = 'results' | 'players'

interface PublicHeaderProps {
  leagueName: string
  leagueId: string
  isAuthenticated: boolean
  currentPage: PublicPage
  showPlayersNav?: boolean
}

export function PublicHeader({
  leagueName,
  leagueId,
  isAuthenticated,
  currentPage,
  showPlayersNav = false,
}: PublicHeaderProps) {
  const redirectParam = encodeURIComponent(`/league/${leagueId}`)
  const signInHref = `/sign-in?redirect=${redirectParam}`

  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700">
      <div className="grid grid-cols-3 h-14 w-full max-w-2xl mx-auto items-center px-4 sm:px-6">
        {/* Left: logo */}
        <img src="/logo.png" alt="Crafted Football" className="h-10 w-10" />

        {/* Centre: nav tabs */}
        <nav className="flex items-center justify-center gap-6">
          <Link
            href={`/results/${leagueId}`}
            className={cn(
              'text-sm font-medium transition-colors',
              currentPage === 'results' ? 'text-slate-100' : 'text-slate-400 hover:text-slate-100',
            )}
          >
            Results
          </Link>

          {showPlayersNav && (
            <Link
              href={`/results/${leagueId}/players`}
              className={cn(
                'text-sm font-medium transition-colors',
                currentPage === 'players' ? 'text-slate-100' : 'text-slate-400 hover:text-slate-100',
              )}
            >
              Players
            </Link>
          )}
        </nav>

        {/* Right: auth */}
        <div className="flex items-center justify-end">
          {isAuthenticated ? (
            <Link
              href={`/league/${leagueId}`}
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              Open app
            </Link>
          ) : (
            <Button size="xs" asChild>
              <a href={signInHref}>Log in</a>
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
