import { latestPlayedMatchDay, lineupConfidence, nextDraftDate, shiftWeeks, sidesFormat } from '@/components/new-league/confidence'

describe('lineupConfidence', () => {
  it.each([
    [0, 0, 'muted', 'Optional. Every past result makes your first lineups fairer.'],
    [2, 20, 'muted', 'Every game you add makes your first lineups fairer.'],
    [3, 30, 'muted', 'Good start. More games, fairer lineups.'],
    [4, 40, 'muted', 'Good start. More games, fairer lineups.'],
    [5, 50, 'sky', 'Good start. More games, fairer lineups.'],
    [6, 60, 'sky', 'Plenty to start with. Add more if you have them.'],
    [9, 90, 'sky', 'Plenty to start with. Add more if you have them.'],
    [10, 100, 'lime', 'Full confidence. Lineups run on real results.'],
    [12, 100, 'lime', 'Full confidence. Lineups run on real results.'],
  ])('%i games → %i%% %s', (games, percent, tone, line) => {
    expect(lineupConfidence(games)).toEqual({ percent, tone, line })
  })
})

describe('draft dates', () => {
  it('steps whole weeks across a month end', () => {
    expect(shiftWeeks('01 Oct 2026', -1)).toBe('24 Sep 2026')
    expect(shiftWeeks('24 Sep 2026', 1)).toBe('01 Oct 2026')
    expect(shiftWeeks('01 Jan 2027', -1)).toBe('25 Dec 2026')
  })
  it('starts a fresh draft a week before the oldest saved game', () => {
    expect(nextDraftDate(['08 Oct 2026', '01 Oct 2026'], '15 Oct 2026')).toBe('24 Sep 2026')
  })
  it('starts at the latest match day when nothing is saved', () => {
    expect(nextDraftDate([], '15 Oct 2026')).toBe('15 Oct 2026')
  })
})

it('names the format from the sides', () => {
  expect(sidesFormat(5, 5)).toBe('5-a-side')
  expect(sidesFormat(3, 4)).toBe('4v3')
})

// Thursday 19 Nov 2026; London is on GMT, so the clock times below are league time.
describe('latestPlayedMatchDay', () => {
  afterEach(() => jest.useRealTimers())
  const at = (iso: string) => jest.useFakeTimers().setSystemTime(new Date(iso))

  it('is last week on a match day before kick-off', () => {
    at('2026-11-19T15:00:00Z')
    expect(latestPlayedMatchDay(4, '20:00')).toBe('12 Nov 2026')
  })
  it('is today once the game has kicked off', () => {
    at('2026-11-19T20:01:00Z')
    expect(latestPlayedMatchDay(4, '20:00')).toBe('19 Nov 2026')
  })
  it('is the last match day on any other day', () => {
    at('2026-11-21T10:00:00Z')
    expect(latestPlayedMatchDay(4, '20:00')).toBe('19 Nov 2026')
  })
  it('is today for a league with no match day', () => {
    at('2026-11-19T15:00:00Z')
    expect(latestPlayedMatchDay(null, null)).toBe('19 Nov 2026')
  })
})
