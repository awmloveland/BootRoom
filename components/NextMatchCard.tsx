'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { getNextMatchDate, getNextWeekNumber, deriveSeason, ewptScore, winProbability, winCopy } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Week, Winner, Player, ScheduledWeek } from '@/lib/types'
import { autoPick, type AutoPickResult } from '@/lib/autoPick'
import { X } from 'lucide-react'
import { WinnerBadge } from '@/components/WinnerBadge'
import { TeamList } from '@/components/TeamList'

const FORM_COLOR: Record<string, string> = {
  W: 'text-sky-400',
  D: 'text-slate-400',
  L: 'text-red-400',
  '-': 'text-slate-700',
}

function FormDots({ form }: { form: string }) {
  return (
    <span className="flex gap-1">
      {form.split('').map((char, i) => (
        <span key={i} className={cn('font-mono text-xs font-bold', FORM_COLOR[char] ?? 'text-slate-600')}>
          {char}
        </span>
      ))}
    </span>
  )
}

interface Props {
  gameId: string
  weeks: Week[]
  onResultSaved: () => void
  canEdit?: boolean
  /** When true, skips the Supabase client fetch and uses public API routes for writes. */
  publicMode?: boolean
  /** Pre-loaded scheduled week from the server (used when publicMode=true). */
  initialScheduledWeek?: ScheduledWeek | null
  /** When true, shows the Auto-Pick Teams button (gated by team_builder feature flag). */
  canAutoPick?: boolean
  /** Full player list for the league — used for squad selection and auto-pick ratings. */
  allPlayers?: Player[]
  /** Called when the user enters building state — used to collapse open match cards. */
  onBuildStart?: () => void
}

type CardState = 'loading' | 'idle' | 'building' | 'lineup' | 'cancelled'

/** Parse 'DD MMM YYYY' and return deadline Date (game day at 20:00). */
function getReactivateDeadline(dateStr: string): Date {
  const [day, mon, yr] = dateStr.split(' ')
  const d = new Date(`${mon} ${day}, ${yr} 20:00:00`)
  return d
}

function canReactivate(dateStr: string): boolean {
  return Date.now() < getReactivateDeadline(dateStr).getTime()
}

function medianRating(players: Player[]): number {
  if (players.length === 0) return 2
  const sorted = [...players].map((p) => p.rating).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function resolvePlayersForAutoPick(names: string[], allPlayers: Player[]): Player[] {
  const lookup = new Map(allPlayers.map((p) => [p.name.toLowerCase(), p]))
  const rating = medianRating(allPlayers)
  return names.map((name) => {
    const found = lookup.get(name.toLowerCase())
    if (found) return found
    return {
      name,
      played: 0, won: 0, drew: 0, lost: 0,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0, qualified: false, points: 0,
      goalkeeper: false, mentality: 'balanced' as const,
      rating,
      recentForm: '',
    }
  })
}


export function NextMatchCard({
  gameId,
  weeks,
  onResultSaved,
  canEdit = true,
  publicMode = false,
  initialScheduledWeek,
  canAutoPick = false,
  allPlayers = [],
  onBuildStart,
}: Props) {
  const [cardState, setCardState] = useState<CardState>('loading')
  const [scheduledWeek, setScheduledWeek] = useState<ScheduledWeek | null>(null)

  // Building state — player selection
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [guestNames, setGuestNames] = useState<string[]>([])
  const [guestInput, setGuestInput] = useState('')

  // Building state — format
  const [format, setFormat] = useState('')

  const [autoPickResult, setAutoPickResult] = useState<AutoPickResult | null>(null)
  const [localTeamA, setLocalTeamA] = useState<Player[]>([])
  const [localTeamB, setLocalTeamB] = useState<Player[]>([])
  const [dragOver, setDragOver] = useState<{ team: 'A' | 'B'; index: number } | null>(null)
  const dragSource = useRef<{ team: 'A' | 'B'; index: number } | null>(null)
  const isAutoPickMode = autoPickResult !== null

  // Cancel game modal
  const [showCancelModal, setShowCancelModal] = useState(false)

  // Result modal
  const [showResultModal, setShowResultModal] = useState(false)

  // Result recording
  const [winner, setWinner] = useState<Winner>(null)
  const [notes, setNotes] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Players sorted A–Z for selection list
  const sortedPlayers = useMemo(
    () => [...allPlayers].sort((a, b) => a.name.localeCompare(b.name)),
    [allPlayers]
  )
  const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames])

  // Full squad: selected known players + manually-added guests
  const squadNames = useMemo(() => [...selectedNames, ...guestNames], [selectedNames, guestNames])

  const nextDate = useMemo(() => getNextMatchDate(weeks), [weeks])
  const nextWeekNum = useMemo(() => getNextWeekNumber(weeks), [weeks])
  const season = useMemo(() => deriveSeason(weeks), [weeks])

  // Auto-derive format from player count
  useEffect(() => {
    const n = squadNames.length
    if (n === 0) { setFormat(''); return }
    setFormat(`${Math.ceil(n / 2)}-a-side`)
  }, [squadNames.length])

  function clearSplit() {
    setAutoPickResult(null)
  }

  function togglePlayer(name: string) {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
    clearSplit()
  }

  function addGuest() {
    const name = guestInput.trim()
    if (!name || guestNames.includes(name) || selectedSet.has(name)) return
    setGuestNames((prev) => [...prev, name])
    setGuestInput('')
    clearSplit()
  }

  function removeGuest(name: string) {
    setGuestNames((prev) => prev.filter((n) => n !== name))
    clearSplit()
  }

  function handleAutoPick() {
    const resolved = resolvePlayersForAutoPick(squadNames, allPlayers)
    const result = autoPick(resolved)
    setAutoPickResult(result)
    if (result.suggestions.length > 0) {
      setLocalTeamA([...result.suggestions[0].teamA])
      setLocalTeamB([...result.suggestions[0].teamB])
    }
  }

  function handleSwap(targetTeam: 'A' | 'B', targetIndex: number) {
    if (!dragSource.current) return
    const { team: srcTeam, index: srcIndex } = dragSource.current
    if (srcTeam === targetTeam && srcIndex === targetIndex) return
    const newA = [...localTeamA]
    const newB = [...localTeamB]
    const srcArr = srcTeam === 'A' ? newA : newB
    const tgtArr = targetTeam === 'A' ? newA : newB
    const srcPlayer = srcArr[srcIndex]
    const tgtPlayer = tgtArr[targetIndex]
    srcArr[srcIndex] = tgtPlayer
    tgtArr[targetIndex] = srcPlayer
    setLocalTeamA(newA)
    setLocalTeamB(newB)
    dragSource.current = null
    setDragOver(null)
  }

  useEffect(() => {
    if (publicMode) {
      if (initialScheduledWeek) {
        setScheduledWeek(initialScheduledWeek)
        setCardState(initialScheduledWeek.status === 'cancelled' ? 'cancelled' : 'lineup')
      } else {
        setCardState('idle')
      }
      return
    }

    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('weeks')
        .select('id, week, date, format, team_a, team_b, status')
        .eq('game_id', gameId)
        .in('status', ['scheduled', 'cancelled'])
        .order('week', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        const week: ScheduledWeek = {
          id: data.id,
          week: data.week,
          date: data.date,
          format: data.format,
          teamA: data.team_a ?? [],
          teamB: data.team_b ?? [],
          status: data.status as 'scheduled' | 'cancelled',
        }
        if (week.status === 'cancelled' && !canReactivate(week.date)) {
          setCardState('idle')
        } else {
          setScheduledWeek(week)
          setCardState(week.status === 'cancelled' ? 'cancelled' : 'lineup')
        }
      } else {
        setCardState('idle')
      }
    }
    load()
  }, [gameId, publicMode, initialScheduledWeek])

  async function handleSaveLineup() {
    if (!autoPickResult || autoPickResult.suggestions.length === 0) {
      setError('No suggestion available')
      return
    }
    const teamA = localTeamA.map((p) => p.name)
    const teamB = localTeamB.map((p) => p.name)
    // When editing an existing scheduled week, use its week number and date
    const saveWeek = scheduledWeek?.week ?? nextWeekNum
    const saveDate = scheduledWeek?.date ?? nextDate
    setSaving(true)
    setError(null)
    try {
      let weekId: string
      if (publicMode) {
        const res = await fetch(`/api/public/league/${gameId}/lineup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season, week: saveWeek, date: saveDate, format: format || null, teamA, teamB }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to save lineup')
        weekId = data.id
      } else {
        const supabase = createClient()
        const { data, error: err } = await supabase.rpc('save_lineup', {
          p_game_id: gameId,
          p_season: season,
          p_week: saveWeek,
          p_date: saveDate,
          p_format: format || null,
          p_team_a: teamA,
          p_team_b: teamB,
        })
        if (err) throw err
        weekId = data as string
      }
      setScheduledWeek({ id: weekId, week: saveWeek, date: saveDate, format, teamA, teamB, status: 'scheduled' })
      setCardState('lineup')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save lineup')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveResult() {
    if (!scheduledWeek || !winner) {
      setError('Select a result first')
      return
    }
    setSaving(true)
    setError(null)
    try {
      if (publicMode) {
        const res = await fetch(`/api/public/league/${gameId}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weekId: scheduledWeek.id, winner, notes: notes.trim() || null }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to save result')
      } else {
        const supabase = createClient()
        const { error: err } = await supabase.rpc('record_result', {
          p_week_id: scheduledWeek.id,
          p_winner: winner,
          p_notes: notes.trim() || null,
        })
        if (err) throw err
      }
      setScheduledWeek(null)
      setCardState('idle')
      setWinner(null)
      setNotes('')
      setShowResultModal(false)
      onResultSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save result')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancelScheduled() {
    if (!scheduledWeek) return
    if (publicMode) {
      await fetch(`/api/public/league/${gameId}/lineup`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekId: scheduledWeek.id }),
      })
    } else {
      const supabase = createClient()
      await supabase.rpc('cancel_lineup', { p_week_id: scheduledWeek.id })
    }
    setScheduledWeek(null)
    setSelectedNames([])
    setGuestNames([])
    clearSplit()
    setCardState('idle')
  }

  function handleEditLineup() {
    if (!scheduledWeek) return
    // Pre-select all players from both teams; start at player selection step
    setSelectedNames([...scheduledWeek.teamA, ...scheduledWeek.teamB])
    setGuestNames([])
    clearSplit()
    setCardState('building')
  }

  async function handleCancelGame() {
    const cancelWeek = scheduledWeek?.week ?? nextWeekNum
    const cancelDate = scheduledWeek?.date ?? nextDate
    setSaving(true)
    setError(null)
    try {
      let weekId: string
      if (publicMode) {
        const res = await fetch(`/api/public/league/${gameId}/cancel`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season, week: cancelWeek, date: cancelDate }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to cancel')
        weekId = data.id
      } else {
        const supabase = createClient()
        const { data, error: err } = await supabase.rpc('cancel_week', {
          p_game_id: gameId,
          p_season: season,
          p_week: cancelWeek,
          p_date: cancelDate,
        })
        if (err) throw err
        weekId = data as string
      }
      setScheduledWeek({ id: weekId, week: cancelWeek, date: cancelDate, format: null, teamA: [], teamB: [], status: 'cancelled' })
      setShowCancelModal(false)
      setError(null)
      setCardState('cancelled')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel game')
    } finally {
      setSaving(false)
    }
  }

  async function handleReactivate() {
    if (!scheduledWeek) return
    setSaving(true)
    setError(null)
    try {
      if (publicMode) {
        const res = await fetch(`/api/public/league/${gameId}/cancel`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weekId: scheduledWeek.id }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to reactivate')
      } else {
        const supabase = createClient()
        const { error: err } = await supabase.rpc('cancel_lineup', { p_week_id: scheduledWeek.id })
        if (err) throw err
      }
      setScheduledWeek(null)
      setCardState('idle')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reactivate game')
    } finally {
      setSaving(false)
    }
  }

  if (cardState === 'loading') return null

  const displayWeek = scheduledWeek?.week ?? nextWeekNum
  const displayDate = scheduledWeek?.date ?? nextDate

  return (
    <>
      <div className="rounded-lg border border-slate-600 bg-slate-800 mb-3">

        {/* ── IDLE ── */}
        {cardState === 'idle' && (
          canEdit ? (
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div>
                <p className="text-sm font-bold text-slate-100">Week {nextWeekNum}</p>
                <p className="text-xs text-slate-400">{nextDate}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { onBuildStart?.(); setCardState('building') }}
                  className="px-3 py-1.5 rounded bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold"
                >
                  Build Teams
                </button>
                <button
                  type="button"
                  onClick={() => { setError(null); setShowCancelModal(true) }}
                  className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="px-4 py-3">
              <p className="text-sm font-bold text-slate-100">Week {nextWeekNum}</p>
              <p className="text-xs text-slate-400">{nextDate}</p>
            </div>
          )
        )}

        {/* ── BUILDING ── */}
        {cardState === 'building' && (
          canEdit ? (
            <>
              {/* Header — matches idle style */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <div>
                  <p className="text-sm font-bold text-slate-100">Week {displayWeek}</p>
                  <p className="text-xs text-slate-400">{displayDate}</p>
                </div>
                <div className="flex items-center gap-3">
                  {squadNames.length > 0 && (() => {
                    const n = squadNames.length
                    if (n < 10) return (
                      <span className="text-xs text-red-400">{10 - n} more needed (min 10)</span>
                    )
                    if (n % 2 !== 0) return (
                      <span className="text-xs text-red-400">Select an even number</span>
                    )
                    return (
                      <span className="text-xs text-slate-400">{format} · {n} players</span>
                    )
                  })()}
                  <button
                    type="button"
                    onClick={() => {
                      setError(null)
                      clearSplit()
                      setSelectedNames([])
                      setGuestNames([])
                      setCardState(scheduledWeek ? 'lineup' : 'idle')
                    }}
                    className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors"
                    aria-label="Close team builder"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-4 py-3 space-y-4">

                {/* Player selection — hidden once auto-pick has run */}
                {!isAutoPickMode && (
                  <>
                    <div>
                      <p className="text-xs text-slate-400 mb-2">Select attending players</p>
                      {sortedPlayers.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {sortedPlayers.map((player) => {
                            const active = selectedSet.has(player.name)
                            return (
                              <button
                                key={player.name}
                                type="button"
                                onClick={() => togglePlayer(player.name)}
                                className={cn(
                                  'px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                                  active
                                    ? 'bg-sky-900/60 border border-sky-700 text-sky-100'
                                    : 'bg-slate-900/60 border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'
                                )}
                              >
                                {player.name}
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">No players in this league yet.</p>
                      )}
                    </div>

                    <div>
                      <p className="text-xs text-slate-400 mb-1.5">Add a guest player</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={guestInput}
                          onChange={(e) => setGuestInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest() } }}
                          placeholder="Guest name"
                          className="flex-1 min-w-0 px-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 text-xs placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-500"
                        />
                        <button
                          type="button"
                          onClick={addGuest}
                          disabled={!guestInput.trim()}
                          className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-medium disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                      {guestNames.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {guestNames.map((name) => (
                            <span
                              key={name}
                              className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-800 border border-dashed border-slate-500 text-slate-400 text-xs"
                            >
                              {name}
                              <button
                                type="button"
                                onClick={() => removeGuest(name)}
                                className="text-slate-600 hover:text-slate-300 leading-none"
                                aria-label={`Remove ${name}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Auto-pick result — replaces player list once built */}
                {isAutoPickMode && autoPickResult.suggestions.length > 0 && (() => {
                  const suggestion = autoPickResult.suggestions[0]
                  const liveScoreA = ewptScore(localTeamA)
                  const liveScoreB = ewptScore(localTeamB)
                  const renderTeam = (team: 'A' | 'B', players: Player[]) => (
                    <div>
                      <p className="text-sm font-semibold text-slate-100 mb-2">{team === 'A' ? 'Team A' : 'Team B'}</p>
                      <div className="space-y-1">
                        {players.map((p, i) => {
                          const isOver = dragOver?.team === team && dragOver?.index === i
                          return (
                            <div
                              key={p.name}
                              draggable
                              onDragStart={() => { dragSource.current = { team, index: i } }}
                              onDragOver={(e) => { e.preventDefault(); setDragOver({ team, index: i }) }}
                              onDragLeave={() => setDragOver(null)}
                              onDrop={() => handleSwap(team, i)}
                              onDragEnd={() => { dragSource.current = null; setDragOver(null) }}
                              className={cn(
                                'flex items-center justify-between px-2.5 py-1.5 rounded border cursor-grab active:cursor-grabbing transition-colors select-none',
                                team === 'A'
                                  ? isOver ? 'bg-sky-800/60 border-sky-600' : 'bg-sky-950/40 border-sky-900/60'
                                  : isOver ? 'bg-violet-800/60 border-violet-600' : 'bg-violet-950/40 border-violet-900/60'
                              )}
                            >
                              <span className={cn('text-xs font-medium', team === 'A' ? 'text-sky-100' : 'text-violet-100')}>{p.name}</span>
                              {p.recentForm && <FormDots form={p.recentForm} />}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        {renderTeam('A', localTeamA)}
                        {renderTeam('B', localTeamB)}
                      </div>
                      {(() => {
                        const winProbA = winProbability(liveScoreA, liveScoreB)
                        const winProbB = 1 - winProbA
                        const copy = winCopy(winProbA)
                        const isEven = copy.team === 'even'
                        return (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2.5">
                              <span className={cn(
                                'text-[15px] font-bold tabular-nums min-w-[34px]',
                                isEven ? 'text-slate-400' : 'text-sky-300'
                              )}>
                                {Math.round(winProbA * 100)}%
                              </span>
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
                                <div
                                  className="bg-sky-600 transition-all"
                                  style={{ width: `${winProbA * 100}%` }}
                                />
                                <div className="bg-violet-600 flex-1" />
                              </div>
                              <span className={cn(
                                'text-[15px] font-bold tabular-nums min-w-[34px] text-right',
                                isEven ? 'text-slate-400' : 'text-violet-300'
                              )}>
                                {Math.round(winProbB * 100)}%
                              </span>
                            </div>
                            <p className={cn(
                              'text-xs font-medium text-center',
                              copy.team === 'A' ? 'text-sky-400' : copy.team === 'B' ? 'text-violet-400' : 'text-slate-400'
                            )}>
                              {copy.text}
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })()}

                {error && <p className="text-xs text-red-400">{error}</p>}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
                {isAutoPickMode ? (
                  <button
                    type="button"
                    onClick={() => clearSplit()}
                    className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
                  >
                    Back
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={isAutoPickMode ? handleSaveLineup : handleAutoPick}
                    disabled={saving || squadNames.length < 10 || squadNames.length % 2 !== 0}
                    className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : isAutoPickMode ? 'Confirm Lineup' : 'Build Lineup'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="px-4 py-3">
              <p className="text-sm text-slate-500">Lineup not yet set.</p>
            </div>
          )
        )}

        {/* ── LINEUP header ── */}
        {cardState === 'lineup' && scheduledWeek && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <div>
              <p className="text-sm font-bold text-slate-100">Week {displayWeek}</p>
              <p className="text-xs text-slate-400">
                {displayDate}
                {scheduledWeek.format && (
                  <span className="ml-2">{scheduledWeek.format}</span>
                )}
              </p>
            </div>
            {getReactivateDeadline(scheduledWeek.date).getTime() <= Date.now() ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-widest uppercase bg-slate-700/60 border border-slate-500 text-slate-300">
                Awaiting Result
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold tracking-widest uppercase bg-sky-900/40 border border-sky-700/60 text-sky-400">
                Upcoming
              </span>
            )}
          </div>
        )}

        {/* ── CANCELLED ── */}
        {cardState === 'cancelled' && scheduledWeek && (
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-sm font-bold text-slate-100">Week {scheduledWeek.week}</p>
                <p className="text-xs text-slate-400">{scheduledWeek.date}</p>
              </div>
              <WinnerBadge winner={null} cancelled />
            </div>
            {canEdit && canReactivate(scheduledWeek.date) && (
              <button
                type="button"
                onClick={handleReactivate}
                disabled={saving}
                className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium disabled:opacity-50"
              >
                Reactivate
              </button>
            )}
          </div>
        )}

        {/* ── LINEUP body ── */}
        {cardState === 'lineup' && scheduledWeek && (
          <div className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4">
              <TeamList label="Team A" players={scheduledWeek.teamA} />
              <TeamList label="Team B" players={scheduledWeek.teamB} />
            </div>
          </div>
        )}

        {/* ── LINEUP footer ── */}
        {cardState === 'lineup' && scheduledWeek && canEdit && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
            <button
              type="button"
              onClick={handleCancelScheduled}
              className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
            >
              Reset
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleEditLineup}
                className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
              >
                Edit Lineups
              </button>
              <button
                type="button"
                onClick={() => { setError(null); setShowResultModal(true) }}
                className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold"
              >
                Result Game
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Cancel Game confirmation modal ── */}
      <Dialog.Root
        open={showCancelModal}
        onOpenChange={(open) => { setShowCancelModal(open); if (!open) setError(null) }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 p-6 shadow-xl focus:outline-none">
            <Dialog.Title className="text-lg font-semibold text-slate-100 mb-3">
              Cancel Week {displayWeek}?
            </Dialog.Title>
            <Dialog.Description className="text-sm text-slate-300 leading-relaxed mb-6">
              This will mark the game as cancelled. You can reactivate it before {displayDate} at 8 pm if plans change.
            </Dialog.Description>
            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500"
                >
                  Keep it
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleCancelGame}
                disabled={saving}
                className="px-4 py-2 rounded bg-red-900 hover:bg-red-800 border border-red-700 text-red-200 text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* ── Result Game modal ── */}
      <Dialog.Root
        open={showResultModal}
        onOpenChange={(open) => {
          setShowResultModal(open)
          if (!open) { setError(null); setWinner(null); setNotes('') }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 p-6 shadow-xl focus:outline-none">
            <Dialog.Title className="text-lg font-semibold text-slate-100 mb-0.5">
              Result — Week {scheduledWeek?.week}
            </Dialog.Title>
            <Dialog.Description className="text-xs text-slate-400 mb-5">
              {scheduledWeek?.date}
            </Dialog.Description>

            <div className="flex gap-2 mb-4">
              {(['teamA', 'draw', 'teamB'] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setWinner(opt)}
                  className={cn(
                    'flex-1 py-2 rounded border text-sm font-medium transition-colors',
                    opt === 'teamA' && (winner === 'teamA'
                      ? 'bg-blue-900 border-blue-700 text-blue-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-blue-700 hover:text-blue-300'),
                    opt === 'draw' && (winner === 'draw'
                      ? 'bg-slate-700 border-slate-600 text-slate-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'),
                    opt === 'teamB' && (winner === 'teamB'
                      ? 'bg-violet-900 border-violet-700 text-violet-300'
                      : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-violet-700 hover:text-violet-300'),
                  )}
                >
                  {opt === 'teamA' ? 'Team A' : opt === 'draw' ? 'Draw' : 'Team B'}
                </button>
              ))}
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes (e.g. +3 goals, injuries…)"
              className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 text-xs placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-500 resize-none mb-4"
            />

            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

            <div className="flex gap-2 justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleSaveResult}
                disabled={saving || !winner}
                className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Confirm Result'}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
