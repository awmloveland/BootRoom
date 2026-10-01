import {
  ordinalSuffix,
  leagueLandingPath,
  formatFixtureDate,
  getNextMatchSeed,
  getOverviewViewerCard,
} from '@/lib/utils'
import type { Week } from '@/lib/types'

describe('ordinalSuffix', () => {
  it.each([
    [1, 'st'], [2, 'nd'], [3, 'rd'], [4, 'th'],
    [11, 'th'], [12, 'th'], [13, 'th'],
    [21, 'st'], [22, 'nd'], [23, 'rd'], [101, 'st'], [111, 'th'],
  ])('%i → %s', (n, suffix) => {
    expect(ordinalSuffix(n)).toBe(suffix)
  })
})

describe('leagueLandingPath', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
  const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  // iPadOS Safari sends a desktop user agent by default.
  const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

  it('sends phones to Overview', () => {
    expect(leagueLandingPath('the-boot-room', IPHONE)).toBe('/the-boot-room/overview')
    expect(leagueLandingPath('the-boot-room', ANDROID_PHONE)).toBe('/the-boot-room/overview')
  })

  it('sends Android tablets to Overview', () => {
    expect(leagueLandingPath('the-boot-room', ANDROID_TABLET)).toBe('/the-boot-room/overview')
  })

  it('sends desktops and iPads to Results', () => {
    expect(leagueLandingPath('the-boot-room', DESKTOP)).toBe('/the-boot-room/results')
    expect(leagueLandingPath('the-boot-room', IPAD)).toBe('/the-boot-room/results')
  })

  it('falls back to Results with no user agent', () => {
    expect(leagueLandingPath('the-boot-room', null)).toBe('/the-boot-room/results')
    expect(leagueLandingPath('the-boot-room', '')).toBe('/the-boot-room/results')
  })

  it('trusts the measured viewport over the user agent', () => {
    // A narrow desktop window or an iPad in portrait
    expect(leagueLandingPath('the-boot-room', DESKTOP, 'narrow')).toBe('/the-boot-room/overview')
    expect(leagueLandingPath('the-boot-room', IPAD, 'narrow')).toBe('/the-boot-room/overview')
    // An Android tablet in landscape
    expect(leagueLandingPath('the-boot-room', ANDROID_TABLET, 'wide')).toBe('/the-boot-room/results')
  })

  it('ignores an unrecognised viewport value', () => {
    expect(leagueLandingPath('the-boot-room', DESKTOP, 'huge')).toBe('/the-boot-room/results')
    expect(leagueLandingPath('the-boot-room', IPHONE, undefined)).toBe('/the-boot-room/overview')
  })
})

describe('formatFixtureDate', () => {
  it('formats a week date as weekday, day and month', () => {
    expect(formatFixtureDate('09 Apr 2026')).toBe('Thu 09 Apr')
  })

  it('pads a single-digit day', () => {
    expect(formatFixtureDate('2 Apr 2026')).toBe('Thu 02 Apr')
  })
})

describe('getNextMatchSeed', () => {
  function week(overrides: Partial<Week> & { week: number; date: string; status: Week['status'] }): Week {
    return { id: `id-${overrides.week}`, season: '2026', teamA: [], teamB: [], winner: null, ...overrides }
  }

  // Monday 6 Apr 2026, midday. Thursday 9 Apr is upcoming; Thursday 2 Apr is past its 20:00 deadline.
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date(2026, 3, 6, 12)) })
  afterEach(() => { jest.useRealTimers() })

  it('returns an upcoming scheduled week as a ScheduledWeek', () => {
    const weeks = [
      week({ week: 14, date: '02 Apr 2026', status: 'played', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      week({ week: 15, date: '09 Apr 2026', status: 'scheduled', format: '5-a-side', teamA: ['Alice'], teamB: ['Bob'], team_a_rating: 1.5, team_b_rating: 1.4 }),
    ]
    expect(getNextMatchSeed(weeks)).toEqual({
      id: 'id-15',
      season: '2026',
      week: 15,
      date: '09 Apr 2026',
      format: '5-a-side',
      teamA: ['Alice'],
      teamB: ['Bob'],
      status: 'scheduled',
      lineupMetadata: null,
      team_a_rating: 1.5,
      team_b_rating: 1.4,
    })
  })

  it('returns an upcoming cancelled week', () => {
    const seed = getNextMatchSeed([week({ week: 15, date: '09 Apr 2026', status: 'cancelled' })])
    expect(seed).toMatchObject({ id: 'id-15', status: 'cancelled', format: null })
  })

  it('returns null when the latest row is unrecorded', () => {
    expect(getNextMatchSeed([week({ week: 14, date: '02 Apr 2026', status: 'unrecorded' })])).toBeNull()
  })

  it('returns null when the scheduled week is past its deadline', () => {
    expect(getNextMatchSeed([week({ week: 14, date: '02 Apr 2026', status: 'scheduled', teamA: ['Alice'], teamB: ['Bob'] })])).toBeNull()
  })

  it('uses the latest-dated row, not an older unrecorded one', () => {
    const weeks = [
      week({ week: 14, date: '02 Apr 2026', status: 'unrecorded' }),
      week({ week: 15, date: '09 Apr 2026', status: 'scheduled', teamA: ['Alice'], teamB: ['Bob'] }),
    ]
    expect(getNextMatchSeed(weeks)?.week).toBe(15)
  })

  it('returns null when there is nothing scheduled, cancelled or unrecorded', () => {
    expect(getNextMatchSeed([week({ week: 14, date: '02 Apr 2026', status: 'played', winner: 'draw' })])).toBeNull()
    expect(getNextMatchSeed([])).toBeNull()
  })
})

describe('getOverviewViewerCard', () => {
  const base = { isAuthenticated: true, tier: 'member' as const, claimStatus: 'none' as const, hasLinkedPlayer: false }

  it('asks a signed-out visitor to sign in', () => {
    expect(getOverviewViewerCard({ ...base, isAuthenticated: false, tier: 'public' })).toBe('sign-in')
  })

  it('shows nothing to a signed-in non-member', () => {
    expect(getOverviewViewerCard({ ...base, tier: 'public' })).toBeNull()
  })

  it('asks a member with no claim to link a profile', () => {
    expect(getOverviewViewerCard(base)).toBe('link-profile')
  })

  it('shows stats to a member or admin with a linked player', () => {
    expect(getOverviewViewerCard({ ...base, claimStatus: 'approved', hasLinkedPlayer: true })).toBe('your-stats')
    expect(getOverviewViewerCard({ ...base, tier: 'admin', claimStatus: 'approved', hasLinkedPlayer: true })).toBe('your-stats')
  })

  it('shows nothing while a claim is pending or after it is rejected', () => {
    expect(getOverviewViewerCard({ ...base, claimStatus: 'pending' })).toBeNull()
    expect(getOverviewViewerCard({ ...base, claimStatus: 'rejected' })).toBeNull()
  })

  it('shows nothing to an admin with no claim', () => {
    expect(getOverviewViewerCard({ ...base, tier: 'admin' })).toBeNull()
  })

  it('shows nothing when the claim is approved but the player is not in the stats list', () => {
    expect(getOverviewViewerCard({ ...base, claimStatus: 'approved', hasLinkedPlayer: false })).toBeNull()
  })
})
