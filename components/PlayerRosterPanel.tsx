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
          <p className="text-sm text-[#8ba4c4]">No players in this league yet.</p>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="px-3 py-1.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold"
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
        <h2 className="text-base font-semibold text-[#f4f9ff]">
          {players.length} {players.length === 1 ? 'Player' : 'Players'}
        </h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="px-3 py-1.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold"
        >
          + Add player
        </button>
      </div>

      <div className="bg-[#38bdf8]/8 border border-[#38bdf8]/35 rounded-lg px-3.5 py-2.5 mb-3.5">
        <div className="text-xs font-semibold text-[#38bdf8] mb-0.5">Strength &amp; mentality influence Auto-Pick</div>
        <div className="text-xs text-[#8ba4c4]">
          <span className="text-[#cfe0f4]">Strength</span> is your private read on each player. Only admins ever see it. Set <span className="text-[#cfe0f4]">Below / Average / Above</span> for players new to the league; it stops contributing after their first 10 games. <span className="text-[#cfe0f4]">Mentality</span> (GK · DEF · BAL · ATT) tells Auto-Pick where they&apos;re best deployed. Changes save as you tap.
        </div>
      </div>

      {players.map((player) => {
        const isExpanded = expandedName === player.name
        const hasError = errorName === player.name

        return (
          <div
            key={player.name}
            className={cn(
              'rounded-lg bg-[#0a1421] border overflow-hidden',
              hasError ? 'border-[#e2686f]/40' : isExpanded || renamingPlayer === player.name ? 'border-[#223a5c]' : 'border-[#1b2c46]'
            )}
          >
            {/* ── Collapsed row ── */}
            <div className={cn('flex items-center gap-3 px-3 py-2.5', renamingPlayer === player.name && 'opacity-60')}>
              <span className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-sm font-semibold text-[#f4f9ff] truncate">{player.name}</span>
                {renamingPlayer !== player.name && (
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingPlayer(player.name)
                      setRenameValue(player.name)
                      setRenameError(null)
                    }}
                    className="text-[#4f688a] hover:text-[#8ba4c4] transition-colors shrink-0"
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
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border bg-[#bef264]/8 text-[#bef264] border-[#bef264]/35">
                    <span className="size-1.5 rounded-full bg-[#bef264] shrink-0" />
                    {player.linked_display_name}
                  </span>
                )}
                <span className="text-[10px] font-semibold bg-[#38bdf8]/12 text-[#7dd3fc] border border-[#38bdf8]/35 rounded px-1.5 py-0.5">
                  {MENTALITY_DISPLAY[player.mentality]}
                </span>
                <ChevronDown
                  className={cn(
                    'size-3.5 text-[#6f88a8] transition-transform',
                    isExpanded && 'rotate-180'
                  )}
                />
              </button>
            </div>

            {/* ── Expanded controls ── */}
            {isExpanded && (
              <div className="border-t border-[#1b2c46] px-3 py-3 flex flex-col gap-3">
                {(player.played ?? 0) < 10 && (
                  <div>
                    <p className="font-plex text-[9px] font-bold text-[#6f88a8] uppercase tracking-[.18em] mb-1.5">
                      Strength
                      <span className="ml-1.5 text-[#4f688a]">
                        · no longer used after {10 - (player.played ?? 0)} more {10 - (player.played ?? 0) === 1 ? 'game' : 'games'}
                      </span>
                    </p>
                    <StrengthPills
                      value={player.strength}
                      onChange={(s) => handleStrengthChange(player.name, s)}
                    />
                  </div>
                )}

                <div>
                  <p className="font-plex text-[9px] font-bold text-[#6f88a8] uppercase tracking-[.18em] mb-1.5">Mentality</p>
                  <MentalityControl
                    value={player.mentality}
                    onChange={(m) => patch(player.name, { mentality: m })}
                    fullWidth
                  />
                </div>

                <div>
                  <p className="font-plex text-[9px] font-bold text-[#6f88a8] uppercase tracking-[.18em] mb-1.5">Member Link</p>
                  {player.linked_display_name ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border bg-[#bef264]/8 text-[#bef264] border-[#bef264]/35">
                      <span className="size-1.5 rounded-full bg-[#bef264] shrink-0" />
                      {player.linked_display_name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setLinkingPlayerName(linkingPlayerName === player.name ? null : player.name)
                        setLinkError(null)
                      }}
                      className="text-xs text-[#6f88a8] border border-dashed border-[#223a5c] px-2 py-0.5 rounded hover:border-[#3d5578] hover:text-[#cfe0f4] transition-colors"
                    >
                      + Link member
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Rename panel ── */}
            {renamingPlayer === player.name && (
              <div className="border-t border-[#38bdf8]/35 bg-[#38bdf8]/8 px-3 py-3">
                <p className="text-[10px] text-[#6f88a8] uppercase tracking-wide mb-2">Rename player</p>
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
                    className="w-36 px-2.5 py-1.5 rounded bg-[#0c1728] border border-[#38bdf8]/50 text-[#f4f9ff] text-sm focus:outline-none focus:ring-0 focus:border-[#38bdf8]"
                  />
                  <button
                    type="button"
                    onClick={() => renamePlayer(player.name)}
                    disabled={renameSubmitting || !renameValue.trim()}
                    className="px-3 py-1.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold disabled:opacity-50 transition-colors"
                  >
                    {renameSubmitting ? '…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRenamingPlayer(null); setRenameValue(''); setRenameError(null) }}
                    className="px-3 py-1.5 rounded-md border border-[#223a5c] text-[#8ba4c4] text-xs hover:border-[#2c4a72] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {renameError && (
                  <p className="mt-2 text-xs text-[#e2686f]">{renameError}</p>
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
                  <p className="px-3 pb-3 text-xs text-[#e2686f]">{linkError}</p>
                )}
              </>
            )}

            {/* Error state */}
            {hasError && (
              <p className="px-3 pb-2 text-[10px] text-[#e2686f]">Failed to save. Please try again.</p>
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
        'flex border border-[#223a5c] rounded overflow-hidden font-plex text-[9px] font-bold uppercase tracking-[.12em]',
        fullWidth && 'w-full'
      )}
    >
      {MENTALITY_LABELS.map(({ value: v, label }, i) => (
        <button
          key={v}
          onClick={() => { if (v !== value) onChange(v) }}
          className={cn(
            'transition-colors border-[#223a5c]',
            fullWidth ? 'flex-1 h-8' : 'h-6 px-2',
            i < MENTALITY_LABELS.length - 1 && 'border-r',
            v === value
              ? 'bg-[rgba(8,47,73,.6)] text-[#7dd3fc]'
              : 'text-[#8ba4c4] hover:text-white'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
