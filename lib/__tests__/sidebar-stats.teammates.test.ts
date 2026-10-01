import { computeTeammates } from '@/lib/sidebar-stats'
import type { Week, WeekStatus, Winner } from '@/lib/types'

function week(n: number, teamA: string[], teamB: string[], winner: Winner = 'teamA', status: WeekStatus = 'played'): Week {
  return { season: '2026', week: n, date: '01 Jan 2026', status, teamA, teamB, winner }
}

/** `count` played weeks with the same line-ups and result. */
function repeat(count: number, teamA: string[], teamB: string[], winner: Winner = 'teamA', start = 1): Week[] {
  return Array.from({ length: count }, (_, i) => week(start + i, teamA, teamB, winner))
}

describe('computeTeammates', () => {
  it('excludes pairs with fewer than 5 games together', () => {
    const weeks = [
      ...repeat(5, ['Alice', 'Bob', 'Cara'], ['Dan', 'Eve']),
      ...repeat(4, ['Alice', 'Finn'], ['Dan', 'Eve'], 'teamA', 10),
    ]
    expect(computeTeammates('Alice', weeks).map((t) => t.name)).toEqual(['Bob', 'Cara'])
  })

  it('honours a custom minimum', () => {
    const weeks = repeat(3, ['Alice', 'Bob'], ['Dan'])
    expect(computeTeammates('Alice', weeks)).toEqual([])
    expect(computeTeammates('Alice', weeks, 3)).toEqual([{ name: 'Bob', played: 3, won: 3, drew: 0, winRate: 100 }])
  })

  it('counts draws as played but not won', () => {
    const weeks = [
      ...repeat(3, ['Alice', 'Bob'], ['Dan'], 'teamA'),
      ...repeat(2, ['Alice', 'Bob'], ['Dan'], 'draw', 10),
    ]
    expect(computeTeammates('Alice', weeks)).toEqual([{ name: 'Bob', played: 5, won: 3, drew: 2, winRate: 60 }])
  })

  it('counts a win when the player is on Team B', () => {
    const weeks = repeat(5, ['Dan'], ['Alice', 'Bob'], 'teamB')
    expect(computeTeammates('Alice', weeks)).toEqual([{ name: 'Bob', played: 5, won: 5, drew: 0, winRate: 100 }])
  })

  it('ignores weeks that were not played', () => {
    const lineup: [string[], string[]] = [['Alice', 'Bob'], ['Dan']]
    const weeks = [
      ...repeat(4, ...lineup),
      week(10, ...lineup, null, 'cancelled'),
      week(11, ...lineup, null, 'unrecorded'),
      week(12, ...lineup, null, 'scheduled'),
      week(13, ...lineup, null, 'dnf'),
    ]
    expect(computeTeammates('Alice', weeks)).toEqual([])
    expect(computeTeammates('Alice', weeks, 4)).toEqual([{ name: 'Bob', played: 4, won: 4, drew: 0, winRate: 100 }])
  })

  it('never counts opponents', () => {
    const weeks = repeat(6, ['Alice', 'Bob'], ['Dan', 'Eve'])
    const names = computeTeammates('Alice', weeks).map((t) => t.name)
    expect(names).toEqual(['Bob'])
  })

  it('leaves out guests', () => {
    const weeks = repeat(5, ['Alice', 'Bob', 'Bob +1'], ['Dan'])
    expect(computeTeammates('Alice', weeks).map((t) => t.name)).toEqual(['Bob'])
  })

  it('sorts by win rate, then by games together', () => {
    const weeks = [
      // Bob: 5 from 5 (100%). Cara: 4 from 5 (80%). Finn: 8 from 10 (80%).
      ...repeat(4, ['Alice', 'Bob', 'Cara', 'Finn'], ['Dan']),
      week(5, ['Alice', 'Bob', 'Finn'], ['Dan', 'Cara']),
      week(6, ['Alice', 'Cara', 'Finn'], ['Dan', 'Bob'], 'teamB'),
      ...repeat(3, ['Alice', 'Finn'], ['Dan'], 'teamA', 7),
      week(10, ['Alice', 'Finn'], ['Dan'], 'teamB'),
    ]
    const result = computeTeammates('Alice', weeks)
    expect(result.map((t) => [t.name, t.won, t.played, t.winRate])).toEqual([
      ['Bob', 5, 5, 100],
      ['Finn', 8, 10, 80],
      ['Cara', 4, 5, 80],
    ])
  })

  it('rounds the win rate to a whole number', () => {
    const weeks = [
      ...repeat(2, ['Alice', 'Bob'], ['Dan'], 'teamA'),
      ...repeat(4, ['Alice', 'Bob'], ['Dan'], 'teamB', 10),
    ]
    expect(computeTeammates('Alice', weeks)[0].winRate).toBe(33)
  })

  it('returns nothing for a player with no games', () => {
    expect(computeTeammates('Zoe', repeat(5, ['Alice', 'Bob'], ['Dan']))).toEqual([])
  })
})
