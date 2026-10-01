import { computeQuarterlyTable, getQuarterStanding, getLastResult, type QuarterlyEntry } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'

function played(week: number, date: string, teamA: string[], teamB: string[], winner: Week['winner'] = 'teamA'): Week {
  return { id: `id-${week}`, season: date.slice(-4), week, date, status: 'played', teamA, teamB, winner }
}

function entry(name: string, points: number, won: number, goalDiff = 0, played = 5): QuarterlyEntry {
  return { name, played, won, drew: 0, lost: 0, points, goalDiff }
}

describe('computeQuarterlyTable: Overview fields', () => {
  const MID_Q2 = new Date(2026, 4, 15) // 15 May 2026

  it('keeps the top 10 in entries and the full table in allEntries', () => {
    const teamA = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']
    const teamB = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']
    const result = computeQuarterlyTable([played(18, '07 May 2026', teamA, teamB)], MID_Q2, 4)
    expect(result.entries).toHaveLength(10)
    expect(result.allEntries).toHaveLength(12)
    expect(result.allEntries.slice(0, 10)).toEqual(result.entries)
  })

  it('reports the displayed quarter as numbers', () => {
    const result = computeQuarterlyTable([played(18, '07 May 2026', ['Alice'], ['Bob'])], MID_Q2, 4)
    expect(result.displayQ).toBe(2)
    expect(result.displayYear).toBe(2026)
  })

  it('reports the held-over quarter when the current one has no games', () => {
    const result = computeQuarterlyTable([played(18, '07 May 2026', ['Alice'], ['Bob'])], new Date(2026, 6, 2), 4)
    expect(result.isHoldover).toBe(true)
    expect(result.displayQ).toBe(2)
    expect(result.displayYear).toBe(2026)
  })

  it('holds over across a year boundary', () => {
    const result = computeQuarterlyTable([played(50, '10 Dec 2026', ['Alice'], ['Bob'])], new Date(2027, 0, 5), 4)
    expect(result.displayQ).toBe(4)
    expect(result.displayYear).toBe(2026)
  })

  it('reports the previous champion with points and quarter', () => {
    const weeks = [
      played(6, '12 Feb 2026', ['Alice', 'Bob'], ['Charlie', 'Dave']),
      played(18, '07 May 2026', ['Alice', 'Bob'], ['Charlie', 'Dave'], 'teamB'),
    ]
    const result = computeQuarterlyTable(weeks, MID_Q2, 4)
    expect(result.lastChampion).toBe('Alice')
    expect(result.lastChampionPoints).toBe(3)
    expect(result.lastQ).toBe(1)
    expect(result.lastYear).toBe(2026)
  })

  it('reports no previous champion when the previous quarter has no games', () => {
    const result = computeQuarterlyTable([played(18, '07 May 2026', ['Alice'], ['Bob'])], MID_Q2, 4)
    expect(result.lastChampion).toBeNull()
    expect(result.lastChampionPoints).toBeNull()
    expect(result.lastQ).toBeNull()
    expect(result.lastYear).toBeNull()
  })
})

describe('getQuarterStanding', () => {
  it('ranks a clear leader first, not joint', () => {
    const table = [entry('Alice', 9, 3), entry('Bob', 6, 2)]
    expect(getQuarterStanding(table, 'Alice')).toEqual({ rank: 1, position: 1, jointTop: false, entry: table[0] })
    expect(getQuarterStanding(table, 'Bob')).toEqual({ rank: 2, position: 2, jointTop: false, entry: table[1] })
  })

  it('gives players level on points and wins a shared first place', () => {
    const table = [entry('Alice', 3, 1), entry('Bob', 3, 1), entry('Charlie', 0, 0)]
    expect(getQuarterStanding(table, 'Alice')).toMatchObject({ rank: 1, position: 1, jointTop: true })
    expect(getQuarterStanding(table, 'Bob')).toMatchObject({ rank: 2, position: 1, jointTop: true })
    expect(getQuarterStanding(table, 'Charlie')).toMatchObject({ rank: 3, position: 3, jointTop: false })
  })

  it('shares a position below first without calling it joint top', () => {
    const table = [entry('Alice', 9, 3), entry('Bob', 6, 2), entry('Charlie', 6, 2)]
    expect(getQuarterStanding(table, 'Charlie')).toMatchObject({ rank: 3, position: 2, jointTop: false })
  })

  it('separates players level on points by wins', () => {
    const table = [entry('Alice', 9, 3), entry('Bob', 9, 2)]
    expect(getQuarterStanding(table, 'Alice')).toMatchObject({ position: 1, jointTop: false })
    expect(getQuarterStanding(table, 'Bob')).toMatchObject({ position: 2, jointTop: false })
  })

  it('separates players level on points by goal difference', () => {
    const table = [entry('Alice', 9, 3, 6), entry('Bob', 9, 3, 2)]
    expect(getQuarterStanding(table, 'Alice')).toMatchObject({ position: 1, jointTop: false })
    expect(getQuarterStanding(table, 'Bob')).toMatchObject({ position: 2, jointTop: false })
  })

  it('separates players level on points and goal difference by fewer games played', () => {
    const table = [entry('Bob', 9, 3, 4, 4), entry('Alice', 9, 3, 4, 5)]
    expect(getQuarterStanding(table, 'Bob')).toMatchObject({ position: 1, jointTop: false })
    expect(getQuarterStanding(table, 'Alice')).toMatchObject({ position: 2, jointTop: false })
  })

  it('agrees with the table order computeQuarterlyTable produces', () => {
    // Zed wins by 4, Alice by 1: level on points, Zed ahead on goal difference.
    const weeks: Week[] = [
      { ...played(14, '02 Apr 2026', ['Alice'], ['Opp1']), goal_difference: 1 },
      { ...played(15, '09 Apr 2026', ['Zed'], ['Opp2']), goal_difference: 4 },
    ]
    const { allEntries } = computeQuarterlyTable(weeks, new Date(2026, 4, 15), 4)
    expect(allEntries.map(e => e.name).slice(0, 2)).toEqual(['Zed', 'Alice'])
    expect(getQuarterStanding(allEntries, 'Zed')).toMatchObject({ rank: 1, position: 1, jointTop: false })
    expect(getQuarterStanding(allEntries, 'Alice')).toMatchObject({ rank: 2, position: 2, jointTop: false })
  })

  it('finds a player ranked below the top 10', () => {
    const table = Array.from({ length: 12 }, (_, i) => entry(`P${i + 1}`, 36 - i * 3, 12 - i))
    expect(getQuarterStanding(table, 'P12')).toMatchObject({ rank: 12, position: 12, jointTop: false })
  })

  it('returns null when the player has no row or no name is given', () => {
    const table = [entry('Alice', 9, 3)]
    expect(getQuarterStanding(table, 'Zed')).toBeNull()
    expect(getQuarterStanding(table, null)).toBeNull()
    expect(getQuarterStanding(table, undefined)).toBeNull()
  })
})

describe('getLastResult', () => {
  it('returns the most recent played week', () => {
    const weeks = [
      played(14, '02 Apr 2026', ['Alice'], ['Bob']),
      played(13, '26 Mar 2026', ['Alice'], ['Bob'], 'teamB'),
    ]
    expect(getLastResult(weeks)?.week).toBe(14)
  })

  it('counts a DNF as a result', () => {
    const weeks: Week[] = [
      played(14, '02 Apr 2026', ['Alice'], ['Bob']),
      { id: 'id-15', season: '2026', week: 15, date: '09 Apr 2026', status: 'dnf', teamA: ['Alice'], teamB: ['Bob'], winner: null },
    ]
    expect(getLastResult(weeks)?.week).toBe(15)
  })

  it('ignores cancelled, scheduled and unrecorded weeks', () => {
    const weeks: Week[] = [
      played(14, '02 Apr 2026', ['Alice'], ['Bob']),
      { id: 'id-15', season: '2026', week: 15, date: '09 Apr 2026', status: 'cancelled', teamA: [], teamB: [], winner: null },
      { id: 'id-16', season: '2026', week: 16, date: '16 Apr 2026', status: 'scheduled', teamA: ['Alice'], teamB: ['Bob'], winner: null },
    ]
    expect(getLastResult(weeks)?.week).toBe(14)
  })

  it('returns null with no results', () => {
    expect(getLastResult([])).toBeNull()
  })
})
