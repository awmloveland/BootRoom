import type { Player } from './types'
import { ewptScore } from './utils'

export interface AutoPickSuggestion {
  teamA: Player[]
  teamB: Player[]
  scoreA: number
  scoreB: number
  diff: number
}

export interface AutoPickResult {
  suggestions: AutoPickSuggestion[]  // up to 3, sorted by diff ascending
  bestDiff: number
  poolSize: number
}

/**
 * Given a list of players attending the game, return up to 3 balanced team splits.
 * Uses exhaustive search for n ≤ 20, random sampling for n > 20.
 * Guest players (not in DB) should be passed with rating set to the median league
 * rating and all stats at zero.
 *
 * @param pairs - Optional array of [guestName, associatedPlayerName] pairs.
 *   Each guest will be pinned to the same team as their associated player.
 */
export function autoPick(players: Player[], pairs?: Array<[string, string]>): AutoPickResult {
  const n = players.length
  if (n < 2) return { suggestions: [], bestDiff: 0, poolSize: 0 }

  // GK constraint: pin one GK to each team (when ≥2 GKs exist) so neither
  // team is ever left without a goalkeeper. Any additional GKs beyond the
  // two pinned ones go into searchPool and are distributed freely.
  // - 0 GKs: no pinning
  // - 1 GK: pin to Team A only
  // - 2 GKs: one pinned to each team — guaranteed opposing sides
  // - 3+ GKs: one pinned to each team, the rest distributed freely
  //
  // Guests (identified by appearance as first element of any pair) are excluded
  // from the GK pool — their placement is handled by pair pinning instead.
  const guestNames = new Set((pairs ?? []).map(([g]) => g))
  const gkPlayers = [...players.filter((p) => (p.goalkeeper || p.mentality === 'goalkeeper') && !guestNames.has(p.name))]
    .sort(() => Math.random() - 0.5) // shuffle so pinned pair is random when 3+ GKs
  const pinnedA: Player | null = gkPlayers.length >= 1 ? gkPlayers[0] : null
  const pinnedB: Player | null = gkPlayers.length >= 2 ? gkPlayers[1] : null
  let searchPool = players.filter((p) => p !== pinnedA && p !== pinnedB)

  // Pair pinning: pin each guest+associated player to the same team.
  // Pairs alternate between Team A and Team B for balance.
  const pinnedTeamA: Player[] = []
  const pinnedTeamB: Player[] = []
  let pairTeamToggle = true

  for (const [guestName, associatedName] of (pairs ?? [])) {
    const guest = searchPool.find((p) => p.name === guestName)

    if (!guest) continue // guest not in pool (absent or already placed) — skip

    const assoc = searchPool.find((p) => p.name === associatedName)

    if (!assoc) {
      // Associated player not found in free pool — check if they are a pinned GK
      // or have already been pinned to a pair team by a previous iteration.
      if (associatedName === pinnedA?.name) {
        // Remove guest from remaining pool and pin to Team A alongside GK
        searchPool = searchPool.filter((p) => p !== guest)
        pinnedTeamA.push(guest)
        // toggle is NOT flipped in this case
      } else if (associatedName === pinnedB?.name) {
        // Remove guest from remaining pool and pin to Team B alongside GK
        searchPool = searchPool.filter((p) => p !== guest)
        pinnedTeamB.push(guest)
        // toggle is NOT flipped in this case
      } else if (pinnedTeamA.some((p) => p.name === associatedName)) {
        // Associated player was already pinned to Team A by a prior pair — join them
        searchPool = searchPool.filter((p) => p !== guest)
        pinnedTeamA.push(guest)
        // toggle is NOT flipped in this case
      } else if (pinnedTeamB.some((p) => p.name === associatedName)) {
        // Associated player was already pinned to Team B by a prior pair — join them
        searchPool = searchPool.filter((p) => p !== guest)
        pinnedTeamB.push(guest)
        // toggle is NOT flipped in this case
      }
      // Otherwise associated player is absent entirely — skip (graceful degradation)
      continue
    }

    // Normal pair: remove both from free pool and pin together
    searchPool = searchPool.filter((p) => p !== guest && p !== assoc)
    if (pairTeamToggle) {
      pinnedTeamA.push(guest, assoc)
    } else {
      pinnedTeamB.push(guest, assoc)
    }
    pairTeamToggle = !pairTeamToggle
  }

  // How many non-pinned players go into Team A (clamp to 0 to avoid negative)
  const sizeA = Math.max(0, Math.ceil(n / 2) - (pinnedA ? 1 : 0) - pinnedTeamA.length)

  // Generate candidate splits
  let rawSplits: [Player[], Player[]][]

  if (n <= 20) {
    rawSplits = combinations(searchPool, sizeA).map((teamASlice) => {
      const inA = new Set(teamASlice.map((p) => p.name))
      return [teamASlice, searchPool.filter((p) => !inA.has(p.name))] as [Player[], Player[]]
    })
  } else {
    // Random-sample fallback for large squads
    rawSplits = []
    for (let i = 0; i < 500; i++) {
      const shuffled = [...searchPool].sort(() => Math.random() - 0.5)
      rawSplits.push([shuffled.slice(0, sizeA), shuffled.slice(sizeA)])
    }
  }

  // Prepend pinned GKs and pair-pinned players to their respective teams
  const allSplits: [Player[], Player[]][] = rawSplits.map(([a, b]) => [
    [...(pinnedA ? [pinnedA] : []), ...pinnedTeamA, ...a],
    [...(pinnedB ? [pinnedB] : []), ...pinnedTeamB, ...b],
  ])

  // Score all splits
  const scored = allSplits.map(([a, b]) => {
    const scoreA = ewptScore(a)
    const scoreB = ewptScore(b)
    const diff = Math.abs(scoreA - scoreB)
    return { teamA: a, teamB: b, scoreA, scoreB, diff }
  })

  // Find best (minimum) diff
  const bestDiff = scored.reduce((min, s) => (s.diff < min ? s.diff : min), Infinity)

  // Collect 5% pool: all splits within 5% of bestDiff (+ small float tolerance)
  const pool = scored.filter((s) => s.diff <= bestDiff * 1.05 + 0.001)

  // Randomly sample up to 3 from the pool, then sort by diff ascending
  const shuffledPool = [...pool].sort(() => Math.random() - 0.5)
  const suggestions = shuffledPool.slice(0, 3).sort((a, b) => a.diff - b.diff)

  return { suggestions, bestDiff, poolSize: pool.length }
}

/** Return all size-k subsets of arr. */
function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (k === arr.length) return [[...arr]]
  if (k > arr.length) return []
  const [first, ...rest] = arr
  return [
    ...combinations(rest, k - 1).map((c) => [first, ...c]),
    ...combinations(rest, k),
  ]
}
