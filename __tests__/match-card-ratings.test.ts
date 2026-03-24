// __tests__/match-card-ratings.test.ts
import type { Week } from '@/lib/types'

// ── Week type — team ratings ─────────────────────────────────────

describe('Week type — team_a_rating / team_b_rating', () => {
  it('accepts numeric ratings', () => {
    const w: Week = {
      week: 1, date: '24 Mar 2026', status: 'played',
      teamA: [], teamB: [], winner: 'teamA',
      team_a_rating: 4.210,
      team_b_rating: 3.890,
    }
    expect(w.team_a_rating).toBe(4.210)
    expect(w.team_b_rating).toBe(3.890)
  })

  it('accepts null ratings (historical games)', () => {
    const w: Week = {
      week: 2, date: '17 Mar 2026', status: 'played',
      teamA: [], teamB: [], winner: 'draw',
      team_a_rating: null,
      team_b_rating: null,
    }
    expect(w.team_a_rating).toBeNull()
    expect(w.team_b_rating).toBeNull()
  })

  it('accepts undefined ratings (field omitted)', () => {
    const w: Week = {
      week: 3, date: '10 Mar 2026', status: 'played',
      teamA: [], teamB: [], winner: 'teamB',
    }
    expect(w.team_a_rating).toBeUndefined()
    expect(w.team_b_rating).toBeUndefined()
  })
})

// ── mapWeekRow — team ratings ────────────────────────────────────
// Mirrors the inline mapper in app/[leagueId]/results/page.tsx

function mapWeekRow(row: Record<string, unknown>) {
  return {
    week: row.week as number,
    date: row.date as string,
    status: row.status as Week['status'],
    format: (row.format as string | null) ?? undefined,
    teamA: (row.team_a as string[]) ?? [],
    teamB: (row.team_b as string[]) ?? [],
    winner: (row.winner as Week['winner']) ?? null,
    notes: (row.notes as string | null) ?? undefined,
    goal_difference: (row.goal_difference as number | null) ?? null,
    team_a_rating: (row.team_a_rating as number | null) ?? null,
    team_b_rating: (row.team_b_rating as number | null) ?? null,
  }
}

describe('mapWeekRow — team ratings', () => {
  it('maps numeric ratings from raw row', () => {
    const row = {
      week: 1, date: '24 Mar 2026', status: 'played', format: '6-a-side',
      team_a: ['Alice', 'Bob'], team_b: ['Carol', 'Dan'],
      winner: 'teamA', notes: null, goal_difference: 2,
      team_a_rating: 4.210, team_b_rating: 3.890,
    }
    const mapped = mapWeekRow(row)
    expect(mapped.team_a_rating).toBe(4.210)
    expect(mapped.team_b_rating).toBe(3.890)
  })

  it('maps null ratings (historical row without ratings)', () => {
    const row = {
      week: 2, date: '17 Mar 2026', status: 'played', format: '6-a-side',
      team_a: [], team_b: [], winner: 'draw', notes: null,
      goal_difference: 0, team_a_rating: null, team_b_rating: null,
    }
    const mapped = mapWeekRow(row)
    expect(mapped.team_a_rating).toBeNull()
    expect(mapped.team_b_rating).toBeNull()
  })

  it('maps absent rating columns as null', () => {
    const row = {
      week: 3, date: '10 Mar 2026', status: 'played', format: '5-a-side',
      team_a: [], team_b: [], winner: 'teamB', notes: null, goal_difference: 1,
      // team_a_rating and team_b_rating absent (pre-migration row)
    }
    const mapped = mapWeekRow(row)
    expect(mapped.team_a_rating).toBeNull()
    expect(mapped.team_b_rating).toBeNull()
  })
})
