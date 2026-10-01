import { buildLeagueTitle, getLeagueTitleStatus } from '@/lib/utils'
import type { Week } from '@/lib/types'

// Thursday 01 Oct 2026, mid-afternoon.
const NOW = new Date(2026, 9, 1, 15, 0)
const THURSDAY = 4

function week(date: string, status: Week['status'], winner: Week['winner'] = null): Week {
  return { season: '2026', week: 40, date, status, teamA: [], teamB: [], winner }
}

describe('getLeagueTitleStatus', () => {
  it('shows the full-time result once today’s game is recorded', () => {
    expect(getLeagueTitleStatus([week('01 Oct 2026', 'played', 'teamA')], NOW, THURSDAY)).toBe('Full time: Team A won')
    expect(getLeagueTitleStatus([week('01 Oct 2026', 'played', 'teamB')], NOW, THURSDAY)).toBe('Full time: Team B won')
    expect(getLeagueTitleStatus([week('01 Oct 2026', 'played', 'draw')], NOW, THURSDAY)).toBe('Full time: draw')
  })

  it('flags a game that did not finish', () => {
    expect(getLeagueTitleStatus([week('01 Oct 2026', 'dnf')], NOW, THURSDAY)).toBe('Did not finish')
  })

  it('flags a cancelled game', () => {
    expect(getLeagueTitleStatus([week('01 Oct 2026', 'cancelled')], NOW, THURSDAY)).toBe('Cancelled today')
  })

  it('says match day when lineups are set for today', () => {
    expect(getLeagueTitleStatus([week('01 Oct 2026', 'scheduled')], NOW)).toBe('Match day')
  })

  it('says match day on the league day even before lineups are set', () => {
    expect(getLeagueTitleStatus([], NOW, THURSDAY)).toBe('Match day')
  })

  it('waits for the result once today’s game has gone unrecorded', () => {
    expect(getLeagueTitleStatus([week('01 Oct 2026', 'unrecorded')], NOW, THURSDAY)).toBe('Awaiting result')
  })

  it('looks ahead to a game tomorrow', () => {
    expect(getLeagueTitleStatus([], NOW, 5)).toBe('Match day tomorrow')
    expect(getLeagueTitleStatus([week('02 Oct 2026', 'scheduled')], NOW)).toBe('Match day tomorrow')
  })

  it('stays quiet when tomorrow’s game is cancelled', () => {
    expect(getLeagueTitleStatus([week('02 Oct 2026', 'cancelled')], NOW, 5)).toBeNull()
  })

  it('stays quiet on other days', () => {
    expect(getLeagueTitleStatus([week('24 Sep 2026', 'played', 'teamA')], NOW, 2)).toBeNull()
    expect(getLeagueTitleStatus([], NOW)).toBeNull()
  })

  it('treats Sunday (0) as a valid league day', () => {
    const sunday = new Date(2026, 9, 4, 12, 0)
    expect(getLeagueTitleStatus([], sunday, 0)).toBe('Match day')
  })
})

describe('buildLeagueTitle', () => {
  it('puts the page before the league name', () => {
    expect(buildLeagueTitle({ page: 'Players', leagueName: 'The Boot Room' })).toBe('Players · The Boot Room')
  })

  it('leads with a pending count when there is one', () => {
    expect(buildLeagueTitle({ page: 'Results', leagueName: 'The Boot Room', pendingCount: 3 })).toBe('(3) Results · The Boot Room')
  })

  it('leaves the count off when nothing is pending', () => {
    expect(buildLeagueTitle({ page: 'Results', leagueName: 'The Boot Room', pendingCount: 0 })).toBe('Results · The Boot Room')
  })
})
