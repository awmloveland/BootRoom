'use client'

import { useMemo, useRef, useState } from 'react'
import { ewptScore, squadFormat } from '@/lib/utils'
import { autoPick, deriveLastPlayedDates, resolvePlayersForAutoPick, type AutoPickResult } from '@/lib/autoPick'
import type { Week, Player, ScheduledWeek, GuestEntry, NewPlayerEntry, LineupMetadata } from '@/lib/types'

/** Fewest players the builder will split into teams. */
export const MIN_SQUAD = 10

type Slot = { team: 'A' | 'B'; index: number }

/**
 * Team-building state for the next match: who is attending, the guests and new
 * players added for the week, the auto-pick split and any drag-to-swap edits.
 * Lives in NextMatchCard rather than the builder screen, so a squad survives
 * the builder closing and Edit Lineups can load a saved week into it.
 */
export function useLineupBuilder({ allPlayers, weeks }: { allPlayers: Player[]; weeks: Week[] }) {
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [guestEntries, setGuestEntries] = useState<GuestEntry[]>([])
  const [newPlayerEntries, setNewPlayerEntries] = useState<NewPlayerEntry[]>([])

  const [autoPickResult, setAutoPickResult] = useState<AutoPickResult | null>(null)
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [isManuallyEdited, setIsManuallyEdited] = useState(false)
  const [localTeamA, setLocalTeamA] = useState<Player[]>([])
  const [localTeamB, setLocalTeamB] = useState<Player[]>([])
  const [dragOver, setDragOver] = useState<Slot | null>(null)
  const dragSource = useRef<Slot | null>(null)

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

  // Odd squads are fine: one side plays with an extra player ('6v5').
  const format = squadFormat(squadNames.length)

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

  function addEntry(entry: GuestEntry | NewPlayerEntry) {
    if (entry.type === 'guest') {
      setGuestEntries((prev) => [...prev, entry as GuestEntry])
    } else {
      setNewPlayerEntries((prev) => [...prev, entry as NewPlayerEntry])
    }
    clearSplit()
  }

  function removeGuest(name: string) {
    setGuestEntries((prev) => prev.filter((e) => e.name !== name))
    clearSplit()
  }

  function removeNewPlayer(name: string) {
    setNewPlayerEntries((prev) => prev.filter((e) => e.name !== name))
    clearSplit()
  }

  function runAutoPick() {
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

  /** Puts back the current suggestion after drag-to-swap edits. */
  function rebalance() {
    if (!autoPickResult) return
    setLocalTeamA(autoPickResult.suggestions[suggestionIndex].teamA)
    setLocalTeamB(autoPickResult.suggestions[suggestionIndex].teamB)
    setIsManuallyEdited(false)
  }

  /** Moves on to the next suggested split, wrapping round at the end. */
  function shuffle() {
    if (!autoPickResult) return
    const next = (suggestionIndex + 1) % autoPickResult.suggestions.length
    setSuggestionIndex(next)
    setLocalTeamA(autoPickResult.suggestions[next].teamA)
    setLocalTeamB(autoPickResult.suggestions[next].teamB)
  }

  function swap(targetTeam: 'A' | 'B', targetIndex: number) {
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

  const drag = {
    over: dragOver,
    start(team: 'A' | 'B', index: number) { dragSource.current = { team, index } },
    enter(team: 'A' | 'B', index: number) { setDragOver({ team, index }) },
    leave() { setDragOver(null) },
    drop: swap,
    end() { dragSource.current = null; setDragOver(null) },
  }

  /** Empties the squad and the split, for a builder closed with the X. */
  function reset() {
    clearSplit()
    setSelectedNames([])
    setGuestEntries([])
    setNewPlayerEntries([])
  }

  /** Drops the week's guests and new players once its result is in. */
  function clearAddedPlayers() {
    setGuestEntries([])
    setNewPlayerEntries([])
  }

  /** Loads a saved line-up back into the builder for Edit Lineups. */
  function loadLineup(week: ScheduledWeek) {
    const knownPlayerNames = new Set(allPlayers.map((p) => p.name.toLowerCase()))
    const knownOnly = [...week.teamA, ...week.teamB].filter(
      (name) => knownPlayerNames.has(name.toLowerCase())
    )
    setSelectedNames(knownOnly)

    const metadata = week.lineupMetadata
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
  }

  /**
   * The split as it stands, ready to save: names, ratings, and the guests and
   * new players both as the card keeps them and as the database stores them.
   * Null until auto-pick has produced a suggestion.
   */
  function toLineup() {
    if (!autoPickResult || autoPickResult.suggestions.length === 0) return null
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
    return {
      teamA: localTeamA.map((p) => p.name),
      teamB: localTeamB.map((p) => p.name),
      teamARating: ewptScore(localTeamA),
      teamBRating: ewptScore(localTeamB),
      lineupMetadata,
      lineupMetadataForDB,
    }
  }

  return {
    sortedPlayers,
    selectedNames,
    selectedSet,
    guestEntries,
    newPlayerEntries,
    squadNames,
    format,
    autoPickResult,
    suggestionIndex,
    isManuallyEdited,
    teamA: localTeamA,
    teamB: localTeamB,
    drag,
    togglePlayer,
    addEntry,
    removeGuest,
    removeNewPlayer,
    runAutoPick,
    clearSplit,
    rebalance,
    shuffle,
    reset,
    clearAddedPlayers,
    loadLineup,
    toLineup,
  }
}

export type LineupBuilderState = ReturnType<typeof useLineupBuilder>
