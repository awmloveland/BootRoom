/**
 * @jest-environment node
 */
// Renders every link-preview image through the real next/og (Satori) and the
// real fonts, because the jsdom tests can't catch CSS Satori rejects.
import type { ReactElement } from 'react'
import { shareImageResponse } from '@/lib/ogImage'
import { GenericShareImage } from '@/components/og/frame'
import { ResultImage } from '@/components/og/ResultShareImage'
import { QuarterImage } from '@/components/og/QuarterShareImage'
import { LeagueImage } from '@/components/og/LeagueShareImage'
import { InviteImage } from '@/components/og/InviteShareImage'
import type { SharedLeague, SharedQuarter, SharedResult } from '@/lib/types'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const LONG_LEAGUE_NAME = 'The Sunday Morning Five-A-Side Premier Division Cup'
const LONG_NAME = 'Bartholomew Featherstonehaugh' // 29 characters
const LONG_HIGHLIGHT = 'Bartholomew Featherstonehaugh · 12-game unbeaten run in all competitions this season'

const RESULT: SharedResult = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  week: 41,
  date: '06 Oct 2026',
  winner: 'teamA',
  goalDifference: 3,
  teamA: ['Marcus Reid', 'Rav Singh', 'Tomasz Wren', 'Dev Patel', 'Callum Shaw', 'Elliot Banks'],
  teamB: ['Sofia Marsh', 'Jordan Hale', 'Sam Okafor', 'Kit Marsh', 'Niall Burke', 'Aaron Pike'],
  highlights: [
    { icon: 'flame', text: 'Marcus Reid · 4-game win streak' },
    { icon: 'zap', text: 'Upset · Team B stronger on paper' },
    { icon: 'award', text: 'Rav Singh · 50th appearance' },
  ],
}

const LONG_RESULT: SharedResult = {
  ...RESULT,
  leagueName: LONG_LEAGUE_NAME,
  teamA: Array.from({ length: 7 }, (_, i) => `${LONG_NAME.slice(0, 25)}${i}`),
  teamB: Array.from({ length: 7 }, (_, i) => `${LONG_NAME.slice(0, 24)}${i}x`),
  highlights: (['flame', 'zap', 'award'] as const).map((icon, i) => ({ icon, text: `${LONG_HIGHLIGHT.slice(0, 59)}${i}` })),
}

const QUARTER: SharedQuarter = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  year: 2026,
  q: 3,
  seasonName: 'Summer',
  dateRange: { from: '07 Jul 2026', to: '29 Sep 2026' },
  gamesPlayed: 12,
  podium: [
    { name: 'Jordan Hale', points: 24, won: 8, drew: 0 },
    { name: 'Sam Okafor', points: 21, won: 7, drew: 0 },
    { name: 'Kit Marsh', points: 19, won: 6, drew: 1 },
  ],
}

const LEAGUE: SharedLeague = {
  leagueName: 'The Boot Room',
  slug: 'the-boot-room',
  gamesPlayed: 142,
  playerCount: 38,
  nextGame: { date: '13 Oct 2026', kickoffTime: '19:00', location: 'Powerleague Shoreditch' },
}

const CASES: [string, ReactElement][] = [
  ['result win', <ResultImage key="a" result={RESULT} />],
  ['result win, no highlights', <ResultImage key="b" result={{ ...RESULT, winner: 'teamB', highlights: [] }} />],
  ['result draw with highlights', <ResultImage key="c" result={{ ...RESULT, winner: 'draw', goalDifference: 0 }} />],
  ['result draw, no highlights', <ResultImage key="d" result={{ ...RESULT, winner: 'draw', goalDifference: 0, highlights: [] }} />],
  ['result with overflowing names and highlights', <ResultImage key="e" result={LONG_RESULT} />],
  ['result draw with overflowing names', <ResultImage key="f" result={{ ...LONG_RESULT, winner: 'draw', goalDifference: 0, highlights: [] }} />],
  ['quarter', <QuarterImage key="g" quarter={QUARTER} />],
  ['quarter with overflowing names', <QuarterImage key="h" quarter={{
    ...QUARTER,
    leagueName: LONG_LEAGUE_NAME,
    podium: QUARTER.podium.map((p) => ({ ...p, name: LONG_NAME + ' ' + LONG_NAME })),
  }} />],
  ['league with a next game', <LeagueImage key="i" league={LEAGUE} />],
  ['league without a next game', <LeagueImage key="j" league={{ ...LEAGUE, nextGame: null }} />],
  ['league with a long name', <LeagueImage key="k" league={{ ...LEAGUE, leagueName: LONG_LEAGUE_NAME }} />],
  ['invite', <InviteImage key="l" invite={{ leagueName: 'The Boot Room' }} />],
  ['invite with a long name', <InviteImage key="m" invite={{ leagueName: LONG_LEAGUE_NAME }} />],
  ['generic', <GenericShareImage key="n" />],
]

describe('link-preview images render through Satori', () => {
  it.each(CASES)('%s', async (_name, element) => {
    const res = await shareImageResponse(Promise.resolve(element), 'public, max-age=60')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(bytes.length).toBeGreaterThan(1000)
    expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_SIGNATURE)
  })
})
