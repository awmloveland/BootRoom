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
 */
export function autoPick(players: Player[]): AutoPickResult {
  const n = players.length
  if (n < 2) return { suggestions: [], bestDiff: 0, poolSize: 0 }

  // GK constraint: pin a single goalkeeper to Team A
  const gkPlayers = players.filter((p) => p.goalkeeper || p.mentality === 'goalkeeper')
  const pinnedGK: Player | null = gkPlayers.length === 1 ? gkPlayers[0] : null
  const searchPool = pinnedGK ? players.filter((p) => p !== pinnedGK) : players

  // How many non-pinned players go into Team A
  const sizeA = Math.ceil(n / 2) - (pinnedGK ? 1 : 0)

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

  // Prepend pinned GK to every Team A
  const allSplits: [Player[], Player[]][] = pinnedGK
    ? rawSplits.map(([a, b]) => [[pinnedGK, ...a], b])
    : rawSplits

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
