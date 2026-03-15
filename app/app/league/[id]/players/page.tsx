'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Users } from 'lucide-react'
import { Player, Week, LeagueFeature, GameRole } from '@/lib/types'
import { cn, deriveSeason, wprScore } from '@/lib/utils'
import { fetchWeeks, fetchPlayers, fetchGames } from '@/lib/data'
import { isFeatureEnabled } from '@/lib/features'
import { resolveVisibilityTier } from '@/lib/roles'
import { PlayerCard } from '@/components/PlayerCard'
import { TeamBuilderPanel } from '@/components/TeamBuilderPanel'

type SortKey = 'name' | 'wpr' | 'played' | 'won' | 'drew' | 'lost' | 'winRate' | 'timesTeamA' | 'timesTeamB' | 'recentForm'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'wpr', label: 'Form (WPR)' },
  { value: 'played', label: 'Games Played' },
  { value: 'won', label: 'Won' },
  { value: 'drew', label: 'Drawn' },
  { value: 'lost', label: 'Lost' },
  { value: 'winRate', label: 'Win Rate' },
  { value: 'recentForm', label: 'Recent Form' },
  { value: 'timesTeamA', label: 'Team A Appearances' },
  { value: 'timesTeamB', label: 'Team B Appearances' },
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
    } else if (sortBy === 'wpr') {
      cmp = wprScore(a) - wprScore(b)
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

  // Role + feature flags
  const [userRole, setUserRole] = useState<GameRole>('member')
  const [features, setFeatures] = useState<LeagueFeature[]>([])

  // Team builder state
  const [builderMode, setBuilderMode] = useState(false)
  const [teamA, setTeamA] = useState<Player[]>([])
  const [teamB, setTeamB] = useState<Player[]>([])


  const assignedNames = useMemo(
    () => new Set([...teamA, ...teamB].map((p) => p.name)),
    [teamA, teamB],
  )

  const filteredAndSortedPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    let filtered = q
      ? players.filter((p) => p.name.toLowerCase().includes(q))
      : players
    // Hide assigned players from the roster while in builder mode
    if (builderMode) {
      filtered = filtered.filter((p) => !assignedNames.has(p.name))
    }
    return sortPlayers(filtered, sortBy, sortAsc)
  }, [players, searchQuery, sortBy, sortAsc, builderMode, assignedNames])

  useEffect(() => {
    if (!leagueId) return

    async function load() {
      try {
        const [games, weeksData, playersData, featuresRes] = await Promise.all([
          fetchGames(),
          fetchWeeks(leagueId),
          fetchPlayers(leagueId),
          fetch(`/api/league/${leagueId}/features`, { credentials: 'include' }),
        ])
        const game = games.find((g) => g.id === leagueId)
        if (!game) {
          setHasAccess(false)
          setLoading(false)
          return
        }
        setHasAccess(true)
        setUserRole(game.role)

        const featuresData: LeagueFeature[] = featuresRes.ok ? await featuresRes.json() : []
        setFeatures(featuresData)

        const name = game.name
        setLeagueName(name)
        setSeason(deriveSeason(weeksData))
        setPlayers(playersData as Player[])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [leagueId])

  // Feature flag checks — admins always bypass via tier === 'admin'
  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'
  const playerStatsEnabled  = isAdmin || isFeatureEnabled(features, 'player_stats',  tier)
  const teamBuilderEnabled  = isAdmin || isFeatureEnabled(features, 'team_builder',  tier)
  const playerStatsConfig   = features.find((f) => f.feature === 'player_stats')?.config
  const maxPlayers          = isAdmin ? null : (playerStatsConfig?.max_players ?? null)
  const visibleStats        = isAdmin ? undefined : (playerStatsConfig?.visible_stats ?? undefined)
  const showMentality       = isAdmin ? true  : (playerStatsConfig?.show_mentality ?? true)

  const handleToggle = (name: string) => {
    setOpenPlayer((prev) => (prev === name ? null : name))
  }

  // Cycle a player through: unassigned → A → B → unassigned
  const handleAssignCycle = (player: Player) => {
    const inA = teamA.some((p) => p.name === player.name)
    const inB = teamB.some((p) => p.name === player.name)
    if (!inA && !inB) {
      setTeamA((prev) => [...prev, player])
    } else if (inA) {
      setTeamA((prev) => prev.filter((p) => p.name !== player.name))
      setTeamB((prev) => [...prev, player])
    } else {
      setTeamB((prev) => prev.filter((p) => p.name !== player.name))
    }
  }

  const handleAdd = (player: Player, team: 'A' | 'B') => {
    // Remove from other team if already assigned
    setTeamA((prev) => prev.filter((p) => p.name !== player.name))
    setTeamB((prev) => prev.filter((p) => p.name !== player.name))
    if (team === 'A') setTeamA((prev) => [...prev, player])
    else setTeamB((prev) => [...prev, player])
  }

  const handleRemove = (playerName: string) => {
    setTeamA((prev) => prev.filter((p) => p.name !== playerName))
    setTeamB((prev) => prev.filter((p) => p.name !== playerName))
  }

  const handleDropOnTeam = (playerName: string, team: 'A' | 'B') => {
    const player = players.find((p) => p.name === playerName)
    if (!player) return
    handleAdd(player, team)
  }

  const toggleBuilderMode = () => {
    if (builderMode) {
      setBuilderMode(false)
      setTeamA([])
      setTeamB([])
    } else {
      setBuilderMode(true)
      setOpenPlayer(null)
    }
  }

  const getAssignment = (player: Player): 'A' | 'B' | null => {
    if (teamA.some((p) => p.name === player.name)) return 'A'
    if (teamB.some((p) => p.name === player.name)) return 'B'
    return null
  }

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

  if (!playerStatsEnabled) {
    return (
      <main className="max-w-md mx-auto px-4 sm:px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-slate-100 mb-2">Players</h1>
        <p className="text-slate-400 text-sm mb-6">
          The players page has been disabled by your league admin.
        </p>
        <Link
          href={`/league/${leagueId}`}
          className="inline-block px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium"
        >
          Back to results
        </Link>
      </main>
    )
  }

  // Apply max_players limit for members
  const displayedPlayers = maxPlayers ? filteredAndSortedPlayers.slice(0, maxPlayers) : filteredAndSortedPlayers

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

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex flex-col gap-3 mb-4">
          {/* Search */}
          <input
            type="search"
            placeholder="Search players…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            aria-label="Search players"
          />

          {/* Team builder panel — inline, full width */}
          {builderMode && (
            <TeamBuilderPanel
              allPlayers={players}
              teamA={teamA}
              teamB={teamB}
              onAdd={handleAdd}
              onRemove={handleRemove}
              onDropOnTeam={handleDropOnTeam}
              onClear={() => { setTeamA([]); setTeamB([]) }}
            />
          )}

          {/* Sort row + Build Teams button */}
          <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <label htmlFor="sort" className="text-xs text-slate-400 shrink-0">Sort by</label>
              <select
                id="sort"
                value={sortBy}
                onChange={(e) => {
                  const key = e.target.value as SortKey
                  setSortBy(key)
                  setSortAsc(key === 'name')
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm min-w-0"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {sortBy !== 'name' && (
                <button
                  type="button"
                  onClick={() => setSortAsc((a) => !a)}
                  className="text-xs text-slate-400 hover:text-slate-300 shrink-0"
                >
                  {sortAsc ? '↑ Low to high' : '↓ High to low'}
                </button>
              )}
            </div>
            {teamBuilderEnabled && (
              <button
                type="button"
                onClick={toggleBuilderMode}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors shrink-0',
                  builderMode
                    ? 'bg-sky-500/20 border-sky-500 text-sky-300'
                    : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-600',
                )}
              >
                <Users className="h-3.5 w-3.5" />
                {builderMode ? 'Done' : 'Build Teams'}
              </button>
            )}
          </div>

          {builderMode && (
            <p className="text-xs text-slate-500">
              Drag players into a team, or tap to cycle: unassigned → A → B → unassigned.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3">
          {displayedPlayers.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">
              {searchQuery.trim() ? 'No players match your search' : 'No players'}
            </p>
          ) : (
            <>
              {displayedPlayers.map((player) => (
                <PlayerCard
                  key={player.name}
                  player={player}
                  isOpen={openPlayer === player.name}
                  onToggle={() => handleToggle(player.name)}
                  builderMode={builderMode}
                  teamAssignment={getAssignment(player)}
                  onAssignCycle={() => handleAssignCycle(player)}
                  onDragStart={() => {}}
                  visibleStats={visibleStats}
                  showMentality={showMentality}
                />
              ))}
              {maxPlayers && filteredAndSortedPlayers.length > maxPlayers && (
                <p className="text-xs text-slate-600 text-center py-2">
                  Showing {maxPlayers} of {filteredAndSortedPlayers.length} players
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </>
  )
}
