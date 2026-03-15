'use client'

import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { fetchGames } from '@/lib/data'
import { cn } from '@/lib/utils'
import type { FeatureKey } from '@/lib/types'

const FEATURE_OVERVIEW: { key: FeatureKey; label: string; description: string }[] = [
  { key: 'match_entry',       label: 'Match Entry',       description: 'Next match card, team building, and result recording.' },
  { key: 'team_builder',      label: 'Team Builder',      description: 'Drag-and-drop team builder on the players page.' },
  { key: 'player_stats',      label: 'Player Stats',      description: 'Player stats page with configurable columns and player limit.' },
  { key: 'player_comparison', label: 'Player Comparison', description: 'Side-by-side player comparison tool.' },
]

export default function SettingsPage() {
  const [games, setGames] = useState<{ id: string; name: string }[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [selectedGameId, setSelectedGameId] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchGames()
      .then(setGames)
      .catch(() => setGames([]))
      .finally(() => setGamesLoading(false))
  }, [])

  async function handleCreateInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedGameId) {
      setError('Select a league')
      return
    }
    setLoading(true)
    setError(null)
    setLink(null)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: selectedGameId }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create invite')
      setLink(data.link)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  async function copyLink() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-100 mb-6">Invite admin</h1>
        <p className="text-slate-400 text-sm mb-6">
          Create a link to share. Anyone who follows it can sign up and get admin access to the league.
        </p>

        <form onSubmit={handleCreateInvite} className="space-y-4">
          <div>
            <label htmlFor="league" className="block text-sm text-slate-400 mb-1">League</label>
            <select
              id="league"
              value={selectedGameId}
              onChange={(e) => setSelectedGameId(e.target.value)}
              disabled={gamesLoading || games.length === 0}
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <option value="">
                {gamesLoading ? 'Loading…' : games.length === 0 ? 'No leagues—join one first' : 'Select a league'}
              </option>
              {games.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            {games.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">
                You need to be a member of a league to invite others. Ask an admin to send you an invite link.
              </p>
            )}
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create invite link'}
          </button>
        </form>

        {link && (
          <div className="mt-8 p-4 rounded-lg bg-slate-800 border border-slate-700">
            <p className="text-xs text-slate-400 mb-2">Share this link (valid 7 days):</p>
            <code className="block text-sm text-slate-300 break-all mb-3">{link}</code>
            <button
              type="button"
              onClick={copyLink}
              className={cn(
                'inline-flex items-center gap-1.5 text-sm font-medium transition-all duration-200',
                copied ? 'text-sky-300' : 'text-sky-400 hover:text-sky-300'
              )}
            >
              {copied ? (
                <>
                  <Check className="size-4 shrink-0" />
                  Copied!
                </>
              ) : (
                'Copy link'
              )}
            </button>
          </div>
        )}

        {/* Feature flags overview */}
        <div className="mt-10">
          <h2 className="text-base font-semibold text-slate-100 mb-1">Feature flags</h2>
          <p className="text-sm text-slate-400 mb-4">
            Feature management coming soon — contact your league admin to enable features.
          </p>
          <div className="space-y-2">
            {FEATURE_OVERVIEW.map((f) => (
              <div
                key={f.key}
                className="flex items-start justify-between gap-4 p-4 rounded-lg bg-slate-800 border border-slate-700"
              >
                <div>
                  <p className="text-sm font-medium text-slate-200">{f.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{f.description}</p>
                </div>
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-400 border border-slate-600">
                  Admin only
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
  )
}
