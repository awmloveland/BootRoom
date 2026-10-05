import { pointsPerGame, formatPointsPerGame } from '../utils'

describe('pointsPerGame', () => {
  it('divides points by games played', () => {
    expect(pointsPerGame({ points: 7, played: 3 })).toBeCloseTo(2.333, 3)
  })

  it('reads as 0 with no games played', () => {
    expect(pointsPerGame({ points: 0, played: 0 })).toBe(0)
  })
})

describe('formatPointsPerGame', () => {
  it('shows two decimal places', () => {
    expect(formatPointsPerGame({ points: 7, played: 3 })).toBe('2.33')
    expect(formatPointsPerGame({ points: 9, played: 3 })).toBe('3.00')
    expect(formatPointsPerGame({ points: 0, played: 0 })).toBe('0.00')
  })
})
