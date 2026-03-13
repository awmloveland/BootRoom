'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { fetchGames } from '@/lib/data'

export default function LeaguesListPage() {
  const [leagues, setLeagues] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newLeagueName, setNewLeagueName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchGames()
        setLeagues(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleCreateLeague(e: React.FormEvent) {
    e.preventDefault()
    if (!newLeagueName.trim()) return
    setCreating(true)
    try {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data, error } = await supabase.rpc('create_game', { game_name: newLeagueName.trim() })
      if (error) throw error
      setLeagues((prev) => [...prev, { id: data, name: newLeagueName.trim() }])
      setNewLeagueName('')
      setShowCreate(false)
      window.location.href = `/league/${data}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header />

      <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-100 mb-6">Your leagues</h1>

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        {leagues.length === 0 && !showCreate ? (
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">No leagues yet. Create one or add existing data.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-3 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium"
            >
              Create new league
            </button>
            <Link
              href="/add-game"
              className="block w-full py-3 px-4 rounded-lg border border-slate-600 hover:border-slate-500 text-slate-200 text-center font-medium"
            >
              Add game data
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {leagues.map((league) => (
              <Link
                key={league.id}
                href={`/league/${league.id}`}
                className="block p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-100 font-medium"
              >
                {league.name}
              </Link>
            ))}
            <button
              onClick={() => setShowCreate(true)}
              className="w-full py-3 px-4 rounded-lg border border-dashed border-slate-600 hover:border-slate-500 text-slate-400 text-sm"
            >
              + Create new league
            </button>
            <Link
              href="/add-game"
              className="block w-full py-3 px-4 rounded-lg border border-slate-600 hover:border-slate-500 text-slate-400 text-sm text-center"
            >
              Add game data
            </Link>
          </div>
        )}

        {showCreate && (
          <form onSubmit={handleCreateLeague} className="mt-6 p-4 rounded-lg bg-slate-800 border border-slate-700">
            <label htmlFor="leagueName" className="block text-sm text-slate-400 mb-2">League name</label>
            <input
              id="leagueName"
              type="text"
              value={newLeagueName}
              onChange={(e) => setNewLeagueName(e.target.value)}
              placeholder="e.g. The Boot Room"
              className="w-full px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 mb-4"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={creating || !newLeagueName.trim()}
                className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewLeagueName('') }}
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-400"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  )
}
