'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AddGamePage() {
  const router = useRouter()
  const [gameName, setGameName] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!gameName.trim() || !jsonText.trim()) {
      setError('Game name and JSON data are required')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/import-game', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: gameName.trim(), data: jsonText }),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      router.push(`/league/${data.gameId}`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-300 mb-4 inline-block">← Leagues</Link>
        <h1 className="text-xl font-semibold text-slate-100 mb-6">Add game data</h1>
        <p className="text-slate-400 text-sm mb-4">
          Use the sample data below, or paste your own JSON (league, weeks, config).
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="gameName" className="block text-sm text-slate-400 mb-1">Game name</label>
            <input
              id="gameName"
              type="text"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              placeholder="e.g. The Boot Room"
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="json" className="block text-sm text-slate-400 mb-1">JSON data</label>
            <textarea
              id="json"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={12}
              placeholder='{"league": "...", "weeks": [...], "config": {...}}'
              className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 font-mono text-sm"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50"
          >
            {loading ? 'Importing…' : 'Import'}
          </button>
        </form>
    </main>
  )
}
