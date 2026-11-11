// lib/__tests__/fees.weeksSinceCreation.test.ts
import { weeksSinceCreation } from '@/lib/fees'
import type { Week } from '@/lib/types'

const week = (date: string): Week => ({ season: date.slice(-4), week: 1, date, status: 'played', teamA: [], teamB: [], winner: 'teamA' })

it('drops weeks dated before the day the league was created', () => {
  const weeks = [week('02 Apr 2026'), week('09 Apr 2026'), week('16 Apr 2026')]
  expect(weeksSinceCreation(weeks, '2026-04-09T18:30:00.000Z').map((w) => w.date)).toEqual(['09 Apr 2026', '16 Apr 2026'])
})

it('keeps everything when there is no creation date', () => {
  const weeks = [week('02 Apr 2026')]
  expect(weeksSinceCreation(weeks, null)).toBe(weeks)
})

it('reads the creation day on the league clock, not UTC', () => {
  const weeks = [week('09 Apr 2026')]
  // 00:30 BST on 9 Apr is still 8 Apr in UTC; the week is on the creation day.
  expect(weeksSinceCreation(weeks, '2026-04-08T23:30:00.000Z')).toHaveLength(1)
  // 00:30 BST on 10 Apr: created the day after the game.
  expect(weeksSinceCreation(weeks, '2026-04-09T23:30:00.000Z')).toHaveLength(0)
})
