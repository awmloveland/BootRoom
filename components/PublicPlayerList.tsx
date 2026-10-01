'use client'

import { useState, useMemo } from 'react'
import { Search, ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PlayerCard } from '@/components/PlayerCard'
import type { Player, SortKey, Week } from '@/lib/types'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'won',        label: 'Won' },
  { value: 'recentForm', label: 'Last 5' },
  { value: 'played',     label: 'Played' },
  { value: 'winRate',    label: 'Win Rate' },
  { value: 'name',       label: 'Name' },
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

const DEFAULT_SORT: SortKey = 'won'

interface Props {
  players: Player[]
  visibleStats?: string[]
  showMentality?: boolean
  weeks?: Week[]
}

export function PublicPlayerList({ players, visibleStats, showMentality = true, weeks }: Props) {
  // Open the top card on first render so the list doesn't land fully collapsed
  const [openPlayer, setOpenPlayer]     = useState<string | null>(
    () => sortPlayers(players, DEFAULT_SORT, DEFAULT_ASC[DEFAULT_SORT])[0]?.name ?? null,
  )
  const [sortBy, setSortBy]             = useState<SortKey>(DEFAULT_SORT)
  const [sortAsc, setSortAsc]           = useState(DEFAULT_ASC[DEFAULT_SORT])
  const [searchQuery, setSearchQuery]   = useState('')
  // Bumped on every sort change to remount the list (see the cards wrapper below)
  const [sortVersion, setSortVersion]   = useState(0)

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return q ? players.filter((p) => p.name.toLowerCase().includes(q)) : players
  }, [players, searchQuery])

  const displayed = useMemo(
    () => sortPlayers(filtered, sortBy, sortAsc),
    [filtered, sortBy, sortAsc],
  )

  // Re-sorting opens whichever card lands at the top
  function applySort(key: SortKey, ascending: boolean) {
    setSortBy(key)
    setSortAsc(ascending)
    setOpenPlayer(sortPlayers(filtered, key, ascending)[0]?.name ?? null)
    setSortVersion((v) => v + 1)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar card */}
      <div className="bg-[#0a1421] border border-[#1b2c46] rounded-xl p-3 shadow-[0_18px_44px_rgba(0,0,0,.42)]">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-[13px] w-[13px] text-[#6f88a8] pointer-events-none" />
          <input
            type="search"
            placeholder="Search players…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-[38px] w-full rounded border border-[#1b2c46] bg-[#0c1728] pl-[34px] pr-3 py-0 font-inter-body text-[13px] text-[#f4f9ff] placeholder:text-[#4f688a] focus:outline-none focus:ring-0 focus:border-[#38bdf8]"
            aria-label="Search players"
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-[#17263c] -mx-3 my-3" />

        {/* Sort */}
        <div role="group" aria-label="Sort by" className="flex items-center gap-2">
          <div className="relative flex-1 overflow-hidden min-w-0 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-4 after:bg-gradient-to-r after:from-transparent after:to-[#0a1421] after:pointer-events-none">
            <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <span aria-hidden="true" className="font-plex text-[9px] font-bold text-[#4f688a] uppercase tracking-[.18em] shrink-0 mr-1">
                Sort
              </span>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={sortBy === opt.value}
                  onClick={() => {
                    if (sortBy === opt.value) return
                    applySort(opt.value, DEFAULT_ASC[opt.value])
                  }}
                  className={cn(
                    'h-7 px-[11px] rounded border font-plex text-[9.5px] font-bold uppercase tracking-[.12em] whitespace-nowrap transition-colors shrink-0',
                    sortBy === opt.value
                      ? 'bg-[#38bdf8] border-[#38bdf8] text-[#05101d]'
                      : 'border-[#1b2c46] text-[#8ba4c4] hover:border-[#2c4a72]',
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
            onClick={() => applySort(sortBy, !sortAsc)}
            className="shrink-0 inline-flex items-center gap-1.5 h-7 px-2.5 rounded border border-[#1b2c46] bg-[#0c1728] font-plex text-[9.5px] font-bold uppercase tracking-[.1em] text-[#8ba4c4] hover:border-[#38bdf8] transition-colors"
          >
            <ArrowUp
              className={cn('h-3 w-3 transition-transform duration-200', !sortAsc && 'rotate-180')}
              strokeWidth={2.2}
            />
            {DIRECTION_LABELS[sortBy][sortAsc ? 0 : 1]}
          </button>
        </div>
      </div>

      {/* Player cards */}
      {displayed.length === 0 ? (
        <p className="font-inter-body text-[13px] text-[#6f88a8] py-4 text-center">
          {searchQuery.trim() ? 'No players match your search' : 'No players'}
        </p>
      ) : (
        // Remounting on sort change swaps the list in one fade instead of cards
        // jumping position while the old and new open cards animate height.
        // Radix skips the expand animation for a card that mounts open.
        <div
          key={sortVersion}
          className={cn('flex flex-col gap-3', sortVersion > 0 && 'motion-safe:animate-list-in')}
        >
          {displayed.map((player) => (
            <PlayerCard
              key={player.name}
              player={player}
              isOpen={openPlayer === player.name}
              onToggle={() => setOpenPlayer((prev) => (prev === player.name ? null : player.name))}
              visibleStats={visibleStats}
              showMentality={showMentality}
              sortBy={sortBy}
              weeks={weeks}
            />
          ))}
        </div>
      )}
    </div>
  )
}
