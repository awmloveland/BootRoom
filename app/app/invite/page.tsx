'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'

function InviteAcceptForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams?.get('token') ?? null
  const [status, setStatus] = useState<'loading' | 'needs-auth' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) {
      setErrorMsg('Missing invite token')
      setStatus('error')
      return
    }

    async function checkAndAccept() {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setStatus('needs-auth')
        return
      }

      const { error } = await supabase.rpc('accept_game_invite', {
        invite_token: token,
      })

      if (error) {
        setErrorMsg(error.message || 'Invalid or expired invite')
        setStatus('error')
        return
      }

      setStatus('success')
      router.replace('/')
      router.refresh()
    }

    checkAndAccept()
  }, [token, router])

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    if (!token || !email || !password) return
    setAuthLoading(true)
    setAuthError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name: email.split('@')[0] } },
    })
    if (error) {
      if (/already exists|already registered/i.test(error.message)) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        if (!signInErr) {
          const { error: acceptErr } = await supabase.rpc('accept_game_invite', { invite_token: token })
          if (!acceptErr) {
            router.replace('/')
            router.refresh()
            return
          }
        }
      }
      setAuthError(error.message)
      setAuthLoading(false)
      return
    }
    const { error: claimErr } = await supabase.rpc('claim_profile')
    if (!claimErr) {
      const { error: acceptErr } = await supabase.rpc('accept_game_invite', { invite_token: token })
      if (!acceptErr) {
        router.replace('/')
        router.refresh()
        return
      }
    }
    setAuthError('Account created. Sign in below to continue.')
    setAuthLoading(false)
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  if (status === 'needs-auth') {
    return (
      <div className="min-h-screen bg-slate-900">
        <Header />
        <main className="max-w-md mx-auto px-4 sm:px-6 py-12">
          <h1 className="text-xl font-semibold text-slate-100 mb-2">Join the league</h1>
          <p className="text-slate-400 text-sm mb-6">
            Create an account to accept this invite and view the stats.
          </p>
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label htmlFor="invite-email" className="block text-sm text-slate-400 mb-1">Email</label>
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label htmlFor="invite-password" className="block text-sm text-slate-400 mb-1">Password</label>
              <input
                id="invite-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500"
                placeholder="At least 6 characters"
              />
            </div>
            {authError && <p className="text-sm text-red-400">{authError}</p>}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50"
            >
              {authLoading ? 'Creating account…' : 'Create account & join'}
            </button>
          </form>
          <p className="mt-4 text-sm text-slate-500">
            Already have an account?{' '}
            <a href={`/sign-in?redirect=${encodeURIComponent(`/invite?token=${token}`)}`} className="text-sky-400 hover:text-sky-300">
              Sign in
            </a>
          </p>
        </main>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-slate-900">
        <Header />
        <main className="max-w-md mx-auto px-4 sm:px-6 py-12 text-center">
          <h1 className="text-xl font-semibold text-slate-100 mb-2">Couldn&apos;t accept invite</h1>
          <p className="text-slate-400 text-sm mb-6">{errorMsg}</p>
          <a
            href="/"
            className="inline-block px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium"
          >
            Back to app
          </a>
        </main>
      </div>
    )
  }

  return null
}

export default function InviteAcceptPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    }>
      <InviteAcceptForm />
    </Suspense>
  )
}
