'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Player, Week } from '@/lib/types'
import { deriveSeason } from '@/lib/utils'
import { fetchWeeks, fetchPlayers, fetchGames } from '@/lib/data'
import { Header } from '@/components/Header'
import { PlayerCard } from '@/components/PlayerCard'
import bootRoomData from '@/data/boot_room.json'

const LEGACY_BOOT_ROOM_ID = '00000000-0000-0000-0000-000000000001'

const bootRoomPlayersData = (() => {
  const weeks = (bootRoomData.weeks ?? []) as Week[]
  const players = (bootRoomData.players ?? []) as Player[]
  const season = deriveSeason(weeks)
  const sorted = [...players].sort((a, b) => a.name.localeCompare(b.name))
  return { leagueName: 'The Boot Room', season, players: sorted }
})()

export default function LeaguePlayersPage() {
  const params = useParams()
  const leagueId = (params?.id as string) ?? ''
  const [leagueName, setLeagueName] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [season, setSeason] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openPlayer, setOpenPlayer] = useState<string | null>(null)
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    if (!leagueId) return

    async function load() {
      try {
        const [games, weeksData, playersData] = await Promise.all([
          fetchGames(),
          fetchWeeks(leagueId),
          fetchPlayers(leagueId),
        ])
        const game = games.find((g) => g.id === leagueId)
        if (!game) {
          setHasAccess(false)
          setLoading(false)
          return
        }
        setHasAccess(true)
        const name = game.name
        const isBootRoom = leagueId === LEGACY_BOOT_ROOM_ID || name === 'The Boot Room'

        if (isBootRoom) {
          setLeagueName(bootRoomPlayersData.leagueName)
          setSeason(bootRoomPlayersData.season)
          setPlayers(bootRoomPlayersData.players)
        } else {
          setLeagueName(name)
          setSeason(deriveSeason(weeksData))
          const sorted = [...playersData].sort((a, b) => a.name.localeCompare(b.name))
          setPlayers(sorted as Player[])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [leagueId])

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

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Header />
        <main className="max-w-md mx-auto px-4 sm:px-6 py-12 text-center">
          <h1 className="text-xl font-semibold text-slate-100 mb-2">League</h1>
          <p className="text-slate-400 text-sm mb-6">
            You need an invite to view this league. Ask an admin to send you an invite link.
          </p>
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium"
          >
            Your leagues
          </Link>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900">
        <Header />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/" className="text-sky-400 hover:underline">Back to leagues</Link>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <Header />

      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2">
          <Link href={`/league/${leagueId}`} className="text-xs text-slate-400 hover:text-slate-300">← {leagueName}</Link>
        </div>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pb-2">
          <h1 className="text-lg font-semibold text-slate-100 mb-1">{leagueName}</h1>
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
