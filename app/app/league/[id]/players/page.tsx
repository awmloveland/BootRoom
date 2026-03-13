'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Player, Week } from '@/lib/types'
import { deriveSeason } from '@/lib/utils'
import { fetchWeeks, fetchPlayers, fetchGames } from '@/lib/data'
import { Header } from '@/components/Header'
import { PlayerCard } from '@/components/PlayerCard'
import bootRoomData from '@/data/boot_room.json'

const LEGACY_BOOT_ROOM_ID = '00000000-0000-0000-0000-000000000001'

type SortKey = 'name' | 'played' | 'won' | 'drew' | 'lost' | 'winRate' | 'timesTeamA' | 'timesTeamB' | 'recentForm'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'played', label: 'Games Played' },
  { value: 'won', label: 'Won' },
  { value: 'drew', label: 'Drawn' },
  { value: 'lost', label: 'Lost' },
  { value: 'winRate', label: 'Win Rate' },
  { value: 'timesTeamA', label: 'Team A Appearances' },
  { value: 'timesTeamB', label: 'Team B Appearances' },
  { value: 'recentForm', label: 'Recent Form' },
]

function formScore(form: string): number {
  let score = 0
  for (const c of form) {
    if (c === 'W') score += 3
    else if (c === 'D') score += 1
  }
  return score
}

function sortPlayers(players: Player[], sortBy: SortKey, ascending: boolean): Player[] {
  const dir = ascending ? 1 : -1
  return [...players].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'name') {
      cmp = a.name.localeCompare(b.name)
    } else if (sortBy === 'recentForm') {
      cmp = formScore(a.recentForm) - formScore(b.recentForm)
    } else {
      const aVal = a[sortBy] as number
      const bVal = b[sortBy] as number
      cmp = aVal - bVal
    }
    return cmp * dir
  })
}

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
  const [sortBy, setSortBy] = useState<SortKey>('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  const filteredAndSortedPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q
      ? players.filter((p) => p.name.toLowerCase().includes(q))
      : players
    return sortPlayers(filtered, sortBy, sortAsc)
  }, [players, searchQuery, sortBy, sortAsc])

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
          setPlayers(playersData as Player[])
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
        <div className="flex flex-col gap-3 mb-4">
          <input
            type="search"
            placeholder="Search players…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            aria-label="Search players"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor="sort" className="text-xs text-slate-400">Sort by</label>
          <select
            id="sort"
            value={sortBy}
            onChange={(e) => {
              const key = e.target.value as SortKey
              setSortBy(key)
              setSortAsc(key === 'name')
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortAsc((a) => !a)}
            className="text-xs text-slate-400 hover:text-slate-300"
            title={sortAsc ? 'Ascending (click for descending)' : 'Descending (click for ascending)'}
          >
            {sortAsc ? '↑ Low to high' : '↓ High to low'}
          </button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {filteredAndSortedPlayers.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">
              {searchQuery.trim() ? 'No players match your search' : 'No players'}
            </p>
          ) : (
            filteredAndSortedPlayers.map((player) => (
              <PlayerCard
                key={player.name}
                player={player}
                isOpen={openPlayer === player.name}
                onToggle={() => handleToggle(player.name)}
              />
            ))
          )}
        </div>
      </main>
    </div>
  )
}
