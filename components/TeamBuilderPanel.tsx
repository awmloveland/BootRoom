'use client'

import { useState, useRef, useMemo } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { Player } from '@/lib/types'
import { ewptScore, cn } from '@/lib/utils'
import { RecentForm } from './RecentForm'

interface TeamBuilderPanelProps {
  allPlayers: Player[]
  teamA: Player[]
  teamB: Player[]
  onAdd: (player: Player, team: 'A' | 'B') => void
  onRemove: (playerName: string) => void
  onDropOnTeam: (playerName: string, team: 'A' | 'B') => void
  onClear: () => void
}

function balanceLabel(scoreA: number, scoreB: number): string {
  const diff = Math.abs(scoreA - scoreB)
  if (diff < 3) return 'Balanced'
  if (diff < 8) return scoreA > scoreB ? 'Team A has the edge' : 'Team B has the edge'
  return scoreA > scoreB ? 'Unbalanced — consider swapping' : 'Unbalanced — consider swapping'
}

interface TeamColumnProps {
  label: string
  team: 'A' | 'B'
  players: Player[]
  allPlayers: Player[]
  assignedNames: Set<string>
  score: number
  onAdd: (player: Player, team: 'A' | 'B') => void
  onRemove: (name: string) => void
  onDropOnTeam: (playerName: string, team: 'A' | 'B') => void
}

function TeamColumn({
  label,
  team,
  players,
  allPlayers,
  assignedNames,
  score,
  onAdd,
  onRemove,
  onDropOnTeam,
}: TeamColumnProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allPlayers
      .filter(
        (p) =>
          !assignedNames.has(p.name) &&
          p.name.toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [query, allPlayers, assignedNames])

  const hasGk = players.some((p) => p.mentality === 'goalkeeper' || p.goalkeeper)
  const isTeamA = team === 'A'
  const accentBorder = isTeamA ? 'border-sky-700' : 'border-violet-700'
  const accentBg = isTeamA ? 'bg-sky-500' : 'bg-violet-500'
  const accentText = isTeamA ? 'text-sky-300' : 'text-violet-300'
  const accentPill = isTeamA
    ? 'bg-sky-900/60 text-sky-300 border-sky-800'
    : 'bg-violet-900/60 text-violet-300 border-violet-800'
  const dropHighlight = isTeamA ? 'border-sky-400 bg-sky-900/20' : 'border-violet-400 bg-violet-900/20'

  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3 transition-colors',
        dragOver ? dropHighlight : accentBorder,
        'bg-slate-800/60',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const name = e.dataTransfer.getData('text/plain')
        if (name) onDropOnTeam(name, team)
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded text-white', accentBg)}>
          {label}
        </span>
        {players.length > 0 && (
          <span className={cn('text-lg font-bold tabular-nums', accentText)}>
            {score.toFixed(1)}
          </span>
        )}
        {players.length > 0 && !hasGk && (
          <span title="No goalkeeper">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-label="No goalkeeper" />
          </span>
        )}
        <span className="text-xs text-slate-500 ml-auto">{players.length} players</span>
      </div>

      {/* Combined player pills: name · form · remove */}
      {players.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {players.map((p) => (
            <span
              key={p.name}
              className={cn(
                'inline-flex items-center gap-2 text-xs font-medium border rounded-full px-2.5 py-1',
                accentPill,
              )}
            >
              <span className="shrink-0">{p.name}</span>
              <RecentForm form={p.recentForm} />
              <button
                type="button"
                onClick={() => onRemove(p.name)}
                className="text-slate-500 hover:text-slate-200 ml-auto shrink-0"
                aria-label={`Remove ${p.name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Drop hint */}
      {players.length === 0 && (
        <p className="text-xs text-slate-600 text-center py-2">
          Drag players here or search below
        </p>
      )}

      {/* Type-to-search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={`Add to ${label}…`}
          className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-600 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        {open && suggestions.length > 0 && (
          <ul className="absolute z-20 top-full mt-1 left-0 right-0 rounded-lg border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
            {suggestions.map((p) => (
              <li key={p.name}>
                <button
                  type="button"
                  onMouseDown={() => {
                    onAdd(p, team)
                    setQuery('')
                    setOpen(false)
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 flex items-center justify-between gap-2"
                >
                  <span>{p.name}</span>
                  <span className="text-[10px] text-slate-500">{p.mentality === 'goalkeeper' || p.goalkeeper ? 'GK' : p.mentality.slice(0,3).toUpperCase()}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

export function TeamBuilderPanel({
  allPlayers,
  teamA,
  teamB,
  onAdd,
  onRemove,
  onDropOnTeam,
  onClear,
}: TeamBuilderPanelProps) {
  const scoreA = useMemo(() => ewptScore(teamA), [teamA])
  const scoreB = useMemo(() => ewptScore(teamB), [teamB])
  const assignedNames = useMemo(
    () => new Set([...teamA, ...teamB].map((p) => p.name)),
    [teamA, teamB],
  )

  const hasPlayers = teamA.length + teamB.length > 0
  const totalA = scoreA + scoreB > 0 ? (scoreA / (scoreA + scoreB)) * 100 : 50
  const totalB = 100 - totalA
  const label = hasPlayers ? balanceLabel(scoreA, scoreB) : null

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      {/* EWTPI balance bar + clear */}
      <div className="px-3 pt-3 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-slate-500">EWTPI</span>
            {hasPlayers && label && (
              <span className="text-[10px] text-slate-400">{label}</span>
            )}
          </div>
          {hasPlayers && (
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {hasPlayers ? (
          <div className="grid grid-cols-2 gap-px h-2 rounded overflow-hidden">
            <div className="flex justify-end bg-slate-700">
              <div
                className="h-full bg-sky-500 transition-all duration-500"
                style={{ width: `${totalA}%` }}
              />
            </div>
            <div className="flex justify-start bg-slate-700">
              <div
                className="h-full bg-violet-500 transition-all duration-500"
                style={{ width: `${totalB}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-600 text-center py-1">
            Add players to each team to see their EWTPI
          </p>
        )}
      </div>

      {/* Team columns */}
      <div className="p-3 grid grid-cols-2 gap-3">
        <TeamColumn
          label="Team A"
          team="A"
          players={teamA}
          allPlayers={allPlayers}
          assignedNames={assignedNames}
          score={scoreA}
          onAdd={onAdd}
          onRemove={onRemove}
          onDropOnTeam={onDropOnTeam}
        />
        <TeamColumn
          label="Team B"
          team="B"
          players={teamB}
          allPlayers={allPlayers}
          assignedNames={assignedNames}
          score={scoreB}
          onAdd={onAdd}
          onRemove={onRemove}
          onDropOnTeam={onDropOnTeam}
        />
      </div>
    </div>
  )
}
