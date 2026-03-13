'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { label: 'Results', href: '/' },
  { label: 'Players', href: '/players' },
  { label: 'Settings', href: '/settings' },
]

export function Header() {
  const pathname = usePathname()
  const [user, setUser] = useState<{ email?: string } | null>(null)

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data: { user } }) => setUser(user ?? null))
  }, [])

  async function handleSignOut() {
    await createClient().auth.signOut()
    window.location.href = '/sign-in'
  }

  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700 h-14 flex items-center">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        <span className="text-xl font-bold text-slate-100">⚽ Craft Football</span>
        <nav className="flex items-center gap-6">
          {pathname !== '/sign-in' && (
            <>
              {NAV_LINKS.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'text-sm transition-colors',
                    pathname === href
                      ? 'text-slate-100 font-medium'
                      : 'text-slate-400 hover:text-slate-100'
                  )}
                >
                  {label}
                </Link>
              ))}
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
