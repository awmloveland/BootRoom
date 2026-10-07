import { MAN_ADVANTAGE_PER_PLAYER, manAdvantage, winProbability } from '@/lib/utils'

describe('manAdvantage', () => {
  it('is zero for even teams', () => {
    expect(manAdvantage(5, 5)).toBe(0)
  })

  it('is positive when Team A has the extra player', () => {
    expect(manAdvantage(6, 5)).toBe(MAN_ADVANTAGE_PER_PLAYER)
  })

  it('is negative when Team B has the extra player', () => {
    expect(manAdvantage(5, 6)).toBe(-MAN_ADVANTAGE_PER_PLAYER)
  })

  it('scales with the size difference', () => {
    expect(manAdvantage(7, 5)).toBe(2 * MAN_ADVANTAGE_PER_PLAYER)
  })
})

describe('winProbability with a man advantage', () => {
  it('matches the two-argument call when the advantage is zero', () => {
    expect(winProbability(55, 50, 0)).toBe(winProbability(55, 50))
  })

  it('tilts towards Team A when they have the extra player', () => {
    const even = winProbability(50, 50)
    const withExtra = winProbability(50, 50, manAdvantage(6, 5))
    expect(even).toBe(0.5)
    expect(withExtra).toBeGreaterThan(0.6)
    expect(withExtra).toBeLessThan(0.7)
  })

  it('tilts towards Team B when they have the extra player', () => {
    expect(winProbability(50, 50, manAdvantage(5, 6))).toBeLessThan(0.4)
  })

  it('reads as even when the shorter side is better by exactly the handicap', () => {
    expect(winProbability(50, 50 + MAN_ADVANTAGE_PER_PLAYER, manAdvantage(6, 5))).toBe(0.5)
  })
})
