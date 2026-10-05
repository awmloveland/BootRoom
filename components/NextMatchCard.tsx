'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { getNextMatchDate, getNextWeekNumber, deriveSeason, ewptScore, winProbability, winCopy, isPastDeadline, buildShareText, fetchLineupShareUrl, wprScore, leagueWprPercentiles, parseWeekDate, hintToWpr } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Winner, Week, Player, ScheduledWeek, GuestEntry, NewPlayerEntry, LineupMetadata, Mentality, Strength } from '@/lib/types'
import { autoPick, type AutoPickResult } from '@/lib/autoPick'
import { X, Share2 } from 'lucide-react'
import { WinnerBadge } from '@/components/WinnerBadge'
import { TeamList } from '@/components/TeamList'
import { AddPlayerModal } from '@/components/AddPlayerModal'
import { ResultModal } from '@/components/ResultModal'
import { FormDots } from '@/components/FormDots'
import { NextGameIdle, NextGameLineup } from '@/components/overview/NextGameCard'
import { Skeleton } from '@/components/ui/skeleton'

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
  /**
   * 'overview' renders the idle and lineup states in the Overview tab design and
   * takes its first state from `initialScheduledWeek` instead of fetching, so the
   * card is in the page's first paint. Building and cancelled are the same in both.
   */
  variant?: 'results' | 'overview'
  /** Extra context shown by the Overview variant. */
  overview?: {
    linkedPlayerName?: string | null
    location?: string | null
    kickoffTime?: string | null
  }
}

type CardState = 'loading' | 'idle' | 'building' | 'lineup' | 'cancelled'

/**
 * Scans played weeks to find the most recent week date each player appeared in.
 * Returns a map of player name → date string ('DD MMM YYYY'), or undefined if never played.
 */
function deriveLastPlayedDates(players: Player[], weeks: Week[]): Map<string, string | undefined> {
  const playedWeeks = weeks
    .filter((w) => w.status === 'played')
    .sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime()) // most recent first
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
  const percentiles = leagueWprPercentiles(allPlayers)

  return names.map((name) => {
    const known = lookup.get(name.toLowerCase())
    if (known) return known   // already has `roster|<name>` from fetchers

    const guest = guestLookup.get(name.toLowerCase())
    if (guest) {
      return {
        playerId: `guest|${name}`,
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        mentality: guest.goalkeeper ? 'goalkeeper' : 'balanced',
        strength: guest.strength,
        recentForm: '',
        wprOverride: hintToWpr(guest.strength, percentiles),
      }
    }

    const newPlayer = newPlayerLookup.get(name.toLowerCase())
    if (newPlayer) {
      return {
        playerId: `new|${name}`,
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        mentality: newPlayer.mentality,
        strength: newPlayer.strength,
        recentForm: '',
        wprOverride: hintToWpr(newPlayer.strength, percentiles),
      }
    }

    return {
      playerId: `unknown|${name}`,
      name,
      played: 0, won: 0, drew: 0, lost: 0,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0, qualified: false, points: 0,
      mentality: 'balanced' as const,
      strength: null,
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
  variant = 'results',
  overview,
}: Props) {
  const isOverview = variant === 'overview'
  const [cardState, setCardState] = useState<CardState>(() => {
    if (!isOverview) return 'loading'
    if (!initialScheduledWeek) return 'idle'
    return initialScheduledWeek.status === 'cancelled' ? 'cancelled' : 'lineup'
  })
  const [scheduledWeek, setScheduledWeek] = useState<ScheduledWeek | null>(
    isOverview ? initialScheduledWeek ?? null : null
  )

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

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Signed share link for the saved lineup, fetched before the tap: iOS
  // Safari drops navigator.share if it awaits a request after the click.
  // Keyed on the week and teams so an edit fetches a fresh link and a stale
  // one is never used.
  const [shareLink, setShareLink] = useState<{ key: string; url: string | null } | null>(null)
  const shareWeekId = scheduledWeek?.id ?? null
  const shareKey =
    !isOverview && cardState === 'lineup' && scheduledWeek &&
    scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0
      ? JSON.stringify([scheduledWeek.id, scheduledWeek.teamA, scheduledWeek.teamB])
      : null
  useEffect(() => {
    if (!shareKey || !shareWeekId) return
    let cancelled = false
    fetchLineupShareUrl(gameId, shareWeekId).then((url) => {
      if (!cancelled) setShareLink({ key: shareKey, url })
    })
    return () => { cancelled = true }
  }, [gameId, shareKey, shareWeekId])
  const signedShareUrl = shareLink?.key === shareKey ? shareLink.url : null

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
    () => allPlayers.filter((p) => p.mentality === 'goalkeeper').map((p) => p.name),
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

    // Treat both guests and new players as "unknown" — the count-balance filter
    // spreads them across teams subject to pair-pinning constraints. autoPick
    // no-ops internally when the set is empty or a singleton, so we can pass it
    // unconditionally. We collect playerIds (not names) so same-named entities
    // stay distinct.
    const unknownEntryNames = new Set<string>()
    for (const g of guestEntries) unknownEntryNames.add(g.name)
    for (const p of newPlayerEntries) unknownEntryNames.add(p.name)
    const unknownIds = new Set(
      resolved.filter((p) => unknownEntryNames.has(p.name)).map((p) => p.playerId),
    )

    const result = autoPick(resolved, pairs, unknownIds)
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
    // Public mode and the Overview variant take the week from the server.
    if (publicMode || isOverview) {
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
                  goalkeeper: g.goalkeeper ?? false,
                  // Accept new `strength` key or legacy `strength_hint`; fall back to 'average'
                  strength: (g.strength ?? g.strength_hint ?? 'average') as Strength,
                })),
                new_players: ((data.lineup_metadata as any).new_players ?? []).map((p: any) => ({
                  type: 'new_player' as const,
                  name: p.name,
                  // Legacy metadata may carry only `goalkeeper`; derive mentality from it.
                  mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
                  // Accept new `strength` key or legacy `strength_hint`; fall back to 'average'
                  strength: (p.strength ?? p.strength_hint ?? 'average') as Strength,
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
  }, [gameId, publicMode, isOverview, initialScheduledWeek])

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
        goalkeeper: g.goalkeeper ?? false,
        strength: g.strength,
      })),
      new_players: newPlayerEntries.map((p) => ({
        name: p.name,
        mentality: p.mentality,
        // DB metadata still accepts a `goalkeeper` key for back-compat with older readers.
        goalkeeper: p.mentality === 'goalkeeper',
        strength: p.strength,
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
      shareUrl: signedShareUrl ?? undefined,
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
        strength: g.strength ?? 'average',
      })))
      setNewPlayerEntries(metadata.new_players.map((p) => ({
        ...p,
        strength: p.strength ?? 'average',
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

  // Same footprint as the idle card, so the match list below doesn't jump
  // when the scheduled week arrives.
  if (cardState === 'loading') {
    return (
      <div
        className="rounded-xl border border-[#223a5c] bg-[#0a1421] px-[18px] py-3 shadow-[0_18px_44px_rgba(0,0,0,.42)]"
        aria-busy="true"
      >
        <div className="flex h-[22px] items-center">
          <Skeleton className="h-3.5 w-20" />
        </div>
        <div className="mt-[3px] flex h-[14px] items-center">
          <Skeleton className="h-2.5 w-28" />
        </div>
      </div>
    )
  }

  const displayWeek = scheduledWeek?.week ?? nextWeekNum
  const displayDate = scheduledWeek?.date ?? nextDate

  return (
    <>
      <div className="rounded-xl border border-[#223a5c] bg-[#0a1421] overflow-hidden shadow-[0_18px_44px_rgba(0,0,0,.42)]">

        {/* ── IDLE (Overview tab) ── */}
        {isOverview && cardState === 'idle' && (
          <NextGameIdle
            week={nextWeekNum}
            canEdit={canEdit}
            onBuildTeams={() => { onBuildStart?.(); setCardState('building') }}
            onCancelGame={() => { setError(null); setShowCancelModal(true) }}
          />
        )}

        {/* ── IDLE ── */}
        {!isOverview && cardState === 'idle' && (
          canEdit ? (
            <div className="flex items-center justify-between gap-4 px-[18px] py-3">
              <div>
                <p className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Week {nextWeekNum}</p>
                <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#7f97b5]">{nextDate}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { onBuildStart?.(); setCardState('building') }}
                  className="h-8 px-3.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold whitespace-nowrap transition-colors"
                >
                  Build Teams
                </button>
                <button
                  type="button"
                  onClick={() => { setError(null); setShowCancelModal(true) }}
                  className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="px-[18px] py-3">
              <p className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Week {nextWeekNum}</p>
              <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#7f97b5]">{nextDate}</p>
            </div>
          )
        )}

        {/* ── BUILDING ── */}
        {cardState === 'building' && (
          canEdit ? (
            <>
              {/* Header — matches idle style */}
              <div className="flex items-center justify-between gap-3 px-[18px] py-3 bg-[#0c1728] border-b border-[#1b2c46]">
                <div>
                  <p className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Week {displayWeek}</p>
                  <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#7f97b5]">{displayDate}</p>
                </div>
                <div className="flex items-center gap-3">
                  {squadNames.length > 0 && (() => {
                    const n = squadNames.length
                    if (n < 10) return (
                      <span className="font-plex text-[9.5px] font-bold uppercase tracking-[.12em] text-[#e2686f]">{10 - n} more needed (min 10)</span>
                    )
                    if (n % 2 !== 0) return (
                      <span className="font-plex text-[9.5px] font-bold uppercase tracking-[.12em] text-[#e2686f]">Select an even number</span>
                    )
                    return (
                      <span className="font-plex text-[9.5px] font-bold uppercase tracking-[.12em] text-[#8ba4c4]">{format} · {n} players</span>
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
                    className="p-1 rounded text-[#8ba4c4] hover:text-white transition-colors"
                    aria-label="Close team builder"
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-[18px] py-4 space-y-4">

                {/* Player selection — hidden once auto-pick has run */}
                {!isAutoPickMode && (
                  <>
                    <div>
                      <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8] mb-3">Select attending players</p>
                      <div className="flex flex-wrap gap-2">
                        {sortedPlayers.map((player) => {
                          const active = selectedSet.has(player.name)
                          return (
                            <button
                              key={player.name}
                              type="button"
                              onClick={() => togglePlayer(player.name)}
                              className={cn(
                                'h-[30px] px-3 rounded border font-inter-body text-xs font-semibold transition-colors',
                                active
                                  ? 'bg-[rgba(8,47,73,.55)] border-[#38bdf8]/50 text-[#7dd3fc]'
                                  : 'bg-[#0a1421] border-[#1b2c46] text-[#cfe0f4] hover:border-[#2c4a72]'
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
                            className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded border font-inter-body text-xs font-semibold bg-[rgba(8,47,73,.55)] border-[#38bdf8]/50 text-[#7dd3fc]"
                          >
                            {g.name}
                            <button
                              type="button"
                              onClick={() => {
                                setGuestEntries((prev) => prev.filter((e) => e.name !== g.name))
                                clearSplit()
                              }}
                              className="text-[#38bdf8] hover:text-white"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}

                        {/* New player pills */}
                        {newPlayerEntries.map((p) => (
                          <span
                            key={p.name}
                            className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded border font-inter-body text-xs font-semibold bg-[rgba(8,47,73,.55)] border-[#38bdf8]/50 text-[#7dd3fc]"
                          >
                            {p.name}
                            <button
                              type="button"
                              onClick={() => {
                                setNewPlayerEntries((prev) => prev.filter((e) => e.name !== p.name))
                                clearSplit()
                              }}
                              className="text-[#38bdf8] hover:text-white"
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
                            className="inline-flex items-center gap-1 h-[30px] px-3 rounded border border-dashed border-[#223a5c] font-inter-body text-xs font-semibold text-[#6f88a8] hover:border-[#38bdf8] hover:text-white transition-colors"
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
                      <div className={cn(
                        'flex items-baseline justify-between gap-2 pb-2 border-b border-[#1b2c46]',
                        team === 'A' ? 'text-[#7dd3fc]' : 'text-[#c4b5fd]'
                      )}>
                        <p className="text-xs font-bold uppercase tracking-[.04em]">{team === 'A' ? 'Team A' : 'Team B'}</p>
                        <span className="font-plex text-sm font-bold tabular-nums">
                          {score.toFixed(3)}
                        </span>
                      </div>
                      <div className="flex flex-col gap-[5px] mt-2">
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
                                'flex items-center justify-between gap-2 px-2.5 py-[7px] rounded border-l-2 cursor-grab active:cursor-grabbing transition-colors select-none',
                                team === 'A'
                                  ? cn('border-[#38bdf8] text-[#dff1ff]', isOver ? 'bg-[rgba(8,47,73,.95)]' : 'bg-[rgba(8,47,73,.55)]')
                                  : cn('border-[#a78bfa] text-[#efeaff]', isOver ? 'bg-[rgba(46,16,101,.85)]' : 'bg-[rgba(46,16,101,.45)]')
                              )}
                            >
                              <span className="font-inter-body text-xs font-semibold">
                                {p.name}{p.mentality === 'goalkeeper' ? ' 🧤' : ''}
                              </span>
                              {p.recentForm && <FormDots form={p.recentForm} team={team} className="gap-1 text-[10px]" />}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                  return (
                    <div>
                      <div className="grid grid-cols-2 gap-4">
                        {renderTeam('A', localTeamA, liveScoreA)}
                        {renderTeam('B', localTeamB, liveScoreB)}
                      </div>
                      {(() => {
                        const winProbA = winProbability(liveScoreA, liveScoreB)
                        const winProbB = 1 - winProbA
                        const copy = winCopy(winProbA)
                        const isEven = copy.team === 'even'
                        return (
                          <div className="mt-[18px] pt-3.5 border-t border-[#1b2c46]">
                            <div className="flex items-center gap-3">
                              <span className={cn(
                                'font-plex text-[15px] font-bold tabular-nums min-w-10',
                                isEven ? 'text-[#8ba4c4]' : 'text-[#7dd3fc]'
                              )}>
                                {Math.round(winProbA * 100)}%
                              </span>
                              <div className="flex-1 h-1.5 rounded-[3px] overflow-hidden flex bg-[#a78bfa]">
                                <div
                                  className="bg-[#38bdf8] transition-all duration-300"
                                  style={{ width: `${winProbA * 100}%` }}
                                />
                              </div>
                              <span className={cn(
                                'font-plex text-[15px] font-bold tabular-nums min-w-10 text-right',
                                isEven ? 'text-[#8ba4c4]' : 'text-[#c4b5fd]'
                              )}>
                                {Math.round(winProbB * 100)}%
                              </span>
                            </div>
                            <p className={cn(
                              'mt-2 text-center font-plex text-[9.5px] font-bold uppercase tracking-[.16em]',
                              copy.team === 'A' ? 'text-[#38bdf8]' : copy.team === 'B' ? 'text-[#a78bfa]' : 'text-[#8ba4c4]'
                            )}>
                              {copy.text}
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  )
                })()}

                {error && <p className="font-inter-body text-xs text-[#e2686f]">{error}</p>}
              </div>

              {/* Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] py-3 border-t border-[#1b2c46] bg-[#0c1728]">
                {isAutoPickMode ? (
                  <button
                    type="button"
                    onClick={() => clearSplit()}
                    className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
                  >
                    Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCardState(scheduledWeek ? 'lineup' : 'idle')}
                    className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
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
                        className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
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
                        className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
                      >
                        Shuffle teams ({suggestionIndex + 1}/{autoPickResult.suggestions.length})
                      </button>
                    ) : null
                  )}
                  <button
                    type="button"
                    onClick={isAutoPickMode ? handleSaveLineup : handleAutoPick}
                    disabled={saving || squadNames.length < 10 || squadNames.length % 2 !== 0}
                    className="h-8 px-3.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold whitespace-nowrap transition-colors disabled:opacity-40"
                  >
                    {saving ? 'Saving…' : isAutoPickMode ? 'Confirm Lineup' : 'Build Lineup'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="px-[18px] py-3">
              <p className="font-inter-body text-xs text-[#6f88a8]">Lineup not yet set.</p>
            </div>
          )
        )}

        {/* ── LINEUP (Overview tab) ── */}
        {isOverview && cardState === 'lineup' && scheduledWeek && (
          <NextGameLineup
            week={displayWeek}
            date={displayDate}
            format={scheduledWeek.format}
            teamA={scheduledWeek.teamA}
            teamB={scheduledWeek.teamB}
            linkedPlayerName={overview?.linkedPlayerName ?? null}
            location={overview?.location ?? null}
            kickoffTime={overview?.kickoffTime ?? null}
            awaitingResult={isPastDeadline(scheduledWeek.date)}
            canEdit={canEdit && scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0}
            onEditLineups={handleEditLineup}
            onResultGame={() => { setError(null); setShowResultModal(true) }}
          />
        )}

        {/* ── LINEUP header ── */}
        {!isOverview && cardState === 'lineup' && scheduledWeek && (
          <div className="flex items-center justify-between gap-3 px-[18px] py-3 bg-[#0c1728] border-b border-[#1b2c46]">
            <div>
              <p className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Week {displayWeek}</p>
              <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#7f97b5]">
                {displayDate}
                {scheduledWeek.format && <span> · {scheduledWeek.format}</span>}
              </p>
            </div>
            {isPastDeadline(scheduledWeek.date) ? (
              <span className="px-2.5 py-[5px] rounded border border-[#223a5c] font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#8ba4c4] whitespace-nowrap">
                Awaiting Result
              </span>
            ) : (
              <span className="inline-flex items-center gap-[7px] px-2.5 py-[5px] rounded border border-[#38bdf8]/40 bg-[#38bdf8]/12 font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#7dd3fc] whitespace-nowrap">
                <span className="size-1.5 rounded-full bg-[#38bdf8] animate-cf-pulse motion-reduce:animate-none" />
                Upcoming
              </span>
            )}
          </div>
        )}

        {/* ── CANCELLED ── */}
        {cardState === 'cancelled' && scheduledWeek && (
          <div className="flex items-center justify-between gap-4 px-[18px] py-3">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Week {scheduledWeek.week}</p>
                <p className="mt-[3px] font-plex text-[9.5px] uppercase tracking-[.14em] text-[#7f97b5]">{scheduledWeek.date}</p>
              </div>
              <WinnerBadge winner={null} cancelled />
            </div>
            {canEdit && !isPastDeadline(scheduledWeek.date) && (
              <button
                type="button"
                onClick={handleReactivate}
                disabled={saving}
                className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors disabled:opacity-50"
              >
                Reactivate
              </button>
            )}
          </div>
        )}

        {/* ── LINEUP body ── */}
        {!isOverview && cardState === 'lineup' && scheduledWeek && (
          <div className="px-[18px] py-4">
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
        {!isOverview && cardState === 'lineup' && scheduledWeek && scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] py-3 border-t border-[#1b2c46] bg-[#0c1728]">
            {canEdit ? (
              <button
                type="button"
                onClick={() => setShowCancelModal(true)}
                className="h-8 px-3 rounded border border-[#e2686f]/40 text-[#e2686f] text-xs font-bold whitespace-nowrap hover:bg-[#e2686f]/10 transition-colors"
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
                    className="h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
                  >
                    <span className="sm:hidden">Edit</span>
                    <span className="hidden sm:inline">Edit Lineups</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setError(null); setShowResultModal(true) }}
                    className="h-8 px-3.5 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-xs font-bold whitespace-nowrap transition-colors"
                  >
                    <span className="sm:hidden">Result</span>
                    <span className="hidden sm:inline">Result Game</span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleShare}
                aria-label="Share"
                className="inline-flex items-center h-8 px-3 rounded border border-[#223a5c] text-[#cfe0f4] text-xs font-bold whitespace-nowrap hover:border-[#38bdf8] hover:text-white transition-colors"
              >
                <Share2 className="size-[15px] sm:hidden" aria-hidden="true" />
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
          <Dialog.Overlay className="fixed inset-0 bg-[#030710]/80 z-[999]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-[calc(100%-32px)] sm:max-w-sm rounded-[14px] bg-[#0a1421] border border-[#1b2c46] p-5 shadow-[0_34px_80px_rgba(0,0,0,.65)] focus:outline-none">
            <Dialog.Title className="text-base font-bold tracking-[-.02em] text-[#f4f9ff] mb-2.5">
              Cancel Week {displayWeek}?
            </Dialog.Title>
            <Dialog.Description className="font-inter-body text-[13px] leading-[1.55] text-[#8ba4c4] mb-5">
              This will mark the game as cancelled. You can reactivate it before {displayDate} at 8 pm if plans change.
            </Dialog.Description>
            {error && <p className="font-inter-body text-xs text-[#e2686f] mb-4">{error}</p>}
            <div className="flex gap-2 justify-end">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="h-9 px-3.5 rounded border border-[#223a5c] text-[#cfe0f4] text-[13px] font-semibold hover:border-[#38bdf8] hover:text-white transition-colors"
                >
                  Keep it
                </button>
              </Dialog.Close>
              <button
                type="button"
                onClick={handleCancelGame}
                disabled={saving}
                className="h-9 px-4 rounded border border-[#e2686f]/40 text-[#e2686f] text-[13px] font-bold hover:bg-[#e2686f]/10 transition-colors disabled:opacity-50"
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
          onSaved={() => {
            setShowResultModal(false)
            setGuestEntries([])
            setNewPlayerEntries([])
            setScheduledWeek(null)
            setCardState('idle')
            onResultSaved()
          }}
          onClose={() => setShowResultModal(false)}
        />
      )}

    </>
  )
}
