'use client'

import Link from 'next/link'

interface PublicHeaderProps {
  leagueName: string
  leagueId: string
  isAuthenticated: boolean
}

export function PublicHeader({ leagueName, leagueId, isAuthenticated }: PublicHeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-700 bg-slate-900">
      <div className="flex h-14 w-full max-w-2xl mx-auto items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl font-bold text-slate-100 shrink-0">⚽</span>
          <span className="text-sm font-medium text-slate-400 truncate">
            {leagueName}
          </span>
          <span className="text-slate-600 shrink-0">·</span>
          <span className="text-sm text-slate-500 shrink-0">Results</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAuthenticated ? (
            <Link
              href={`/league/${leagueId}`}
              className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors"
            >
              Open in app →
            </Link>
          ) : (
            <>
              <Link
                href={`/sign-in?redirect=${encodeURIComponent(`/league/${leagueId}`)}`}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium transition-colors"
              >
                Sign in
              </Link>
              <Link
                href={`/sign-in?mode=signup&redirect=${encodeURIComponent(`/league/${leagueId}`)}`}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
