// app/settings/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export default function AccountSettingsPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()
      setDisplayName(profile?.display_name ?? '')
      setLoading(false)
    }
    load()
  }, [])

  async function saveDisplayName(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error: err } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', user.id)
      if (err) throw err
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <p className="text-slate-400">Loading…</p>
    </div>
  )

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-100 mb-6">Account</h1>

      <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 mb-4">
        <p className="text-xs text-slate-500 mb-1">Email</p>
        <p className="text-sm text-slate-300">{email}</p>
      </div>

      <form onSubmit={saveDisplayName} className="space-y-4">
        <div>
          <label htmlFor="displayName" className="block text-sm text-slate-400 mb-1">
            Display name
          </label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className={cn(
            'px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50',
            saved ? 'bg-slate-700 text-sky-300' : 'bg-sky-600 hover:bg-sky-500 text-white'
          )}
        >
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
        </button>
      </form>
    </main>
  )
}
