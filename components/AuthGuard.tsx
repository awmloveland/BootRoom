'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface AuthGuardProps {
  children: React.ReactNode
}

/** Ensures user has access to at least one game on protected routes. */
export function AuthGuard({ children }: AuthGuardProps) {
  const pathname = usePathname()
  const [status, setStatus] = useState<'loading' | 'allowed' | 'not-invited'>('loading')

  const isPublicRoute = pathname === '/sign-in' || pathname?.startsWith('/auth') || pathname?.startsWith('/invite')

  useEffect(() => {
    if (isPublicRoute) return
    async function check() {
      const res = await fetch('/api/verify-access', { credentials: 'include' })
      if (res.ok) {
        setStatus('allowed')
        return
      }
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setStatus('loading')
        return
      }
      const { data: member } = await supabase
        .from('game_members')
        .select('game_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      setStatus(member ? 'allowed' : 'not-invited')
    }
    check()
  }, [pathname, isPublicRoute])

  if (isPublicRoute) return <>{children}</>

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  if (status === 'not-invited') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-slate-100 mb-2">No games yet</h1>
          <p className="text-slate-400 text-sm mb-6">
            You need an invite link from a game admin to view stats. Ask someone to send you one.
          </p>
          <button
            onClick={async () => {
              await createClient().auth.signOut()
              window.location.href = '/sign-in'
            }}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
