'use client'

import { useState, useMemo } from 'react'
import { Search, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlayerCard } from '@/components/PlayerCard'
import type { Player, SortKey } from '@/lib/types'

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

const DIRECTION_LABELS: Record<SortKey, [string, string]> = {
  name:       ['A–Z',        'Z–A'],
  played:     ['Low–High',   'High–Low'],
  won:        ['Low–High',   'High–Low'],
  winRate:    ['Low–High',   'High–Low'],
  recentForm: ['Worst–Best', 'Best–Worst'],
}
// Index 0 = sortAsc true, index 1 = sortAsc false

const DEFAULT_ASC: Record<SortKey, boolean> = {
  name:       true,
  played:     false,
  won:        false,
  winRate:    false,
  recentForm: false,
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
      {/* Toolbar card */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          <input
            type="search"
            placeholder="Search players…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-900 border border-slate-600 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 w-full"
            aria-label="Search players"
          />
        </div>

        {/* Divider */}
        <div className="border-t border-slate-700 -mx-3 my-3" />

        {/* Sort */}
        <div role="group" aria-label="Sort by" className="flex items-center gap-0.5">
          <div className="relative flex-1 overflow-hidden min-w-0 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-4 after:bg-gradient-to-r after:from-transparent after:to-slate-800 after:pointer-events-none">
            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span aria-hidden="true" className="text-[10px] text-slate-500 uppercase tracking-widest shrink-0">
                Sort
              </span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={sortBy === opt.value}
                  onClick={() => {
                    if (sortBy === opt.value) return
                    setSortBy(opt.value)
                    setSortAsc(DEFAULT_ASC[opt.value])
                  }}
                  className={cn(
                    'rounded-full text-xs px-2.5 py-1 transition-colors shrink-0',
                    sortBy === opt.value
                      ? 'bg-sky-500 border border-sky-500 text-white hover:bg-sky-400'
                      : 'border border-slate-700 text-slate-400 hover:border-slate-500',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            aria-label="Toggle sort direction"
            onClick={() => setSortAsc((a) => !a)}
            className="shrink-0 text-xs text-slate-400 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 flex items-center gap-1 hover:border-slate-500 transition-colors"
          >
            {sortAsc
              ? <ArrowUp className="h-3.5 w-3.5" />
              : <ArrowDown className="h-3.5 w-3.5" />
            }
            {DIRECTION_LABELS[sortBy][sortAsc ? 0 : 1]}
          </button>
        </div>
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
            visibleStats={visibleStats}
            showMentality={showMentality}
            sortBy={sortBy}
          />
        ))
      )}
    </div>
  )
}
