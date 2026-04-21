import { autoPick, diffForBand, findAssocTeam } from '@/lib/autoPick'
import type { Player } from '@/lib/types'
import { ewptScore } from '@/lib/utils'
import { seededRng } from './helpers/seeded-rng'

function makePlayer(name: string, overrides?: Partial<Player>): Player {
  return {
    playerId: `known|${name}`,
    name,
    played: 0, won: 0, drew: 0, lost: 0,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: false, points: 0,
    mentality: 'balanced',
    rating: 2, /* median league rating — same default used for guest players */
    recentForm: '',
    ...overrides,
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function onSameTeam(suggestion: { teamA: Player[]; teamB: Player[] }, a: string, b: string): boolean {
  const inA = (name: string) => suggestion.teamA.some((p) => p.name === name)
  return inA(a) === inA(b)
}

// ─── Baseline: no pairs ───────────────────────────────────────────────────────

describe('autoPick — no pairs (baseline)', () => {
  it('returns valid suggestions with all players distributed', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`Player ${i + 1}`))
    const result = autoPick(players)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(10)
    }
  })
})

// ─── One pair ─────────────────────────────────────────────────────────────────
// Use 10 players so there are C(8,4)=70 possible splits of the free pool —
// the probability of every split accidentally keeping the pair together is
// negligible without the pinning logic.

describe('autoPick — one guest+associated pair', () => {
  it('places guest and associated player on the same team in ALL suggestions', () => {
    const players = [
      makePlayer('Alice'),
      makePlayer('Bob'),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Eve'),
      makePlayer('Frank'),
      makePlayer('Grace'),
      makePlayer('Hank'),
      makePlayer('Iris'),
      makePlayer('Alice +1'),
    ]
    const pairs: Array<[string, string]> = [['Alice +1', 'Alice']]
    const result = autoPick(players, pairs)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(onSameTeam(s, 'Alice', 'Alice +1')).toBe(true)
    }
  })
})

// ─── Multiple guests per associated player ────────────────────────────────────

describe('autoPick — two guests sharing one associated player', () => {
  it('places both guests and their associated player on the same team', () => {
    const players = [
      makePlayer('Alice'),
      makePlayer('Bob'),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Eve'),
      makePlayer('Alice +1'),
      makePlayer('Alice +2'),
    ]
    const pairs: Array<[string, string]> = [
      ['Alice +1', 'Alice'],
      ['Alice +2', 'Alice'],
    ]
    const result = autoPick(players, pairs)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(onSameTeam(s, 'Alice', 'Alice +1')).toBe(true)
      expect(onSameTeam(s, 'Alice', 'Alice +2')).toBe(true)
    }
  })
})

// ─── Associated player is a GK ────────────────────────────────────────────────

describe('autoPick — associated player is a GK', () => {
  it('places the guest on the same team as the GK-pinned associated player', () => {
    const players = [
      makePlayer('Alice', { mentality: 'goalkeeper' }),
      makePlayer('Bob', { mentality: 'goalkeeper' }),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Alice +1'),
      makePlayer('Eve'),
    ]
    const pairs: Array<[string, string]> = [['Alice +1', 'Alice']]
    const result = autoPick(players, pairs)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(onSameTeam(s, 'Alice', 'Alice +1')).toBe(true)
    }
  })
})

// ─── Associated player not in squad ──────────────────────────────────────────

describe('autoPick — associated player not in squad', () => {
  it('distributes the guest freely when their associated player is absent', () => {
    const players = [
      makePlayer('Bob'),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Eve'),
      makePlayer('Alice +1'), // associated with 'Alice', who is NOT in the squad
    ]
    const pairs: Array<[string, string]> = [['Alice +1', 'Alice']]
    const result = autoPick(players, pairs)
    expect(result.suggestions.length).toBeGreaterThan(0)
    // All 5 players must be distributed across both teams
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(5)
      const allPlayers = [...s.teamA, ...s.teamB]
      expect(allPlayers.some((p) => p.name === 'Alice +1')).toBe(true)
    }
  })
})

// ─── Swap deduplication ───────────────────────────────────────────────────────

describe('autoPick — swap deduplication', () => {
  it('does not return two suggestions that are team-swaps of each other', () => {
    // 10 identical-rated players → many valid exhaustive splits, so the pool
    // is large enough to surface swap-pairs without deduplication.
    const players = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`Player ${i + 1}`, { rating: 2 })
    )
    // Run across a handful of deterministic seeds to exercise the shuffle-and-pick
    // logic under varied inputs — each seed must still produce distinct splits.
    for (const seed of [1, 7, 42, 99, 256]) {
      const result = autoPick(players, undefined, undefined, seededRng(seed))
      for (let i = 0; i < result.suggestions.length; i++) {
        for (let j = i + 1; j < result.suggestions.length; j++) {
          const a = result.suggestions[i]
          const b = result.suggestions[j]
          const namesA = (t: typeof a) =>
            [[...t.teamA].map((p) => p.name).sort(), [...t.teamB].map((p) => p.name).sort()]
              .sort()
              .join('|')
          expect(namesA(a)).not.toBe(namesA(b))
        }
      }
    }
  })
})

// ─── Guest is themselves a GK ─────────────────────────────────────────────────

describe('autoPick — guest has goalkeeper: true', () => {
  it('excludes the guest-GK from GK pool, places via pair pinning, preserves goalkeeper flag', () => {
    const players = [
      makePlayer('Alice', { mentality: 'goalkeeper' }),
      makePlayer('Bob', { mentality: 'goalkeeper' }),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Bob +1', { mentality: 'goalkeeper' }), // guest who is also a GK
      makePlayer('Eve'),
    ]
    const pairs: Array<[string, string]> = [['Bob +1', 'Bob']]
    const result = autoPick(players, pairs)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      // Pair constraint satisfied
      expect(onSameTeam(s, 'Bob', 'Bob +1')).toBe(true)
      // Real GKs (Alice, Bob) must be on opposing teams — GK split unaffected
      expect(onSameTeam(s, 'Alice', 'Bob')).toBe(false)
      // Keeper mentality preserved on the guest object
      const allPlayers = [...s.teamA, ...s.teamB]
      const guestObj = allPlayers.find((p) => p.name === 'Bob +1')
      expect(guestObj?.mentality).toBe('goalkeeper')
    }
  })
})

// ─── New player count-balance filter ─────────────────────────────────────────

describe('autoPick — unknownNames count-balance filter', () => {
  it('splits 4 new players evenly (2 per team) in all suggestions', () => {
    // 6 rated players + 4 new players (all same wprOverride → algorithm needs
    // count-balance filter to guarantee even split)
    const rated = Array.from({ length: 6 }, (_, i) =>
      makePlayer(`Rated ${i + 1}`, { wprOverride: 60 })
    )
    const newPlayers = [
      makePlayer('New1', { wprOverride: 50 }),
      makePlayer('New2', { wprOverride: 50 }),
      makePlayer('New3', { wprOverride: 50 }),
      makePlayer('New4', { wprOverride: 50 }),
    ]
    const newPlayerIds = new Set(newPlayers.map((p) => p.playerId))
    const result = autoPick([...rated, ...newPlayers], undefined, newPlayerIds)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      const countA = s.teamA.filter((p) => newPlayerIds.has(p.playerId)).length
      const countB = s.teamB.filter((p) => newPlayerIds.has(p.playerId)).length
      expect(Math.abs(countA - countB)).toBeLessThanOrEqual(1)
    }
  })

  it('splits 5 new players with at most a 1-player count difference per team', () => {
    const rated = Array.from({ length: 5 }, (_, i) =>
      makePlayer(`Rated ${i + 1}`, { wprOverride: 60 })
    )
    const newPlayers = Array.from({ length: 5 }, (_, i) =>
      makePlayer(`New ${i + 1}`, { wprOverride: 50 })
    )
    const newPlayerIds = new Set(newPlayers.map((p) => p.playerId))
    const result = autoPick([...rated, ...newPlayers], undefined, newPlayerIds)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      const countA = s.teamA.filter((p) => newPlayerIds.has(p.playerId)).length
      const countB = s.teamB.filter((p) => newPlayerIds.has(p.playerId)).length
      expect(Math.abs(countA - countB)).toBeLessThanOrEqual(1)
    }
  })

  it('uses new player wprOverride ratings to find best balance within count constraint', () => {
    // Two strong and two weak new players — the algorithm should produce a balanced
    // split (1 strong + 1 weak per team) since the 6 rated players are equal and the
    // count-balance filter ensures exactly 2 new players per team.
    const rated = Array.from({ length: 6 }, (_, i) =>
      makePlayer(`Rated ${i + 1}`, { wprOverride: 55 })
    )
    const newPlayers = [
      makePlayer('StrongA', { wprOverride: 80 }),
      makePlayer('StrongB', { wprOverride: 80 }),
      makePlayer('WeakA', { wprOverride: 20 }),
      makePlayer('WeakB', { wprOverride: 20 }),
    ]
    const newPlayerIds = new Set(newPlayers.map((p) => p.playerId))

    const result = autoPick(
      [...rated, ...newPlayers],
      undefined,
      newPlayerIds,
      seededRng(42),
    )
    expect(result.suggestions.length).toBeGreaterThan(0)

    // All suggestions must satisfy count-balance constraint
    for (const s of result.suggestions) {
      const countA = s.teamA.filter((p) => newPlayerIds.has(p.playerId)).length
      const countB = s.teamB.filter((p) => newPlayerIds.has(p.playerId)).length
      expect(Math.abs(countA - countB)).toBeLessThanOrEqual(1)
    }

    // Best split (lowest diff) must pair one strong + one weak per team. The
    // (1+1) configuration is the only one that drives diff to 0 with these
    // inputs, so it's guaranteed to surface as suggestions[0].
    const best = result.suggestions[0]
    const strongOnA = best.teamA.filter((p) => p.name === 'StrongA' || p.name === 'StrongB').length
    const weakOnA = best.teamA.filter((p) => p.name === 'WeakA' || p.name === 'WeakB').length
    expect(strongOnA).toBe(1)
    expect(weakOnA).toBe(1)
  })

  it('returns valid suggestions with small squads when newPlayerIds is supplied', () => {
    // Robustness: 3 players total, 2 new. The 2v1 split has valid 1-1 new-player
    // splits (Rated+New1 vs New2, or Rated+New2 vs New1) so the filter passes —
    // we just verify the function returns suggestions and distributes all players.
    const players = [
      makePlayer('Rated', { wprOverride: 60 }),
      makePlayer('New1', { wprOverride: 50 }),
      makePlayer('New2', { wprOverride: 50 }),
    ]
    const newPlayerIds = new Set(['known|New1', 'known|New2'])
    const result = autoPick(players, undefined, newPlayerIds)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(3)
    }
  })

  it('balances total unknowns (guests + new players) across teams', () => {
    // 2 guests sharing associated player Alice → both pinned to Alice's team.
    // 2 new players in the free pool. Under the extended filter, splits where
    // both new players join the Alice-cluster team (3-vs-1 unknowns) must be
    // rejected; a balanced 2-vs-2 split must be preferred.
    const players = [
      makePlayer('Alice'),
      makePlayer('Bob'),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Alice +1'),
      makePlayer('Alice +2'),
      makePlayer('New1', { wprOverride: 50 }),
      makePlayer('New2', { wprOverride: 50 }),
    ]
    const pairs: Array<[string, string]> = [
      ['Alice +1', 'Alice'],
      ['Alice +2', 'Alice'],
    ]
    const unknownIds = new Set(
      ['Alice +1', 'Alice +2', 'New1', 'New2'].map((n) => `known|${n}`),
    )
    const result = autoPick(players, pairs, unknownIds)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      const countA = s.teamA.filter((p) => unknownIds.has(p.playerId)).length
      const countB = s.teamB.filter((p) => unknownIds.has(p.playerId)).length
      expect(Math.abs(countA - countB)).toBeLessThanOrEqual(1)
    }
  })

  it('passes no unknownNames — behaviour unchanged from baseline', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`Player ${i + 1}`))
    const result = autoPick(players)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(10)
    }
  })

  it('with 1 new player, does not apply filter and still returns valid suggestions', () => {
    // With only 1 new player, every split puts them on exactly one team so
    // |countA - countB| is always 1 — the filter is bypassed to avoid a no-op.
    const players = Array.from({ length: 8 }, (_, i) => makePlayer(`Player ${i + 1}`))
    const newPlayerIds = new Set(['known|Player 1'])
    const result = autoPick(players, undefined, newPlayerIds)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(8)
    }
  })
})

// ─── Odd-player allocation (1.4) ─────────────────────────────────────────────

describe('autoPick — odd-player allocation distribution', () => {
  it('odd n=11: extra slot goes to either team roughly equally over 100 runs', () => {
    const players = Array.from({ length: 11 }, (_, i) => makePlayer(`Player ${i + 1}`))
    let aBigger = 0
    for (let i = 0; i < 100; i++) {
      const result = autoPick(players)
      if (result.suggestions.length === 0) continue
      const s = result.suggestions[0]
      if (s.teamA.length === 6) aBigger++
    }
    // Soft bounds tolerating random variance. Pre-1.4 code pegs this at 100.
    expect(aBigger).toBeGreaterThanOrEqual(35)
    expect(aBigger).toBeLessThanOrEqual(65)
  })

  it('even n=10: both teams always size 5', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`Player ${i + 1}`))
    for (let i = 0; i < 100; i++) {
      const result = autoPick(players)
      if (result.suggestions.length === 0) continue
      const s = result.suggestions[0]
      expect(s.teamA.length).toBe(5)
      expect(s.teamB.length).toBe(5)
    }
  })

  it('odd n=11 with 2 GKs: extra slot distribution is balanced', () => {
    const players = [
      makePlayer('GK1', { mentality: 'goalkeeper' }),
      makePlayer('GK2', { mentality: 'goalkeeper' }),
      ...Array.from({ length: 9 }, (_, i) => makePlayer(`Player ${i + 1}`)),
    ]
    let aBigger = 0
    for (let i = 0; i < 100; i++) {
      const result = autoPick(players)
      if (result.suggestions.length === 0) continue
      const s = result.suggestions[0]
      if (s.teamA.length === 6) aBigger++
    }
    expect(aBigger).toBeGreaterThanOrEqual(35)
    expect(aBigger).toBeLessThanOrEqual(65)
  })
})

// ─── Win-probability tolerance (1.6) ─────────────────────────────────────────

describe('findAssocTeam — placement helper', () => {
  it('returns null when the associated player is nowhere', () => {
    expect(findAssocTeam('known|Alice', null, null, [], [])).toBeNull()
  })

  it('returns null when assocId is undefined', () => {
    expect(findAssocTeam(undefined, null, null, [], [])).toBeNull()
  })

  it('returns A when assoc matches the Team A pinned GK', () => {
    const alice = makePlayer('Alice', { mentality: 'goalkeeper' })
    expect(findAssocTeam(alice.playerId, alice, null, [], [])).toBe('A')
  })

  it('returns B when assoc matches the Team B pinned GK', () => {
    const alice = makePlayer('Alice', { mentality: 'goalkeeper' })
    expect(findAssocTeam(alice.playerId, null, alice, [], [])).toBe('B')
  })

  it('returns A when assoc is already in pinnedTeamA (prior pair)', () => {
    const alice = makePlayer('Alice')
    expect(findAssocTeam(alice.playerId, null, null, [alice], [])).toBe('A')
  })

  it('returns B when assoc is already in pinnedTeamB (prior pair)', () => {
    const alice = makePlayer('Alice')
    expect(findAssocTeam(alice.playerId, null, null, [], [alice])).toBe('B')
  })

  it('pinned GK takes precedence over pair-list membership when IDs match', () => {
    const aliceGk = makePlayer('Alice', { mentality: 'goalkeeper' })
    // Player with the same playerId in the pair list — precedence check
    expect(findAssocTeam(aliceGk.playerId, aliceGk, null, [aliceGk], [])).toBe('A')
  })
})

describe('autoPick — synthetic playerId identity (2.7)', () => {
  it('distinguishes two players with identical names via different playerId', () => {
    const alice1 = makePlayer('Alice', { playerId: 'roster|alice-1' })
    const alice2 = makePlayer('Alice', { playerId: 'roster|alice-2' })
    const squad = [alice1, alice2, makePlayer('Bob'), makePlayer('Carol')]
    const result = autoPick(squad, undefined, undefined, seededRng(42))
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      const all = [...s.teamA, ...s.teamB]
      expect(all.filter((p) => p.playerId === alice1.playerId)).toHaveLength(1)
      expect(all.filter((p) => p.playerId === alice2.playerId)).toHaveLength(1)
    }
  })

  it('treats guest-Alice and known-Alice as distinct entities', () => {
    const knownAlice = makePlayer('Alice', { playerId: 'known|Alice' })
    const guestAlice = makePlayer('Alice', { playerId: 'guest|Alice' })
    const squad = [knownAlice, guestAlice, makePlayer('Bob'), makePlayer('Carol')]
    const result = autoPick(squad, undefined, undefined, seededRng(42))
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      const all = [...s.teamA, ...s.teamB]
      expect(all.filter((p) => p.playerId === knownAlice.playerId)).toHaveLength(1)
      expect(all.filter((p) => p.playerId === guestAlice.playerId)).toHaveLength(1)
    }
  })
})

// ─── Closest-N selection ─────────────────────────────────────────────────────

describe('autoPick — returns closest-N splits', () => {
  // Canonical team-swap key so {A,B} and {B,A} collapse to the same string.
  // Matches the dedup key used inside autoPick itself.
  const teamSwapKey = (a: Player[], b: Player[]) =>
    [a.map((p) => p.playerId).sort().join(','), b.map((p) => p.playerId).sort().join(',')]
      .sort()
      .join('|')

  it('returns 5 suggestions sorted ascending by diff, and they are the 5 smallest-diff unique splits', () => {
    // 10 players with varied ratings to guarantee >5 unique diffs.
    // No goalkeepers → no GK pinning, so the search is over all 10 players.
    const players = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`P${i + 1}`, { rating: 1 + (i % 3), played: 10, recentForm: 'WLDWL' })
    )

    const result = autoPick(players, undefined, undefined, seededRng(1))

    // Length matches SUGGESTION_COUNT (= 5 after Task 2).
    expect(result.suggestions.length).toBe(5)

    // Sorted ascending by diff.
    for (let i = 1; i < result.suggestions.length; i++) {
      expect(result.suggestions[i].diff).toBeGreaterThanOrEqual(
        result.suggestions[i - 1].diff,
      )
    }

    // Brute-force completeness check: independently enumerate every 5-vs-5
    // split, collapse team-swaps, and assert no unseen split beats the 5th.
    const combinations = <T,>(arr: T[], k: number): T[][] => {
      if (k === 0) return [[]]
      if (k === arr.length) return [[...arr]]
      if (k > arr.length) return []
      const [first, ...rest] = arr
      return [
        ...combinations(rest, k - 1).map((c) => [first, ...c]),
        ...combinations(rest, k),
      ]
    }

    const suggestionKeys = new Set(
      result.suggestions.map((s) => teamSwapKey(s.teamA, s.teamB)),
    )
    const worstSuggestedDiff = result.suggestions[4].diff

    const visitedKeys = new Set<string>()
    for (const teamA of combinations(players, 5)) {
      const inA = new Set(teamA.map((p) => p.playerId))
      const teamB = players.filter((p) => !inA.has(p.playerId))
      const key = teamSwapKey(teamA, teamB)
      if (visitedKeys.has(key)) continue
      visitedKeys.add(key)
      if (suggestionKeys.has(key)) continue
      const diff = Math.abs(ewptScore(teamA) - ewptScore(teamB))
      expect(diff).toBeGreaterThanOrEqual(worstSuggestedDiff)
    }
  })

  it('returns fewer than 5 suggestions when fewer unique splits exist', () => {
    // 4 players → sizeA=2 → C(4,2)=6 raw splits → 3 unique after team-swap dedup.
    const players = [
      makePlayer('A', { rating: 3 }),
      makePlayer('B', { rating: 2 }),
      makePlayer('C', { rating: 1 }),
      makePlayer('D', { rating: 2 }),
    ]
    const result = autoPick(players, undefined, undefined, seededRng(1))

    expect(result.suggestions.length).toBeLessThanOrEqual(5)
    expect(result.suggestions.length).toBeGreaterThan(0)
    // No duplicates among suggestions (team-swap dedup invariant).
    const keys = new Set<string>()
    for (const s of result.suggestions) {
      const key = teamSwapKey(s.teamA, s.teamB)
      expect(keys.has(key)).toBe(false)
      keys.add(key)
    }
  })
})

describe('diffForBand — inverse logistic helper', () => {
  it('band = 0.095 yields a diff threshold of ~3.08 (matches legacy +3 absolute floor)', () => {
    expect(diffForBand(0.095)).toBeCloseTo(3.08, 2)
  })

  it('band = 0.05 yields ~1.61', () => {
    expect(diffForBand(0.05)).toBeCloseTo(1.61, 2)
  })

  it('band = 0.2 yields ~6.78', () => {
    expect(diffForBand(0.2)).toBeCloseTo(6.78, 2)
  })

  it('is monotonically increasing in the band', () => {
    expect(diffForBand(0.05)).toBeLessThan(diffForBand(0.1))
    expect(diffForBand(0.1)).toBeLessThan(diffForBand(0.2))
  })
})
