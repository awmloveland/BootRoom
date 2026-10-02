import { autoPick, type AutoPickResult, type AutoPickSuggestion } from '@/lib/autoPick'
import type { Player } from '@/lib/types'
import { ewptScore, ewptScoreFromRatings, wprScore } from '@/lib/utils'
import { seededRng } from './helpers/seeded-rng'
import { makePlayer, ratedPlayer } from './helpers/players'

// seededRng's first draw is below 0.5 for every seed from 0 to 200, so tests
// that depend on the Team A / Team B coin use well-spread seeds.
const spreadRng = (i: number) => seededRng(i * 7919)
const SEEDS = Array.from({ length: 50 }, (_, i) => i + 1)

// ─── Helpers ─────────────────────────────────────────────────────────────────

function onSameTeam(s: AutoPickSuggestion, a: Player, b: Player): boolean {
  return s.teamA.includes(a) === s.teamA.includes(b)
}

/** Partition key by object identity, ignoring which side is called A. */
function partitionKey(players: Player[], s: { teamA: Player[]; teamB: Player[] }): string {
  const side = (team: Player[]) => team.map((p) => players.indexOf(p)).sort((x, y) => x - y).join(',')
  return [side(s.teamA), side(s.teamB)].sort().join('|')
}

function count(team: Player[], pred: (p: Player) => boolean): number {
  return team.filter(pred).length
}

const isKeeper = (p: Player) => p.mentality === 'goalkeeper'

/** A squad of `n` veterans with spread ratings. */
function squad(n: number, rng: () => number = seededRng(n)): Player[] {
  return Array.from({ length: n }, (_, i) => ratedPlayer(`P${i}`, 30 + rng() * 25))
}

/**
 * Reference implementation of the valid set (7.2 steps 3 to 5) by brute force
 * over every assignment. Only for small squads.
 */
function bruteForceValid(players: Player[], pairs: Array<[string, string]> = [], unknownIds = new Set<string>()) {
  const n = players.length
  const parent = players.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const takenGuests = new Set<number>()
  for (const [g, h] of pairs) {
    const gi = players.findIndex((p, i) => p.name === g && !takenGuests.has(i))
    const hi = players.findIndex((p) => p.name === h)
    if (gi < 0 || hi < 0 || gi === hi) continue
    takenGuests.add(gi)
    parent[find(gi)] = find(hi)
  }
  const splits: Array<{ a: Player[]; b: Player[]; diff: number; sizeGap: number; k: number; u: number }> = []
  for (let mask = 0; mask < 1 << n; mask++) {
    if (!(mask & 1)) continue // fix player 0 on A
    const inA = (i: number) => ((mask >> i) & 1) === 1
    let together = true
    for (let i = 0; i < n; i++) if (inA(i) !== inA(find(i))) together = false
    if (!together) continue
    const a = players.filter((_, i) => inA(i))
    const b = players.filter((_, i) => !inA(i))
    splits.push({
      a, b,
      diff: Math.abs(ewptScore(a) - ewptScore(b)),
      sizeGap: Math.abs(a.length - b.length),
      k: Math.abs(count(a, isKeeper) - count(b, isKeeper)),
      u: Math.abs(count(a, (p) => unknownIds.has(p.playerId)) - count(b, (p) => unknownIds.has(p.playerId))),
    })
  }
  const minSize = Math.min(...splits.map((s) => s.sizeGap))
  const bySize = splits.filter((s) => s.sizeGap === minSize)
  const minK = Math.min(...bySize.map((s) => s.k))
  const byK = bySize.filter((s) => s.k === minK)
  const minU = Math.min(...byK.map((s) => s.u))
  return byK.filter((s) => s.u === minU)
}

function expectEveryPlayerOnce(players: Player[], result: AutoPickResult) {
  for (const s of result.suggestions) {
    const all = [...s.teamA, ...s.teamB]
    expect(all).toHaveLength(players.length)
    for (const p of players) expect(all.filter((q) => q === p)).toHaveLength(1)
  }
}

// ─── Basics ──────────────────────────────────────────────────────────────────

describe('autoPick — basics', () => {
  it('returns nothing for fewer than two players', () => {
    expect(autoPick([])).toEqual({ suggestions: [], bestDiff: 0 })
    expect(autoPick([ratedPlayer('Solo', 40)])).toEqual({ suggestions: [], bestDiff: 0 })
  })

  it('returns fewer than five suggestions when fewer distinct splits exist', () => {
    // 4 players → 3 distinct 2 v 2 partitions.
    const players = squad(4)
    const result = autoPick(players, undefined, undefined, seededRng(1))
    expect(result.suggestions).toHaveLength(3)
    expect(new Set(result.suggestions.map((s) => partitionKey(players, s))).size).toBe(3)
  })

  it('returns five distinct suggestions for a normal squad', () => {
    const players = squad(10)
    const result = autoPick(players, undefined, undefined, seededRng(1))
    expect(result.suggestions).toHaveLength(5)
    expect(new Set(result.suggestions.map((s) => partitionKey(players, s))).size).toBe(5)
  })
})

// ─── 7.9 acceptance tests ────────────────────────────────────────────────────

describe('autoPick — 1. every player once', () => {
  it('places each input object exactly once for random squads of 2 to 20 players', () => {
    const rng = seededRng(2026)
    for (let n = 2; n <= 20; n++) {
      const players = Array.from({ length: n }, (_, i) =>
        ratedPlayer(`P${i}`, 25 + rng() * 30, { mentality: rng() < 0.15 ? 'goalkeeper' : 'balanced' }),
      )
      // A few guests attached to random hosts.
      const pairs: Array<[string, string]> = []
      for (let i = 1; i < n; i++) {
        if (rng() < 0.15) pairs.push([players[i].name, players[Math.floor(rng() * i)].name])
      }
      const unknownIds = new Set(players.filter(() => rng() < 0.2).map((p) => p.playerId))
      const result = autoPick(players, pairs, unknownIds, seededRng(n))
      expect(result.suggestions.length).toBeGreaterThan(0)
      expectEveryPlayerOnce(players, result)
    }
  })
})

describe('autoPick — 2. duplicate ids', () => {
  it('keeps both of two free players who share a playerId and name', () => {
    const players = squad(12)
    const twinA = ratedPlayer('Tom', 40)
    const twinB = ratedPlayer('Tom', 45)
    expect(twinA.playerId).toBe(twinB.playerId)
    const all = [...players, twinA, twinB]
    const result = autoPick(all, undefined, undefined, seededRng(3))
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA).toHaveLength(7)
      expect(s.teamB).toHaveLength(7)
    }
    expectEveryPlayerOnce(all, result)
  })
})

describe('autoPick — 3. equal sizes', () => {
  it.each([4, 6, 10, 14, 18])('even n=%d gives equal teams', (n) => {
    const result = autoPick(squad(n), undefined, undefined, seededRng(n))
    for (const s of result.suggestions) expect(s.teamA.length).toBe(s.teamB.length)
  })

  it.each([3, 5, 9, 11, 15])('odd n=%d gives sizes differing by exactly one', (n) => {
    const result = autoPick(squad(n), undefined, undefined, seededRng(n))
    for (const s of result.suggestions) expect(Math.abs(s.teamA.length - s.teamB.length)).toBe(1)
  })
})

describe('autoPick — 4. guest with host', () => {
  it('keeps two guests of one host on the host’s team in every suggestion', () => {
    const players = squad(8)
    const host = players[0]
    const g1 = makePlayer('P0 +1', { playerId: 'guest|P0 +1' })
    const g2 = makePlayer('P0 +2', { playerId: 'guest|P0 +2' })
    const all = [...players, g1, g2]
    const pairs: Array<[string, string]> = [['P0 +1', 'P0'], ['P0 +2', 'P0']]
    for (const seed of SEEDS) {
      const result = autoPick(all, pairs, undefined, spreadRng(seed))
      expect(result.suggestions.length).toBeGreaterThan(0)
      for (const s of result.suggestions) {
        expect(onSameTeam(s, host, g1)).toBe(true)
        expect(onSameTeam(s, host, g2)).toBe(true)
      }
    }
  })

  it('keeps a guest with a goalkeeper host', () => {
    const gk1 = ratedPlayer('GK1', 40, { mentality: 'goalkeeper' })
    const gk2 = ratedPlayer('GK2', 40, { mentality: 'goalkeeper' })
    const guest = makePlayer('GK1 +1', { playerId: 'guest|GK1 +1' })
    const all = [gk1, gk2, guest, ...squad(7)]
    const result = autoPick(all, [['GK1 +1', 'GK1']], undefined, seededRng(4))
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(onSameTeam(s, gk1, guest)).toBe(true)
      expect(onSameTeam(s, gk1, gk2)).toBe(false)
    }
  })
})

describe('autoPick — 5. guest keeper', () => {
  it('puts a guest keeper and the roster keeper on opposite teams for every seed', () => {
    const rosterGk = ratedPlayer('Keeper', 40, { mentality: 'goalkeeper' })
    const outfield = squad(8)
    const guestGk = makePlayer('P3 +1', { playerId: 'guest|P3 +1', mentality: 'goalkeeper' })
    const all = [rosterGk, ...outfield, guestGk]
    for (const seed of SEEDS) {
      const result = autoPick(all, [['P3 +1', 'P3']], new Set([guestGk.playerId]), spreadRng(seed))
      expect(result.suggestions.length).toBeGreaterThan(0)
      for (const s of result.suggestions) expect(onSameTeam(s, rosterGk, guestGk)).toBe(false)
    }
  })
})

describe('autoPick — 6. forced keeper pair', () => {
  it('keeps a guest keeper with their keeper host and does not throw', () => {
    const rosterGk = ratedPlayer('Keeper', 40, { mentality: 'goalkeeper' })
    const guestGk = makePlayer('Keeper +1', { playerId: 'guest|Keeper +1', mentality: 'goalkeeper' })
    const all = [rosterGk, guestGk, ...squad(8)]
    const result = autoPick(all, [['Keeper +1', 'Keeper']], new Set([guestGk.playerId]), seededRng(6))
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) expect(onSameTeam(s, rosterGk, guestGk)).toBe(true)
  })
})

describe('autoPick — 7. keeper counts', () => {
  const withKeepers = (k: number, n: number) => [
    ...Array.from({ length: k }, (_, i) => ratedPlayer(`GK${i}`, 35 + i * 3, { mentality: 'goalkeeper' })),
    ...squad(n - k),
  ]

  it('splits three keepers 2 and 1', () => {
    const result = autoPick(withKeepers(3, 10), undefined, undefined, seededRng(7))
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect([count(s.teamA, isKeeper), count(s.teamB, isKeeper)].sort()).toEqual([1, 2])
    }
  })

  it('splits four keepers 2 and 2', () => {
    const result = autoPick(withKeepers(4, 10), undefined, undefined, seededRng(7))
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(count(s.teamA, isKeeper)).toBe(2)
      expect(count(s.teamB, isKeeper)).toBe(2)
    }
  })

  it('allows a single keeper', () => {
    const result = autoPick(withKeepers(1, 10), undefined, undefined, seededRng(7))
    expect(result.suggestions).toHaveLength(5)
  })
})

describe('autoPick — 8. unknown balance', () => {
  it('splits four free unknowns 2 and 2', () => {
    const newcomers = Array.from({ length: 4 }, (_, i) => makePlayer(`New${i}`, { playerId: `new|New${i}` }))
    const all = [...squad(6), ...newcomers]
    const unknownIds = new Set(newcomers.map((p) => p.playerId))
    for (const seed of SEEDS.slice(0, 10)) {
      const result = autoPick(all, undefined, unknownIds, spreadRng(seed))
      expect(result.suggestions.length).toBeGreaterThan(0)
      for (const s of result.suggestions) {
        expect(count(s.teamA, (p) => unknownIds.has(p.playerId))).toBe(2)
      }
    }
  })

  it('puts a keeper’s guest and an outfielder’s guest on opposite teams when they are the only unknowns', () => {
    const keeper = ratedPlayer('Keeper', 40, { mentality: 'goalkeeper' })
    const outfield = squad(7)
    const gGuest = makePlayer('Keeper +1', { playerId: 'guest|Keeper +1' })
    const oGuest = makePlayer('P2 +1', { playerId: 'guest|P2 +1' })
    const all = [keeper, ...outfield, gGuest, oGuest]
    const pairs: Array<[string, string]> = [['Keeper +1', 'Keeper'], ['P2 +1', 'P2']]
    const unknownIds = new Set([gGuest.playerId, oGuest.playerId])
    const result = autoPick(all, pairs, unknownIds, seededRng(8))
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) expect(onSameTeam(s, gGuest, oGuest)).toBe(false)
  })
})

describe('autoPick — 9. oversized unit', () => {
  it('fits one host with four guests into 5 v 5 for every seed', () => {
    const keeper = ratedPlayer('Keeper', 40, { mentality: 'goalkeeper' })
    const host = ratedPlayer('Host', 45)
    const guests = Array.from({ length: 4 }, (_, i) => makePlayer(`Host +${i + 1}`, { playerId: `guest|Host +${i + 1}` }))
    const all = [keeper, host, ...guests, ...squad(4)]
    const pairs = guests.map((g) => [g.name, 'Host'] as [string, string])
    for (const seed of SEEDS) {
      const result = autoPick(all, pairs, new Set(guests.map((g) => g.playerId)), spreadRng(seed))
      expect(result.warning).toBeUndefined()
      expect(result.suggestions).toHaveLength(1)
      expect(result.suggestions[0].teamA).toHaveLength(5)
      expect(result.suggestions[0].teamB).toHaveLength(5)
    }
  })

  it('warns and plays 6 v 4 when one host brings five guests', () => {
    const host = ratedPlayer('Host', 45)
    const guests = Array.from({ length: 5 }, (_, i) => makePlayer(`Host +${i + 1}`, { playerId: `guest|Host +${i + 1}` }))
    const all = [host, ...guests, ...squad(4)]
    const pairs = guests.map((g) => [g.name, 'Host'] as [string, string])
    const result = autoPick(all, pairs, new Set(guests.map((g) => g.playerId)), seededRng(9))
    expect(result.warning).toBe('uneven-teams')
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect([s.teamA.length, s.teamB.length].sort()).toEqual([4, 6])
      expect(onSameTeam(s, host, guests[4])).toBe(true)
    }
  })
})

describe('autoPick — 10. seed independence', () => {
  it.each([9, 12, 14])('returns the same partitions for every seed (n=%d)', (n) => {
    const players = squad(n)
    players[0].mentality = 'goalkeeper'
    const keys = (seed: number) =>
      autoPick(players, undefined, undefined, spreadRng(seed)).suggestions.map((s) => partitionKey(players, s)).sort().join(' / ')
    const first = keys(1)
    for (const seed of SEEDS) expect(keys(seed)).toBe(first)
  })
})

describe('autoPick — 11. input-order independence', () => {
  it('finds the same bestDiff when the input array is shuffled', () => {
    const players = squad(12)
    players[3].mentality = 'goalkeeper'
    players[8].mentality = 'goalkeeper'
    const base = autoPick(players, undefined, undefined, seededRng(1)).bestDiff
    const rng = seededRng(11)
    for (let t = 0; t < 10; t++) {
      const shuffled = [...players]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      expect(autoPick(shuffled, undefined, undefined, seededRng(t)).bestDiff).toBeCloseTo(base, 9)
    }
  })
})

describe('autoPick — 12. band', () => {
  const newcomerGap = (s: { teamA: Player[]; teamB: Player[] }) =>
    Math.abs(count(s.teamA, (p) => p.played < 5) - count(s.teamB, (p) => p.played < 5))

  it.each([1, 2, 3, 4, 5])('bestDiff is the brute-force minimum and suggestions come from the band (case %d)', (seed) => {
    const rng = seededRng(seed * 101)
    const players = Array.from({ length: 10 }, (_, i) =>
      i < 3
        ? makePlayer(`New${i}`, { played: i, points: i * 2, strength: (['below', 'average', 'above'] as const)[i] })
        : ratedPlayer(`P${i}`, 30 + rng() * 20, { mentality: i === 3 ? 'goalkeeper' : 'balanced' }),
    )
    const valid = bruteForceValid(players)
    const minDiff = Math.min(...valid.map((s) => s.diff))
    const result = autoPick(players, undefined, undefined, seededRng(seed))
    expect(result.bestDiff).toBeCloseTo(minDiff, 9)

    const band = valid.filter((s) => s.diff <= minDiff + 0.5)
    const bandKeys = new Set(band.map((s) => partitionKey(players, { teamA: s.a, teamB: s.b })))
    // These squads have a band of at least five distinct splits, so every
    // suggestion must come from it.
    expect(bandKeys.size).toBeGreaterThanOrEqual(5)
    expect(result.suggestions).toHaveLength(5)
    for (const s of result.suggestions) {
      expect(bandKeys.has(partitionKey(players, s))).toBe(true)
      expect(s.diff).toBeLessThanOrEqual(result.bestDiff + 0.5 + 1e-9)
    }
    expect(newcomerGap(result.suggestions[0])).toBe(Math.min(...band.map((s) => newcomerGap({ teamA: s.a, teamB: s.b }))))
  })

  it('falls back to the rest of the valid set by diff when the band is small', () => {
    // Two strong, two weak and two middling players: few splits are level.
    const players = [ratedPlayer('S1', 80), ratedPlayer('S2', 80), ratedPlayer('W1', 20), ratedPlayer('W2', 20), ratedPlayer('M1', 50), ratedPlayer('M2', 55)]
    const result = autoPick(players, undefined, undefined, seededRng(12))
    expect(result.suggestions).toHaveLength(5)
    const diffs = result.suggestions.map((s) => s.diff)
    const outside = diffs.filter((d) => d > result.bestDiff + 0.5)
    expect(outside.length).toBeGreaterThan(0)
    // Band suggestions come first, then the rest by diff ascending.
    expect(diffs.slice(diffs.length - outside.length)).toEqual(outside)
    for (let i = 1; i < outside.length; i++) expect(outside[i]).toBeGreaterThanOrEqual(outside[i - 1])
  })
})

describe('autoPick — 13. interchangeable newcomers', () => {
  it('does not return two suggestions that differ only by swapping identical newcomers', () => {
    const newcomers = Array.from({ length: 4 }, (_, i) => makePlayer(`New${i}`, { playerId: `new|New${i}` }))
    const all = [...squad(10), ...newcomers]
    const unknownIds = new Set(newcomers.map((p) => p.playerId))
    const result = autoPick(all, undefined, unknownIds, seededRng(13))
    const canonical = (s: AutoPickSuggestion) => {
      const side = (team: Player[]) =>
        team.map((p) => (unknownIds.has(p.playerId) ? 'new' : String(all.indexOf(p)))).sort().join(',')
      return [side(s.teamA), side(s.teamB)].sort().join('|')
    }
    const keys = result.suggestions.map(canonical)
    expect(keys).toHaveLength(5)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('autoPick — 14. labels and order', () => {
  it('puts a lone keeper on Team A between 30% and 70% of the time', () => {
    const players = [ratedPlayer('Keeper', 40, { mentality: 'goalkeeper' }), ...squad(9)]
    let onA = 0
    for (let i = 1; i <= 200; i++) {
      const s = autoPick(players, undefined, undefined, spreadRng(i)).suggestions[0]
      if (s.teamA.includes(players[0])) onA++
    }
    expect(onA).toBeGreaterThanOrEqual(60)
    expect(onA).toBeLessThanOrEqual(140)
  })

  it('lists goalkeepers first, then everyone else in input order', () => {
    const players = [
      ...squad(4),
      ratedPlayer('GK1', 40, { mentality: 'goalkeeper' }),
      ...squad(4, seededRng(99)).map((p, i) => ({ ...p, name: `Q${i}`, playerId: `known|Q${i}` })),
      ratedPlayer('GK2', 41, { mentality: 'goalkeeper' }),
    ]
    const result = autoPick(players, undefined, undefined, seededRng(14))
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      for (const team of [s.teamA, s.teamB]) {
        const keepers = team.filter(isKeeper)
        expect(team.slice(0, keepers.length)).toEqual(keepers)
        const rest = team.slice(keepers.length).map((p) => players.indexOf(p))
        expect(rest).toEqual([...rest].sort((a, b) => a - b))
      }
    }
  })
})

describe('autoPick — 15. score consistency', () => {
  it('reports scores equal to ewptScore of each team', () => {
    const players = [ratedPlayer('Keeper', 40, { mentality: 'goalkeeper' }), ...squad(9), makePlayer('New', { playerId: 'new|New' })]
    const result = autoPick(players, undefined, new Set(['new|New']), seededRng(15))
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.scoreA).toBeCloseTo(ewptScore(s.teamA), 9)
      expect(s.scoreB).toBeCloseTo(ewptScore(s.teamB), 9)
      expect(s.diff).toBeCloseTo(Math.abs(s.scoreA - s.scoreB), 9)
    }
  })
})

describe('autoPick — 16. large squads', () => {
  function checkRules(players: Player[], result: AutoPickResult, pairs: Array<[Player, Player]>) {
    for (const s of result.suggestions) {
      expect(Math.abs(s.teamA.length - s.teamB.length)).toBe(players.length % 2)
      for (const [g, h] of pairs) expect(onSameTeam(s, g, h)).toBe(true)
      expect(Math.abs(count(s.teamA, isKeeper) - count(s.teamB, isKeeper))).toBeLessThanOrEqual(1)
    }
    expectEveryPlayerOnce(players, result)
  }

  it.each([22, 24])('n=%d with no pairs returns five valid suggestions', (n) => {
    const players = squad(n)
    players[0].mentality = 'goalkeeper'
    players[5].mentality = 'goalkeeper'
    const result = autoPick(players, undefined, undefined, seededRng(n))
    expect(result.suggestions).toHaveLength(5)
    checkRules(players, result, [])
  })

  it.each([22, 24])('n=%d with pairs returns one to five valid suggestions', (n) => {
    const players = squad(n)
    players[0].mentality = 'goalkeeper'
    const pairs: Array<[string, string]> = [['P10', 'P1'], ['P11', 'P1'], ['P12', 'P2']]
    const result = autoPick(players, pairs, new Set(['known|P10', 'known|P11', 'known|P12']), seededRng(n))
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1)
    expect(result.suggestions.length).toBeLessThanOrEqual(5)
    checkRules(players, result, [[players[10], players[1]], [players[11], players[1]], [players[12], players[2]]])
  })

  it('a 22-player squad of units 8, 7 and 7 plays 14 v 8 with a warning', () => {
    const players = squad(22)
    const pairs: Array<[string, string]> = []
    for (let i = 1; i < 8; i++) pairs.push([`P${i}`, 'P0'])
    for (let i = 9; i < 15; i++) pairs.push([`P${i}`, 'P8'])
    for (let i = 16; i < 22; i++) pairs.push([`P${i}`, 'P15'])
    const result = autoPick(players, pairs, undefined, seededRng(16))
    expect(result.warning).toBe('uneven-teams')
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) expect([s.teamA.length, s.teamB.length].sort((a, b) => a - b)).toEqual([8, 14])
    expectEveryPlayerOnce(players, result)
  })
})

describe('ewptScoreFromRatings', () => {
  it('matches ewptScore for the same players', () => {
    const players = [ratedPlayer('Keeper', 41, { mentality: 'goalkeeper' }), ...squad(6), makePlayer('New')]
    expect(ewptScoreFromRatings(players, players.map(wprScore))).toBe(ewptScore(players))
  })
})
