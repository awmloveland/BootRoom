'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import type { Week, Player, Winner } from '@/lib/types'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditWeekModalProps {
  week: Week
  gameId: string
  allPlayers: Player[]
  onSaved: () => void
  onClose: () => void
}

type EditStatus = 'played' | 'cancelled' | 'unrecorded' | 'dnf'

const RESULT_OPTIONS = ['teamA', 'draw', 'teamB'] as const

// ── PlayerChip ────────────────────────────────────────────────────────────────

function PlayerChip({
  name,
  team,
  onRemove,
  onDragStart,
}: {
  name: string
  team: 'A' | 'B' | 'roster'
  onRemove?: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        'flex items-center justify-between gap-2 rounded-md px-3 py-1.5 text-sm cursor-grab select-none',
        team === 'A' && 'bg-slate-900 border border-blue-800 text-slate-200',
        team === 'B' && 'bg-slate-900 border border-violet-800 text-slate-200',
        team === 'roster' && 'bg-slate-900 border border-slate-700 text-slate-400'
      )}
    >
      <span>{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-slate-500 hover:text-slate-300 leading-none text-base"
          aria-label={`Remove ${name}`}
        >
          ×
        </button>
      )}
    </div>
  )
}

// ── LineupEditor ──────────────────────────────────────────────────────────────

function LineupEditor({
  teamA,
  teamB,
  allPlayers,
  onChangeTeamA,
  onChangeTeamB,
}: {
  teamA: string[]
  teamB: string[]
  allPlayers: Player[]
  onChangeTeamA: (names: string[]) => void
  onChangeTeamB: (names: string[]) => void
}) {
  const [dragOverA, setDragOverA] = useState(false)
  const [dragOverB, setDragOverB] = useState(false)
  const [search, setSearch] = useState('')

  const assignedNames = new Set([...teamA, ...teamB])
  const roster = allPlayers
    .map((p) => p.name)
    .filter((name) => !assignedNames.has(name))
    .filter((name) => name.toLowerCase().includes(search.toLowerCase()))

  function handleDrop(target: 'A' | 'B', e: React.DragEvent) {
    e.preventDefault()
    const name = e.dataTransfer.getData('playerName')
    const source = e.dataTransfer.getData('source') as 'teamA' | 'teamB' | 'roster'
    if (!name) return

    if (target === 'A') {
      setDragOverA(false)
      if (source === 'teamB') onChangeTeamB(teamB.filter((n) => n !== name))
      if (!teamA.includes(name)) onChangeTeamA([...teamA, name])
    } else {
      setDragOverB(false)
      if (source === 'teamA') onChangeTeamA(teamA.filter((n) => n !== name))
      if (!teamB.includes(name)) onChangeTeamB([...teamB, name])
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {/* Team A */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverA(true) }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverA(false)
          }}
          onDrop={(e) => handleDrop('A', e)}
          className={cn(
            'rounded-lg border p-2.5 min-h-[80px] flex flex-col gap-1.5 transition-colors',
            dragOverA ? 'border-blue-600 bg-blue-950/20' : 'border-slate-700 bg-slate-800/50'
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-400 mb-1">Team A</p>
          {teamA.map((name) => (
            <PlayerChip
              key={name}
              name={name}
              team="A"
              onRemove={() => onChangeTeamA(teamA.filter((n) => n !== name))}
              onDragStart={(e) => {
                e.dataTransfer.setData('playerName', name)
                e.dataTransfer.setData('source', 'teamA')
              }}
            />
          ))}
          {teamA.length === 0 && (
            <p className="text-xs text-slate-600 text-center pt-2">Drop players here</p>
          )}
        </div>

        {/* Team B */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverB(true) }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverB(false)
          }}
          onDrop={(e) => handleDrop('B', e)}
          className={cn(
            'rounded-lg border p-2.5 min-h-[80px] flex flex-col gap-1.5 transition-colors',
            dragOverB ? 'border-violet-600 bg-violet-950/20' : 'border-slate-700 bg-slate-800/50'
          )}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-400 mb-1">Team B</p>
          {teamB.map((name) => (
            <PlayerChip
              key={name}
              name={name}
              team="B"
              onRemove={() => onChangeTeamB(teamB.filter((n) => n !== name))}
              onDragStart={(e) => {
                e.dataTransfer.setData('playerName', name)
                e.dataTransfer.setData('source', 'teamB')
              }}
            />
          ))}
          {teamB.length === 0 && (
            <p className="text-xs text-slate-600 text-center pt-2">Drop players here</p>
          )}
        </div>
      </div>

      {/* Roster */}
      <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          Roster — drag into a team
        </p>
        <input
          type="text"
          name="player-search"
          placeholder="Search players"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 mb-2"
        />
        <div className="flex flex-wrap gap-1.5">
          {roster.map((name) => (
            <PlayerChip
              key={name}
              name={name}
              team="roster"
              onDragStart={(e) => {
                e.dataTransfer.setData('playerName', name)
                e.dataTransfer.setData('source', 'roster')
              }}
            />
          ))}
          {roster.length === 0 && search === '' && (
            <p className="text-xs text-slate-600">All players assigned</p>
          )}
          {roster.length === 0 && search !== '' && (
            <p className="text-xs text-slate-600">No players match</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── EditWeekModal ─────────────────────────────────────────────────────────────

export function EditWeekModal({
  week,
  gameId,
  allPlayers,
  onSaved,
  onClose,
}: EditWeekModalProps) {
  const wasPlayed = week.status === 'played'
  // Awaiting Result weeks have status 'scheduled' — default the modal to 'played'
  const initialStatus: EditStatus =
    week.status === 'scheduled' ? 'played' : (week.status as EditStatus)

  const [date, setDate] = useState(week.date)
  const [status, setStatus] = useState<EditStatus>(initialStatus)
  const [winner, setWinner] = useState<Winner>(wasPlayed ? (week.winner ?? null) : null)
  const [margin, setMargin] = useState(
    wasPlayed && week.goal_difference != null && week.goal_difference > 0
      ? week.goal_difference
      : 1
  )
  const [notes, setNotes] = useState(week.notes ?? '')
  const [teamA, setTeamA] = useState<string[]>(week.teamA ?? [])
  const [teamB, setTeamB] = useState<string[]>(week.teamB ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Show warning when the game had a result and admin is switching away from played
  const showClearWarning = wasPlayed && status !== 'played'

  async function handleSave() {
    setError(null)

    if (!date || !/^\d{2} [A-Za-z]{3} \d{4}$/.test(date)) {
      setError('Date must be in DD MMM YYYY format, e.g. 26 Mar 2026')
      return
    }
    if (status === 'played' && !winner) {
      setError('Select a result')
      return
    }

    if (!week.id) {
      setError('Cannot edit this week — missing ID')
      return
    }

    setSaving(true)

    const body: Record<string, unknown> = {
      date,
      status,
      notes: notes.trim() || null,
    }

    if (status === 'played') {
      body.winner = winner
      body.goalDifference = winner === 'draw' ? 0 : margin
      body.teamA = teamA
      body.teamB = teamB
    }

    if (status === 'dnf') {
      body.teamA = teamA
      body.teamB = teamB
    }

    try {
      const res = await fetch(`/api/league/${gameId}/weeks/${week.id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Failed to save')
        return
      }

      onSaved()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-base font-semibold text-slate-100">
            Edit Week {week.week}
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {/* Date + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                Date
              </label>
              <input
                type="text"
                name="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="DD MMM YYYY"
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                Status
              </label>
              <select
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as EditStatus)}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="played">Played</option>
                <option value="cancelled">Cancelled</option>
                <option value="unrecorded">Unrecorded</option>
                <option value="dnf">DNF</option>
              </select>
            </div>
          </div>

          {/* Clear warning */}
          {showClearWarning && (
            <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/50 rounded-md px-3 py-2">
              This will clear the recorded result and lineups.
            </p>
          )}

          {/* Played-only fields */}
          {status === 'played' && (
            <>
              {/* Result */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                  Result
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {RESULT_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setWinner(opt)}
                      className={cn(
                        'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                        winner === opt
                          ? opt === 'teamA'
                            ? 'bg-blue-900 border-blue-700 text-blue-300'
                            : opt === 'teamB'
                            ? 'bg-violet-900 border-violet-700 text-violet-300'
                            : 'bg-slate-700 border-slate-500 text-slate-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                      )}
                    >
                      {opt === 'teamA' ? 'Team A' : opt === 'teamB' ? 'Team B' : 'Draw'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Margin */}
              {winner !== 'draw' && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                    Margin of victory
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setMargin((m) => Math.max(1, m - 1))}
                      className="h-8 w-8 rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-lg leading-none hover:bg-slate-700 transition-colors"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm font-semibold text-slate-200">
                      {margin}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMargin((m) => Math.min(20, m + 1))}
                      className="h-8 w-8 rounded-md border border-slate-700 bg-slate-800 text-slate-300 text-lg leading-none hover:bg-slate-700 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Lineups */}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                  Lineups
                </label>
                <LineupEditor
                  teamA={teamA}
                  teamB={teamB}
                  allPlayers={allPlayers}
                  onChangeTeamA={setTeamA}
                  onChangeTeamB={setTeamB}
                />
              </div>
            </>
          )}

          {/* DNF fields — lineups editable, no result or margin */}
          {status === 'dnf' && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
                Lineups
              </label>
              <LineupEditor
                teamA={teamA}
                teamB={teamB}
                allPlayers={allPlayers}
                onChangeTeamA={setTeamA}
                onChangeTeamB={setTeamB}
              />
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
              Notes
            </label>
            <textarea
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes"
              className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-800">
          <button
            onClick={onClose}
            className="rounded-md border border-slate-700 bg-transparent px-4 py-2 text-sm text-slate-400 hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
