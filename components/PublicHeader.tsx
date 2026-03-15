'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

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
  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700 h-14 flex items-center">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        <span className="text-xl font-bold text-slate-100">⚽ {leagueName}</span>

        <nav className="flex items-center gap-6">
          <Link
            href={`/results/${leagueId}`}
            className={cn(
              'text-sm transition-colors',
              currentPage === 'results'
                ? 'text-slate-100 font-medium'
                : 'text-slate-400 hover:text-slate-100',
            )}
          >
            Results
          </Link>

          {showPlayersNav && (
            <Link
              href={`/results/${leagueId}/players`}
              className={cn(
                'text-sm transition-colors',
                currentPage === 'players'
                  ? 'text-slate-100 font-medium'
                  : 'text-slate-400 hover:text-slate-100',
              )}
            >
              Players
            </Link>
          )}

          {isAuthenticated ? (
            <Link
              href={`/league/${leagueId}`}
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              Open app
            </Link>
          ) : (
            <>
              <Link
                href={`/sign-in?redirect=${encodeURIComponent(`/league/${leagueId}`)}`}
                className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
              >
                Sign in
              </Link>
              <Link
                href={`/sign-in?mode=signup&redirect=${encodeURIComponent(`/league/${leagueId}`)}`}
                className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
