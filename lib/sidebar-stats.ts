import { compareStandings, computeStandings, parseWeekDate } from '@/lib/utils'
import { isGuestName } from '@/lib/guestName'
import type { Player, Week } from '@/lib/types'

// ─── gamesLeftInQuarter ───────────────────────────────────────────────────────

/**
 * Count game days (0=Sun…6=Sat) from today to the last day of the given quarter
 * that are still to be played. A day stops counting once a week dated on it is
 * settled — any status other than 'scheduled'. Dates are normalized to midnight
 * so comparisons with `quarterEnd` (also midnight) are not skewed by time-of-day.
 */
function gamesLeftInQuarter(q: number, year: number, gameDay: number, now: Date, weeks: Week[]): number {
  // quarterEndMonthIdx: 0-indexed last month of quarter (Q1→2, Q2→5, Q3→8, Q4→11)
  // new Date(year, month+1, 0) = last day of `month`, constructed at local midnight
  const quarterEndMonthIdx = q * 3 - 1
  const quarterEnd = new Date(year, quarterEndMonthIdx + 1, 0)

  const settledDates = new Set(
    weeks
      .filter(w => w.status !== 'scheduled')
      .map(w => {
        const d = parseWeekDate(w.date)
        d.setHours(0, 0, 0, 0)
        return d.getTime()
      })
  )

  let count = 0
  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)
  while (cursor <= quarterEnd) {
    if (cursor.getDay() === gameDay && !settledDates.has(cursor.getTime())) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

// ─── inferGameDay ─────────────────────────────────────────────────────────────

/**
 * Infer the league's recurring game day from the most recent played week across
 * ALL history (not just the current quarter). Returns null only when there are
 * zero played weeks ever — e.g. a brand new league.
 */
function inferGameDay(weeks: Week[]): number | null {
  const played = weeks.filter(w => w.status === 'played')
  if (played.length === 0) return null
  // reduce without initial value is safe: `played` is non-empty after the guard above
  const latest = played.reduce((a, b) => (parseWeekDate(a.date) > parseWeekDate(b.date) ? a : b))
  return parseWeekDate(latest.date).getDay()
}

// ─── computeInForm ────────────────────────────────────────────────────────────

export interface InFormEntry {
  name: string
  recentForm: string
  ppg: number
}

export function computeInForm(players: Player[], weeks: Week[], now: Date = new Date()): InFormEntry[] {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 56) // 8 weeks = 56 days

  const lastPlayed = new Map<string, Date>()
  for (const w of weeks) {
    if (w.status !== 'played') continue
    const d = parseWeekDate(w.date)
    for (const name of [...w.teamA, ...w.teamB]) {
      const existing = lastPlayed.get(name)
      if (!existing || d > existing) lastPlayed.set(name, d)
    }
  }

  return players
    .filter(p => {
      if (p.played < 5) return false
      const last = lastPlayed.get(p.name)
      return last !== undefined && last >= cutoff
    })
    .map(p => {
      const chars = p.recentForm.split('').filter(c => c !== '-')
      if (chars.length === 0) return { name: p.name, recentForm: p.recentForm, ppg: 0 }
      const points = chars.reduce((acc, c) => acc + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0)
      return { name: p.name, recentForm: p.recentForm, ppg: points / chars.length }
    })
    .sort((a, b) => b.ppg - a.ppg)
    .slice(0, 5)
}

// ─── computeQuarterlyTable ────────────────────────────────────────────────────

/**
 * A quarter needs this many played games to count: fewer, and it crowns no
 * champion, hands out no awards and stays out of the trophy cabinet. Its
 * games still count towards career records.
 */
export const MIN_QUARTER_GAMES = 5

export interface QuarterlyEntry {
  name: string
  played: number
  won: number
  drew: number
  lost: number
  points: number
  goalDiff: number  // sum of signed margins: + for wins, - for losses; see computeStandings
}

export interface QuarterAward {
  key: 'champion' | 'iron_man' | 'win_machine' | 'sharp_shooter' | 'clutch' | 'untouchable' | 'on_fire'
  nickname: string
  icon: string
  player: string
  stat: string  // pre-formatted, e.g. "2.3 PPG", "5-game streak"
}

export interface QuarterlyTableResult {
  quarterLabel: string
  /** Quarter and four-digit year actually shown (the previous quarter during holdover). */
  displayQ: number
  displayYear: number
  /** Top 10 of the displayed quarter. */
  entries: QuarterlyEntry[]
  /** The full sorted table of the displayed quarter. */
  allEntries: QuarterlyEntry[]
  lastChampion: string | null
  lastChampionPoints: number | null
  lastQuarterLabel: string | null
  /** Calendar previous quarter, or null when it has no champion (fewer than MIN_QUARTER_GAMES played). */
  lastQ: number | null
  lastYear: number | null
  gamesLeft: number
  gamesTotal: number
  isHoldover: boolean
}

export type QuarterStatus = 'completed' | 'in_progress' | 'upcoming'

export interface QuarterSummary {
  q: number
  year: number
  quarterLabel: string                             // e.g. "Q3 26"
  seasonName: string                               // "Winter" | "Spring" | "Summer" | "Autumn"
  status: QuarterStatus
  weekRange: { from: number; to: number } | null  // null when no game data exists yet
  dateRange: { from: string; to: string }          // "DD MMM YYYY" formatted strings
  champion?: string
  entries?: QuarterlyEntry[]
  awards?: QuarterAward[]
  gamesPlayed?: number                             // played-week count; set for completed quarters only
  belowMinimum?: boolean                           // completed with fewer than MIN_QUARTER_GAMES played: no champion or awards
}

export interface HonoursYear {
  year: number
  completedCount: number
  quarters: QuarterSummary[]
}

function quarterOf(d: Date): { q: number; year: number } {
  return { q: Math.floor(d.getMonth() / 3) + 1, year: d.getFullYear() }
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  return `${dd} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

function firstWeekdayOnOrAfter(weekday: number, from: Date): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1)
  return d
}

function lastWeekdayOnOrBefore(weekday: number, before: Date): Date {
  const d = new Date(before)
  d.setHours(0, 0, 0, 0)
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
  return d
}

export function weekInQuarter(week: Week, q: number, year: number): boolean {
  const d = parseWeekDate(week.date)
  const wq = quarterOf(d)
  return wq.q === q && wq.year === year
}

function maxBy<T>(arr: T[], fn: (item: T) => number): T | undefined {
  if (arr.length === 0) return undefined
  return arr.reduce((best, item) => fn(item) > fn(best) ? item : best)
}

function longestWinStreak(weeks: Week[]): { player: string; count: number } {
  const sorted = [...weeks].sort(
    (a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime()
  )
  const current = new Map<string, number>()
  const best = new Map<string, number>()

  for (const w of sorted) {
    const allPlayers = [...w.teamA, ...w.teamB]
    for (const name of allPlayers) {
      const onTeamA = w.teamA.includes(name)
      const won =
        (w.winner === 'teamA' && onTeamA) ||
        (w.winner === 'teamB' && !onTeamA)
      const streak = won ? (current.get(name) ?? 0) + 1 : 0
      current.set(name, streak)
      if (streak > (best.get(name) ?? 0)) best.set(name, streak)
    }
  }

  let topPlayer = ''
  let topCount = 0
  for (const [name, count] of best) {
    if (count > topCount) { topPlayer = name; topCount = count }
  }
  return { player: topPlayer, count: topCount }
}

function buildQuarterAwards(entries: QuarterlyEntry[], weekSlice: Week[]): QuarterAward[] {
  const awards: QuarterAward[] = []
  const qualified = entries.filter(e => e.played >= 3)

  // Champion — always first
  if (entries.length > 0) {
    const top = entries[0]
    awards.push({ key: 'champion', nickname: 'Champion', icon: '🏅',
      player: top.name, stat: `${top.points} pts` })
  }

  // Iron Man — most games played (no minimum)
  const ironMan = maxBy(entries, e => e.played)
  if (ironMan) {
    awards.push({ key: 'iron_man', nickname: 'Iron Man', icon: '⚽',
      player: ironMan.name, stat: `${ironMan.played} games` })
  }

  // Win Machine — most wins (must have ≥1 win)
  const winMachine = maxBy(entries, e => e.won)
  if (winMachine && winMachine.won > 0) {
    awards.push({ key: 'win_machine', nickname: 'Win Machine', icon: '🏆',
      player: winMachine.name, stat: `${winMachine.won} wins` })
  }

  // Sharp Shooter — best PPG, min 3 games
  const sharpShooter = maxBy(qualified, e => e.points / e.played)
  if (sharpShooter) {
    awards.push({ key: 'sharp_shooter', nickname: 'Sharp Shooter', icon: '⚡',
      player: sharpShooter.name, stat: `${(sharpShooter.points / sharpShooter.played).toFixed(1)} PPG` })
  }

  // Clutch — best win rate, min 3 games and ≥1 win
  const clutch = maxBy(qualified, e => e.won / e.played)
  if (clutch && clutch.won > 0) {
    awards.push({ key: 'clutch', nickname: 'Clutch', icon: '🎯',
      player: clutch.name, stat: `${Math.round((clutch.won / clutch.played) * 100)}% win rate` })
  }

  // Untouchable — zero losses, min 3 games
  const untouchable = qualified.find(e => e.lost === 0)
  if (untouchable) {
    awards.push({ key: 'untouchable', nickname: 'Untouchable', icon: '🛡️',
      player: untouchable.name, stat: `${untouchable.played} games, 0 losses` })
  }

  // On Fire — longest win streak, min 2 consecutive wins
  const streak = longestWinStreak(weekSlice)
  if (streak.count >= 2) {
    awards.push({ key: 'on_fire', nickname: 'On Fire', icon: '🔥',
      player: streak.player, stat: `${streak.count}-game streak` })
  }

  return awards
}

export function computeQuarterlyTable(weeks: Week[], now: Date = new Date(), gameDay?: number): QuarterlyTableResult {
  const { q, year } = quarterOf(now)

  // Holdover: if no played games in the current calendar quarter, show the previous quarter
  const currentPlayedCount = weeks.filter(w => weekInQuarter(w, q, year) && w.status === 'played').length
  const isHoldover = currentPlayedCount === 0

  const displayQ = isHoldover ? (q === 1 ? 4 : q - 1) : q
  const displayYear = isHoldover ? (q === 1 ? year - 1 : year) : year
  const yy = String(displayYear).slice(-2)
  const quarterLabel = `Q${displayQ} ${yy}`

  const displayWeeks = weeks.filter(w => weekInQuarter(w, displayQ, displayYear))
  const allEntries = computeStandings(displayWeeks)
  const entries = allEntries.slice(0, 10)

  // gamesLeft is 0 during holdover (the displayed quarter is complete)
  const resolvedGameDay = gameDay ?? inferGameDay(weeks)
  const gamesLeft = !isHoldover && resolvedGameDay !== null
    ? gamesLeftInQuarter(q, year, resolvedGameDay, now, weeks)
    : 0

  const gamesPlayed = displayWeeks.filter(w => w.status === 'played').length
  const gamesTotal = gamesPlayed + gamesLeft

  // Champion banner: always based on the calendar previous quarter (not the displayed quarter)
  const prevQ = q === 1 ? 4 : q - 1
  const prevYear = q === 1 ? year - 1 : year
  const prevYY = String(prevYear).slice(-2)
  const prevWeeks = weeks.filter(w => weekInQuarter(w, prevQ, prevYear))
  const prevEntries = computeStandings(prevWeeks)
  const prevPlayed = prevWeeks.filter(w => w.status === 'played').length
  const hasPrev = prevEntries.length > 0 && prevPlayed >= MIN_QUARTER_GAMES
  const lastChampion = hasPrev ? prevEntries[0].name : null
  const lastChampionPoints = hasPrev ? prevEntries[0].points : null
  const lastQuarterLabel = hasPrev ? `Q${prevQ} ${prevYY}` : null

  return {
    quarterLabel,
    displayQ,
    displayYear,
    entries,
    allEntries,
    lastChampion,
    lastChampionPoints,
    lastQuarterLabel,
    lastQ: hasPrev ? prevQ : null,
    lastYear: hasPrev ? prevYear : null,
    gamesLeft,
    gamesTotal,
    isHoldover,
  }
}

// ─── getQuarterStanding ───────────────────────────────────────────────────────

export interface QuarterStanding {
  /** 1-based place in the sorted table: what the rank column shows. */
  rank: number
  /**
   * Players level on every ranking key (points, goal difference, games played,
   * wins) share a position: what "1st" on the Your stats card shows.
   */
  position: number
  /** First place, shared with at least one other player. */
  jointTop: boolean
  entry: QuarterlyEntry
}

/**
 * Where a player sits in a quarterly table. `allEntries` must be the full sorted
 * table from computeQuarterlyTable, not the top-10 slice.
 */
export function getQuarterStanding(
  allEntries: QuarterlyEntry[],
  name: string | null | undefined,
): QuarterStanding | null {
  if (!name) return null
  const index = allEntries.findIndex(e => e.name === name)
  if (index === -1) return null
  const entry = allEntries[index]
  // Same order as the table itself, minus the alphabetical last resort.
  const ahead = allEntries.filter(e => compareStandings(e, entry) < 0).length
  const level = allEntries.filter(e => compareStandings(e, entry) === 0).length
  const position = ahead + 1
  return { rank: index + 1, position, jointTop: position === 1 && level > 1, entry }
}

// ─── getLastResult ────────────────────────────────────────────────────────────

/** The most recent week with a result (played or did not finish), or null. */
export function getLastResult(weeks: Week[]): Week | null {
  const resulted = weeks.filter(w => w.status === 'played' || w.status === 'dnf')
  if (resulted.length === 0) return null
  return resulted.reduce((a, b) => (parseWeekDate(a.date) >= parseWeekDate(b.date) ? a : b))
}

const SEASON_NAMES: Record<number, string> = { 1: 'Winter', 2: 'Spring', 3: 'Summer', 4: 'Autumn' }

export function computeAllQuarters(weeks: Week[], now: Date = new Date()): HonoursYear[] {
  const { year: currentYear } = quarterOf(now)
  const gameDay = inferGameDay(weeks)

  // Collect all years that have any week data, always include the current year
  const yearsWithData = new Set<number>([currentYear])
  for (const w of weeks) {
    yearsWithData.add(quarterOf(parseWeekDate(w.date)).year)
  }

  const result: HonoursYear[] = []

  for (const year of Array.from(yearsWithData).sort((a, b) => b - a)) {
    const isCurrentYear = year === currentYear
    const summaries: QuarterSummary[] = []

    // Iterate Q4→Q1 so quarters are newest-first within the year
    for (let q = 4; q >= 1; q--) {
      // Calendar bounds for this quarter
      const qStart = new Date(year, (q - 1) * 3, 1)     // e.g. Q1 → Jan 1
      const qEnd   = new Date(year, q * 3, 0)             // e.g. Q1 → Mar 31

      // Initial status from calendar position (refined below for the current quarter)
      let status: QuarterStatus
      if (now < qStart) {
        status = 'upcoming'
      } else if (now <= qEnd) {
        status = 'in_progress'
      } else {
        status = 'completed'
      }

      // For prior years, only show quarters that actually completed with data
      if (!isCurrentYear && status !== 'completed') continue

      // Get all weeks in this quarter
      const qWeeks = weeks.filter(w => weekInQuarter(w, q, year))

      // The current quarter is over as soon as every game day in it has a
      // state: no scheduled/unrecorded weeks, no game days left before quarter
      // end, and at least one game actually played. Mirrors the sidebar's
      // "games left" count so the board completes on the final result, not on
      // the calendar rollover.
      if (status === 'in_progress' && gameDay !== null) {
        const allSettled = !qWeeks.some(w => w.status === 'unrecorded' || w.status === 'scheduled')
        const hasPlayed  = qWeeks.some(w => w.status === 'played')
        if (allSettled && hasPlayed && gamesLeftInQuarter(q, year, gameDay, now, weeks) === 0) {
          status = 'completed'
        }
      }

      // Completed quarters must have all weeks settled and at least one played
      if (status === 'completed') {
        const hasIncomplete = qWeeks.some(w => w.status === 'unrecorded' || w.status === 'scheduled')
        if (hasIncomplete) continue
        if (!qWeeks.some(w => w.status === 'played')) continue
      }

      // Date range
      // In-progress quarters show their full planned span: earliest recorded week
      // (or first game day) through the last game day of the calendar quarter —
      // not just the weeks recorded so far.
      let dateRange: { from: string; to: string }
      if (status === 'in_progress') {
        const from = qWeeks.length > 0
          ? new Date(Math.min(...qWeeks.map(w => parseWeekDate(w.date).getTime())))
          : gameDay !== null
            ? firstWeekdayOnOrAfter(gameDay, qStart)
            : qStart
        const to = gameDay !== null ? lastWeekdayOnOrBefore(gameDay, qEnd) : qEnd
        dateRange = { from: formatDate(from), to: formatDate(to) }
      } else if (qWeeks.length > 0) {
        const dates = qWeeks.map(w => parseWeekDate(w.date).getTime())
        dateRange = {
          from: formatDate(new Date(Math.min(...dates))),
          to:   formatDate(new Date(Math.max(...dates))),
        }
      } else if (gameDay !== null) {
        const first = firstWeekdayOnOrAfter(gameDay, qStart)
        const last  = lastWeekdayOnOrBefore(gameDay, qEnd)
        dateRange = {
          from: first <= qEnd   ? formatDate(first) : formatDate(qStart),
          to:   last  >= qStart ? formatDate(last)  : formatDate(qEnd),
        }
      } else {
        dateRange = { from: formatDate(qStart), to: formatDate(qEnd) }
      }

      // Week range
      let weekRange: { from: number; to: number } | null = null
      if (qWeeks.length > 0) {
        const weekNums = qWeeks.map(w => w.week)
        weekRange = { from: Math.min(...weekNums), to: Math.max(...weekNums) }
      }

      // Standings (completed only). A short quarter keeps its table but
      // crowns no champion and hands out no awards.
      let champion: string | undefined
      let entries: QuarterlyEntry[] | undefined
      let awards: QuarterAward[] | undefined
      let gamesPlayed: number | undefined
      let belowMinimum: boolean | undefined
      if (status === 'completed') {
        const playedWeeks = qWeeks.filter(w => w.status === 'played')
        entries  = computeStandings(playedWeeks)
        gamesPlayed = playedWeeks.length
        if (gamesPlayed >= MIN_QUARTER_GAMES) {
          champion = entries[0]?.name
          awards   = buildQuarterAwards(entries, playedWeeks)
        } else {
          belowMinimum = true
        }
      }

      const yy = String(year).slice(-2)
      summaries.push({
        q,
        year,
        quarterLabel: `Q${q} ${yy}`,
        seasonName: SEASON_NAMES[q],
        status,
        weekRange,
        dateRange,
        champion,
        entries,
        awards,
        gamesPlayed,
        belowMinimum,
      })
    }

    if (summaries.length === 0) continue

    const STATUS_ORDER: Record<QuarterStatus, number> = { in_progress: 0, completed: 1, upcoming: 2 }
    summaries.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.q - a.q)

    result.push({
      year,
      completedCount: summaries.filter(s => s.status === 'completed').length,
      quarters: summaries,
    })
  }

  return result
}

/**
 * Returns the quarter that transitioned to `completed` (with a champion) between
 * two week sets, or null if none did. Used to decide whether recording a game
 * clinched a quarter. If more than one newly completes, returns the most recent.
 */
export function findNewlyCompletedQuarter(
  weeksBefore: Week[],
  weeksAfter: Week[],
  now: Date = new Date(),
): QuarterSummary | null {
  const completedKeys = (weeks: Week[]): Set<string> => {
    const keys = new Set<string>()
    for (const yr of computeAllQuarters(weeks, now)) {
      for (const s of yr.quarters) {
        if (s.status === 'completed' && s.champion) keys.add(`${s.year}-${s.q}`)
      }
    }
    return keys
  }

  const before = completedKeys(weeksBefore)
  const newly: QuarterSummary[] = []
  for (const yr of computeAllQuarters(weeksAfter, now)) {
    for (const s of yr.quarters) {
      if (s.status === 'completed' && s.champion && !before.has(`${s.year}-${s.q}`)) {
        newly.push(s)
      }
    }
  }
  if (newly.length === 0) return null
  newly.sort((a, b) => b.year - a.year || b.q - a.q)
  return newly[0]
}

/**
 * Returns the most recently completed quarter with a champion, or null.
 *
 * The Results tab renders the celebration card inside the match list, just
 * above the first result of this quarter, so it sits below the next match and
 * slides down the page as new results come in. Older quarters live on the
 * Honours tab only.
 */
export function getCelebratedQuarter(weeks: Week[], now: Date = new Date()): QuarterSummary | null {
  const completed = computeAllQuarters(weeks, now)
    .flatMap(y => y.quarters)
    .filter(s => s.status === 'completed' && Boolean(s.champion))
    .sort((a, b) => b.year - a.year || b.q - a.q)
  return completed[0] ?? null
}

/** Everything the results lists need to render the celebration card. */
export interface ResultsCelebration {
  quarter: QuarterSummary
  leagueName: string
  leagueSlug: string
}

/**
 * True when `weeks[index]` is the first listed week of the celebrated quarter,
 * i.e. where the results lists should render the celebration card.
 * Lists are newest-first, so this is the slot directly below the next quarter's games.
 */
export function startsCelebratedQuarter(weeks: Week[], index: number, quarter: QuarterSummary): boolean {
  const inQuarter = (w: Week) => weekInQuarter(w, quarter.q, quarter.year)
  return inQuarter(weeks[index]) && (index === 0 || !inQuarter(weeks[index - 1]))
}

// ─── computeTeamAB ────────────────────────────────────────────────────────────

export interface TeamABResult {
  teamAWins: number
  draws: number
  teamBWins: number
  total: number
  streakTeam: 'teamA' | 'teamB' | 'draw' | null
  streakLength: number
}

export function computeTeamAB(weeks: Week[]): TeamABResult {
  const played = weeks.filter(w => w.status === 'played')
  const teamAWins = played.filter(w => w.winner === 'teamA').length
  const draws     = played.filter(w => w.winner === 'draw').length
  const teamBWins = played.filter(w => w.winner === 'teamB').length

  const sorted = [...played].sort(
    (a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime()
  )
  let streakTeam: TeamABResult['streakTeam'] = null
  let streakLength = 0
  for (const w of sorted) {
    if (streakTeam === null) {
      streakTeam = w.winner as TeamABResult['streakTeam']
      streakLength = 1
    } else if (w.winner === streakTeam) {
      streakLength++
    } else {
      break
    }
  }

  return { teamAWins, draws, teamBWins, total: played.length, streakTeam, streakLength }
}

// ─── computeTeammates ─────────────────────────────────────────────────────────

export interface TeammateStat {
  name: string
  played: number
  won: number
  drew: number
  /** 0–100, rounded */
  winRate: number
}

/**
 * Every teammate who has played at least `minGames` played weeks on the same
 * side as `playerName`, with the pair's record. Draws count as played, not won.
 * Guests are left out. Sorted by win rate, then by games together.
 */
export function computeTeammates(playerName: string, weeks: Week[], minGames = 5): TeammateStat[] {
  const together = new Map<string, { played: number; won: number; drew: number }>()

  for (const w of weeks) {
    if (w.status !== 'played') continue
    const side = w.teamA.includes(playerName) ? 'teamA' : w.teamB.includes(playerName) ? 'teamB' : null
    if (!side) continue
    const won = w.winner === side
    const drew = w.winner === 'draw'
    for (const name of w[side]) {
      if (name === playerName || isGuestName(name)) continue
      const pair = together.get(name) ?? { played: 0, won: 0, drew: 0 }
      pair.played++
      if (won) pair.won++
      if (drew) pair.drew++
      together.set(name, pair)
    }
  }

  return Array.from(together, ([name, { played, won, drew }]) => ({
    name,
    played,
    won,
    drew,
    winRate: Math.round((won / played) * 100),
  }))
    .filter((t) => t.played >= minGames)
    .sort((a, b) => b.winRate - a.winRate || b.played - a.played)
}
