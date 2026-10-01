'use client'

import { useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
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
        'flex items-center justify-between gap-1.5 rounded font-inter-body text-xs font-semibold cursor-grab select-none',
        team === 'A' && 'px-[9px] py-1.5 bg-[rgba(8,47,73,.55)] border-l-2 border-[#38bdf8] text-[#dff1ff]',
        team === 'B' && 'px-[9px] py-1.5 bg-[rgba(46,16,101,.45)] border-l-2 border-[#a78bfa] text-[#efeaff]',
        team === 'roster' && 'px-2.5 py-1.5 border border-[#223a5c] text-[#8ba4c4]'
      )}
    >
      <span className="whitespace-nowrap">{name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="text-[#6f88a8] hover:text-white leading-none text-sm"
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
    <div>
      <div className="grid grid-cols-2 gap-2.5">
        {/* Team A */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOverA(true) }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverA(false)
          }}
          onDrop={(e) => handleDrop('A', e)}
          className={cn(
            'rounded-lg border bg-[#0c1728] p-2.5 min-h-20 flex flex-col gap-[5px] transition-colors',
            dragOverA ? 'border-[#38bdf8]/50' : 'border-[#1b2c46]'
          )}
        >
          <p className="font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#7dd3fc] mb-[3px]">Team A</p>
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
            <p className="font-plex text-[9px] uppercase tracking-[.14em] text-[#4f688a] text-center pt-2">Drop players here</p>
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
            'rounded-lg border bg-[#0c1728] p-2.5 min-h-20 flex flex-col gap-[5px] transition-colors',
            dragOverB ? 'border-[#a78bfa]/50' : 'border-[#1b2c46]'
          )}
        >
          <p className="font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#c4b5fd] mb-[3px]">Team B</p>
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
            <p className="font-plex text-[9px] uppercase tracking-[.14em] text-[#4f688a] text-center pt-2">Drop players here</p>
          )}
        </div>
      </div>

      {/* Roster */}
      <div className="mt-2.5 rounded-lg border border-[#1b2c46] bg-[#0c1728] p-2.5">
        <p className="font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#6f88a8] mb-2">
          Roster · drag into a team
        </p>
        <input
          type="text"
          name="player-search"
          placeholder="Search players"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-8 rounded border border-[#1b2c46] bg-[#060b14] px-2.5 py-0 font-inter-body text-xs text-[#f4f9ff] placeholder:text-[#4f688a] focus:outline-none focus:ring-0 focus:border-[#38bdf8] mb-2"
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
            <p className="font-plex text-[9px] uppercase tracking-[.14em] text-[#4f688a]">All players assigned</p>
          )}
          {roster.length === 0 && search !== '' && (
            <p className="font-plex text-[9px] uppercase tracking-[.14em] text-[#4f688a]">No players match</p>
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
      setError('Cannot edit this week: missing ID')
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
      setError('Network error. Please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#030710]/80" onClick={onClose} />
      <div className="relative z-10 w-full max-w-[468px] rounded-[14px] border border-[#1b2c46] bg-[#0a1421] shadow-[0_34px_80px_rgba(0,0,0,.65)] overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3.5 border-b border-[#1b2c46] bg-[#0c1728]">
          <h2 className="text-base font-bold tracking-[-.02em] text-[#f4f9ff]">
            Edit Week {week.week}
          </h2>
          <button
            onClick={onClose}
            className="inline-flex size-7 items-center justify-center text-[#8ba4c4] hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="size-4" strokeWidth={2.2} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-[18px] flex flex-col gap-4">
          {/* Date + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-1.5">
                Date
              </label>
              <input
                type="text"
                name="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                placeholder="DD MMM YYYY"
                className="w-full h-9 rounded border border-[#1b2c46] bg-[#0c1728] px-3 py-0 font-plex text-xs text-[#f4f9ff] placeholder:text-[#4f688a] focus:outline-none focus:ring-0 focus:border-[#38bdf8]"
              />
            </div>
            <div>
              <label className="block font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-1.5">
                Status
              </label>
              <div className="relative">
                <select
                  name="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as EditStatus)}
                  className="w-full h-9 appearance-none bg-none rounded border border-[#1b2c46] bg-[#0c1728] pl-3 pr-8 py-0 font-inter-body text-xs font-semibold text-[#f4f9ff] focus:outline-none focus:ring-0 focus:border-[#38bdf8]"
                >
                  <option value="played">Played</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="unrecorded">Unrecorded</option>
                  <option value="dnf">DNF</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-[11px] top-1/2 -translate-y-1/2 size-[13px] text-[#6f88a8]" />
              </div>
            </div>
          </div>

          {/* Clear warning */}
          {showClearWarning && (
            <p className="font-inter-body text-xs text-[#e2686f] bg-[#e2686f]/10 border border-[#e2686f]/40 rounded px-3 py-2">
              This will clear the recorded result and lineups.
            </p>
          )}

          {/* Played-only fields */}
          {status === 'played' && (
            <>
              {/* Result */}
              <div>
                <label className="block font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-1.5">
                  Result
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {RESULT_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setWinner(opt)}
                      className={cn(
                        'h-9 rounded border text-xs font-bold transition-colors',
                        winner === opt
                          ? opt === 'teamA'
                            ? 'bg-[rgba(8,47,73,.6)] border-[#38bdf8]/50 text-[#7dd3fc]'
                            : opt === 'teamB'
                            ? 'bg-[rgba(46,16,101,.5)] border-[#a78bfa]/50 text-[#c4b5fd]'
                            : 'bg-[#1b2c46] border-[#2c4a72] text-[#cfe0f4]'
                          : 'bg-[#0c1728] border-[#223a5c] text-[#8ba4c4] hover:border-[#38bdf8]'
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
                  <label className="block font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-1.5">
                    Margin of victory
                  </label>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setMargin((m) => Math.max(1, m - 1))}
                      className="h-8 w-8 rounded border border-[#223a5c] bg-[#0c1728] text-[#8ba4c4] text-base leading-none hover:text-white transition-colors"
                    >
                      −
                    </button>
                    <span className="w-7 text-center font-plex text-sm font-bold text-[#f4f9ff]">
                      {margin}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMargin((m) => Math.min(20, m + 1))}
                      className="h-8 w-8 rounded border border-[#223a5c] bg-[#0c1728] text-[#8ba4c4] text-base leading-none hover:text-white transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Lineups */}
              <div>
                <label className="block font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-1.5">
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
              <label className="block font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-1.5">
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
            <label className="block font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-1.5">
              Notes
            </label>
            <textarea
              name="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes"
              className="block w-full rounded border border-[#1b2c46] bg-[#0c1728] px-3 py-2.5 font-inter-body text-xs text-[#f4f9ff] placeholder:text-[#4f688a] focus:outline-none focus:ring-0 focus:border-[#38bdf8] resize-none"
            />
          </div>

          {error && <p className="font-inter-body text-xs text-[#e2686f]">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-[#1b2c46] bg-[#0c1728]">
          <button
            onClick={onClose}
            className="h-9 px-3.5 rounded border border-[#223a5c] text-[#cfe0f4] text-[13px] font-semibold hover:border-[#38bdf8] hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 px-4 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-[13px] font-bold disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
