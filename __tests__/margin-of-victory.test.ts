// __tests__/margin-of-victory.test.ts
import type { Week } from '@/lib/types'
import { shouldShowMeta } from '@/lib/utils'

describe('Week type — goal_difference', () => {
  it('accepts goal_difference as a number', () => {
    const w: Week = {
      week: 1,
      date: '20 Mar 2026',
      status: 'played',
      teamA: [],
      teamB: [],
      winner: 'teamA',
      goal_difference: 3,
    }
    expect(w.goal_difference).toBe(3)
  })

  it('accepts goal_difference as null', () => {
    const w: Week = {
      week: 1,
      date: '20 Mar 2026',
      status: 'played',
      teamA: [],
      teamB: [],
      winner: 'teamA',
      goal_difference: null,
    }
    expect(w.goal_difference).toBeNull()
  })

  it('accepts goal_difference as undefined (optional)', () => {
    const w: Week = {
      week: 1,
      date: '20 Mar 2026',
      status: 'played',
      teamA: [],
      teamB: [],
      winner: 'teamA',
    }
    expect(w.goal_difference).toBeUndefined()
  })
})

// ── shouldShowMeta ──────────────────────────────────────────────
// Tests the display condition: show the meta row when there's a
// non-null, non-zero margin OR non-empty notes.

describe('shouldShowMeta', () => {
  it('returns true when goal_difference is a positive win margin', () => {
    expect(shouldShowMeta(3, undefined)).toBe(true)
  })

  it('returns false when goal_difference is 0 (draw) with no notes', () => {
    expect(shouldShowMeta(0, undefined)).toBe(false)
  })

  it('returns false when goal_difference is null with no notes', () => {
    expect(shouldShowMeta(null, undefined)).toBe(false)
  })

  it('returns true when goal_difference is null but notes are present', () => {
    expect(shouldShowMeta(null, 'Good game')).toBe(true)
  })

  it('returns false when notes are whitespace only', () => {
    expect(shouldShowMeta(null, '   ')).toBe(false)
  })

  it('returns true when draw (0) but notes are present', () => {
    expect(shouldShowMeta(0, 'Played in rain')).toBe(true)
  })
})

// ── mapWeekRow ──────────────────────────────────────────────────
// Tests that raw Supabase rows (snake_case keys) are correctly
// mapped to the Week type, including goal_difference.
// This mirrors the inline mapper in lib/data.ts fetchWeeks.
function mapWeekRow(row: Record<string, unknown>) {
  return {
    week: row.week,
    date: row.date,
    status: row.status,
    format: row.format ?? undefined,
    teamA: row.team_a ?? [],
    teamB: row.team_b ?? [],
    winner: row.winner ?? null,
    notes: row.notes ?? undefined,
    goal_difference: row.goal_difference ?? null,
  }
}

describe('mapWeekRow — goal_difference', () => {
  it('maps a positive goal_difference from raw row', () => {
    const row = { week: 1, date: '20 Mar 2026', status: 'played', format: '6v6',
      team_a: [], team_b: [], winner: 'teamA', notes: '+3 Goals', goal_difference: 3 }
    expect(mapWeekRow(row).goal_difference).toBe(3)
  })

  it('maps goal_difference of 0 (draw)', () => {
    const row = { week: 2, date: '27 Mar 2026', status: 'played', format: '6v6',
      team_a: [], team_b: [], winner: 'draw', notes: null, goal_difference: 0 }
    expect(mapWeekRow(row).goal_difference).toBe(0)
  })

  it('maps null goal_difference (not recorded)', () => {
    const row = { week: 3, date: '3 Apr 2026', status: 'played', format: '6v6',
      team_a: [], team_b: [], winner: 'teamB', notes: null, goal_difference: null }
    expect(mapWeekRow(row).goal_difference).toBeNull()
  })

  it('maps missing goal_difference as null (absent from old row)', () => {
    const row = { week: 4, date: '10 Apr 2026', status: 'played', format: '6v6',
      team_a: [], team_b: [], winner: 'teamA', notes: null }
    expect(mapWeekRow(row).goal_difference).toBeNull()
  })
})
