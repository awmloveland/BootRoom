'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams?.get('redirect') || '/'
  const locked = searchParams?.get('locked') === '1'
  const initialMode = searchParams?.get('mode') === 'signup' ? 'signup' : 'signin'
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>(initialMode)
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [apiReachable, setApiReachable] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(() => setApiReachable(true))
      .catch(() => setApiReachable(false))
  }, [])

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email) {
      setMessage({ type: 'error', text: 'Enter your email first' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://m.craft-football.com'
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, redirect_base: baseUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
      setMessage({ type: 'success', text: data.message ?? 'Check your email for the password reset link.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isNetwork = /fetch|network|connection|failed/i.test(msg)
      setMessage({
        type: 'error',
        text: isNetwork
          ? 'Network error. The API may be unreachable—check deployment or try again.'
          : msg,
      })
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    const supabase = createClient()

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: username.trim() || email.split('@')[0],
              name: username.trim() || email.split('@')[0],
            },
          },
        })
        if (error) {
          const errMsg = error.message
          if (/already exists|already registered/i.test(errMsg)) {
            setMessage({ type: 'error', text: errMsg })
            setMode('forgot')
          } else {
            throw new Error(errMsg)
          }
          return
        }
        if (data.session) {
          const { error: claimErr } = await supabase.rpc('claim_profile')
          if (claimErr) {
            setMessage({ type: 'error', text: `Profile setup failed: ${claimErr.message}` })
            return
          }
          router.push(redirect)
          router.refresh()
          return
        }
        // No session (email confirmation required). Try sign-in to give user a chance.
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })
        if (!signInErr) {
          const { error: claimErr } = await supabase.rpc('claim_profile')
          if (!claimErr) {
            router.push(redirect)
            router.refresh()
            return
          }
        }
        setMessage({
          type: 'success',
          text: 'Account created. Check your email and click the confirmation link, then sign in below.',
        })
        setMode('signin')
        setUsername('')
        setPassword('')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          let msg = error.message
          if (/invalid|credentials/i.test(msg)) {
            msg = 'Invalid email or password. Use "Forgot password?" to set a new one.'
          } else if (/email not confirmed/i.test(msg)) {
            msg = 'Check your email and click the confirmation link first.'
          }
          throw new Error(msg)
        }
        const { error: claimErr } = await supabase.rpc('claim_profile')
        if (claimErr) {
          setMessage({ type: 'error', text: `Profile setup failed: ${claimErr.message}` })
          return
        }
        router.push(redirect)
        router.refresh()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isNetwork = /fetch|network|connection|failed/i.test(msg)
      setMessage({
        type: 'error',
        text: isNetwork
          ? 'Network error. The API may be unreachable—check deployment or try again.'
          : msg,
      })
    } finally {
      setLoading(false)
    }
  }

  if (locked) {
    return (
      <main className="max-w-md mx-auto px-4 sm:px-6 py-12">
          <h1 className="text-xl font-semibold text-slate-100 mb-4">App locked</h1>
          <p className="text-slate-400 text-sm mb-4">
            Add your access key to the URL to unlock. Use the same URL when signing in so your session persists.
          </p>
          <code className="block px-4 py-3 rounded-lg bg-slate-800 text-slate-300 text-sm break-all mb-6">
            {typeof window !== 'undefined' ? `${window.location.origin}/?key=YOUR_SECRET` : 'https://m.craft-football.com/?key=YOUR_SECRET'}
          </code>
          <p className="text-slate-500 text-xs">
            Get the key from APP_ACCESS_KEY in your deployment environment.
          </p>
      </main>
    )
  }

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-xl font-semibold text-slate-100 mb-6">
          {mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'Sign in'}
        </h1>

        {apiReachable === false && (
          <p className="text-amber-400 text-sm mb-4 p-3 rounded-lg bg-amber-950/30 border border-amber-900">
            Cannot reach the server. If you&apos;re on production, ensure the app is deployed with API routes. Try{' '}
            <a href="/api/health" target="_blank" rel="noopener noreferrer" className="underline">
              /api/health
            </a>{' '}
            in a new tab to test.
          </p>
        )}

        {mode === 'forgot' ? (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <p className="text-slate-400 text-sm mb-4">
              Enter your email and we&apos;ll send you a link to set a new password.
            </p>
            <div>
              <label htmlFor="email-forgot" className="block text-sm text-slate-400 mb-1">Email</label>
              <input
                id="email-forgot"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
                placeholder="you@example.com"
              />
            </div>
            {message && (
              <p className={`text-sm ${message.type === 'success' ? 'text-sky-400' : 'text-red-400'}`}>
                {message.text}
              </p>
            )}
            <button
              type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => { setMode('signin'); setMessage(null) }}
              className="text-sm text-slate-400 hover:text-slate-300"
            >
              ← Back to sign in
            </button>
          </form>
        ) : (
        <>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label htmlFor="username" className="block text-sm text-slate-400 mb-1">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder="Your name"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="block text-sm text-slate-400 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              placeholder="you@example.com"
            />
          </div>

          {mode === 'signup' && (
            <div>
              <label htmlFor="password" className="block text-sm text-slate-400 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder="At least 6 characters"
              />
            </div>
          )}

          {mode === 'signin' && (
            <div>
              <label htmlFor="password" className="block text-sm text-slate-400 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>
          )}

          {message && (
            <div className="space-y-1">
              <p
                className={`text-sm ${
                  message.type === 'success' ? 'text-sky-400' : 'text-red-400'
                }`}
              >
                {message.text}
              </p>
              {message.type === 'error' && /invalid|password/i.test(message.text) && (
                <button
                  type="button"
                  onClick={() => { setMode('forgot'); setMessage(null) }}
                  className="text-sm text-sky-400 hover:text-sky-300 underline"
                >
                  Reset password
                </button>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        </>
        )}

        <div className="mt-4 space-y-2">
          {mode !== 'forgot' && (
            <button
              type="button"
              onClick={() => { setMode((m) => (m === 'signin' ? 'signup' : 'signin')); setMessage(null) }}
              className="block text-sm text-slate-400 hover:text-slate-300"
            >
              {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </button>
          )}
          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => { setMode('forgot'); setMessage(null) }}
              className="block text-sm text-slate-400 hover:text-slate-300"
            >
              Forgot password?
            </button>
          )}
        </div>
    </main>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    }>
      <SignInForm />
    </Suspense>
  )
}
