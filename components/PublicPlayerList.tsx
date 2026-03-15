'use client'

import { useState, useMemo } from 'react'
import { PlayerCard } from '@/components/PlayerCard'
import type { Player } from '@/lib/types'

type SortKey = 'name' | 'played' | 'won' | 'winRate' | 'recentForm'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name',       label: 'Name' },
  { value: 'played',     label: 'Games Played' },
  { value: 'won',        label: 'Won' },
  { value: 'winRate',    label: 'Win Rate' },
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
    if (sortBy === 'name') cmp = a.name.localeCompare(b.name)
    else if (sortBy === 'recentForm') cmp = formScore(a.recentForm) - formScore(b.recentForm)
    else cmp = (a[sortBy] as number) - (b[sortBy] as number)
    return cmp * dir
  })
}

interface Props {
  players: Player[]
  visibleStats?: string[]
  showMentality?: boolean
}

export function PublicPlayerList({ players, visibleStats, showMentality = true }: Props) {
  const [openPlayer, setOpenPlayer]     = useState<string | null>(null)
  const [sortBy, setSortBy]             = useState<SortKey>('name')
  const [sortAsc, setSortAsc]           = useState(true)
  const [searchQuery, setSearchQuery]   = useState('')

  const displayed = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const filtered = q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players
    return sortPlayers(filtered, sortBy, sortAsc)
  }, [players, searchQuery, sortBy, sortAsc])

  return (
    <div className="flex flex-col gap-3">
      {/* Search */}
      <input
        type="search"
        placeholder="Search players…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
        aria-label="Search players"
      />

      {/* Sort */}
      <div className="flex items-center gap-2">
        <label htmlFor="pub-sort" className="text-xs text-slate-400 shrink-0">Sort by</label>
        <select
          id="pub-sort"
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

      {/* Player cards */}
      {displayed.length === 0 ? (
        <p className="text-slate-500 text-sm py-4 text-center">
          {searchQuery.trim() ? 'No players match your search' : 'No players'}
        </p>
      ) : (
        displayed.map((player) => (
          <PlayerCard
            key={player.name}
            player={player}
            isOpen={openPlayer === player.name}
            onToggle={() => setOpenPlayer((prev) => (prev === player.name ? null : player.name))}
            builderMode={false}
            teamAssignment={null}
            onAssignCycle={() => {}}
            onDragStart={() => {}}
            visibleStats={visibleStats}
            showMentality={showMentality}
          />
        ))
      )}
    </div>
  )
}
