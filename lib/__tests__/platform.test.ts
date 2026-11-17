// lib/__tests__/platform.test.ts
import { countSince, daysAgo, formatDay, isPlatformAdmin, leagueStatus, platformMilestones } from '@/lib/platform'
import type { PlatformLeague } from '@/lib/types'

const NOW = new Date('2026-11-17T12:00:00Z')

function league(over: Partial<PlatformLeague>): PlatformLeague {
  return {
    id: 'g1', name: 'Thursday Night Fives', slug: 'thursday-night-fives-k7x', created_at: '2026-11-09T10:00:00Z',
    location: null, day: 'Thursday', kickoff_time: '18:30', creator_name: 'Marcus Reid', creator_email: 'marcus@example.com',
    members: 1, players: 1, results: 0, last_activity: null, ...over,
  }
}

describe('isPlatformAdmin', () => {
  const saved = process.env.PLATFORM_ADMIN_IDS
  afterEach(() => {
    if (saved === undefined) delete process.env.PLATFORM_ADMIN_IDS
    else process.env.PLATFORM_ADMIN_IDS = saved
  })

  it('lets nobody in while the variable is unset or empty', () => {
    delete process.env.PLATFORM_ADMIN_IDS
    expect(isPlatformAdmin('u1')).toBe(false)
    expect(isPlatformAdmin('')).toBe(false)
    process.env.PLATFORM_ADMIN_IDS = ''
    expect(isPlatformAdmin('')).toBe(false)
    process.env.PLATFORM_ADMIN_IDS = ' , '
    expect(isPlatformAdmin('')).toBe(false)
  })

  it('matches a listed id, ignoring spaces around the commas', () => {
    process.env.PLATFORM_ADMIN_IDS = 'u1, u2 ,u3'
    expect(isPlatformAdmin('u1')).toBe(true)
    expect(isPlatformAdmin('u2')).toBe(true)
    expect(isPlatformAdmin('u3')).toBe(true)
  })

  it('refuses an id that is not listed, or only part of one', () => {
    process.env.PLATFORM_ADMIN_IDS = 'u1,u22'
    expect(isPlatformAdmin('u2')).toBe(false)
    expect(isPlatformAdmin('u')).toBe(false)
  })
})

describe('leagueStatus', () => {
  it('is Not started with no results, however recent the last week', () => {
    expect(leagueStatus(league({ results: 0, last_activity: '2026-11-16T10:00:00Z' }), NOW)).toBe('Not started')
  })

  it('is Active when a week was saved within 28 days', () => {
    expect(leagueStatus(league({ results: 3, last_activity: '2026-10-20T12:00:00Z' }), NOW)).toBe('Active')
  })

  it('is Stalled when the last week is older than 28 days', () => {
    expect(leagueStatus(league({ results: 3, last_activity: '2026-10-20T11:59:59Z' }), NOW)).toBe('Stalled')
  })
})

describe('daysAgo and countSince', () => {
  it('gives the instant that many days before now', () => {
    expect(daysAgo(7, NOW)).toBe('2026-11-10T12:00:00.000Z')
  })

  it('counts dates on or after the cut-off and skips nulls', () => {
    const dates = ['2026-11-16T00:00:00Z', '2026-11-10T12:00:00Z', '2026-11-10T11:59:59Z', null]
    expect(countSince(dates, 7, NOW)).toBe(2)
    expect(countSince(dates, 30, NOW)).toBe(3)
  })
})

describe('platformMilestones', () => {
  it('counts the leagues that reached each milestone', () => {
    const leagues = [
      league({ id: 'a' }),
      league({ id: 'b', players: 10, results: 2 }),
      league({ id: 'c', players: 14, results: 9, members: 3 }),
    ]
    expect(platformMilestones(leagues)).toEqual([
      { label: 'Created', count: 3 },
      { label: 'Roster added', count: 2 },
      { label: 'First result', count: 2 },
      { label: 'Second member joined', count: 1 },
      { label: 'Four results', count: 1 },
    ])
  })
})

describe('formatDay', () => {
  it('writes the date on the league clock', () => {
    expect(formatDay('2026-11-09T10:00:00Z')).toBe('9 Nov 2026')
    // 23:30 UTC in July is already the next day in London.
    expect(formatDay('2026-07-01T23:30:00Z')).toBe('2 Jul 2026')
  })
})
