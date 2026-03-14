'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftRight } from 'lucide-react'
import { Player, Week } from '@/lib/types'
import { cn, deriveSeason, wprScore } from '@/lib/utils'
import { fetchWeeks, fetchPlayers, fetchGames } from '@/lib/data'
import { PlayerCard } from '@/components/PlayerCard'
import { ComparePanel } from '@/components/ComparePanel'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import bootRoomData from '@/data/boot_room.json'

const LEGACY_BOOT_ROOM_ID = '00000000-0000-0000-0000-000000000001'

type SortKey = 'performer' | 'name' | 'played' | 'won' | 'drew' | 'lost' | 'winRate' | 'timesTeamA' | 'timesTeamB' | 'recentForm'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'performer', label: 'Weighted Performance Rating' },
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
    if (sortBy === 'performer') {
      // Qualified players (5+ games) always rank above unqualified
      if (a.qualified !== b.qualified) return a.qualified ? -1 : 1
      return wprScore(b) - wprScore(a)
    }
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
  const [sortBy, setSortBy] = useState<SortKey>('performer')
  const [sortAsc, setSortAsc] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [compareMode, setCompareMode] = useState(false)
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)

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

  const handleSelectPlayer = (player: Player) => {
    setSelectedPlayers((prev) => {
      if (prev.some((p) => p.name === player.name)) {
        return prev.filter((p) => p.name !== player.name)
      }
      if (prev.length >= 2) {
        return [prev[1], player]
      }
      return [...prev, player]
    })
  }

  const toggleCompareMode = () => {
    if (compareMode) {
      setCompareMode(false)
      setSelectedPlayers([])
      setSheetOpen(false)
    } else {
      setCompareMode(true)
      setOpenPlayer(null)
    }
  }

  useEffect(() => {
    if (compareMode && selectedPlayers.length === 2) {
      setSheetOpen(true)
    }
  }, [compareMode, selectedPlayers.length])

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <p className="text-slate-400">Loading…</p>
      </div>
    )
  }

  if (!hasAccess) {
    return (
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
    )
  }

  if (error) {
    return (
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/" className="text-sky-400 hover:underline">Back to leagues</Link>
      </main>
    )
  }

  const comparePair =
    selectedPlayers.length === 2
      ? (selectedPlayers as [Player, Player])
      : null

  return (
    <>
      <div className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
          <Link href={`/league/${leagueId}`} className="text-xs text-slate-400 hover:text-slate-300">← Results</Link>
          <span className="text-xs text-slate-400">
            {players.length} Players · Season {season}
          </span>
        </div>
      </div>

      <main
        className={cn(
          'mx-auto px-4 sm:px-6 py-4 transition-all duration-300',
          compareMode && comparePair ? 'max-w-5xl' : 'max-w-2xl',
        )}
      >
        <div
          className={cn(
            compareMode && comparePair ? 'lg:grid lg:grid-cols-[1fr_320px] lg:gap-6' : '',
          )}
        >
          {/* Left column: toolbar + player list */}
          <div>
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
                <label htmlFor="sort" className="text-xs text-slate-400 shrink-0">Sort by</label>
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
                {sortBy !== 'performer' && (
                  <button
                    type="button"
                    onClick={() => setSortAsc((a) => !a)}
                    className="text-xs text-slate-400 hover:text-slate-300"
                    title={sortAsc ? 'Ascending (click for descending)' : 'Descending (click for ascending)'}
                  >
                    {sortAsc ? '↑ Low to high' : '↓ High to low'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleCompareMode}
                  className={cn(
                    'ml-auto inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors',
                    compareMode
                      ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                      : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-600',
                  )}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  Compare
                </button>
              </div>
              {sortBy === 'performer' && !compareMode && (
                <p className="text-xs text-slate-500">
                  Based on overall record, recent form and player rating. Players with fewer than 5 games appear at the bottom.
                </p>
              )}
              {compareMode && (
                <p className="text-xs text-slate-500">
                  {selectedPlayers.length === 0 && 'Tap two players to compare them side by side.'}
                  {selectedPlayers.length === 1 && `${selectedPlayers[0].name} selected — pick one more.`}
                  {selectedPlayers.length === 2 && `Comparing ${selectedPlayers[0].name} and ${selectedPlayers[1].name}.`}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              {filteredAndSortedPlayers.length === 0 ? (
                <p className="text-slate-500 text-sm py-4 text-center">
                  {searchQuery.trim() ? 'No players match your search' : 'No players'}
                </p>
              ) : (
                filteredAndSortedPlayers.map((player, index) => (
                  <PlayerCard
                    key={player.name}
                    player={player}
                    isOpen={openPlayer === player.name}
                    onToggle={() => handleToggle(player.name)}
                    rank={sortBy === 'performer' && !searchQuery.trim() && !compareMode ? index + 1 : undefined}
                    compareMode={compareMode}
                    isSelected={selectedPlayers.some((p) => p.name === player.name)}
                    onSelect={() => handleSelectPlayer(player)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right column: compare panel (desktop only) */}
          {compareMode && (
            <div className="hidden lg:block">
              <div className="sticky top-20">
                {comparePair ? (
                  <ComparePanel
                    playerA={comparePair[0]}
                    playerB={comparePair[1]}
                    onClear={() => setSelectedPlayers([])}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800/50 p-8 text-center">
                    <ArrowLeftRight className="h-6 w-6 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">
                      {selectedPlayers.length === 0
                        ? 'Select 2 players to compare'
                        : `${selectedPlayers[0].name} selected — pick one more`}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Mobile floating pill */}
      {compareMode && (
        <div className="lg:hidden fixed bottom-6 inset-x-4 z-40">
          <div className="rounded-full border border-slate-700 bg-slate-800 shadow-xl px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-slate-300 truncate">
              {selectedPlayers.length === 0 && 'Select 2 players to compare'}
              {selectedPlayers.length === 1 && `${selectedPlayers[0].name} — pick one more`}
              {selectedPlayers.length === 2 && `${selectedPlayers[0].name} vs ${selectedPlayers[1].name}`}
            </span>
            <div className="flex items-center gap-3 shrink-0">
              {comparePair && (
                <button
                  type="button"
                  onClick={() => setSheetOpen(true)}
                  className="text-xs font-semibold text-sky-400 hover:text-sky-300 whitespace-nowrap"
                >
                  View →
                </button>
              )}
              <button
                type="button"
                onClick={toggleCompareMode}
                className="text-xs text-slate-500 hover:text-slate-400"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom sheet */}
      {compareMode && comparePair && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="bottom"
            className="h-[85vh] bg-slate-900 border-slate-700 p-0 flex flex-col"
          >
            <SheetHeader className="px-4 pt-5 pb-3 border-b border-slate-700 shrink-0">
              <SheetTitle className="text-slate-100">Compare Players</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto px-4 py-4 flex-1">
              <ComparePanel
                playerA={comparePair[0]}
                playerB={comparePair[1]}
                onClear={() => {
                  setSelectedPlayers([])
                  setSheetOpen(false)
                }}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </>
  )
}
