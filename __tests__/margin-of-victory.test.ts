// __tests__/margin-of-victory.test.ts
import type { Week } from '@/lib/types'
import { getMarginBarWidth, getMarginCaption } from '@/lib/utils'

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

// ── getMarginBarWidth ──────────────────────────────────────────
// Team A segment width for the tug of war bar on played match cards.

describe('getMarginBarWidth', () => {
  it('leans towards Team A by 6% per goal', () => {
    expect(getMarginBarWidth('teamA', 2)).toBe(62)
  })

  it('leans away from Team A when Team B wins', () => {
    expect(getMarginBarWidth('teamB', 1)).toBe(44)
  })

  it('clamps to 80% and 20%', () => {
    expect(getMarginBarWidth('teamA', 9)).toBe(80)
    expect(getMarginBarWidth('teamB', 9)).toBe(20)
  })

  it('sits level on a draw or when the margin was not recorded', () => {
    expect(getMarginBarWidth('draw', 0)).toBe(50)
    expect(getMarginBarWidth('teamA', null)).toBe(50)
  })
})

// ── getMarginCaption ────────────────────────────────────────────

describe('getMarginCaption', () => {
  it('names the winning team and the margin', () => {
    expect(getMarginCaption('teamA', 2)).toBe('Team A won by 2 goals')
    expect(getMarginCaption('teamB', 3)).toBe('Team B won by 3 goals')
  })

  it('uses the singular for a one goal margin', () => {
    expect(getMarginCaption('teamB', 1)).toBe('Team B won by 1 goal')
  })

  it('drops the margin when it is null or 0', () => {
    expect(getMarginCaption('teamA', null)).toBe('Team A won')
    expect(getMarginCaption('teamA', 0)).toBe('Team A won')
  })

  it('switches to "You" when the viewer was on the winning side', () => {
    expect(getMarginCaption('teamA', 2, true)).toBe('You won by 2 goals')
    expect(getMarginCaption('teamA', null, true)).toBe('You won')
  })

  it('reads "Honours even" on a draw', () => {
    expect(getMarginCaption('draw', 0)).toBe('Honours even')
    expect(getMarginCaption('draw', 0, true)).toBe('Honours even')
  })

  it('returns null when there is no result', () => {
    expect(getMarginCaption(null, null)).toBeNull()
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
