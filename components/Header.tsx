'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const LEAGUE_NAV = [
  { label: 'Results', href: 'results' },
  { label: 'Players', href: 'players' },
  { label: 'Settings', href: '/settings' },
]

const HOME_NAV = [
  { label: 'Leagues', href: '/' },
  { label: 'Settings', href: '/settings' },
]

export function Header() {
  const pathname = usePathname()
  const [user, setUser] = useState<{ email?: string } | null>(null)

  const isLeagueDetail = pathname?.match(/^\/league\/[^/]+/)
  const leagueId = pathname?.match(/^\/league\/([^/]+)/)?.[1]
  const isPlayersPage = pathname?.endsWith('/players')
  const navLinks = isLeagueDetail ? LEAGUE_NAV : HOME_NAV

  useEffect(() => {
    if (pathname === '/sign-in' || pathname === '/reset-password') return
    fetch('/api/auth/me', { credentials: 'include' })
      .then((res) => res.json().catch(() => ({})))
      .then((data) => setUser(data?.user ?? null))
  }, [pathname])

  async function handleSignOut() {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
    window.location.href = '/sign-in'
  }

  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700 h-14 flex items-center">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-slate-100 hover:text-slate-200 transition-colors">⚽ Crafted Football</Link>
        <nav className="flex items-center gap-6">
          {pathname !== '/sign-in' && (
            <>
              {navLinks.map(({ label, href }) => {
                const isResults = href === 'results'
                const isPlayers = href === 'players'
                const isSettings = href === '/settings'
                const isLeagues = href === '/'
                const isActive =
                  (isResults && isLeagueDetail && !isPlayersPage) ||
                  (isPlayers && isPlayersPage) ||
                  (isSettings && pathname === '/settings') ||
                  (isLeagues && (pathname === '/' || pathname === ''))
                const linkHref = isResults && leagueId ? `/league/${leagueId}` : isPlayers && leagueId ? `/league/${leagueId}/players` : href
                return (
                  <Link
                    key={href}
                    href={linkHref}
                    className={cn(
                      'text-sm transition-colors',
                      isActive ? 'text-slate-100 font-medium' : 'text-slate-400 hover:text-slate-100'
                    )}
                  >
                    {label}
                  </Link>
                )
              })}
              {user && (
                <button
                  onClick={handleSignOut}
                  className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
                >
                  Sign out
                </button>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
