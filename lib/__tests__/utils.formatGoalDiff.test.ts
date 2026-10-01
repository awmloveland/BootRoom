import { formatGoalDiff } from '../utils'

describe('formatGoalDiff', () => {
  it('prefixes positive values with a plus sign', () => {
    expect(formatGoalDiff(5)).toBe('+5')
    expect(formatGoalDiff(12)).toBe('+12')
  })

  it('shows zero without a sign', () => {
    expect(formatGoalDiff(0)).toBe('0')
  })

  it('shows negative values with a minus sign', () => {
    expect(formatGoalDiff(-3)).toBe('-3')
  })
})
