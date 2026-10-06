import {
  buildResultShareText,
  computeResultHighlights,
  playerStatsAsOf,
  resultImageHighlights,
  weeksUpTo,
} from '../utils'
import type { Player, Week } from '../types'

function wk(n: number, date: string, teamA: string[], teamB: string[], winner: Week['winner']): Week {
  return { id: `w${n}`, season: '2026', week: n, date, status: 'played', format: '5-a-side', teamA, teamB, winner, goal_difference: winner === 'draw' ? 0 : 1 }
}

const A = ['Ava Stone', 'Ben Hale']
const B = ['Cal Reed', 'Dan Moss']
const HISTORY: Week[] = [
  wk(1, '07 Jul 2026', A, B, 'teamB'),
  wk(2, '14 Jul 2026', A, B, 'teamA'),
  wk(3, '21 Jul 2026', A, B, 'draw'),
  wk(4, '28 Jul 2026', B, A, 'teamA'),
  wk(5, '04 Aug 2026', B, A, 'teamA'),
  wk(6, '11 Aug 2026', A, B, 'teamA'),
  wk(7, '18 Aug 2026', A, B, 'teamA'),
]
const TONIGHT: Week = { ...wk(8, '25 Aug 2026', A, B, 'teamA'), goal_difference: 3, team_a_rating: 4.1, team_b_rating: 4.6 }

function player(name: string, played: number, recentForm: string): Player {
  return { playerId: name, name, played, won: 0, drew: 0, lost: 0, timesTeamA: 0, timesTeamB: 0, winRate: 0, qualified: true, points: 0, mentality: 'balanced', strength: null, recentForm }
}
const PLAYERS = [player('Ava Stone', 9, 'WWWWD'), player('Ben Hale', 24, 'WWLWW'), player('Cal Reed', 7, 'LLLWD'), player('Dan Moss', 7, 'LLDWL')]

const PARAMS = {
  leagueName: 'Test FC', leagueSlug: 'test-fc', week: 8, date: '25 Aug 2026', format: '5-a-side',
  teamA: A, teamB: B, winner: 'teamA' as const, goalDifference: 3, teamARating: 4.1, teamBRating: 4.6,
  players: PLAYERS, weeks: [...HISTORY, TONIGHT],
}

// Captured from buildResultShareText before the refactor, less the losing
// team's line-up (the share now lists winners only).
const GOLDEN_HIGHLIGHTS = '🔥 Ava Stone on a 3-game winning streak\n\n🔥 Ben Hale on a 3-game winning streak\n\n😱 Upset! Team B were stronger on paper (4.6 vs 4.1)\n\n🎖️ Ava Stone played their 10th game tonight\n\n🎖️ Ben Hale played their 25th game tonight\n\n📊 Q3 2026 standings\n1. Ava Stone — 13pts\n2. Ben Hale — 13pts\n3. Cal Reed — 10pts\n4. Dan Moss — 10pts\n\n⚡ In form: Ava Stone (2.6 PPG)'
const GOLDEN_TEXT = `⚽ Test FC — Week 8\n📅 Tue 25 Aug · 5-a-side\n\n🏆 Team A win! (+3 goals)\n\n🔵 Team A\nAva Stone, Ben Hale\n\n${GOLDEN_HIGHLIGHTS}\n\n🔗 https://craft-football.com/test-fc`

describe('buildResultShareText', () => {
  it('matches the golden output', () => {
    expect(buildResultShareText(PARAMS)).toEqual({ shareText: GOLDEN_TEXT, highlightsText: GOLDEN_HIGHLIGHTS })
  })
})

describe('computeResultHighlights', () => {
  it('returns typed highlights in share text order', () => {
    const h = computeResultHighlights({
      date: PARAMS.date, teamA: A, teamB: B, winner: 'teamA',
      teamARating: 4.1, teamBRating: 4.6, players: PLAYERS, weeks: PARAMS.weeks,
    })
    expect(h.items).toEqual([
      { kind: 'win_streak', player: 'Ava Stone', count: 3 },
      { kind: 'win_streak', player: 'Ben Hale', count: 3 },
      { kind: 'upset', strongerTeam: 'Team B', strongRating: '4.6', weakRating: '4.1' },
      { kind: 'milestone', player: 'Ava Stone', games: 10 },
      { kind: 'milestone', player: 'Ben Hale', games: 25 },
    ])
    expect(h.table?.q).toBe(3)
    expect(h.table?.year).toBe(2026)
    expect(h.table?.entries[0]).toEqual(expect.objectContaining({ name: 'Ava Stone', points: 13 }))
    expect(h.inForm).toEqual({ name: 'Ava Stone', ppg: 2.6 })
  })

  it('has no streaks or upset on a draw', () => {
    const h = computeResultHighlights({
      date: PARAMS.date, teamA: A, teamB: B, winner: 'draw',
      teamARating: 4.1, teamBRating: 4.6, players: PLAYERS, weeks: [...HISTORY, { ...TONIGHT, winner: 'draw' }],
    })
    expect(h.items.filter((i) => i.kind !== 'milestone')).toEqual([])
  })
})

describe('resultImageHighlights', () => {
  it('keeps the first three in priority order with short copy', () => {
    const h = computeResultHighlights({
      date: PARAMS.date, teamA: A, teamB: B, winner: 'teamA',
      teamARating: 4.1, teamBRating: 4.6, players: PLAYERS, weeks: PARAMS.weeks,
    })
    expect(resultImageHighlights(h)).toEqual([
      { icon: 'flame', text: 'Ava Stone · 3-game win streak' },
      { icon: 'flame', text: 'Ben Hale · 3-game win streak' },
      { icon: 'zap', text: 'Upset · Team B stronger on paper' },
    ])
  })

  it('falls back to in form and the quarter leader', () => {
    expect(resultImageHighlights({
      items: [{ kind: 'milestone', player: 'Cal Reed', games: 50 }],
      table: { q: 4, year: 2026, entries: [{ name: 'Dan Moss', played: 3, won: 3, drew: 0, lost: 0, points: 9, goalDiff: 4 }] },
      inForm: { name: 'Ava Stone', ppg: 2.4 },
    })).toEqual([
      { icon: 'award', text: "Cal Reed's 50th game" },
      { icon: 'trending-up', text: 'In form · Ava Stone · 2.4 PPG' },
      { icon: 'crown', text: 'Q4 leader · Dan Moss · 9 pts' },
    ])
  })

  it('words an ended unbeaten run', () => {
    expect(resultImageHighlights({ items: [{ kind: 'unbeaten_ended', player: 'Kit Marsh', count: 7 }], table: null, inForm: null }))
      .toEqual([{ icon: 'heart-crack', text: "Kit Marsh's 7-game unbeaten run is over" }])
  })

  it('is empty when nothing applies', () => {
    expect(resultImageHighlights({ items: [], table: null, inForm: null })).toEqual([])
  })
})

describe('weeksUpTo', () => {
  it('returns oldest first, ending with the target', () => {
    const shuffled = [HISTORY[3], TONIGHT, HISTORY[0], HISTORY[6]]
    expect(weeksUpTo(shuffled, 'w4').map((w) => w.id)).toEqual(['w1', 'w4'])
    expect(weeksUpTo(shuffled, 'w8').map((w) => w.id)).toEqual(['w1', 'w4', 'w7', 'w8'])
  })

  it('is empty when the target is missing', () => {
    expect(weeksUpTo(HISTORY, 'nope')).toEqual([])
  })

  it('breaks a same-date tie by week number', () => {
    const later = wk(10, '01 Sep 2026', A, B, 'teamA')
    const earlier = wk(9, '01 Sep 2026', B, A, 'teamB')
    expect(weeksUpTo([later, earlier], 'w10').map((w) => w.id)).toEqual(['w9', 'w10'])
    expect(weeksUpTo([later, earlier], 'w9').map((w) => w.id)).toEqual(['w9'])
  })
})

describe('playerStatsAsOf', () => {
  it('counts games and the last five results, newest first, from played weeks only', () => {
    const stats = playerStatsAsOf([...HISTORY, { ...wk(9, '01 Sep 2026', A, B, null), status: 'scheduled' }])
    expect(stats.find((p) => p.name === 'Ava Stone')).toEqual({ name: 'Ava Stone', played: 7, recentForm: 'WWLLD' })
    expect(stats.find((p) => p.name === 'Cal Reed')).toEqual({ name: 'Cal Reed', played: 7, recentForm: 'LLWWD' })
  })

  it('skips a played week with no winner', () => {
    const stats = playerStatsAsOf([wk(1, '07 Jul 2026', A, B, 'teamA'), wk(2, '14 Jul 2026', A, B, null)])
    expect(stats.find((p) => p.name === 'Cal Reed')).toEqual({ name: 'Cal Reed', played: 1, recentForm: 'L' })
  })
})
