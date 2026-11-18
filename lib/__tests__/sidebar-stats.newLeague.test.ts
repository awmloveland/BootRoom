import { computeQuarterlyTable, getQuarterStanding } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'

function played(week: number, date: string, teamA: string[], teamB: string[]): Week {
  return { id: `id-${week}`, season: date.slice(-4), week, date, status: 'played', teamA, teamB, winner: 'teamA' }
}

// Wednesday 18 Nov 2026: mid Q4. Thursdays left in the quarter: 19, 26 Nov, 3, 10, 17, 24, 31 Dec.
const NOW = new Date(2026, 10, 18, 12)
const THURSDAY = 4
const ROSTER = ['Marcus', 'Callum', 'Sofia']

describe('computeQuarterlyTable: a league with no games yet', () => {
  it('shows the current quarter, not the one before the league existed', () => {
    const table = computeQuarterlyTable([], NOW, THURSDAY, ROSTER)
    expect(table.isHoldover).toBe(false)
    expect(table.quarterLabel).toBe('Q4 26')
    expect(table.displayQ).toBe(4)
    expect(table.displayYear).toBe(2026)
  })

  it('lists the roster in name order with every column at zero', () => {
    const table = computeQuarterlyTable([], NOW, THURSDAY, ROSTER)
    expect(table.entries).toEqual([
      { name: 'Callum', played: 0, won: 0, drew: 0, lost: 0, points: 0, goalDiff: 0 },
      { name: 'Marcus', played: 0, won: 0, drew: 0, lost: 0, points: 0, goalDiff: 0 },
      { name: 'Sofia', played: 0, won: 0, drew: 0, lost: 0, points: 0, goalDiff: 0 },
    ])
  })

  it('cuts the shown rows at ten but keeps everyone in allEntries', () => {
    const roster = Array.from({ length: 12 }, (_, i) => `Player ${String(i + 1).padStart(2, '0')}`)
    const table = computeQuarterlyTable([], NOW, THURSDAY, roster)
    expect(table.entries).toHaveLength(10)
    expect(table.allEntries).toHaveLength(12)
    expect(getQuarterStanding(table.allEntries, 'Player 12')?.rank).toBe(12)
  })

  it('counts the game days still to come', () => {
    const table = computeQuarterlyTable([], NOW, THURSDAY, ROSTER)
    expect(table.gamesLeft).toBe(7)
    expect(table.gamesTotal).toBe(7)
  })

  it('stays empty when no roster is given', () => {
    expect(computeQuarterlyTable([], NOW, THURSDAY).entries).toEqual([])
  })
})

describe('computeQuarterlyTable: roster rows give way to results', () => {
  it('ranks only players with a game once the quarter has one', () => {
    const table = computeQuarterlyTable([played(1, '12 Nov 2026', ['Marcus'], ['Callum'])], NOW, THURSDAY, ROSTER)
    expect(table.entries.map((e) => e.name)).toEqual(['Marcus', 'Callum'])
  })

  it('still holds over to last quarter when that one had games', () => {
    const table = computeQuarterlyTable([played(1, '17 Sep 2026', ['Marcus'], ['Callum'])], NOW, THURSDAY, ROSTER)
    expect(table.isHoldover).toBe(true)
    expect(table.quarterLabel).toBe('Q3 26')
    expect(table.entries.map((e) => e.name)).toEqual(['Marcus', 'Callum'])
  })

  it('moves on to the current quarter when last quarter had no games either', () => {
    const table = computeQuarterlyTable([played(1, '18 Jun 2026', ['Marcus'], ['Callum'])], NOW, THURSDAY, ROSTER)
    expect(table.isHoldover).toBe(false)
    expect(table.quarterLabel).toBe('Q4 26')
    expect(table.entries.map((e) => e.name)).toEqual(['Callum', 'Marcus', 'Sofia'])
  })
})
