'use client'

import { useEffect, useState } from 'react'
import { Player } from '@/lib/types'
import { deriveSeason } from '@/lib/utils'
import { fetchWeeks, fetchPlayers } from '@/lib/data'
import { Header } from '@/components/Header'
import { PlayerCard } from '@/components/PlayerCard'

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [season, setSeason] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const [weeksData, playersData] = await Promise.all([
          fetchWeeks(),
          fetchPlayers(),
        ])
        setSeason(deriveSeason(weeksData))
        const sorted = [...playersData].sort((a, b) => a.name.localeCompare(b.name))
        setPlayers(sorted as Player[])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleToggle = (name: string) => {
    setOpenPlayer((prev) => (prev === name ? null : name))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
        <p className="text-red-400">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header />

      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2">
          <p className="text-xs text-slate-400">
            {players.length} Players · Season {season}
          </p>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col gap-3">
          {players.map((player) => (
            <PlayerCard
              key={player.name}
              player={player}
              isOpen={openPlayer === player.name}
              onToggle={() => handleToggle(player.name)}
            />
          ))}
        </div>
      </main>
    </div>
  )
}
