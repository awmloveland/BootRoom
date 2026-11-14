import { formatLongFixtureDate } from '@/lib/dates'

it('writes the full weekday and drops the leading zero', () => {
  expect(formatLongFixtureDate('09 Apr 2026')).toBe('Thursday 9 Apr')
  expect(formatLongFixtureDate('30 Oct 2026')).toBe('Friday 30 Oct')
})
