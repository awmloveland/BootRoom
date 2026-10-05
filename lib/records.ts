import { compareStandings, parseWeekDate } from '@/lib/utils'
import { isGuestName } from '@/lib/guestName'
import { computeAllQuarters } from '@/lib/sidebar-stats'
import type {
  BiggestWin,
  LeagueRecord,
  MilestoneBadge,
  RecordBadge,
  RecordEntry,
  RecordsData,
  RivalryRecord,
  TitleRow,
  Week,
} from '@/lib/types'

/** Win rate and points per game need this many games (README brief). */
export const MIN_RATE_GAMES = 15
/** Best duo needs this many games together. */
export const MIN_DUO_GAMES = 10
export const MILESTONES = [10, 25, 50, 100]

const TOP_N = 5
const NOBODY = 'Nobody yet'
const EMPTY_VALUE = '–'

type Outcome = 'W' | 'D' | 'L'

interface Appearance {
  outcome: Outcome
  date: string
  gameIndex: number   // position in the chronological list of played games
}

interface Run {
  length: number
  start: number   // index into the player's appearances
  end: number
}

// ── Small helpers ─────────────────────────────────────────────────────────────

/** 'Will', 'Will & Joe R', 'Luke, Ian & Alice', 'Luke, Ian & 3 others'. */
export function joinNames(names: string[]): string {
  if (names.length === 0) return NOBODY
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  if (names.length === 3) return `${names[0]}, ${names[1]} & ${names[2]}`
  return `${names[0]}, ${names[1]} & ${names.length - 2} others`
}

/** Every name, for shared titles: 'Luke, Ian, Alice & Gareth'. */
function fullNames(names: string[]): string {
  if (names.length <= 2) return joinNames(names)
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

/** Runner-up phrasing: 'Joe R', 'Matt, Joe R and Adam', '4 players'. */
function listNames(names: string[]): string {
  if (names.length === 1) return names[0]
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${names.length} players`
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** '04 Jul 2026' → '4 Jul'. Adds the year when asked to. */
function shortDate(date: string, withYear = false): string {
  const [dd, mon, yyyy] = date.split(' ')
  const day = String(Number(dd))
  return withYear ? `${day} ${mon} ${yyyy}` : `${day} ${mon}`
}

function dateRange(from: string, to: string): string {
  if (from === to) return shortDate(from, true)
  const sameYear = from.split(' ')[2] === to.split(' ')[2]
  return sameYear
    ? `${shortDate(from)} – ${shortDate(to, true)}`
    : `${shortDate(from, true)} – ${shortDate(to, true)}`
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

/** Pair key and label, names in alphabetical order so 'Roy & Will' is stable. */
function pairOf(a: string, b: string): [string, string] {
  return a.localeCompare(b) <= 0 ? [a, b] : [b, a]
}

// ── Ranking ───────────────────────────────────────────────────────────────────

interface Candidate {
  name: string
  score: number      // primary ranking value, higher is better
  tiebreak?: number  // secondary, higher is better (e.g. games played for rates)
  value: string      // display value
  sub?: string
}

function rank(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort((a, b) =>
    b.score - a.score ||
    (b.tiebreak ?? 0) - (a.tiebreak ?? 0) ||
    a.name.localeCompare(b.name)
  )
}

/** Everyone level with the leader on the primary score. */
function leaders(ranked: Candidate[]): Candidate[] {
  if (ranked.length === 0) return []
  return ranked.filter((c) => c.score === ranked[0].score)
}

/** The next score group after the leaders, e.g. 'Joe R on 19'. */
function runnerUpNote(ranked: Candidate[], joiner = ' on '): string {
  const leaderCount = leaders(ranked).length
  const next = ranked[leaderCount]
  if (!next) return ''
  const group = ranked.filter((c) => c.score === next.score)
  return `${listNames(group.map((c) => c.name))}${joiner}${next.value}`
}

function topEntries(ranked: Candidate[]): RecordEntry[] {
  return ranked.slice(0, TOP_N).map(({ name, value, sub }) => ({ name, value, sub }))
}

function emptyRecord(key: string, label: string, unit: string, note: string): LeagueRecord {
  return { key, label, holders: [], holderLabel: NOBODY, value: EMPTY_VALUE, note, unit, top: [] }
}

/**
 * Builds a ranked record. `positive` filters out zero scores so a league with
 * no wins yet shows 'Nobody yet' rather than a list of zeros.
 */
function buildRecord(opts: {
  key: string
  label: string
  unit: string
  candidates: Candidate[]
  note: (ranked: Candidate[], holders: Candidate[]) => string
  emptyNote?: string
  badge?: (holders: Candidate[]) => RecordBadge | undefined
  foot?: string
  positive?: boolean
}): LeagueRecord {
  const pool = opts.positive === false ? opts.candidates : opts.candidates.filter((c) => c.score > 0)
  const ranked = rank(pool)
  if (ranked.length === 0) return emptyRecord(opts.key, opts.label, opts.unit, opts.emptyNote ?? '')
  const holders = leaders(ranked)
  return {
    key: opts.key,
    label: opts.label,
    holders: holders.map((h) => h.name),
    holderLabel: joinNames(holders.map((h) => h.name)),
    value: holders[0].value,
    note: opts.note(ranked, holders),
    unit: opts.unit,
    badge: opts.badge ? opts.badge(holders) : holders.length > 1 ? 'tied' : undefined,
    top: topEntries(ranked),
    foot: opts.foot,
  }
}

// ── Runs ──────────────────────────────────────────────────────────────────────

/** Longest run of appearances matching `pred`, and the current (trailing) run. */
function runs(apps: Appearance[], pred: (a: Appearance) => boolean): { best: Run; current: number } {
  let best: Run = { length: 0, start: -1, end: -1 }
  let length = 0
  for (let i = 0; i < apps.length; i++) {
    length = pred(apps[i]) ? length + 1 : 0
    // Strictly greater keeps the first time a length was reached.
    if (length > best.length) best = { length, start: i - length + 1, end: i }
  }
  return { best, current: length }
}

/** True when the best run is still going (it ends on the player's latest game). */
function isLive(r: { best: Run; current: number }): boolean {
  return r.best.length > 0 && r.current === r.best.length
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Every all-time record for the Records tab, in one pass over the played games.
 * Points are W=3 D=1. Guests (`Name +1`) are left out of player records but
 * their games still count towards team records. Only `played` weeks count;
 * cancelled, unfinished and unrecorded weeks are ignored.
 */
export function computeRecords(weeks: Week[], now: Date = new Date()): RecordsData {
  const games = weeks
    .filter((w) => w.status === 'played')
    .sort((a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime() || a.week - b.week)

  const apps = new Map<string, Appearance[]>()
  const together = new Map<string, { a: string; b: string; games: number; wins: number }>()
  const opposed = new Map<string, { a: string; b: string; games: number; winsA: number; winsB: number; draws: number }>()
  let teamA = 0
  let teamB = 0
  let draws = 0
  let biggestWin: BiggestWin | null = null

  for (let gameIndex = 0; gameIndex < games.length; gameIndex++) {
    const w = games[gameIndex]
    if (w.winner === 'teamA') teamA++
    else if (w.winner === 'teamB') teamB++
    else if (w.winner === 'draw') draws++

    const margin = w.goal_difference ?? 0
    if ((w.winner === 'teamA' || w.winner === 'teamB') && margin > 0 && margin > (biggestWin?.margin ?? 0)) {
      biggestWin = { margin, date: w.date, season: w.season, week: w.week }
    }

    const sides = [
      { names: w.teamA.filter((n) => !isGuestName(n)), side: 'teamA' as const },
      { names: w.teamB.filter((n) => !isGuestName(n)), side: 'teamB' as const },
    ]

    for (const { names, side } of sides) {
      const outcome: Outcome = w.winner === 'draw' ? 'D' : w.winner === side ? 'W' : 'L'
      for (const name of names) {
        if (!apps.has(name)) apps.set(name, [])
        apps.get(name)!.push({ outcome, date: w.date, gameIndex })
      }
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const [a, b] = pairOf(names[i], names[j])
          const key = `${a}|${b}`
          const pair = together.get(key) ?? { a, b, games: 0, wins: 0 }
          pair.games++
          if (outcome === 'W') pair.wins++
          together.set(key, pair)
        }
      }
    }

    for (const x of sides[0].names) {
      for (const y of sides[1].names) {
        const [a, b] = pairOf(x, y)
        const key = `${a}|${b}`
        const rivalry = opposed.get(key) ?? { a, b, games: 0, winsA: 0, winsB: 0, draws: 0 }
        rivalry.games++
        if (w.winner === 'draw') rivalry.draws++
        else {
          const winner = w.winner === 'teamA' ? x : y
          if (winner === a) rivalry.winsA++
          else rivalry.winsB++
        }
        opposed.set(key, rivalry)
      }
    }
  }

  const totalGames = games.length
  const lastGameIndex = totalGames - 1

  const players = Array.from(apps.entries()).map(([name, list]) => {
    const won = list.filter((a) => a.outcome === 'W').length
    const drew = list.filter((a) => a.outcome === 'D').length
    // Consecutive appearances run over the league's games, not the player's.
    let bestAttend = 0
    let attend = 0
    for (let i = 0; i < list.length; i++) {
      attend = i > 0 && list[i].gameIndex === list[i - 1].gameIndex + 1 ? attend + 1 : 1
      bestAttend = Math.max(bestAttend, attend)
    }
    const attendLive = list[list.length - 1].gameIndex === lastGameIndex && attend === bestAttend
    return {
      name,
      apps: list,
      played: list.length,
      won,
      drew,
      points: won * 3 + drew,
      winRun: runs(list, (a) => a.outcome === 'W'),
      unbeatenRun: runs(list, (a) => a.outcome !== 'L'),
      winlessRun: runs(list, (a) => a.outcome !== 'W'),
      bestAttend,
      attendLive,
    }
  })
  const byName = new Map(players.map((p) => [p.name, p]))

  // ── Career ──────────────────────────────────────────────────────────────────

  const eligible = players.filter((p) => p.played >= MIN_RATE_GAMES)

  const career: LeagueRecord[] = [
    buildRecord({
      key: 'most_appearances',
      label: 'Most appearances',
      unit: 'Games',
      candidates: players.map((p) => ({ name: p.name, score: p.played, value: String(p.played) })),
      note: () => `of ${plural(totalGames, 'game')}`,
    }),
    buildRecord({
      key: 'most_wins',
      label: 'Most wins',
      unit: 'Wins',
      candidates: players.map((p) => ({ name: p.name, score: p.won, value: String(p.won) })),
      note: (ranked) => runnerUpNote(ranked),
    }),
    buildRecord({
      key: 'most_points',
      label: 'Most points',
      unit: 'Pts',
      candidates: players.map((p) => ({
        name: p.name,
        score: p.points,
        value: String(p.points),
        sub: `${p.won}W ${p.drew}D`,
      })),
      note: (ranked, holders) => {
        const chasers = ranked.slice(holders.length, holders.length + 2).map((c) => `${c.name} ${c.value}`)
        return ['W=3 D=1', ...chasers].join(' · ')
      },
    }),
    buildRecord({
      key: 'best_win_rate',
      label: 'Best win rate',
      unit: 'Win %',
      candidates: eligible.map((p) => ({
        name: p.name,
        score: p.won / p.played,
        tiebreak: p.played,
        value: pct(p.won / p.played),
        sub: `${p.played} GP`,
      })),
      note: (_, holders) => {
        const p = byName.get(holders[0].name)!
        return `Min ${MIN_RATE_GAMES} games · ${p.won} of ${p.played}`
      },
      emptyNote: `Min ${MIN_RATE_GAMES} games to qualify`,
      foot: `Minimum ${MIN_RATE_GAMES} games to qualify. ${eligible.length === 1 ? '1 player is' : `${eligible.length} players are`} eligible.`,
    }),
    buildRecord({
      key: 'best_ppg',
      label: 'Best points per game',
      unit: 'PPG',
      candidates: eligible.map((p) => ({
        name: p.name,
        score: p.points / p.played,
        tiebreak: p.played,
        value: (p.points / p.played).toFixed(2),
        sub: `${p.played} GP`,
      })),
      note: (_, holders) => {
        const p = byName.get(holders[0].name)!
        return `Min ${MIN_RATE_GAMES} games · ${p.points} pts from ${p.played}`
      },
      emptyNote: `Min ${MIN_RATE_GAMES} games to qualify`,
      foot: `Minimum ${MIN_RATE_GAMES} games to qualify. Same basis as the quarterly Sharp Shooter award.`,
    }),
  ]

  // ── Streaks ─────────────────────────────────────────────────────────────────

  // A tie reads as TIED; a single holder whose run is still going reads as LIVE.
  const liveOrTied = (live: (name: string) => boolean) => (holders: Candidate[]): RecordBadge | undefined =>
    holders.length > 1 ? 'tied' : live(holders[0].name) ? 'live' : undefined

  const winLive = (name: string) => isLive(byName.get(name)!.winRun)
  const unbeatenLive = (name: string) => isLive(byName.get(name)!.unbeatenRun)

  const streaks: LeagueRecord[] = [
    buildRecord({
      key: 'longest_win_streak',
      label: 'Longest winning streak',
      unit: 'Wins',
      candidates: players.map((p) => ({
        name: p.name,
        score: p.winRun.best.length,
        value: String(p.winRun.best.length),
        sub: isLive(p.winRun) ? 'Live' : undefined,
      })),
      note: (ranked) => runnerUpNote(ranked),
      badge: liveOrTied(winLive),
    }),
    buildRecord({
      key: 'longest_unbeaten_run',
      label: 'Longest unbeaten run',
      unit: 'Games',
      candidates: players.map((p) => ({
        name: p.name,
        score: p.unbeatenRun.best.length,
        value: String(p.unbeatenRun.best.length),
        sub: isLive(p.unbeatenRun) ? 'Live' : undefined,
      })),
      note: (_, holders) => {
        // Describe a live holder's run if there is one, else the first holder's.
        const name = holders.find((h) => unbeatenLive(h.name))?.name ?? holders[0].name
        const p = byName.get(name)!
        const { best } = p.unbeatenRun
        if (isLive(p.unbeatenRun)) {
          const lastLoss = best.start > 0 ? p.apps[best.start - 1] : null
          return lastLoss ? `Still going · last loss ${shortDate(lastLoss.date)}` : 'Still going · never beaten'
        }
        return dateRange(p.apps[best.start].date, p.apps[best.end].date)
      },
      badge: liveOrTied(unbeatenLive),
    }),
    buildRecord({
      key: 'most_consecutive_appearances',
      label: 'Most consecutive appearances',
      unit: 'Games',
      candidates: players.map((p) => ({
        name: p.name,
        score: p.bestAttend,
        value: String(p.bestAttend),
        sub: p.attendLive ? 'Live' : undefined,
      })),
      note: (ranked) => runnerUpNote(ranked, ' '),
      badge: () => 'iron_man',
    }),
  ]

  // Softened banter row: the longest run without a win.
  let waitForWin: LeagueRecord | null = null
  const winless = rank(players.map((p) => ({ name: p.name, score: p.winlessRun.best.length, value: String(p.winlessRun.best.length) })))
    .filter((c) => c.score > 0)
  if (winless.length > 0) {
    const holders = leaders(winless)
    const p = byName.get(holders[0].name)!
    const ender = p.apps[p.winlessRun.best.end + 1]   // the win that ended the run
    waitForWin = {
      key: 'longest_wait_for_win',
      label: 'Longest wait for a win',
      holders: holders.map((h) => h.name),
      holderLabel: joinNames(holders.map((h) => h.name)),
      value: holders[0].value,
      note: ender ? `It happens to everyone · ended ${shortDate(ender.date)}` : 'It happens to everyone',
      unit: 'Games',
      top: [],
    }
  }

  // ── Trophy cabinet ──────────────────────────────────────────────────────────

  // Only quarters that crowned a champion: short quarters (under
  // MIN_QUARTER_GAMES) neither award a title nor count as played.
  const completed = computeAllQuarters(weeks, now)
    .flatMap((y) => y.quarters)
    .filter((q) => q.status === 'completed' && Boolean(q.champion))
    .sort((a, b) => b.year - a.year || b.q - a.q)

  const titleMap = new Map<string, { quarters: { label: string; tag?: string }[]; latest: number }>()
  const sharedRows: (TitleRow & { latest: number })[] = []

  for (const q of completed) {
    const entries = q.entries!
    const top = entries[0]
    const label = `Q${q.q} ${q.year}`
    const order = q.year * 10 + q.q
    const level = entries.filter((e) => compareStandings(e, top) === 0)
    if (level.length > 1) {
      sharedRows.push({
        key: `shared-${q.year}-${q.q}`,
        name: fullNames(level.map((e) => e.name)),
        quarters: `${label} · Shared`,
        count: 1,
        shared: true,
        latest: order,
      })
      continue
    }
    const second = entries[1]
    const tag = second && second.points === top.points
      ? second.goalDiff !== top.goalDiff ? 'on GD' : 'on countback'
      : undefined
    const row = titleMap.get(top.name) ?? { quarters: [], latest: order }
    row.quarters.push({ label, tag })
    titleMap.set(top.name, row)
  }

  const titles: TitleRow[] = [
    ...Array.from(titleMap.entries()).map(([name, { quarters, latest }]) => ({
      key: name,
      name,
      quarters: quarters.length === 1
        ? [quarters[0].label, quarters[0].tag].filter(Boolean).join(' · ')
        : quarters.map((t) => (t.tag ? `${t.label} ${t.tag}` : t.label)).join(' · '),
      count: quarters.length,
      shared: false,
      latest,
    })),
    ...sharedRows,
  ]
    .sort((a, b) => b.count - a.count || Number(a.shared) - Number(b.shared) || b.latest - a.latest)
    .map(({ latest: _latest, ...row }) => row)

  // ── Partnerships & rivalries ────────────────────────────────────────────────

  const pairs = Array.from(together.values())
  const duoEligible = pairs.filter((p) => p.games >= MIN_DUO_GAMES)

  const duos: LeagueRecord[] = [
    buildRecord({
      key: 'most_games_as_teammates',
      label: 'Most games as teammates',
      unit: 'Games',
      candidates: pairs.map((p) => ({ name: `${p.a} & ${p.b}`, score: p.games, tiebreak: p.wins, value: String(p.games) })),
      note: (_, holders) => {
        const pair = pairs.find((p) => `${p.a} & ${p.b}` === holders[0].name)!
        return `${plural(pair.wins, 'win')} together`
      },
    }),
    buildRecord({
      key: 'best_duo',
      label: 'Best duo',
      unit: 'Win %',
      candidates: duoEligible.map((p) => ({
        name: `${p.a} & ${p.b}`,
        score: p.wins / p.games,
        tiebreak: p.games,
        value: pct(p.wins / p.games),
        sub: `${p.wins} of ${p.games}`,
      })),
      note: (_, holders) => {
        const pair = duoEligible.find((p) => `${p.a} & ${p.b}` === holders[0].name)!
        return `Min ${MIN_DUO_GAMES} together · ${plural(pair.wins, 'win')} from ${pair.games}`
      },
      emptyNote: `Min ${MIN_DUO_GAMES} games together to qualify`,
      foot: `Minimum ${MIN_DUO_GAMES} games together to qualify.`,
    }),
  ]
  // Pairs are already labelled 'A & B', so tied pairs join with a dot instead.
  for (const record of duos) {
    if (record.holders.length > 1) record.holderLabel = record.holders.slice(0, 2).join(' · ') + (record.holders.length > 2 ? ` · +${record.holders.length - 2}` : '')
  }

  let rivalry: RivalryRecord | null = null
  const topRivalry = Array.from(opposed.values()).sort((x, y) =>
    y.games - x.games ||
    // Among equals, the closest contest makes the better rivalry.
    Math.abs(x.winsA - x.winsB) - Math.abs(y.winsA - y.winsB) ||
    `${x.a}|${x.b}`.localeCompare(`${y.a}|${y.b}`)
  )[0]
  if (topRivalry) {
    const sideA = { name: topRivalry.a, wins: topRivalry.winsA }
    const sideB = { name: topRivalry.b, wins: topRivalry.winsB }
    const [leader, trailer] = sideB.wins > sideA.wins ? [sideB, sideA] : [sideA, sideB]
    rivalry = { games: topRivalry.games, draws: topRivalry.draws, leader, trailer }
  }

  // ── Milestones ──────────────────────────────────────────────────────────────

  const milestones: MilestoneBadge[] = MILESTONES.map((threshold) => ({
    threshold,
    players: players.filter((p) => p.played >= threshold).length,
  }))

  let nextMilestone: LeagueRecord | null = null
  const nextThreshold = milestones.find((m) => m.players === 0)?.threshold
  if (nextThreshold !== undefined && players.length > 0) {
    nextMilestone = buildRecord({
      key: 'next_milestone',
      label: `Next to ${nextThreshold}`,
      unit: 'Games',
      candidates: players.map((p) => ({ name: p.name, score: p.played, value: String(p.played) })),
      note: (_, holders) => `${plural(nextThreshold - holders[0].score, 'game')} away`,
      badge: () => undefined,
    })
    nextMilestone.top = []
  }

  return {
    totalGames,
    career,
    streaks,
    waitForWin,
    quartersPlayed: completed.length,
    titles,
    duos,
    rivalry,
    milestones,
    nextMilestone,
    biggestWin,
    teamAB: { teamA, teamB, draws },
  }
}
