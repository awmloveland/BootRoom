'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/'
  const locked = searchParams.get('locked') === '1'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [useMagicLink, setUseMagicLink] = useState(true)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      if (useMagicLink) {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${typeof window !== 'undefined' ? window.location.origin : 'https://m.craft-football.com'}/auth/callback?redirect=${encodeURIComponent(redirect)}` },
        })
        if (error) throw error
        setMessage({ type: 'success', text: 'Check your email for the sign-in link.' })
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        router.push(redirect)
        router.refresh()
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong.',
      })
    } finally {
      setLoading(false)
    }
  }

  if (locked) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Header />
        <main className="max-w-md mx-auto px-4 sm:px-6 py-12">
          <h1 className="text-xl font-semibold text-slate-100 mb-4">App locked</h1>
          <p className="text-slate-400 text-sm mb-6">
            Add your access key to the URL to unlock, e.g.:
          </p>
          <code className="block px-4 py-3 rounded-lg bg-slate-800 text-slate-300 text-sm break-all">
            {typeof window !== 'undefined' ? `${window.location.origin}/?key=YOUR_SECRET` : 'https://m.craft-football.com/?key=YOUR_SECRET'}
          </code>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header />

      <main className="max-w-md mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-xl font-semibold text-slate-100 mb-6">Sign in</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          {!useMagicLink && (
            <div>
              <label htmlFor="password" className="block text-sm text-slate-400 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required={!useMagicLink}
                className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
              />
            </div>
          )}

          {message && (
            <p
              className={`text-sm ${
                message.type === 'success' ? 'text-sky-400' : 'text-red-400'
              }`}
            >
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Sending…' : useMagicLink ? 'Send magic link' : 'Sign in'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => setUseMagicLink((v) => !v)}
          className="mt-4 text-sm text-slate-400 hover:text-slate-300"
        >
          {useMagicLink ? 'Use password instead' : 'Use magic link instead'}
        </button>

        <p className="mt-8 text-xs text-slate-500">
          Need access? Ask a game admin to send you an invite link.
        </p>
      </main>
    </div>
  )
}

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    }>
      <SignInForm />
    </Suspense>
  )
}
