'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { getNextMatchDate, getNextWeekNumber, deriveSeason, ewptScore, winProbability, winCopy, isPastDeadline, buildShareText, wprScore, leagueWprPercentiles } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Winner, Week, Player, ScheduledWeek, GuestEntry, NewPlayerEntry, LineupMetadata, Mentality, StrengthHint } from '@/lib/types'
import { autoPick, type AutoPickResult } from '@/lib/autoPick'
import { X, Share2 } from 'lucide-react'
import { WinnerBadge } from '@/components/WinnerBadge'
import { TeamList } from '@/components/TeamList'
import { AddPlayerModal } from '@/components/AddPlayerModal'
import { ResultModal } from '@/components/ResultModal'
import { ResultSuccessPanel } from '@/components/ResultSuccessPanel'
import { FormDots } from '@/components/FormDots'

interface Props {
  gameId: string
  /** League slug used for share URLs (e.g. craft-football.com/[leagueSlug]). Separate from gameId (UUID) which is used for API calls. */
  leagueSlug: string
  weeks: Week[]
  onResultSaved: () => void
  canEdit?: boolean
  /** When true, skips the Supabase client fetch and uses public API routes for writes. */
  publicMode?: boolean
  /** Pre-loaded scheduled week from the server (used when publicMode=true). */
  initialScheduledWeek?: ScheduledWeek | null
  /** When true, shows the Auto-Pick Teams button. */
  canAutoPick?: boolean
  /** Full player list for the league — used for squad selection and auto-pick ratings. */
  allPlayers?: Player[]
  /** Called when the user enters building state — used to collapse open match cards. */
  onBuildStart?: () => void
  /** Day-of-week index (0=Sun…6=Sat) from league config — used to compute next match date. */
  leagueDayIndex?: number
  /** Display name of the league — used to build the share text. */
  leagueName?: string
}

type CardState = 'loading' | 'idle' | 'building' | 'lineup' | 'cancelled'

function medianRating(players: Player[]): number {
  if (players.length === 0) return 2
  const sorted = [...players].map((p) => p.rating).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Scans played weeks to find the most recent week date each player appeared in.
 * Returns a map of player name → date string ('DD MMM YYYY'), or undefined if never played.
 */
function deriveLastPlayedDates(players: Player[], weeks: Week[]): Map<string, string | undefined> {
  const playedWeeks = weeks
    .filter((w) => w.status === 'played')
    .sort((a, b) => b.week - a.week) // most recent first
  const result = new Map<string, string | undefined>()
  for (const player of players) {
    const lastWeek = playedWeeks.find(
      (w) => w.teamA.includes(player.name) || w.teamB.includes(player.name)
    )
    result.set(player.name, lastWeek?.date)
  }
  return result
}

function resolvePlayersForAutoPick(
  names: string[],
  allPlayers: Player[],
  guests: GuestEntry[],
  newPlayers: NewPlayerEntry[],
): Player[] {
  const lookup = new Map(allPlayers.map((p) => [p.name.toLowerCase(), p]))
  const guestLookup = new Map(guests.map((g) => [g.name.toLowerCase(), g]))
  const newPlayerLookup = new Map(newPlayers.map((p) => [p.name.toLowerCase(), p]))
  const fallbackRating = medianRating(allPlayers)
  const percentiles = leagueWprPercentiles(allPlayers)

  function hintToWpr(hint: StrengthHint | undefined): number {
    if (hint === 'above') return Math.min(100, percentiles.p75)
    if (hint === 'below') return Math.max(0, percentiles.p25)
    return percentiles.p50
  }

  return names.map((name) => {
    const known = lookup.get(name.toLowerCase())
    if (known) return known

    const guest = guestLookup.get(name.toLowerCase())
    if (guest) {
      return {
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        goalkeeper: guest.goalkeeper ?? false, mentality: 'balanced' as const,
        rating: 2,
        recentForm: '',
        wprOverride: hintToWpr(guest.strengthHint),
      }
    }

    const newPlayer = newPlayerLookup.get(name.toLowerCase())
    if (newPlayer) {
      return {
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        goalkeeper: newPlayer.goalkeeper ?? false, mentality: newPlayer.mentality,
        rating: 2,
        recentForm: '',
        wprOverride: hintToWpr(newPlayer.strengthHint),
      }
    }

    return {
      name,
      played: 0, won: 0, drew: 0, lost: 0,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0, qualified: false, points: 0,
      goalkeeper: false, mentality: 'balanced' as const,
      rating: fallbackRating,
      recentForm: '',
    }
  })
}


export function NextMatchCard({
  gameId,
  leagueSlug,
  weeks,
  onResultSaved,
  canEdit = true,
  publicMode = false,
  initialScheduledWeek,
  canAutoPick = false,
  allPlayers = [],
  onBuildStart,
  leagueDayIndex,
  leagueName = '',
}: Props) {
  const [cardState, setCardState] = useState<CardState>('loading')
  const [scheduledWeek, setScheduledWeek] = useState<ScheduledWeek | null>(null)

  // Building state — player selection
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [guestEntries, setGuestEntries] = useState<GuestEntry[]>([])
  const [newPlayerEntries, setNewPlayerEntries] = useState<NewPlayerEntry[]>([])
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false)

  // Building state — format
  const [format, setFormat] = useState('')

  const [autoPickResult, setAutoPickResult] = useState<AutoPickResult | null>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [isManuallyEdited, setIsManuallyEdited] = useState(false)
  const [localTeamA, setLocalTeamA] = useState<Player[]>([])
  const [localTeamB, setLocalTeamB] = useState<Player[]>([])
  const [dragOver, setDragOver] = useState<{ team: 'A' | 'B'; index: number } | null>(null)
  const dragSource = useRef<{ team: 'A' | 'B'; index: number } | null>(null)
  const isAutoPickMode = autoPickResult !== null

  // Cancel game modal
  const [showCancelModal, setShowCancelModal] = useState(false)

  // Result modal
  const [showResultModal, setShowResultModal] = useState(false)
  const [savedResult, setSavedResult] = useState<{
    winner: NonNullable<Winner>
    goalDifference: number
    shareText: string
    highlightsText: string
  } | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Players sorted A–Z for selection list
  const sortedPlayers = useMemo(
    () => [...allPlayers].sort((a, b) => a.name.localeCompare(b.name)),
    [allPlayers]
  )
  const selectedSet = useMemo(() => new Set(selectedNames), [selectedNames])

  // Full squad: selected known players + manually-added guests
  const squadNames = useMemo(
    () => [
      ...selectedNames,
      ...guestEntries.map((g) => g.name),
      ...newPlayerEntries.map((p) => p.name),
    ],
    [selectedNames, guestEntries, newPlayerEntries]
  )

  const nextDate = useMemo(() => getNextMatchDate(weeks, leagueDayIndex), [weeks, leagueDayIndex])
  const nextWeekNum = useMemo(() => getNextWeekNumber(weeks), [weeks])
  const season = useMemo(() => deriveSeason(weeks), [weeks])

  const goalkeepers = useMemo(
    () => allPlayers.filter(p => p.goalkeeper).map(p => p.name),
    [allPlayers]
  )

  // Auto-derive format from player count
  useEffect(() => {
    const n = squadNames.length
    if (n === 0) { setFormat(''); return }
    setFormat(`${Math.ceil(n / 2)}-a-side`)
  }, [squadNames.length])

  function clearSplit() {
    setAutoPickResult(null)
    setSuggestionIndex(0)
    setIsManuallyEdited(false)
  }

  function togglePlayer(name: string) {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
    clearSplit()
  }

  function handleAutoPick() {
    const lastPlayedDates = deriveLastPlayedDates(allPlayers, weeks)
    const enrichedPlayers = allPlayers.map((p) => ({
      ...p,
      lastPlayedWeekDate: lastPlayedDates.get(p.name),
    }))
    const resolved = resolvePlayersForAutoPick(squadNames, enrichedPlayers, guestEntries, newPlayerEntries)
    const pairs = guestEntries
      .filter((g) => g.associatedPlayer)
      .map((g) => [g.name, g.associatedPlayer] as [string, string])

    const newPlayerNames = newPlayerEntries.map((p) => p.name)
    const pinsA = newPlayerNames.length >= 2
      ? newPlayerNames.filter((_, i) => i % 2 === 0)
      : undefined
    const pinsB = newPlayerNames.length >= 2
      ? newPlayerNames.filter((_, i) => i % 2 === 1)
      : undefined

    const result = autoPick(resolved, pairs, pinsA, pinsB)
    setAutoPickResult(result)
    setSuggestionIndex(0)
    setIsManuallyEdited(false)
    if (result.suggestions.length > 0) {
      setLocalTeamA(result.suggestions[0].teamA)
      setLocalTeamB(result.suggestions[0].teamB)
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
    setIsManuallyEdited(true)
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
        .select('id, season, week, date, format, team_a, team_b, status, lineup_metadata, team_a_rating, team_b_rating')
        .eq('game_id', gameId)
        .in('status', ['scheduled', 'cancelled', 'unrecorded'])
        .order('week', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        // Unrecorded row — advance to next week
        if (data.status === 'unrecorded') {
          setCardState('idle')
          return
        }

        const week: ScheduledWeek = {
          id: data.id,
          season: data.season,
          week: data.week,
          date: data.date,
          format: data.format,
          teamA: data.team_a ?? [],
          teamB: data.team_b ?? [],
          status: data.status as 'scheduled' | 'cancelled',
          lineupMetadata: data.lineup_metadata
            ? {
                guests: ((data.lineup_metadata as any).guests ?? []).map((g: any) => ({
                  type: 'guest' as const,
                  name: g.name,
                  associatedPlayer: g.associated_player,
                  rating: g.rating,
                  goalkeeper: g.goalkeeper ?? false,
                  strengthHint: (g.strength_hint ?? 'average') as StrengthHint,
                })),
                new_players: ((data.lineup_metadata as any).new_players ?? []).map((p: any) => ({
                  type: 'new_player' as const,
                  name: p.name,
                  rating: p.rating,
                  mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
                  goalkeeper: p.goalkeeper ?? false,
                  strengthHint: (p.strength_hint ?? 'average') as StrengthHint,
                })),
              }
            : null,
          team_a_rating: data.team_a_rating ?? null,
          team_b_rating: data.team_b_rating ?? null,
        }

        // Past-deadline scheduled row — lineup exists but game day has passed
        // The row stays in DB and appears in the results list as "Awaiting Result"
        if (week.status === 'scheduled' && isPastDeadline(week.date)) {
          setCardState('idle')
          return
        }
        // Cancelled past deadline — treat as idle
        if (week.status === 'cancelled' && isPastDeadline(week.date)) {
          setCardState('idle')
          return
        }

        setScheduledWeek(week)
        setCardState(week.status === 'cancelled' ? 'cancelled' : 'lineup')
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
    const teamARating = ewptScore(localTeamA)
    const teamBRating = ewptScore(localTeamB)
    // When editing an existing scheduled week, use its week number and date
    const saveWeek = scheduledWeek?.week ?? nextWeekNum
    const saveDate = scheduledWeek?.date ?? nextDate
    const lineupMetadata: LineupMetadata = {
      guests: guestEntries,
      new_players: newPlayerEntries,
    }
    const lineupMetadataForDB = {
      guests: guestEntries.map((g) => ({
        name: g.name,
        associated_player: g.associatedPlayer,
        rating: g.rating,
        goalkeeper: g.goalkeeper ?? false,
        strength_hint: g.strengthHint,
      })),
      new_players: newPlayerEntries.map((p) => ({
        name: p.name,
        rating: p.rating,
        mentality: p.mentality,
        goalkeeper: p.goalkeeper ?? false,
        strength_hint: p.strengthHint,
      })),
    }
    setSaving(true)
    setError(null)
    try {
      let weekId: string
      if (publicMode) {
        const res = await fetch(`/api/public/league/${gameId}/lineup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season, week: saveWeek, date: saveDate, format: format || null, teamA, teamB, teamARating, teamBRating }),
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
          p_lineup_metadata: lineupMetadataForDB,
          p_team_a_rating: teamARating,
          p_team_b_rating: teamBRating,
        })
        if (err) throw err
        weekId = data as string
      }
      setScheduledWeek({ id: weekId, season, week: saveWeek, date: saveDate, format, teamA, teamB, status: 'scheduled', lineupMetadata, team_a_rating: teamARating, team_b_rating: teamBRating })
      setCardState('lineup')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save lineup')
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
    setGuestEntries([])
    setNewPlayerEntries([])
    clearSplit()
    setCardState('idle')
  }

  async function handleShare() {
    if (!scheduledWeek || !leagueName) return
    const text = buildShareText({
      leagueName,
      leagueSlug,
      week: scheduledWeek.week,
      date: scheduledWeek.date,
      format: scheduledWeek.format ?? '',
      teamA: scheduledWeek.teamA,
      teamB: scheduledWeek.teamB,
      teamARating: scheduledWeek.team_a_rating ?? 0,
      teamBRating: scheduledWeek.team_b_rating ?? 0,
    })
    if (navigator.share) {
      try {
        await navigator.share({ text })
      } catch (err) {
        if (err instanceof DOMException && err.name !== 'AbortError') {
          // Share API failed — fall back to clipboard
          try {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            // clipboard unavailable — nothing to do
          }
        }
        // AbortError = user cancelled — do nothing
      }
    } else {
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        // clipboard unavailable — nothing to do
      }
    }
  }

  function handleEditLineup() {
    if (!scheduledWeek) return
    const knownPlayerNames = new Set(allPlayers.map((p) => p.name.toLowerCase()))
    const knownOnly = [...scheduledWeek.teamA, ...scheduledWeek.teamB].filter(
      (name) => knownPlayerNames.has(name.toLowerCase())
    )
    setSelectedNames(knownOnly)

    const metadata = scheduledWeek.lineupMetadata
    if (metadata) {
      setGuestEntries(metadata.guests.map((g) => ({
        ...g,
        strengthHint: g.strengthHint ?? 'average',
      })))
      setNewPlayerEntries(metadata.new_players.map((p) => ({
        ...p,
        strengthHint: p.strengthHint ?? 'average',
      })))
    } else {
      setGuestEntries([])
      setNewPlayerEntries([])
    }

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
      setScheduledWeek({ id: weekId, season, week: cancelWeek, date: cancelDate, format: null, teamA: [], teamB: [], status: 'cancelled' })
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
                      setGuestEntries([])
                      setNewPlayerEntries([])
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

                        {/* Guest pills */}
                        {guestEntries.map((g) => (
                          <span
                            key={g.name}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-900/60 border border-sky-700 text-sky-100"
                          >
                            {g.name}
                            <button
                              type="button"
                              onClick={() => {
                                setGuestEntries((prev) => prev.filter((e) => e.name !== g.name))
                                clearSplit()
                              }}
                              className="text-sky-400 hover:text-sky-200 ml-0.5"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}

                        {/* New player pills */}
                        {newPlayerEntries.map((p) => (
                          <span
                            key={p.name}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-sky-900/60 border border-sky-700 text-sky-100"
                          >
                            {p.name}
                            <button
                              type="button"
                              onClick={() => {
                                setNewPlayerEntries((prev) => prev.filter((e) => e.name !== p.name))
                                clearSplit()
                              }}
                              className="text-sky-400 hover:text-sky-200 ml-0.5"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}

                        {/* Add guest or new player button */}
                        {!publicMode && (
                          <button
                            type="button"
                            onClick={() => setShowAddPlayerModal(true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-slate-600 text-slate-500 hover:border-blue-500 hover:text-blue-400 transition-colors"
                          >
                            + Add guest or new player
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Auto-pick result — replaces player list once built */}
                {isAutoPickMode && autoPickResult.suggestions.length > 0 && (() => {
                  const liveScoreA = ewptScore(localTeamA)
                  const liveScoreB = ewptScore(localTeamB)
                  const renderTeam = (team: 'A' | 'B', players: Player[], score: number) => (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-slate-100">{team === 'A' ? 'Team A' : 'Team B'}</p>
                        <span className={cn(
                          'px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums',
                          team === 'A'
                            ? 'bg-sky-900/60 border border-sky-700 text-sky-300'
                            : 'bg-violet-900/60 border border-violet-700 text-violet-300'
                        )}>
                          {score.toFixed(3)}
                        </span>
                      </div>
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
                              <span className={cn('text-xs font-medium', team === 'A' ? 'text-sky-100' : 'text-violet-100')}>
                                {p.name}{p.goalkeeper ? ' 🧤' : ''}
                              </span>
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
                        {renderTeam('A', localTeamA, liveScoreA)}
                        {renderTeam('B', localTeamB, liveScoreB)}
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
                  <button
                    type="button"
                    onClick={() => setCardState(scheduledWeek ? 'lineup' : 'idle')}
                    className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
                  >
                    Cancel
                  </button>
                )}
                <div className="flex items-center gap-2">
                  {isAutoPickMode && autoPickResult && (
                    isManuallyEdited ? (
                      <button
                        type="button"
                        onClick={() => {
                          setLocalTeamA(autoPickResult.suggestions[suggestionIndex].teamA)
                          setLocalTeamB(autoPickResult.suggestions[suggestionIndex].teamB)
                          setIsManuallyEdited(false)
                        }}
                        className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
                      >
                        Auto Balance Teams
                      </button>
                    ) : autoPickResult.suggestions.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = (suggestionIndex + 1) % autoPickResult.suggestions.length
                          setSuggestionIndex(next)
                          setLocalTeamA(autoPickResult.suggestions[next].teamA)
                          setLocalTeamB(autoPickResult.suggestions[next].teamB)
                        }}
                        className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
                      >
                        Shuffle teams ({suggestionIndex + 1}/{autoPickResult.suggestions.length})
                      </button>
                    ) : null
                  )}
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
            {isPastDeadline(scheduledWeek.date) ? (
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
            {canEdit && !isPastDeadline(scheduledWeek.date) && (
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
              <TeamList
                label="Team A"
                team="A"
                players={scheduledWeek.teamA}
                goalkeepers={goalkeepers}
                rating={scheduledWeek.team_a_rating ?? null}
              />
              <TeamList
                label="Team B"
                team="B"
                players={scheduledWeek.teamB}
                goalkeepers={goalkeepers}
                rating={scheduledWeek.team_b_rating ?? null}
              />
            </div>
          </div>
        )}

        {/* ── LINEUP footer ── */}
        {cardState === 'lineup' && scheduledWeek && scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700">
            {canEdit ? (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="px-3 py-1.5 rounded bg-red-900 hover:bg-red-800 text-red-200 text-sm font-medium"
              >
                Cancel Game
              </button>
            ) : (
              <div />
            )}
            <div className="flex items-center gap-2">
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={handleEditLineup}
                    className="px-3 py-1.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium"
                  >
                    <span className="sm:hidden">Edit</span>
                    <span className="hidden sm:inline">Edit Lineups</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setError(null); setShowResultModal(true) }}
                    className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold"
                  >
                    <span className="sm:hidden">Result</span>
                    <span className="hidden sm:inline">Result Game</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleShare}
                className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium"
              >
                <Share2 className="w-5 h-5 sm:hidden" aria-hidden="true" />
                <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share'}</span>
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

      {showAddPlayerModal && (
        <AddPlayerModal
          players={sortedPlayers.filter((p) => selectedNames.includes(p.name))}
          allLeaguePlayers={allPlayers}
          existingGuests={guestEntries}
          onAdd={(entry) => {
            if (entry.type === 'guest') {
              setGuestEntries((prev) => [...prev, entry as GuestEntry])
            } else {
              setNewPlayerEntries((prev) => [...prev, entry as NewPlayerEntry])
            }
            clearSplit()
          }}
          onClose={() => setShowAddPlayerModal(false)}
        />
      )}

      {showResultModal && scheduledWeek && (
        <ResultModal
          scheduledWeek={scheduledWeek}
          lineupMetadata={scheduledWeek.lineupMetadata ?? null}
          allPlayers={allPlayers}
          gameId={gameId}
          leagueSlug={leagueSlug}
          leagueName={leagueName}
          weeks={weeks}
          publicMode={publicMode}
          onSaved={(result) => {
            setShowResultModal(false)
            setGuestEntries([])
            setNewPlayerEntries([])
            setSavedResult(result)
          }}
          onClose={() => setShowResultModal(false)}
        />
      )}

      {savedResult && scheduledWeek && (
        <ResultSuccessPanel
          week={scheduledWeek.week}
          date={scheduledWeek.date}
          winner={savedResult.winner}
          goalDifference={savedResult.goalDifference}
          teamA={scheduledWeek.teamA}
          teamB={scheduledWeek.teamB}
          highlightsText={savedResult.highlightsText}
          shareText={savedResult.shareText}
          onDismiss={() => {
            setSavedResult(null)
            setScheduledWeek(null)
            setCardState('idle')
            onResultSaved()
          }}
        />
      )}
    </>
  )
}
