import { computeRecords, joinNames } from '../records'
import type { LeagueRecord, Week, Winner } from '../types'

// Fixed "now" in Q4 2026 so every quarter below is completed.
const NOW = new Date(2026, 9, 1)

let weekNo = 0
function game(date: string, teamA: string[], teamB: string[], winner: Winner, gd = 1): Week {
  weekNo++
  return {
    season: date.split(' ')[2],
    week: weekNo,
    date,
    status: 'played',
    teamA,
    teamB,
    winner,
    goal_difference: winner === 'draw' ? 0 : gd,
  }
}

/** n Monday dates from 05 Jan 2026, one week apart, 'DD MMM YYYY'. */
function mondays(n: number, from = new Date(2026, 0, 5)): string[] {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(from)
    d.setDate(d.getDate() + i * 7)
    return `${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`
  })
}

function find(records: LeagueRecord[], key: string): LeagueRecord {
  const r = records.find((x) => x.key === key)
  if (!r) throw new Error(`missing record ${key}`)
  return r
}

describe('joinNames', () => {
  it('joins one, two, three and many names', () => {
    expect(joinNames([])).toBe('Nobody yet')
    expect(joinNames(['Will'])).toBe('Will')
    expect(joinNames(['Will', 'Joe R'])).toBe('Will & Joe R')
    expect(joinNames(['Luke', 'Ian', 'Alice'])).toBe('Luke, Ian & Alice')
    expect(joinNames(['A', 'B', 'C', 'D', 'E'])).toBe('A, B & 3 others')
  })
})

describe('computeRecords: empty league', () => {
  it('shows nobody yet everywhere', () => {
    const data = computeRecords([], NOW)
    expect(data.totalGames).toBe(0)
    for (const r of [...data.career, ...data.streaks, ...data.duos]) {
      expect(r.holderLabel).toBe('Nobody yet')
      expect(r.top).toEqual([])
    }
    expect(data.waitForWin).toBeNull()
    expect(data.rivalry).toBeNull()
    expect(data.titles).toEqual([])
    expect(data.biggestWin).toBeNull()
    expect(data.nextMilestone).toBeNull()
  })
})

describe('computeRecords: career', () => {
  const d = mondays(4)
  const weeks = [
    game(d[0], ['Will', 'Joe R'], ['Matt', 'Jaff +1'], 'teamA'),
    game(d[1], ['Will'], ['Joe R', 'Jaff +1'], 'draw'),
    game(d[2], ['Will', 'Joe R'], ['Matt', 'Luke'], 'teamB'),
    game(d[3], ['Joe R'], ['Will', 'Matt'], 'teamA'),
    // Cancelled and unfinished weeks never count.
    { ...game('02 Feb 2026', ['Will'], ['Matt'], 'teamA'), status: 'cancelled' as const },
    { ...game('09 Feb 2026', ['Will'], ['Matt'], 'teamA'), status: 'dnf' as const },
  ]
  const data = computeRecords(weeks, NOW)

  it('counts only played games and leaves guests out', () => {
    expect(data.totalGames).toBe(4)
    const apps = find(data.career, 'most_appearances')
    expect(apps.holders).toEqual(['Joe R', 'Will'])
    expect(apps.holderLabel).toBe('Joe R & Will')
    expect(apps.badge).toBe('tied')
    expect(apps.value).toBe('4')
    expect(apps.note).toBe('of 4 games')
    expect(apps.top.map((e) => e.name)).not.toContain('Jaff +1')
  })

  it('scores points as W=3 D=1 with the W/D split as qualifier', () => {
    // Joe R: W D L W → 2W 1D = 7
    const pts = find(data.career, 'most_points')
    expect(pts.holders).toEqual(['Joe R'])
    expect(pts.value).toBe('7')
    expect(pts.top[0]).toEqual({ name: 'Joe R', value: '7', sub: '2W 1D' })
    expect(pts.note.startsWith('W=3 D=1 · ')).toBe(true)
  })

  it('gives the runner-up in the most wins note', () => {
    const wins = find(data.career, 'most_wins')
    expect(wins.holders).toEqual(['Joe R'])
    expect(wins.note).toBe('Luke, Matt and Will on 1')
  })

  it('needs 15 games for win rate and points per game', () => {
    const rate = find(data.career, 'best_win_rate')
    expect(rate.holderLabel).toBe('Nobody yet')
    expect(rate.top).toEqual([])
    expect(rate.note).toBe('Min 15 games to qualify')
  })
})

describe('computeRecords: rates with qualifiers', () => {
  it('ranks win rate among 15+ game players only', () => {
    const d = mondays(16)
    // Luke plays 15 and wins 10; Matt plays 16 and wins 6; Sub plays 2, too few to qualify.
    const weeks = d.map((date, i) => {
      if (i === 15) return game(date, ['Matt', 'Sub'], ['Other'], 'teamA')
      const lukeWins = i < 10
      return game(date, ['Luke', ...(i === 14 ? ['Sub'] : [])], ['Matt'], lukeWins ? 'teamA' : 'teamB')
    })
    const data = computeRecords(weeks, NOW)
    const rate = find(data.career, 'best_win_rate')
    expect(rate.holders).toEqual(['Luke'])
    expect(rate.value).toBe('67%')
    expect(rate.note).toBe('Min 15 games · 10 of 15')
    expect(rate.top.map((e) => e.name)).toEqual(['Luke', 'Matt'])
    expect(rate.top[0].sub).toBe('15 GP')
    expect(rate.foot).toBe('Minimum 15 games to qualify. 2 players are eligible.')
    const ppg = find(data.career, 'best_ppg')
    expect(ppg.value).toBe('2.00')
    expect(ppg.note).toBe('Min 15 games · 30 pts from 15')
  })
})

describe('computeRecords: streaks', () => {
  const d = mondays(8)
  // Jaff: L W W D W W W(live). Alice: L L L L W ... Will plays every game.
  const weeks = [
    game(d[0], ['Will', 'Alice'], ['Jaff'], 'teamA'),
    game(d[1], ['Jaff', 'Will'], ['Alice'], 'teamA'),
    game(d[2], ['Jaff'], ['Alice', 'Will'], 'teamA'),
    game(d[3], ['Jaff'], ['Alice', 'Will'], 'draw'),
    game(d[4], ['Jaff', 'Alice'], ['Will'], 'teamA'),
    game(d[5], ['Jaff'], ['Will'], 'teamA'),
    game(d[6], ['Jaff'], ['Will'], 'teamA'),
  ]
  const data = computeRecords(weeks, NOW)

  it('finds the longest winning streak', () => {
    const r = find(data.streaks, 'longest_win_streak')
    expect(r.holders).toEqual(['Jaff'])
    expect(r.value).toBe('3')
    expect(r.badge).toBe('live')
  })

  it('marks a live unbeaten run with the date of the last loss', () => {
    const r = find(data.streaks, 'longest_unbeaten_run')
    expect(r.holders).toEqual(['Jaff'])
    expect(r.value).toBe('6')
    expect(r.badge).toBe('live')
    expect(r.note).toBe(`Still going · last loss ${Number(d[0].slice(0, 2))} Jan`)
    expect(r.top[0].sub).toBe('Live')
  })

  it('counts consecutive appearances over league games', () => {
    const r = find(data.streaks, 'most_consecutive_appearances')
    expect(r.holderLabel).toBe('Jaff & Will')
    expect(r.value).toBe('7')
    expect(r.badge).toBe('iron_man')
  })

  it('softens the longest wait for a win', () => {
    // Alice: W L L D W → winless run of 3, ended on d[4]. Will: W W L D L L L → 5, still going.
    expect(data.waitForWin?.holders).toEqual(['Will'])
    expect(data.waitForWin?.value).toBe('5')
    expect(data.waitForWin?.note).toBe('It happens to everyone')
    expect(data.waitForWin?.top).toEqual([])
  })

  it('shows the date range once an unbeaten run has ended', () => {
    const ended = computeRecords([...weeks, game('23 Feb 2026', ['Will'], ['Jaff'], 'teamA')], NOW)
    const r = find(ended.streaks, 'longest_unbeaten_run')
    expect(r.badge).toBeUndefined()
    expect(r.note).toBe('12 Jan – 16 Feb 2026')
  })
})

describe('computeRecords: trophy cabinet', () => {
  // Draws between fresh pairs (at most 2 pts each) to bring a quarter up to
  // the five games it needs to crown a champion, without touching the top.
  const filler = (dates: string[]) =>
    dates.map((d, i) => game(d, [`F${2 * Math.floor(i / 2) + 1}`], [`F${2 * Math.floor(i / 2) + 2}`], 'draw'))

  it('lists champions, GD deciders and shared quarters', () => {
    const weeks = [
      // Q1 2026: Roy wins outright.
      game('05 Jan 2026', ['Roy'], ['Ian'], 'teamA'),
      ...filler(['12 Jan 2026', '19 Jan 2026', '26 Jan 2026', '02 Feb 2026']),
      // Q2 2026: Jaff and Joe R both on 3 pts, Jaff ahead on GD.
      game('06 Apr 2026', ['Jaff'], ['Ian'], 'teamA', 4),
      game('13 Apr 2026', ['Joe R'], ['Ian'], 'teamA', 1),
      ...filler(['20 Apr 2026', '27 Apr 2026', '04 May 2026']),
      // Q3 2026: Luke and Alice level on everything.
      game('06 Jul 2026', ['Luke', 'Alice'], ['Ian'], 'teamA', 2),
      ...filler(['13 Jul 2026', '20 Jul 2026', '27 Jul 2026', '03 Aug 2026']),
      // Q3 2025: Roy again.
      game('07 Jul 2025', ['Roy'], ['Ian'], 'teamA'),
      ...filler(['14 Jul 2025', '21 Jul 2025', '28 Jul 2025', '04 Aug 2025']),
      // Q4 2025: only four games, so Ian's win earns no title.
      game('06 Oct 2025', ['Ian'], ['Roy'], 'teamA'),
      ...filler(['13 Oct 2025', '20 Oct 2025', '27 Oct 2025']),
    ]
    const data = computeRecords(weeks, NOW)
    expect(data.quartersPlayed).toBe(4)
    expect(data.titles).toEqual([
      { key: 'Roy', name: 'Roy', quarters: 'Q1 2026 · Q3 2025', count: 2, shared: false },
      { key: 'Jaff', name: 'Jaff', quarters: 'Q2 2026 · on GD', count: 1, shared: false },
      { key: 'shared-2026-3', name: 'Alice & Luke', quarters: 'Q3 2026 · Shared', count: 1, shared: true },
    ])
  })
})

describe('computeRecords: partnerships and rivalries', () => {
  const d = mondays(12)
  // Roy & Will together 12 times, win 9. Matt v Jaff opposed 12 times.
  const weeks = d.map((date, i) =>
    game(date, ['Roy', 'Will', 'Matt'], ['Jaff', 'Luke'], i < 9 ? 'teamA' : i < 11 ? 'teamB' : 'draw')
  )
  const data = computeRecords(weeks, NOW)

  it('names the pair with most games together', () => {
    const r = find(data.duos, 'most_games_as_teammates')
    expect(r.value).toBe('12')
    expect(r.badge).toBe('tied')
    expect(r.note).toBe('9 wins together')
  })

  it('ranks the best duo among pairs with 10+ games', () => {
    const r = find(data.duos, 'best_duo')
    expect(r.value).toBe('75%')
    expect(r.top[0].sub).toBe('9 of 12')
    expect(r.foot).toBe('Minimum 10 games together to qualify.')
  })

  it('puts the rivalry leader first', () => {
    expect(data.rivalry?.games).toBe(12)
    expect(data.rivalry?.draws).toBe(1)
    expect(data.rivalry?.leader.wins).toBe(9)
    expect(data.rivalry?.trailer.wins).toBe(2)
  })
})

describe('computeRecords: milestones and match records', () => {
  const d = mondays(12)
  const weeks = d.map((date, i) =>
    game(date, ['Will', ...(i < 3 ? ['Matt'] : [])], ['Joe'], i % 3 === 0 ? 'teamB' : 'teamA', i === 4 || i === 7 ? 6 : 2)
  )
  const data = computeRecords(weeks, NOW)

  it('counts players per appearance badge and the next milestone', () => {
    expect(data.milestones).toEqual([
      { threshold: 10, players: 2 },
      { threshold: 25, players: 0 },
      { threshold: 50, players: 0 },
      { threshold: 100, players: 0 },
    ])
    expect(data.nextMilestone?.label).toBe('Next to 25')
    expect(data.nextMilestone?.holderLabel).toBe('Joe & Will')
    expect(data.nextMilestone?.note).toBe('13 games away')
  })

  it('keeps the first biggest win and the all-time team split', () => {
    expect(data.biggestWin).toEqual({ margin: 6, date: d[4], season: '2026', week: weeks[4].week })
    expect(data.teamAB).toEqual({ teamA: 8, teamB: 4, draws: 0 })
  })
})
