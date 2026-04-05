'use client'

import { useState, useCallback } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Mentality, PlayerAttribute } from '@/lib/types'
import MemberLinkPicker from '@/components/MemberLinkPicker'

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

  const patch = useCallback(
    async (name: string, update: Partial<Pick<PlayerAttribute, 'rating' | 'mentality'>>) => {
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

  function handleRatingClick(player: PlayerAttribute, dot: number) {
    // Clicking the active dot decrements by 1 (min 1)
    const next = player.rating === dot ? Math.max(1, dot - 1) : dot
    if (next !== player.rating) patch(player.name, { rating: next })
  }

  if (players.length === 0) {
    return <p className="text-sm text-slate-400">No players in this league yet.</p>
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="bg-sky-950/40 border border-sky-900/40 rounded-lg px-3.5 py-2.5 mb-3.5">
        <div className="text-xs font-semibold text-sky-400 mb-0.5">Eye test &amp; mentality influence Auto-Pick</div>
        <div className="text-xs text-slate-400">
          <span className="text-slate-300">Eye test</span> is your private read on each player — only admins ever see it. <span className="text-slate-300">1</span> = developing, <span className="text-slate-300">2</span> = solid, <span className="text-slate-300">3</span> = top player. <span className="text-slate-300">Mentality</span> (GK · DEF · BAL · ATT) tells Auto-Pick where they&apos;re best deployed. Changes save as you tap.
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
              hasError ? 'border-red-800' : isExpanded ? 'border-slate-600' : 'border-slate-700'
            )}
          >
            {/* ── Row ── */}
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span className="flex-1 min-w-0 text-sm font-semibold text-slate-100 truncate">
                {player.name}
              </span>

              {/* Desktop controls */}
              <div className="hidden sm:flex items-center gap-3">
                {/* Linked member badge or link button */}
                {player.linked_display_name ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border bg-emerald-900/40 text-emerald-300 border-emerald-700/50">
                    <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                    Linked: {player.linked_display_name}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLinkingPlayerName(linkingPlayerName === player.name ? null : player.name)}
                    className="text-xs text-slate-500 border border-dashed border-slate-600 px-2 py-0.5 rounded hover:border-slate-400 hover:text-slate-300 transition-colors"
                  >
                    + Link member
                  </button>
                )}

                {/* Rating dots */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500 mr-1">Eye Test</span>
                  {[1, 2, 3].map((dot) => (
                    <button
                      key={dot}
                      onClick={() => handleRatingClick(player, dot)}
                      className={cn(
                        'w-4 h-4 rounded-full border-2 transition-colors',
                        dot <= player.rating
                          ? 'bg-blue-500 border-blue-600'
                          : 'bg-slate-900 border-slate-600 hover:border-slate-400'
                      )}
                      aria-label={`Set rating to ${dot}`}
                    />
                  ))}
                </div>

                {/* Divider */}
                <div className="w-px h-4 bg-slate-700" />

                {/* Mentality segmented control */}
                <MentalityControl
                  value={player.mentality}
                  onChange={(m) => patch(player.name, { mentality: m })}
                />
              </div>

              {/* Mobile collapsed state */}
              <button
                className="sm:hidden flex items-center gap-2"
                onClick={() => setExpandedName(isExpanded ? null : player.name)}
                aria-expanded={isExpanded}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${player.name}`}
              >
                <span className="text-[10px] font-semibold bg-blue-950 text-blue-300 border border-blue-800 rounded px-1.5 py-0.5">
                  {MENTALITY_DISPLAY[player.mentality]}
                </span>
                <div className="flex gap-1">
                  {[1, 2, 3].map((dot) => (
                    <div
                      key={dot}
                      className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        dot <= player.rating ? 'bg-blue-500' : 'bg-slate-600'
                      )}
                    />
                  ))}
                </div>
                <ChevronDown
                  className={cn(
                    'size-3.5 text-slate-500 transition-transform',
                    isExpanded && 'rotate-180'
                  )}
                />
              </button>
            </div>

            {/* ── Mobile expanded controls ── */}
            {isExpanded && (
              <div className="sm:hidden border-t border-slate-700 px-3 py-3 flex flex-col gap-3">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Eye Test</p>
                  <div className="flex gap-2">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        onClick={() => handleRatingClick(player, n)}
                        className={cn(
                          'flex-1 py-1.5 rounded-md border text-sm font-semibold transition-colors',
                          n <= player.rating
                            ? 'bg-blue-950 border-blue-700 text-blue-300'
                            : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

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
                      Linked: {player.linked_display_name}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLinkingPlayerName(linkingPlayerName === player.name ? null : player.name)}
                      className="text-xs text-slate-500 border border-dashed border-slate-600 px-2 py-0.5 rounded hover:border-slate-400 hover:text-slate-300 transition-colors"
                    >
                      + Link member
                    </button>
                  )}
                </div>
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
