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
  suggestions: AutoPickSuggestion[]  // up to SUGGESTION_COUNT, sorted by diff ascending
  bestDiff: number
  poolSize: number
}

// --- Split search ---
const EXHAUSTIVE_THRESHOLD = 20        // n ≤ this → try every split; above, sample
const FALLBACK_SAMPLE_COUNT = 500      // random shuffles tried when n > EXHAUSTIVE_THRESHOLD
const SUGGESTION_COUNT = 5             // distinct splits surfaced in the UI

// --- Filters ---
const COUNT_BALANCE_SLACK = 1          // max |unknownA − unknownB| tolerated

// --- Tolerance pool ---
// Accept splits within ±TOLERANCE_WIN_PROB_BAND of a 50/50 match. 0.095 ≈ 3.08
// score points above bestDiff, matching the legacy "+3 absolute" floor for
// typical 5-a-side best diffs.
const TOLERANCE_WIN_PROB_BAND = 0.095
const POOL_EPSILON = 0.001             // float-safety nudge on pool boundary

/**
 * Inverse of `winProbability`'s logistic curve: given a win-probability band
 * (distance from 0.5), return the corresponding score-difference threshold.
 * 1 / (1 + exp(-diff/8)) = 0.5 + band  →  diff = -8 × ln(1/(0.5+band) - 1).
 */
export function diffForBand(band: number): number {
  return -8 * Math.log(1 / (0.5 + band) - 1)
}

/**
 * Return the team an associated player is currently pinned to, or null if
 * they're absent. Used by the pair-pinning loop to place a guest on the same
 * team as their associated player when the associated player is outside the
 * free search pool (already pinned as GK or by a prior pair).
 */
export function findAssocTeam(
  assocId: string | undefined,
  pinnedA: Player | null,
  pinnedB: Player | null,
  pinnedTeamA: Player[],
  pinnedTeamB: Player[],
): 'A' | 'B' | null {
  if (assocId === undefined) return null
  if (assocId === pinnedA?.playerId) return 'A'
  if (assocId === pinnedB?.playerId) return 'B'
  if (pinnedTeamA.some((p) => p.playerId === assocId)) return 'A'
  if (pinnedTeamB.some((p) => p.playerId === assocId)) return 'B'
  return null
}

/**
 * Given a list of players attending the game, return up to SUGGESTION_COUNT
 * balanced team splits — always the closest-to-50/50 splits, sorted by diff
 * ascending, with team-swap duplicates collapsed.
 * Uses exhaustive search for n ≤ 20, random sampling for n > 20.
 * Guest players (not in DB) should be passed with a wprOverride set to the appropriate
 * league percentile and all stats at zero.
 *
 * @param pairs - Optional array of [guestName, associatedPlayerName] pairs.
 *   Each guest will be pinned to the same team as their associated player.
 * @param unknownIds - Optional set of `playerId`s that are unknown — guests or
 *   new players. Used as a post-generation count-balance filter: splits where the
 *   unknown-player count differs by more than 1 between teams are discarded. If no
 *   split passes, falls back to the full set.
 * @param random - Optional RNG function returning `[0, 1)`. Defaults to
 *   `Math.random`. Tests pass a seeded generator for deterministic behaviour.
 */
export function autoPick(
  players: Player[],
  pairs?: Array<[string, string]>,
  unknownIds?: Set<string>,
  random?: () => number,
): AutoPickResult {
  const rng = random ?? Math.random
  const n = players.length
  if (n < 2) return { suggestions: [], bestDiff: 0, poolSize: 0 }

  // Translate name-based pairs to ID-based at the top so every downstream
  // comparison can use playerId (collision-safe) rather than name.
  const nameToId = new Map<string, string>(players.map((p) => [p.name, p.playerId]))
  const idPairs: Array<[string, string | undefined]> = (pairs ?? [])
    .map(([guestName, assocName]) => {
      const guestId = nameToId.get(guestName)
      if (!guestId) return null
      return [guestId, nameToId.get(assocName)] as [string, string | undefined]
    })
    .filter((p): p is [string, string | undefined] => p !== null)

  // GK constraint: pin one GK to each team (when ≥2 GKs exist) so neither
  // team is ever left without a goalkeeper. Any additional GKs beyond the
  // two pinned ones go into searchPool and are distributed freely.
  // - 0 GKs: no pinning
  // - 1 GK: pin to Team A only
  // - 2 GKs: one pinned to each team — guaranteed opposing sides
  // - 3+ GKs: one pinned to each team, the rest distributed freely
  //
  // Guests (identified by first element of any id-pair) are excluded from the
  // GK pool — their placement is handled by pair pinning instead.
  const guestIds = new Set(idPairs.map(([g]) => g))
  const gkPlayers = [...players.filter((p) => p.mentality === 'goalkeeper' && !guestIds.has(p.playerId))]
    .sort(() => rng() - 0.5) // shuffle so pinned pair is random when 3+ GKs
  const pinnedA: Player | null = gkPlayers.length >= 1 ? gkPlayers[0] : null
  const pinnedB: Player | null = gkPlayers.length >= 2 ? gkPlayers[1] : null
  let searchPool = players.filter((p) => p !== pinnedA && p !== pinnedB)

  // Pair pinning: pin each guest+associated player to the same team.
  // Pairs alternate between Team A and Team B for balance.
  const pinnedTeamA: Player[] = []
  const pinnedTeamB: Player[] = []
  let pairTeamToggle = true

  // Accumulate pool exclusions and drop them in a single filter after the loop
  // (avoids O(n²) array rebuilding per iteration).
  const excluded = new Set<Player>()

  for (const [guestId, assocId] of idPairs) {
    const guest = searchPool.find((p) => p.playerId === guestId && !excluded.has(p))
    if (!guest) continue // guest not in pool (absent or already placed) — skip

    const assoc = assocId === undefined
      ? undefined
      : searchPool.find((p) => p.playerId === assocId && !excluded.has(p))

    if (assoc) {
      // Normal case: both in free pool. Assign by toggle, then flip.
      excluded.add(guest)
      excluded.add(assoc)
      if (pairTeamToggle) {
        pinnedTeamA.push(guest, assoc)
      } else {
        pinnedTeamB.push(guest, assoc)
      }
      pairTeamToggle = !pairTeamToggle
      continue
    }

    // Associated player not in free pool — follow them to wherever they're
    // already pinned (GK slot or a prior-pair team list). The toggle does NOT
    // flip here: only "new" pair pins advance the alternation.
    const team = findAssocTeam(assocId, pinnedA, pinnedB, pinnedTeamA, pinnedTeamB)
    if (team === 'A') {
      excluded.add(guest)
      pinnedTeamA.push(guest)
    } else if (team === 'B') {
      excluded.add(guest)
      pinnedTeamB.push(guest)
    }
    // Otherwise the associated player is absent entirely — guest stays in
    // searchPool and gets distributed freely by the split search.
  }

  // Apply all pair-pinning exclusions in one pass.
  searchPool = searchPool.filter((p) => !excluded.has(p))

  // When n is odd, randomise which team receives the extra slot. Over many games
  // this removes Team A's persistent +0.5 depth-bonus advantage.
  const extraSlotToA = n % 2 === 0 || rng() < 0.5
  const halfSize = extraSlotToA ? Math.ceil(n / 2) : Math.floor(n / 2)
  // How many non-pinned players go into Team A (clamp to 0 to avoid negative, and to searchPool.length to avoid exceeding pool)
  const sizeA = Math.max(0, Math.min(searchPool.length, halfSize - (pinnedA ? 1 : 0) - pinnedTeamA.length))

  // Generate candidate splits
  let rawSplits: [Player[], Player[]][]

  if (n <= EXHAUSTIVE_THRESHOLD) {
    rawSplits = combinations(searchPool, sizeA).map((teamASlice) => {
      const inA = new Set(teamASlice.map((p) => p.playerId))
      return [teamASlice, searchPool.filter((p) => !inA.has(p.playerId))] as [Player[], Player[]]
    })
  } else {
    // Random-sample fallback for large squads
    rawSplits = []
    for (let i = 0; i < FALLBACK_SAMPLE_COUNT; i++) {
      const shuffled = [...searchPool].sort(() => rng() - 0.5)
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

  // Count-balance filter: when unknown players are identified (guests or new players),
  // discard splits where the unknown-player count differs by more than 1 between teams.
  // This ensures unknowns are spread evenly regardless of how many there are or their order.
  // Falls back to the full scored set if no split passes (e.g. extreme small squads).
  let filteredScored = scored
  // size >= 2: with only 1 unknown, every split puts them on exactly one team
  // (|diff| always === 1), so the filter would reject all splits and fall back
  // unconditionally — skip it entirely.
  if (unknownIds && unknownIds.size >= 2) {
    const balanced = scored.filter((s) => {
      const countA = s.teamA.filter((p) => unknownIds.has(p.playerId)).length
      const countB = s.teamB.filter((p) => unknownIds.has(p.playerId)).length
      return Math.abs(countA - countB) <= COUNT_BALANCE_SLACK
    })
    if (balanced.length > 0) filteredScored = balanced
  }

  // Sort all scored splits by diff ascending, then walk with team-swap dedup
  // to collect the top SUGGESTION_COUNT unique splits. This always surfaces
  // the closest-to-50/50 splits the algorithm can find — variety is no longer
  // traded off against tightness.
  const sortedByDiff = [...filteredScored].sort((a, b) => a.diff - b.diff)
  const seen = new Set<string>()
  const suggestions: typeof sortedByDiff = []
  for (const candidate of sortedByDiff) {
    const key = [
      [...candidate.teamA].map((p) => p.playerId).sort().join(','),
      [...candidate.teamB].map((p) => p.playerId).sort().join(','),
    ].sort().join('|')
    if (!seen.has(key)) {
      seen.add(key)
      suggestions.push(candidate)
    }
    if (suggestions.length === SUGGESTION_COUNT) break
  }

  const bestDiff = suggestions.length > 0 ? suggestions[0].diff : 0

  return { suggestions, bestDiff, poolSize: 0 }
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
