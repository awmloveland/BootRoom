// __tests__/margin-of-victory.test.ts
import type { Week } from '@/lib/types'

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
