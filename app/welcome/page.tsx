'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const inputClass =
  'w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent'

function WelcomeForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dest = searchParams.get('redirect') ?? '/'

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadMeta() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/sign-in'); return }
      const meta = user.user_metadata ?? {}
      setFirstName(meta.given_name ?? '')
      setLastName(meta.family_name ?? '')
      setLoading(false)
    }
    loadMeta()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() && !lastName.trim()) {
      setError('Please enter your name.')
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName }),
    })
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }
    router.refresh()
    router.push(dest)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Confirm your name</h1>
          <p className="text-sm text-slate-400 mt-1">
            This is how you&apos;ll appear across your leagues.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="welcome-first" className="block text-sm text-slate-400 mb-1">
                First name
              </label>
              <input
                id="welcome-first"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className={inputClass}
                placeholder="Alex"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="welcome-last" className="block text-sm text-slate-400 mb-1">
                Last name
              </label>
              <input
                id="welcome-last"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className={inputClass}
                placeholder="Smith"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Saving…' : 'Confirm'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function WelcomePage() {
  return (
    <Suspense>
      <WelcomeForm />
    </Suspense>
  )
}
