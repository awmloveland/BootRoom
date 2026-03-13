'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/Header'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const code = searchParams?.get('code') ?? null
    let tokenHash = searchParams?.get('token_hash') ?? null
    const type = searchParams?.get('type') ?? null

    if (!tokenHash && typeof window !== 'undefined' && window.location.hash) {
      const hash = new URLSearchParams(window.location.hash.slice(1))
      tokenHash = hash.get('token_hash') || null
    }

    async function init() {
      if (code) {
        const res = await fetch('/api/auth/verify-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
          credentials: 'include',
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setMessage({ type: 'error', text: data.error ?? 'Reset link expired or invalid.' })
        }
      } else if (tokenHash && type === 'recovery') {
        const res = await fetch('/api/auth/verify-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token_hash: tokenHash }),
          credentials: 'include',
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setMessage({ type: 'error', text: data.error ?? 'Reset link expired or invalid.' })
        }
      } else {
        const res = await fetch('/api/auth/session', { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (!data.session) {
          setMessage({ type: 'error', text: 'No reset link detected. Use "Forgot password?" on the sign-in page to get a new link.' })
        }
      }
      setReady(true)
    }

    init()
  }, [searchParams])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' })
      return
    }
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to update password')
      setMessage({ type: 'success', text: 'Password updated. Redirecting…' })
      setTimeout(() => {
        window.location.href = '/'
      }, 1500)
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update password' })
    } finally {
      setLoading(false)
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Verifying reset link…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header />

      <main className="max-w-md mx-auto px-4 sm:px-6 py-12">
        <h1 className="text-xl font-semibold text-slate-100 mb-6">Set new password</h1>
        <p className="text-slate-400 text-sm mb-6">
          Enter your new password below.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm text-slate-400 mb-1">New password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
              placeholder="At least 6 characters"
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
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <a href="/sign-in" className="mt-4 block text-sm text-slate-400 hover:text-slate-300">
          ← Back to sign in
        </a>
      </main>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
