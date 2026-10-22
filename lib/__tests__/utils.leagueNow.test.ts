import { leagueNow, isPastDeadline, isAwaitingWindowOver, getLeagueTitleStatus, formatWeekDate } from '@/lib/utils'

// Instants chosen so London and UTC disagree (British Summer Time).
const BST_EVENING = Date.UTC(2026, 6, 2, 19, 30) // 20:30 in London on Thu 2 Jul 2026
const BST_LATE = Date.UTC(2026, 6, 2, 23, 30)    // 00:30 on Fri 3 Jul in London, still 2 Jul in UTC
const GMT_EVENING = Date.UTC(2026, 0, 8, 20, 30) // 20:30 in London on Thu 8 Jan 2026

describe('leagueNow', () => {
  it('reads the London wall clock during British Summer Time', () => {
    const now = leagueNow(BST_EVENING)
    expect([now.getDate(), now.getHours(), now.getMinutes()]).toEqual([2, 20, 30])
  })

  it('rolls to the next London day before UTC does', () => {
    expect(formatWeekDate(leagueNow(BST_LATE))).toBe('03 Jul 2026')
  })

  it('matches UTC in winter', () => {
    const now = leagueNow(GMT_EVENING)
    expect([now.getDate(), now.getHours()]).toEqual([8, 20])
  })
})

describe('deadlines on the league clock', () => {
  afterEach(() => jest.useRealTimers())

  it('treats a 20:00 kick-off as passed at 20:30 London time in summer', () => {
    jest.useFakeTimers().setSystemTime(BST_EVENING)
    expect(isPastDeadline('02 Jul 2026', '20:00')).toBe(true)
  })

  it('keeps the awaiting window open until the end of the day after the game', () => {
    jest.useFakeTimers().setSystemTime(BST_LATE)
    expect(isAwaitingWindowOver('02 Jul 2026')).toBe(false)
  })

  it('names the tab title from the London date', () => {
    const weeks = [{ id: 'w', season: '2026', week: 1, date: '03 Jul 2026', status: 'scheduled' as const, teamA: [], teamB: [], winner: null }]
    expect(getLeagueTitleStatus(weeks, leagueNow(BST_LATE))).toBe('Match day')
  })
})
