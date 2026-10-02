import type { AutoPickAudit, LineupRatingEntry, Player } from './types'
import { ewptScoreFromRatings, ewptScoreFromTotals, wprScore } from './utils'

/** Version of the team builder recorded with every saved lineup. Bump when the rating or picker changes. */
export const TEAM_BUILDER_VERSION = 2

export interface AutoPickSuggestion {
  teamA: Player[]
  teamB: Player[]
  scoreA: number
  scoreB: number
  diff: number
}

export interface AutoPickResult {
  suggestions: AutoPickSuggestion[]   // up to SUGGESTION_COUNT: level splits first (see autoPick), then the rest by diff; may be fewer
  bestDiff: number                    // smallest diff in the valid set, or 0 when empty
  warning?: 'uneven-teams'            // set when pair constraints make equal sizes impossible
}

// --- Split search ---
const EXHAUSTIVE_THRESHOLD = 20        // n ≤ this → try every split; above, sample
const SAMPLE_TARGET = 500              // size-valid splits collected when n > EXHAUSTIVE_THRESHOLD
const SAMPLE_MAX_ATTEMPTS = 20_000     // give up sampling after this many attempts
const SUGGESTION_COUNT = 5             // distinct splits surfaced in the UI

// --- Choosing among level splits ---
// Ratings are far noisier than the gaps between the closest splits, so every
// split within LEVEL_BAND of the best is treated as level, and the picker uses
// that freedom to make the two teams look alike.
const LEVEL_BAND = 0.5                 // team-score points; splits within this of bestDiff are treated as level
const NEWCOMER_GAMES = 5               // players with fewer games than this count as newcomers when spreading them

/** Running totals for one side of a split. */
interface SideTotals {
  size: number
  ratingSum: number
  keepers: number
  keeperRatingSum: number
  unknowns: number
  newcomers: number
}

/**
 * Players who must share a side. A host and their present guests form one
 * unit; everyone else is a unit of one. Unit 0 always contains player 0.
 */
interface Units {
  count: number
  unitOf: number[]                     // player index → unit index
  stats: SideTotals[]                  // totals per unit
}

/** Every split of the squad, enumerated or sampled. */
interface SplitSource {
  /** Calls `visit` once per split with the totals of side A. `a` is reused between calls. */
  forEach(visit: (ref: number, a: SideTotals) => void): void
  /** Which side each unit is on for split `ref`: 1 = side A. */
  side(ref: number): Uint8Array
}

interface Candidate {
  ref: number
  diff: number
  newcomerGap: number
  profileGap: number
}

/**
 * Given the players attending, return up to SUGGESTION_COUNT (5) distinct
 * balanced team splits.
 *
 * Identity is the array index, so two players who share a name or playerId are
 * both kept. Splits must satisfy, strictly in this order:
 *  1. Sizes: equal teams for even n, one apart for odd n. If guests tied to one
 *     host make that impossible, the smallest achievable gap is used and the
 *     result carries `warning: 'uneven-teams'`.
 *  2. Keepers: the smallest achievable gap in goalkeepers between the teams,
 *     guests and new players included.
 *  3. Unknowns: the smallest achievable gap in `unknownIds` players.
 * The splits that survive are the valid set; `bestDiff` is its smallest team
 * score gap.
 *
 * Every valid split within LEVEL_BAND of `bestDiff` is treated as level and
 * ordered by newcomer gap, then by how alike the two teams' rating profiles
 * are, then by diff. Suggestions are therefore not sorted by diff, and
 * `suggestions[0].diff` can exceed `bestDiff` by up to LEVEL_BAND. If the band
 * holds fewer than five distinct splits, the rest of the valid set follows in
 * diff order.
 *
 * Squads of up to 20 are searched exhaustively, so the teams for a given squad
 * are the same on every call; only a final coin flip for which side is called
 * Team A uses `random`. Larger squads are sampled.
 *
 * @param pairs - `[guestName, hostName]` pairs. Each guest is kept on their
 *   host's team. Pairs whose guest or host is absent are ignored.
 * @param unknownIds - `playerId`s of guests, new players and zero-game
 *   players, spread evenly between the teams.
 * @param random - RNG returning `[0, 1)`. Defaults to `Math.random`. Tests pass
 *   a seeded generator for deterministic behaviour.
 */
export function autoPick(
  players: Player[],
  pairs?: Array<[string, string]>,
  unknownIds?: Set<string>,
  random?: () => number,
): AutoPickResult {
  const rng = random ?? Math.random
  const n = players.length
  if (n < 2) return { suggestions: [], bestDiff: 0 }

  const unknown = unknownIds ?? new Set<string>()
  const ratings = players.map((p) => wprScore(p))
  const units = buildUnits(players, ratings, pairs ?? [], unknown)
  const total = sumTotals(units.stats)
  const { sizes: targetSizes, gap: sizeGap } = acceptableSizes(units.stats.map((u) => u.size), n)
  const warning = sizeGap > n % 2 ? { warning: 'uneven-teams' as const } : {}

  const source = n <= EXHAUSTIVE_THRESHOLD
    ? enumerateSplits(units)
    : sampleSplits(units, targetSizes, rng)

  const keeperGap = (a: SideTotals) => Math.abs(2 * a.keepers - total.keepers)
  const unknownGap = (a: SideTotals) => Math.abs(2 * a.unknowns - total.unknowns)
  const splitDiff = (a: SideTotals) => Math.abs(
    ewptScoreFromTotals(a.size, a.ratingSum, a.keepers, a.keeperRatingSum) -
    ewptScoreFromTotals(
      total.size - a.size,
      total.ratingSum - a.ratingSum,
      total.keepers - a.keepers,
      total.keeperRatingSum - a.keeperRatingSum,
    ),
  )

  // Pass 1: the smallest keeper gap, then unknown gap, then diff.
  let minKeeperGap = Infinity
  let minUnknownGap = Infinity
  let bestDiff = Infinity
  source.forEach((_, a) => {
    if (Math.abs(2 * a.size - n) !== sizeGap) return
    const k = keeperGap(a)
    const u = unknownGap(a)
    if (k < minKeeperGap || (k === minKeeperGap && u < minUnknownGap)) {
      minKeeperGap = k
      minUnknownGap = u
      bestDiff = Infinity
    }
    if (k === minKeeperGap && u === minUnknownGap) bestDiff = Math.min(bestDiff, splitDiff(a))
  })
  if (bestDiff === Infinity) return { suggestions: [], bestDiff: 0, ...warning }

  const isValid = (a: SideTotals) =>
    Math.abs(2 * a.size - n) === sizeGap && keeperGap(a) === minKeeperGap && unknownGap(a) === minUnknownGap

  // Pass 2: the band of level splits, ordered to make the teams look alike.
  const byRatingDesc = players.map((_, i) => i).sort((x, y) => ratings[y] - ratings[x] || x - y)
  const band: Candidate[] = []
  source.forEach((ref, a) => {
    if (!isValid(a)) return
    const diff = splitDiff(a)
    if (diff > bestDiff + LEVEL_BAND) return
    const newcomerGap = Math.abs(2 * a.newcomers - total.newcomers)
    band.push({ ref, diff, newcomerGap, profileGap: 0 })
  })
  for (const c of band) c.profileGap = profileGap(source.side(c.ref), units.unitOf, byRatingDesc, ratings)
  band.sort((x, y) => x.newcomerGap - y.newcomerGap || x.profileGap - y.profileGap || x.diff - y.diff)

  const keys = playerKeys(players, ratings, units, unknown)
  const chosen: Uint8Array[] = []
  const seen = new Set<string>()
  const take = (candidates: Candidate[]) => {
    for (const c of candidates) {
      if (chosen.length === SUGGESTION_COUNT) return
      const side = source.side(c.ref)
      const key = partitionKey(side, units.unitOf, keys)
      if (seen.has(key)) continue
      seen.add(key)
      chosen.push(side)
    }
  }
  take(band)

  // Pass 3, only when the band runs out: the rest of the valid set by diff.
  if (chosen.length < SUGGESTION_COUNT) {
    const rest: Candidate[] = []
    source.forEach((ref, a) => {
      if (!isValid(a)) return
      const diff = splitDiff(a)
      if (diff > bestDiff + LEVEL_BAND) rest.push({ ref, diff, newcomerGap: 0, profileGap: 0 })
    })
    rest.sort((x, y) => x.diff - y.diff)
    take(rest)
  }

  // Goalkeepers first, then everyone else, each in input order.
  const listOrder = [
    ...players.map((_, i) => i).filter((i) => players[i].mentality === 'goalkeeper'),
    ...players.map((_, i) => i).filter((i) => players[i].mentality !== 'goalkeeper'),
  ]
  // One coin decides which side is called Team A, for every suggestion together.
  const swapSides = rng() < 0.5
  const suggestions = chosen.map((side): AutoPickSuggestion => {
    const a = listOrder.filter((i) => side[units.unitOf[i]] === 1)
    const b = listOrder.filter((i) => side[units.unitOf[i]] === 0)
    const [first, second] = swapSides ? [b, a] : [a, b]
    const teamA = first.map((i) => players[i])
    const teamB = second.map((i) => players[i])
    const scoreA = ewptScoreFromRatings(teamA, first.map((i) => ratings[i]))
    const scoreB = ewptScoreFromRatings(teamB, second.map((i) => ratings[i]))
    return { teamA, teamB, scoreA, scoreB, diff: Math.abs(scoreA - scoreB) }
  })

  return { suggestions, bestDiff, ...warning }
}

/**
 * Groups players into units. Each `[guestName, hostName]` pair resolves to
 * indices once: the guest is the first index with that name not already taken
 * as an earlier pair's guest; the host is the first index with that name.
 * Chains (a host who is also someone's guest) collapse into one unit.
 */
function buildUnits(
  players: Player[],
  ratings: number[],
  pairs: Array<[string, string]>,
  unknownIds: Set<string>,
): Units {
  const parent = players.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]]
    return i
  }
  const takenGuests = new Set<number>()
  for (const [guestName, hostName] of pairs) {
    const guest = players.findIndex((p, i) => p.name === guestName && !takenGuests.has(i))
    const host = players.findIndex((p) => p.name === hostName)
    if (guest < 0 || host < 0 || guest === host) continue
    takenGuests.add(guest)
    parent[find(guest)] = find(host)
  }

  const unitOfRoot = new Map<number, number>()
  const unitOf: number[] = []
  const stats: SideTotals[] = []
  players.forEach((p, i) => {
    const root = find(i)
    let unit = unitOfRoot.get(root)
    if (unit === undefined) {
      unit = stats.length
      unitOfRoot.set(root, unit)
      stats.push(emptyTotals())
    }
    unitOf.push(unit)
    const s = stats[unit]
    s.size++
    s.ratingSum += ratings[i]
    if (p.mentality === 'goalkeeper') {
      s.keepers++
      s.keeperRatingSum += ratings[i]
    }
    if (unknownIds.has(p.playerId)) s.unknowns++
    if (p.played < NEWCOMER_GAMES) s.newcomers++
  })
  return { count: stats.length, unitOf, stats }
}

function emptyTotals(): SideTotals {
  return { size: 0, ratingSum: 0, keepers: 0, keeperRatingSum: 0, unknowns: 0, newcomers: 0 }
}

function sumTotals(stats: SideTotals[]): SideTotals {
  const t = emptyTotals()
  for (const s of stats) addTotals(t, s)
  return t
}

function addTotals(into: SideTotals, s: SideTotals): void {
  into.size += s.size
  into.ratingSum += s.ratingSum
  into.keepers += s.keepers
  into.keeperRatingSum += s.keeperRatingSum
  into.unknowns += s.unknowns
  into.newcomers += s.newcomers
}

/**
 * Sizes side A can take that bring the two teams closest to equal, found by a
 * subset-sum over unit sizes. `gap` is the resulting |sizeA - sizeB|.
 */
function acceptableSizes(unitSizes: number[], n: number): { sizes: number[]; gap: number } {
  const reachable = new Uint8Array(n + 1)
  reachable[0] = 1
  for (const s of unitSizes) {
    for (let t = n; t >= s; t--) if (reachable[t - s]) reachable[t] = 1
  }
  let gap = Infinity
  for (let t = 0; t <= n; t++) if (reachable[t]) gap = Math.min(gap, Math.abs(2 * t - n))
  const sizes: number[] = []
  for (let t = 0; t <= n; t++) if (reachable[t] && Math.abs(2 * t - n) === gap) sizes.push(t)
  return { sizes, gap }
}

/**
 * Every partition of the units, each once: unit 0 is always on side A and bit
 * j of the mask puts unit j + 1 on side A. Side totals come from two lookup
 * tables (low and high halves of the mask), so no split is ever built.
 */
function enumerateSplits(units: Units): SplitSource {
  const m = units.count - 1
  const loBits = Math.ceil(m / 2)
  const lo = totalsTable(units.stats, 1, loBits)
  const hi = totalsTable(units.stats, 1 + loBits, m - loBits)
  const loMask = (1 << loBits) - 1
  const first = units.stats[0]
  const a = emptyTotals()
  return {
    forEach(visit) {
      const end = 1 << m
      for (let mask = 0; mask < end; mask++) {
        const l = mask & loMask
        const h = mask >>> loBits
        a.size = first.size + lo.size[l] + hi.size[h]
        a.ratingSum = first.ratingSum + lo.ratingSum[l] + hi.ratingSum[h]
        a.keepers = first.keepers + lo.keepers[l] + hi.keepers[h]
        a.keeperRatingSum = first.keeperRatingSum + lo.keeperRatingSum[l] + hi.keeperRatingSum[h]
        a.unknowns = first.unknowns + lo.unknowns[l] + hi.unknowns[h]
        a.newcomers = first.newcomers + lo.newcomers[l] + hi.newcomers[h]
        visit(mask, a)
      }
    },
    side(mask) {
      const side = new Uint8Array(units.count)
      side[0] = 1
      for (let j = 0; j < m; j++) side[j + 1] = (mask >>> j) & 1
      return side
    },
  }
}

/** Totals for every subset of `bits` consecutive units starting at `start`, indexed by bitmask. */
function totalsTable(stats: SideTotals[], start: number, bits: number) {
  const len = 1 << bits
  const t = {
    size: new Int32Array(len),
    ratingSum: new Float64Array(len),
    keepers: new Int32Array(len),
    keeperRatingSum: new Float64Array(len),
    unknowns: new Int32Array(len),
    newcomers: new Int32Array(len),
  }
  for (let mask = 1; mask < len; mask++) {
    const low = mask & -mask
    const prev = mask ^ low
    const s = stats[start + 31 - Math.clz32(low)]
    t.size[mask] = t.size[prev] + s.size
    t.ratingSum[mask] = t.ratingSum[prev] + s.ratingSum
    t.keepers[mask] = t.keepers[prev] + s.keepers
    t.keeperRatingSum[mask] = t.keeperRatingSum[prev] + s.keeperRatingSum
    t.unknowns[mask] = t.unknowns[prev] + s.unknowns
    t.newcomers[mask] = t.newcomers[prev] + s.newcomers
  }
  return t
}

/**
 * A sample of size-valid splits for large squads: shuffle the units, pick a
 * target size for side A, and add units in shuffled order while they fit.
 * Attempts that miss the target are discarded.
 */
function sampleSplits(units: Units, targetSizes: number[], rng: () => number): SplitSource {
  const samples: Uint8Array[] = []
  const order = Array.from({ length: units.count }, (_, j) => j)
  for (let attempt = 0; attempt < SAMPLE_MAX_ATTEMPTS && samples.length < SAMPLE_TARGET; attempt++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const target = targetSizes.length === 1
      ? targetSizes[0]
      : targetSizes[Math.floor(rng() * targetSizes.length)]
    const side = new Uint8Array(units.count)
    let size = 0
    for (const j of order) {
      if (size + units.stats[j].size > target) continue
      side[j] = 1
      size += units.stats[j].size
    }
    if (size === target) samples.push(side)
  }
  return {
    forEach(visit) {
      samples.forEach((side, ref) => {
        const a = emptyTotals()
        side.forEach((onA, j) => { if (onA) addTotals(a, units.stats[j]) })
        visit(ref, a)
      })
    },
    side: (ref) => samples[ref],
  }
}

/**
 * How alike two teams look: sort each team's ratings from best to worst and
 * sum the gaps between the k-th best players on each side.
 */
function profileGap(side: Uint8Array, unitOf: number[], byRatingDesc: number[], ratings: number[]): number {
  const a: number[] = []
  const b: number[] = []
  for (const i of byRatingDesc) (side[unitOf[i]] ? a : b).push(ratings[i])
  let gap = 0
  for (let k = 0; k < Math.min(a.length, b.length); k++) gap += Math.abs(a[k] - b[k])
  return gap
}

/** Key classes for spotting duplicate suggestions (see `partitionKey`). */
interface PlayerKeys {
  classOf: number[]                    // player index → key class
  totals: number[]                     // players per key class
}

/**
 * Key class per player for spotting duplicate suggestions: each player is
 * their own class (identity is the array index), except free unknowns (an
 * unknown in a unit of one), who share a class with every other free unknown
 * of the same rating and mentality, since swapping them changes nothing.
 */
function playerKeys(players: Player[], ratings: number[], units: Units, unknownIds: Set<string>): PlayerKeys {
  const freeClass = new Map<string, number>()
  const totals: number[] = []
  const classOf = players.map((p, i) => {
    const free = unknownIds.has(p.playerId) && units.stats[units.unitOf[i]].size === 1
    let cls = free ? freeClass.get(`${ratings[i]}|${p.mentality}`) : undefined
    if (cls === undefined) {
      cls = totals.length
      totals.push(0)
      if (free) freeClass.set(`${ratings[i]}|${p.mentality}`, cls)
    }
    totals[cls]++
    return cls
  })
  return { classOf, totals }
}

/**
 * Same key for two splits whose teams match as an unordered pair of multisets
 * of key classes: each side is written as its count per class.
 */
function partitionKey(side: Uint8Array, unitOf: number[], keys: PlayerKeys): string {
  const countA = new Array<number>(keys.totals.length).fill(0)
  keys.classOf.forEach((cls, i) => { if (side[unitOf[i]]) countA[cls]++ })
  const a = countA.join(',')
  const b = countA.map((c, cls) => keys.totals[cls] - c).join(',')
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

const round3 = (x: number) => Math.round(x * 1000) / 1000

/**
 * The audit block and per-player ratings saved with a lineup, so a lineup can
 * later be explained: which suggestion was used, whether it was changed by
 * hand, and the ratings the picker saw.
 */
export function buildLineupAudit(params: {
  teamA: Player[]
  teamB: Player[]
  teamARating: number
  teamBRating: number
  bestDiff: number
  suggestionIndex: number
  suggestionCount: number
  edited: boolean
  builtAt: Date
}): { autoPick: AutoPickAudit; ratings: LineupRatingEntry[] } {
  const entry = (team: 'A' | 'B') => (p: Player): LineupRatingEntry => ({
    name: p.name,
    team,
    wpr: round3(wprScore(p)),
    strength: p.strength,
    played: p.played,
    gamesMissed: p.gamesMissed ?? 0,
    kind: p.playerId.startsWith('guest|') ? 'guest' : p.playerId.startsWith('new|') ? 'new' : 'roster',
  })
  return {
    autoPick: {
      algorithm: TEAM_BUILDER_VERSION,
      suggestionIndex: params.suggestionIndex,
      suggestionCount: params.suggestionCount,
      edited: params.edited,
      bestDiff: round3(params.bestDiff),
      savedDiff: round3(Math.abs(params.teamARating - params.teamBRating)),
      builtAt: params.builtAt.toISOString(),
    },
    ratings: [...params.teamA.map(entry('A')), ...params.teamB.map(entry('B'))],
  }
}
