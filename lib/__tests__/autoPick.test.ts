import { autoPick } from '@/lib/autoPick'
import type { Player } from '@/lib/types'

function makePlayer(name: string, overrides?: Partial<Player>): Player {
  return {
    name,
    played: 0, won: 0, drew: 0, lost: 0,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: false, points: 0,
    goalkeeper: false, mentality: 'balanced', rating: 2, /* median league rating — same default used for guest players */ recentForm: '',
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
      makePlayer('Alice', { goalkeeper: true }),
      makePlayer('Bob', { goalkeeper: true }),
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
    // will be large enough to potentially surface swaps without deduplication.
    const players = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`Player ${i + 1}`, { rating: 2 })
    )
    // Run many times to exercise the random sampling path
    for (let run = 0; run < 20; run++) {
      const result = autoPick(players)
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
      makePlayer('Alice', { goalkeeper: true }),
      makePlayer('Bob', { goalkeeper: true }),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Bob +1', { goalkeeper: true }), // guest who is also a GK
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
      // goalkeeper flag preserved on the guest object
      const allPlayers = [...s.teamA, ...s.teamB]
      const guestObj = allPlayers.find((p) => p.name === 'Bob +1')
      expect(guestObj?.goalkeeper).toBe(true)
    }
  })
})

// ─── New player count-balance filter ─────────────────────────────────────────

describe('autoPick — newPlayerNames count-balance filter', () => {
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
    const newPlayerNames = new Set(newPlayers.map((p) => p.name))
    const result = autoPick([...rated, ...newPlayers], undefined, newPlayerNames)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      const countA = s.teamA.filter((p) => newPlayerNames.has(p.name)).length
      const countB = s.teamB.filter((p) => newPlayerNames.has(p.name)).length
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
    const newPlayerNames = new Set(newPlayers.map((p) => p.name))
    const result = autoPick([...rated, ...newPlayers], undefined, newPlayerNames)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      const countA = s.teamA.filter((p) => newPlayerNames.has(p.name)).length
      const countB = s.teamB.filter((p) => newPlayerNames.has(p.name)).length
      expect(Math.abs(countA - countB)).toBeLessThanOrEqual(1)
    }
  })

  it('uses new player wprOverride ratings to find best balance within count constraint', () => {
    // Two strong and two weak new players — algorithm should split one strong + one weak per team
    const rated = Array.from({ length: 6 }, (_, i) =>
      makePlayer(`Rated ${i + 1}`, { wprOverride: 55 })
    )
    const newPlayers = [
      makePlayer('StrongA', { wprOverride: 80 }),
      makePlayer('StrongB', { wprOverride: 80 }),
      makePlayer('WeakA', { wprOverride: 20 }),
      makePlayer('WeakB', { wprOverride: 20 }),
    ]
    const newPlayerNames = new Set(newPlayers.map((p) => p.name))

    // Run multiple times to reduce sensitivity to random sampling
    let foundGoodSplit = false
    for (let i = 0; i < 20; i++) {
      const result = autoPick([...rated, ...newPlayers], undefined, newPlayerNames)
      if (result.suggestions.length === 0) continue
      const s = result.suggestions[0]
      const strongOnA = s.teamA.filter((p) => p.name === 'StrongA' || p.name === 'StrongB').length
      const weakOnA = s.teamA.filter((p) => p.name === 'WeakA' || p.name === 'WeakB').length
      // A balanced split puts one strong and one weak per team
      if (strongOnA === 1 && weakOnA === 1) {
        foundGoodSplit = true
        break
      }
    }
    expect(foundGoodSplit).toBe(true)
  })

  it('returns valid suggestions with small squads when newPlayerNames is supplied', () => {
    // Robustness: 3 players total, 2 new. The 2v1 split has valid 1-1 new-player
    // splits (Rated+New1 vs New2, or Rated+New2 vs New1) so the filter passes —
    // we just verify the function returns suggestions and distributes all players.
    const players = [
      makePlayer('Rated', { wprOverride: 60 }),
      makePlayer('New1', { wprOverride: 50 }),
      makePlayer('New2', { wprOverride: 50 }),
    ]
    const newPlayerNames = new Set(['New1', 'New2'])
    const result = autoPick(players, undefined, newPlayerNames)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(3)
    }
  })

  it('passes no newPlayerNames — behaviour unchanged from baseline', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`Player ${i + 1}`))
    const result = autoPick(players)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(10)
    }
  })
})
