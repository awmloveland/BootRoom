'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

interface AuthGuardProps {
  children: React.ReactNode
}

/** Ensures user has access to at least one game on protected routes. */
export function AuthGuard({ children }: AuthGuardProps) {
  const pathname = usePathname()
  const router = useRouter()
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
      const meRes = await fetch('/api/auth/me', { credentials: 'include' })
      const data = await meRes.json().catch(() => ({}))
      if (!data?.user) {
        router.replace(`/sign-in?redirect=${encodeURIComponent(pathname || '/')}`)
        return
      }
      setStatus(data.profile ? 'allowed' : 'not-invited')
    }
    check()
  }, [pathname, isPublicRoute, router])

  if (isPublicRoute) return <>{children}</>

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#060b14] flex items-center justify-center">
        <p className="text-[#8ba4c4]">Loading…</p>
      </div>
    )
  }

  if (status === 'not-invited') {
    return (
      <div className="min-h-screen bg-[#060b14] flex items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold text-[#f4f9ff] mb-2">Profile required</h1>
          <p className="text-[#8ba4c4] text-sm mb-6">
            Your account is missing a profile. Sign out and sign in again, or contact support.
          </p>
          <button
            onClick={async () => {
              await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
              window.location.href = '/sign-in'
            }}
            className="px-4 py-2 rounded-lg bg-[#1b2c46] hover:bg-[#223a5c] text-[#f4f9ff] text-sm font-medium transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
