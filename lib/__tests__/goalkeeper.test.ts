import type { Player } from '@/lib/types'

function makePlayer(name: string, isGoalkeeper: boolean): Player {
  return {
    name,
    played: 0, won: 0, drew: 0, lost: 0,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: false, points: 0,
    mentality: isGoalkeeper ? 'goalkeeper' : 'balanced',
    rating: 0, recentForm: '',
  }
}

describe('goalkeeper name derivation', () => {
  it('extracts only goalkeeper names from player list', () => {
    const players = [
      makePlayer('Alice', true),
      makePlayer('Bob', false),
      makePlayer('Carol', true),
    ]
    const goalkeepers = players.filter((p) => p.mentality === 'goalkeeper').map((p) => p.name)
    expect(goalkeepers).toEqual(['Alice', 'Carol'])
  })

  it('returns empty array when no players are goalkeepers', () => {
    const players = [makePlayer('Bob', false), makePlayer('Dave', false)]
    const goalkeepers = players.filter((p) => p.mentality === 'goalkeeper').map((p) => p.name)
    expect(goalkeepers).toEqual([])
  })

  it('returns empty array when player list is empty', () => {
    const goalkeepers = ([] as Player[]).filter((p) => p.mentality === 'goalkeeper').map((p) => p.name)
    expect(goalkeepers).toEqual([])
  })
})

describe('goalkeeper badge inclusion check', () => {
  it('finds a goalkeeper by exact name match', () => {
    const goalkeepers = ['Alice', 'Carol']
    expect(goalkeepers.includes('Alice')).toBe(true)
  })

  it('does not match a non-goalkeeper', () => {
    const goalkeepers = ['Alice']
    expect(goalkeepers.includes('Bob')).toBe(false)
  })

  it('returns undefined (falsy) when goalkeepers prop is undefined', () => {
    // Cast to prevent TypeScript narrowing the literal `undefined` to the `undefined` type
    const goalkeepers = undefined as string[] | undefined
    // This is how TeamList will call it: goalkeepers?.includes(player)
    // undefined means no badge — correct behaviour
    expect(goalkeepers?.includes('Alice')).toBeUndefined()
  })

  it('is case-sensitive — mismatched casing produces no badge', () => {
    const goalkeepers = ['Alice']
    expect(goalkeepers.includes('alice')).toBe(false)
  })
})
