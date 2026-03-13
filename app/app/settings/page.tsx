'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { fetchGames } from '@/lib/data'

export default function SettingsPage() {
  const [games, setGames] = useState<{ id: string; name: string }[]>([])
  const [gamesLoading, setGamesLoading] = useState(true)
  const [selectedGameId, setSelectedGameId] = useState('')
  const [link, setLink] = useState<string | null>(null)
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
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header />

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
              className="text-sm text-sky-400 hover:text-sky-300"
            >
              Copy link
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
