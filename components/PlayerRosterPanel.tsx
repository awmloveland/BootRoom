'use client'

import { useState, useCallback } from 'react'
import { ChevronDown, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Mentality, PlayerAttribute, Strength } from '@/lib/types'
import { StrengthPills } from '@/components/ui/StrengthPills'
import MemberLinkPicker from '@/components/MemberLinkPicker'
import { AddRosterPlayerModal } from '@/components/AddRosterPlayerModal'

interface Props {
  leagueId: string
  initialPlayers: PlayerAttribute[]
}

const MENTALITY_LABELS: { value: Mentality; label: string }[] = [
  { value: 'goalkeeper', label: 'GK' },
  { value: 'defensive',  label: 'DEF' },
  { value: 'balanced',   label: 'BAL' },
  { value: 'attacking',  label: 'ATT' },
]

const MENTALITY_DISPLAY: Record<Mentality, string> = {
  goalkeeper: 'GK',
  defensive:  'DEF',
  balanced:   'BAL',
  attacking:  'ATT',
}

export function PlayerRosterPanel({ leagueId, initialPlayers }: Props) {
  const [players, setPlayers] = useState<PlayerAttribute[]>(initialPlayers)
  const [expandedName, setExpandedName] = useState<string | null>(null)
  const [errorName, setErrorName] = useState<string | null>(null)
  const [linkingPlayerName, setLinkingPlayerName] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [linkSubmitting, setLinkSubmitting] = useState(false)
  const [renamingPlayer, setRenamingPlayer] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renameSubmitting, setRenameSubmitting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const patch = useCallback(
    async (name: string, update: Partial<Pick<PlayerAttribute, 'strength' | 'mentality'>>) => {
      // Capture current state before optimistic update so we can revert
      let snapshot: PlayerAttribute[] = []
      setPlayers((prev) => {
        snapshot = prev
        return prev.map((p) => (p.name === name ? { ...p, ...update } : p))
      })
      setErrorName(null)

      const res = await fetch(
        `/api/league/${leagueId}/players/${encodeURIComponent(name)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(update),
        }
      )

      if (!res.ok) {
        setPlayers(snapshot)
        setErrorName(name)
      }
    },
    [leagueId]
  )

  async function assignMember(playerName: string, userId: string, displayName: string) {
    setLinkSubmitting(true)
    setLinkError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/player-claims/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ user_id: userId, player_name: playerName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to link member')
      setPlayers((prev) =>
        prev.map((p) =>
          p.name === playerName
            ? { ...p, linked_user_id: userId, linked_display_name: displayName }
            : p
        )
      )
      setLinkingPlayerName(null)
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLinkSubmitting(false)
    }
  }

  async function renamePlayer(oldName: string) {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    setRenameSubmitting(true)
    setRenameError(null)
    try {
      const res = await fetch(
        `/api/league/${leagueId}/players/${encodeURIComponent(oldName)}/rename`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ new_name: trimmed }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to rename')
      setPlayers((prev) =>
        prev.map((p) => (p.name === oldName ? { ...p, name: trimmed } : p))
      )
      setRenamingPlayer(null)
      setRenameValue('')
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Failed to rename')
    } finally {
      setRenameSubmitting(false)
    }
  }

  function handleStrengthChange(name: string, next: Strength) {
    patch(name, { strength: next })
  }

  function appendPlayer(player: PlayerAttribute) {
    setPlayers((prev) =>
      [...prev, player].sort((a, b) => a.name.localeCompare(b.name))
    )
  }

  if (players.length === 0) {
    return (
      <>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-slate-400">No players in this league yet.</p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
          >
            + Add player
          </button>
        </div>
        {addOpen && (
          <AddRosterPlayerModal
            leagueId={leagueId}
            existingNames={[]}
            onCreated={appendPlayer}
            onClose={() => setAddOpen(false)}
          />
        )}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-semibold text-slate-100">
          {players.length} {players.length === 1 ? 'Player' : 'Players'}
        </h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
        >
          + Add player
        </button>
      </div>

      <div className="bg-sky-950/40 border border-sky-900/40 rounded-lg px-3.5 py-2.5 mb-3.5">
        <div className="text-xs font-semibold text-sky-400 mb-0.5">Strength &amp; mentality influence Auto-Pick</div>
        <div className="text-xs text-slate-400">
          <span className="text-slate-300">Strength</span> is your private read on each player — only admins ever see it. Set <span className="text-slate-300">Below / Average / Above</span> for players new to the league; it stops contributing after their first 10 games. <span className="text-slate-300">Mentality</span> (GK · DEF · BAL · ATT) tells Auto-Pick where they&apos;re best deployed. Changes save as you tap.
        </div>
      </div>

      {players.map((player) => {
        const isExpanded = expandedName === player.name
        const hasError = errorName === player.name

        return (
          <div
            key={player.name}
            className={cn(
              'rounded-lg bg-slate-800 border overflow-hidden',
              hasError ? 'border-red-800' : isExpanded || renamingPlayer === player.name ? 'border-slate-600' : 'border-slate-700'
            )}
          >
            {/* ── Collapsed row ── */}
            <div className={cn('flex items-center gap-3 px-3 py-2.5', renamingPlayer === player.name && 'opacity-60')}>
              <span className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-sm font-semibold text-slate-100 truncate">{player.name}</span>
                {renamingPlayer !== player.name && (
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingPlayer(player.name)
                      setRenameValue(player.name)
                      setRenameError(null)
                    }}
                    className="text-slate-600 hover:text-slate-400 transition-colors shrink-0"
                    aria-label={`Rename ${player.name}`}
                  >
                    <Pencil className="size-3" />
                  </button>
                )}
              </span>

              <button
                type="button"
                className="flex items-center gap-2"
                onClick={() => setExpandedName(isExpanded ? null : player.name)}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${player.name}`}
              >
                {player.linked_display_name && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border bg-emerald-900/40 text-emerald-300 border-emerald-700/50">
                    <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                    {player.linked_display_name}
                  </span>
                )}
                <span className="text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800 rounded px-1.5 py-0.5">
                  {MENTALITY_DISPLAY[player.mentality]}
                </span>
                <ChevronDown
                  className={cn(
                    'size-3.5 text-slate-500 transition-transform',
                    isExpanded && 'rotate-180'
                  )}
                />
              </button>
            </div>

            {/* ── Expanded controls ── */}
            {isExpanded && (
              <div className="border-t border-slate-700 px-3 py-3 flex flex-col gap-3">
                {(player.played ?? 0) < 10 && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">
                      Strength
                      <span className="ml-1.5 normal-case tracking-normal text-slate-400">
                        — no longer used after {10 - (player.played ?? 0)} more {10 - (player.played ?? 0) === 1 ? 'game' : 'games'}
                      </span>
                    </p>
                    <StrengthPills
                      value={player.strength}
                      onChange={(s) => handleStrengthChange(player.name, s)}
                    />
                  </div>
                )}

                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Mentality</p>
                  <MentalityControl
                    value={player.mentality}
                    onChange={(m) => patch(player.name, { mentality: m })}
                    fullWidth
                  />
                </div>

                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Member Link</p>
                  {player.linked_display_name ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border bg-emerald-900/40 text-emerald-300 border-emerald-700/50">
                      <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                      {player.linked_display_name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setLinkingPlayerName(linkingPlayerName === player.name ? null : player.name)
                        setLinkError(null)
                      }}
                      className="text-xs text-slate-500 border border-dashed border-slate-600 px-2 py-0.5 rounded hover:border-slate-400 hover:text-slate-300 transition-colors"
                    >
                      + Link member
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Rename panel ── */}
            {renamingPlayer === player.name && (
              <div className="border-t border-sky-900/30 bg-sky-950/10 px-3 py-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Rename player</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renamePlayer(player.name)
                      if (e.key === 'Escape') { setRenamingPlayer(null); setRenameValue('') }
                    }}
                    autoFocus
                    className="w-36 px-2.5 py-1.5 rounded-md bg-slate-900 border border-sky-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => renamePlayer(player.name)}
                    disabled={renameSubmitting || !renameValue.trim()}
                    className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                  >
                    {renameSubmitting ? '…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRenamingPlayer(null); setRenameValue(''); setRenameError(null) }}
                    className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-400 text-xs hover:border-slate-500 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {renameError && (
                  <p className="mt-2 text-xs text-red-400">{renameError}</p>
                )}
              </div>
            )}

            {/* Inline member link picker */}
            {linkingPlayerName === player.name && (
              <>
                <MemberLinkPicker
                  leagueId={leagueId}
                  submitting={linkSubmitting}
                  onLink={(userId, displayName) => assignMember(player.name, userId, displayName)}
                  onCancel={() => { setLinkingPlayerName(null); setLinkError(null) }}
                />
                {linkError && (
                  <p className="px-3 pb-3 text-xs text-red-400">{linkError}</p>
                )}
              </>
            )}

            {/* Error state */}
            {hasError && (
              <p className="px-3 pb-2 text-[10px] text-red-400">Failed to save — please try again.</p>
            )}
          </div>
        )
      })}

      {addOpen && (
        <AddRosterPlayerModal
          leagueId={leagueId}
          existingNames={players.map((p) => p.name)}
          onCreated={appendPlayer}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  )
}

function MentalityControl({
  value,
  onChange,
  fullWidth = false,
}: {
  value: Mentality
  onChange: (m: Mentality) => void
  fullWidth?: boolean
}) {
  return (
    <div
      className={cn(
        'flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[10px] font-semibold',
        fullWidth && 'w-full'
      )}
    >
      {MENTALITY_LABELS.map(({ value: v, label }, i) => (
        <button
          key={v}
          onClick={() => { if (v !== value) onChange(v) }}
          className={cn(
            'py-1 transition-colors',
            fullWidth ? 'flex-1' : 'px-2',
            i < MENTALITY_LABELS.length - 1 && 'border-r',
            v === value
              ? 'bg-blue-950 text-blue-300 border-blue-800'
              : 'text-slate-500 border-slate-700 hover:text-slate-300'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
