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
