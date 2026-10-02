import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { LeagueDetails, Player, PlayerClaimStatus, ScheduledWeek, Week, Winner, YearStats } from './types'
import type { VisibilityTier } from './roles'
import type { QuarterSummary, QuarterlyEntry } from './sidebar-stats'

// --- Per-player score (wprScore, v2) ---
// A player's rating is their shrunk points per game, plus a starting label
// that fades out over their first LABEL_FADE_GAMES games, then discounted
// for newcomers and for players returning after several missed games.
const WPR_RESULTS_WEIGHT = 0.85        // shrunk points per game, normalised 0-100
const WPR_LABEL_POINTS = 7.5           // 'above' adds this, 'below' subtracts it, 'average' adds 0
const LABEL_FADE_GAMES = 10            // label weight reaches 0 at this many games (owner decision, do not change)
const PRIOR_GAMES = 12                 // phantom average games used to shrink points per game
const PRIOR_AVG_PPG = 1.5              // the phantom games' points per game (a 50% record)

// --- Team score (ewptScore) ---
// Fixed team-score points. Halved for the v2 rating, whose spread is about
// 40% narrower, so a lone keeper's handicap stays the same real-world size.
const GK_BASE_BONUS = 0.25             // minimum GK bonus when exactly one keeper present
const GK_WPR_SCALE = 1.0               // added per unit of (gkWpr / 100)
const NO_GK_PENALTY = -0.75
const DUAL_GK_PENALTY = -0.5
const DEPTH_BASELINE = 5               // team size where depth bonus = 0
const DEPTH_PER_EXTRA_PLAYER = 0.5
const DEPTH_MAX_BONUS = 3              // cap on cumulative depth bonus

// --- Win probability ---
const WIN_PROB_SCALE = 8               // logistic scale: diff / SCALE drives the sigmoid

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Convert a league name to a URL slug: lowercase, hyphens only, no leading/trailing hyphens. */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Sort weeks descending by actual match date (most recent first). */
export function sortWeeks(weeks: Week[]): Week[] {
  return [...weeks].sort(
    (a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime()
  )
}

/** Return only played weeks. */
export function getPlayedWeeks(weeks: Week[]): Week[] {
  return weeks.filter((w) => w.status === 'played')
}

/** Map winner value to display label. */
export function formatWinner(winner: Winner): string {
  switch (winner) {
    case 'teamA':
      return 'Team A'
    case 'teamB':
      return 'Team B'
    case 'draw':
      return 'Draw'
    default:
      return ''
  }
}

/** Signed goal difference for standings tables, e.g. '+5', '0', '-3'. */
export function formatGoalDiff(goalDiff: number): string {
  return goalDiff > 0 ? `+${goalDiff}` : String(goalDiff)
}

/**
 * Standings order without the alphabetical last resort: points, then GD, then
 * fewer games played, then wins. Negative when `a` ranks above `b`, 0 when the
 * two are level on every key.
 */
export function compareStandings(a: QuarterlyEntry, b: QuarterlyEntry): number {
  return (
    b.points - a.points ||
    b.goalDiff - a.goalDiff ||
    a.played - b.played ||
    b.won - a.won
  )
}

/**
 * Ranked standings for a set of weeks (only played weeks count). Used by the
 * sidebar and honours quarter tables and the result share text, so they all
 * agree on order: points, then GD, then fewer games played, then wins, then name.
 */
export function computeStandings(weeks: Week[]): QuarterlyEntry[] {
  const map = new Map<string, QuarterlyEntry>()
  for (const w of weeks) {
    if (w.status !== 'played') continue
    // goal_difference is an unsigned margin: winners gain it, losers lose it.
    // An unrecorded margin counts as 0.
    const margin = w.goal_difference ?? 0
    const allPlayers = [...w.teamA, ...w.teamB]
    for (const name of allPlayers) {
      if (!map.has(name)) map.set(name, { name, played: 0, won: 0, drew: 0, lost: 0, points: 0, goalDiff: 0 })
      const e = map.get(name)!
      e.played++
      const onTeamA = w.teamA.includes(name)
      if (w.winner === 'draw') { e.drew++; e.points += 1 }
      else if ((w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA)) { e.won++; e.points += 3; e.goalDiff += margin }
      else { e.lost++; e.goalDiff -= margin }
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    compareStandings(a, b) || a.name.localeCompare(b.name)
  )
}

const MONTH_LONG: Record<string, string> = {
  Jan: 'January',  Feb: 'February', Mar: 'March',    Apr: 'April',
  May: 'May',      Jun: 'June',     Jul: 'July',      Aug: 'August',
  Sep: 'September', Oct: 'October', Nov: 'November', Dec: 'December',
}

/** Returns a short month-year key used to detect group boundaries, e.g. 'Mar 2026'. */
export function getMonthKey(date: string): string {
  const [, mon, yr] = date.split(' ')
  return `${mon} ${yr}`
}

/** Returns a month + year label, e.g. 'Mar 2026'. */
export function formatMonthYear(date: string): string {
  const [, mon, yr] = date.split(' ')
  return `${mon} ${yr}`
}

/**
 * Weighted Performance Rating (WPR, v2) for a player.
 *
 *  - Results: points per game (W=3, D=1, L=0) shrunk toward 1.5 by
 *    PRIOR_GAMES phantom average games, normalised to 0-100 and weighted by
 *    WPR_RESULTS_WEIGHT. A newcomer's rating moves gradually as results arrive.
 *  - Label: the admin's strength label is a starting guess. 'above' adds
 *    WPR_LABEL_POINTS, 'below' subtracts it, 'average' and unrated add 0. Its
 *    weight fades linearly to zero at LABEL_FADE_GAMES games.
 *  - Newcomer discount: x0.85 for 0 or 1 games, x0.90 for 2, x0.95 for 3.
 *  - Rust discount: by league games missed since the player's last appearance
 *    (`gamesMissed`, set by `enrichPlayersForRating`).
 *
 * Pure: depends only on the player object, never on the clock. Recent form is
 * displayed in the UI but does not feed the rating.
 */
export function wprScore(player: Player): number {
  const shrunkPpg = (player.points + PRIOR_GAMES * PRIOR_AVG_PPG) / (player.played + PRIOR_GAMES)
  const resultsScore = (shrunkPpg / 3) * 100 * WPR_RESULTS_WEIGHT

  const labelOffset =
    player.strength === 'above' ? WPR_LABEL_POINTS
    : player.strength === 'below' ? -WPR_LABEL_POINTS
    : 0
  const labelWeight = Math.max(0, 1 - player.played / LABEL_FADE_GAMES)

  const score = resultsScore + labelOffset * labelWeight
  return score * newcomerMultiplier(player.played) * rustMultiplier(player.gamesMissed ?? 0)
}

/** Players still new to the league are discounted: 0 or 1 game 0.85, 2 games 0.90, 3 games 0.95, 4+ games 1. */
function newcomerMultiplier(played: number): number {
  if (played <= 1) return 0.85
  if (played === 2) return 0.90
  if (played === 3) return 0.95
  return 1
}

/** 0 to 2 missed games: 1. 3 missed: 0.96. 4 missed: 0.92. 5 or more: 0.88. */
function rustMultiplier(gamesMissed: number): number {
  if (gamesMissed <= 2) return 1
  if (gamesMissed === 3) return 0.96
  if (gamesMissed === 4) return 0.92
  return 0.88
}

/**
 * For each player name, the number of league games (status 'played' or 'dnf') dated after
 * that player's most recent appearance in a 'played' or 'dnf' week. Players who have never
 * appeared are absent from the map (treat as 0).
 */
export function gamesMissedByPlayer(weeks: Week[]): Map<string, number> {
  const games = weeks
    .filter((w) => w.status === 'played' || w.status === 'dnf')
    .sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime()) // most recent first
  const missed = new Map<string, number>()
  games.forEach((w, gamesSince) => {
    for (const name of [...w.teamA, ...w.teamB]) {
      if (!missed.has(name)) missed.set(name, gamesSince)
    }
  })
  return missed
}

/** Returns copies of `players` with `gamesMissed` set from `weeks`. */
export function enrichPlayersForRating(players: Player[], weeks: Week[]): Player[] {
  const missed = gamesMissedByPlayer(weeks)
  return players.map((p) => ({ ...p, gamesMissed: missed.get(p.name) ?? 0 }))
}

/**
 * Estimated Weighted Team Performance Indicator (EWTPI).
 *
 * Returns a single 0–100 score for a group of players representing a team.
 *
 *  - Average WPR — overall team quality
 *  - GK modifier: scaled by GK WPR — 0.25 + (wprScore(gk)/100)*1.0, range [+0.25,+1.25];
 *                 -0.75 for no GK, -0.5 for two (wasted slot)
 *  - Depth modifier: small bonus/penalty relative to a 5-player baseline
 */
export function ewptScore(players: Player[]): number {
  if (players.length === 0) return 0
  const wprScores = players.map((p) => wprScore(p))
  const avgWpr = wprScores.reduce((sum, s) => sum + s, 0) / players.length
  const gks = players.filter((p) => p.mentality === 'goalkeeper')
  const gkCount = gks.length
  let gkModifier: number
  if (gkCount === 0) {
    gkModifier = NO_GK_PENALTY
  } else if (gkCount === 1) {
    const gkWpr = wprScore(gks[0])
    gkModifier = GK_BASE_BONUS + (gkWpr / 100) * GK_WPR_SCALE
  } else {
    gkModifier = DUAL_GK_PENALTY
  }
  const depthBonus = Math.min(
    (players.length - DEPTH_BASELINE) * DEPTH_PER_EXTRA_PLAYER,
    DEPTH_MAX_BONUS,
  )
  return Math.min(
    100,
    Math.max(0, avgWpr + gkModifier + depthBonus),
  )
}

/**
 * Resolves the team rating to write when a result is recorded.
 *
 * Prefers the snapshot saved by `save_lineup` (the pre-game rating that was
 * shown when teams were balanced). Falls back to a fresh `ewptScore` only
 * for legacy lineups saved before the snapshot column existed.
 *
 * Recomputing at result-recording time is unsafe because the inputs to
 * `ewptScore` (notably `Player.gamesMissed`, derived from the weeks at build
 * time) are not persisted, and every result recorded since moves the ratings,
 * so the recomputed value drifts from the snapshot a member saw pre-game.
 */
export function resolveTeamRatingForResult(
  snapshot: number | null | undefined,
  recomputePlayers: Player[],
): number {
  if (snapshot !== null && snapshot !== undefined) return snapshot
  return parseFloat(ewptScore(recomputePlayers).toFixed(3))
}

/**
 * Given EWTPI scores for two teams, returns the probability (0–1) that team A wins.
 * Uses a logistic function so a 10-point gap ≈ 73% likelihood.
 */
export function winProbability(scoreA: number, scoreB: number): number {
  if (scoreA === 0 && scoreB === 0) return 0.5
  return 1 / (1 + Math.exp(-(scoreA - scoreB) / WIN_PROB_SCALE))
}

/**
 * Returns pundit-style copy and the leading team for a given Team A win probability.
 * Thresholds: even ≤51%, slight edge >51–<55%, stronger side 55–<62%,
 * favourites 62–<70%, heavy favourites ≥70%.
 */
export function winCopy(probA: number): { text: string; team: 'A' | 'B' | 'even' } {
  const pct = probA * 100
  const isEven = Math.abs(pct - 50) <= 1
  if (isEven) return { text: "Too close to call — this one could go either way", team: 'even' }
  const leading = pct > 50 ? 'A' : 'B'
  const leadPct = pct > 50 ? pct : 100 - pct
  const name = leading === 'A' ? 'Team A' : 'Team B'
  if (leadPct < 55) return { text: `Slight edge to ${name} going into this one`, team: leading }
  if (leadPct < 62) return { text: `${name} look like the stronger side tonight`, team: leading }
  if (leadPct < 70) return { text: `${name} are favourites heading into this one`, team: leading }
  return { text: `The odds heavily favour ${name} tonight`, team: leading }
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Builds a formatted plain-text share message for a saved lineup.
 * Suitable for pasting into WhatsApp, iMessage, or any messaging app.
 */
export function buildShareText(params: {
  leagueName: string
  leagueSlug: string
  week: number
  date: string        // 'DD MMM YYYY' — the canonical app date format
  format: string
  teamA: string[]
  teamB: string[]
  teamARating: number
  teamBRating: number
}): string {
  const { leagueName, leagueSlug, week, date, format, teamA, teamB, teamARating, teamBRating } = params
  const parsed = parseWeekDate(date)
  const [dd, mmm] = date.split(' ')
  const shortDate = `${DAY_SHORT[parsed.getDay()]} ${dd} ${mmm}`
  const prob = winProbability(teamARating, teamBRating)
  const { text: prediction } = winCopy(prob)
  return [
    `⚽ ${leagueName} — Week ${week}`,
    `📅 ${shortDate} · ${format}`,
    '',
    `🔵 Team A (${teamARating.toFixed(1)})`,
    teamA.join(', '),
    '',
    `🟣 Team B (${teamBRating.toFixed(1)})`,
    teamB.join(', '),
    '',
    `📊 ${prediction}`,
    '',
    `🔗 https://craft-football.com/${leagueSlug}`,
  ].join('\n')
}

/**
 * Builds a formatted plain-text share message for a DNF (Did Not Finish) week.
 *
 * Mirrors the lineup-share format but replaces the win-probability copy with a
 * DNF headline. Format segment, rating parentheticals, and the notes paragraph
 * are omitted when the corresponding inputs are empty/null.
 */
export function buildDnfShareText(params: {
  leagueName: string
  leagueSlug: string
  week: number
  date: string                // 'DD MMM YYYY'
  format: string              // '' when absent — function omits the "· {format}" segment
  teamA: string[]
  teamB: string[]
  teamARating: number | null  // null → no parenthetical on Team A header
  teamBRating: number | null  // null → no parenthetical on Team B header
  notes: string               // '' when absent — function omits the notes paragraph
}): string {
  const { leagueName, leagueSlug, week, date, format, teamA, teamB, teamARating, teamBRating, notes } = params
  const parsed = parseWeekDate(date)
  const [dd, mmm] = date.split(' ')
  const shortDate = `${DAY_SHORT[parsed.getDay()]} ${dd} ${mmm}`
  const dateLine = format ? `📅 ${shortDate} · ${format}` : `📅 ${shortDate}`
  const teamAHeader = teamARating !== null
    ? `🔵 Team A (${teamARating.toFixed(1)})`
    : '🔵 Team A'
  const teamBHeader = teamBRating !== null
    ? `🟣 Team B (${teamBRating.toFixed(1)})`
    : '🟣 Team B'
  const trimmedNotes = notes.trim()

  const lines: string[] = [
    `⚽ ${leagueName} — Week ${week}`,
    dateLine,
    '',
    '⚠️ Game called off — DNF',
    '',
    teamAHeader,
    teamA.join(', '),
    '',
    teamBHeader,
    teamB.join(', '),
  ]

  if (trimmedNotes.length > 0) {
    lines.push('', trimmedNotes)
  }

  lines.push('', `🔗 https://craft-football.com/${leagueSlug}`)
  return lines.join('\n')
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_IDX: Record<string, number> = Object.fromEntries(MONTH_SHORT.map((m, i) => [m, i]))

/** Parse a 'DD MMM YYYY' date string into a local Date. */
export function parseWeekDate(date: string): Date {
  const [d, m, y] = date.split(' ')
  return new Date(parseInt(y), MONTH_IDX[m], parseInt(d))
}

/** Format a Date into the canonical 'DD MMM YYYY' string used across the app. */
export function formatWeekDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  return `${d} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * Compute the next match date. If `leagueDayIndex` is provided (0=Sun…6=Sat),
 * it is used directly. Otherwise the day-of-week is inferred from the most
 * recent played week. Falls back to +7 days if no pattern is available.
 *
 * NOTE: 0 (Sunday) is a valid leagueDayIndex — use `!== undefined`, not truthiness.
 */
export function getNextMatchDate(weeks: Week[], leagueDayIndex?: number): string {
  const played = getPlayedWeeks(sortWeeks(weeks))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Use leagueDayIndex if provided (note: 0 = Sunday is valid, use !== undefined not truthiness)
  const dow = leagueDayIndex !== undefined
    ? leagueDayIndex
    : played.length > 0
      ? parseWeekDate(played[0].date).getDay()
      : null

  if (dow === null) {
    const next = new Date(today)
    next.setDate(today.getDate() + 7)
    return formatWeekDate(next)
  }

  let daysUntil = (dow - today.getDay() + 7) % 7
  if (daysUntil === 0) {
    const todayStr = formatWeekDate(today)
    if (weeks.some((w) => w.date === todayStr)) daysUntil = 7
  }
  const next = new Date(today)
  next.setDate(today.getDate() + daysUntil)
  return formatWeekDate(next)
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
}

/** Convert a day name string (e.g. "Thursday") to a Date.getDay() index (0=Sun…6=Sat). Returns null if null or unrecognised. */
export function dayNameToIndex(day: string | null): number | null {
  if (!day) return null
  return DAY_NAME_TO_INDEX[day] ?? null
}

/**
 * Return the next calendar occurrence of `dayIndex` (0=Sun…6=Sat) after today
 * as a 'DD MMM YYYY' string. Never returns today — always at least tomorrow.
 */
export function nextOccurrenceAfterToday(dayIndex: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let daysUntil = (dayIndex - today.getDay() + 7) % 7
  if (daysUntil === 0) daysUntil = 7
  const next = new Date(today)
  next.setDate(today.getDate() + daysUntil)
  return formatWeekDate(next)
}

/** Season (calendar year) a match date belongs to. `date` is 'DD MMM YYYY'. */
export function seasonOfDate(date: string): string {
  return date.split(' ')[2]
}

/** Next week number within `season`: highest existing week in that season plus one, or 1 if none. */
export function getNextWeekNumber(weeks: Week[], season: string): number {
  const inSeason = weeks.filter((w) => w.season === season)
  if (inSeason.length === 0) return 1
  return Math.max(...inSeason.map((w) => w.week)) + 1
}

export function computeYearStats(playerName: string, weeks: Week[], year: string): YearStats {
  const yearPlayed = weeks.filter(
    (w) => w.status === 'played' && w.season === year &&
      (w.teamA.includes(playerName) || w.teamB.includes(playerName))
  )

  let won = 0, drew = 0, lost = 0
  for (const w of yearPlayed) {
    const onTeamA = w.teamA.includes(playerName)
    if (w.winner === 'draw') { drew++ }
    else if ((w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA)) { won++ }
    else { lost++ }
  }

  const played = yearPlayed.length
  const winRate = played > 0 ? Math.round((won / played) * 1000) / 10 : 0
  const points = won * 3 + drew

  const recent = [...yearPlayed]
    .sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime())
    .slice(0, 5)
    .map((w) => {
      const onTeamA = w.teamA.includes(playerName)
      if (w.winner === 'draw') return 'D'
      return (w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA) ? 'W' : 'L'
    })
  const recentForm = recent.join('').padEnd(5, '-')

  return { played, won, drew, lost, winRate, points, recentForm, qualified: played >= 5 }
}

/**
 * Returns the played-week count for the current season used in the
 * "X of 52 weeks · N% complete" header. Uses the max `week` from the current
 * year's played/cancelled weeks, falling back to the previous year if the
 * current year has none yet.
 */
export function getSeasonPlayedWeekCount(weeks: Week[]): number {
  const relevant = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled' || w.status === 'dnf')
  const currentYear = String(new Date().getFullYear())
  const currentYearWeeks = relevant.filter((w) => w.season === currentYear)
  if (currentYearWeeks.length > 0) {
    return Math.max(...currentYearWeeks.map((w) => w.week))
  }
  const prevYear = String(new Date().getFullYear() - 1)
  const prevYearWeeks = relevant.filter((w) => w.season === prevYear)
  return prevYearWeeks.length > 0 ? Math.max(...prevYearWeeks.map((w) => w.week)) : 0
}

/**
 * Season (year) the "X of 52 weeks" header count refers to — the current year,
 * or the previous year while the current year has no played/cancelled weeks.
 * Mirrors the fallback in getSeasonPlayedWeekCount.
 */
export function getHeaderSeason(weeks: Week[]): string {
  const relevant = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled' || w.status === 'dnf')
  const currentYear = String(new Date().getFullYear())
  if (relevant.some((w) => w.season === currentYear)) return currentYear
  const prevYear = String(new Date().getFullYear() - 1)
  return relevant.some((w) => w.season === prevYear) ? prevYear : currentYear
}

/** Distinct seasons across all weeks (any status), newest first, e.g. ['2026', '2025']. */
export function getSeasons(weeks: Week[]): string[] {
  return Array.from(new Set(weeks.map((w) => w.season))).sort((a, b) => Number(b) - Number(a))
}

/**
 * Season the Results tab shows: the `?year` param when it is one of the
 * league's seasons, otherwise the newest season (or the current calendar year
 * when the league has no weeks yet).
 */
export function resolveSelectedYear(seasons: string[], param: string | null | undefined): string {
  if (param && seasons.includes(param)) return param
  return seasons[0] ?? String(new Date().getFullYear())
}

/** Latest played or DNF week by date: the result card that opens by default. */
export function getLatestResultWeek(weeks: Week[]): Week | null {
  return sortWeeks(weeks.filter((w) => w.status === 'played' || w.status === 'dnf'))[0] ?? null
}

/**
 * Mirrors the Results year into the URL without a navigation. The default
 * year keeps the URL clean. Client-only.
 */
export function writeYearParam(year: string, defaultYear: string): void {
  const url = new URL(window.location.href)
  if (year === defaultYear) url.searchParams.delete('year')
  else url.searchParams.set('year', year)
  window.history.replaceState(null, '', url)
}

/** Returns the array of non-empty line-1 fact strings for the info bar. */
export function buildLeagueInfoFacts(details: LeagueDetails): string[] {
  const facts: string[] = []
  if (details.location) facts.push(`📍 ${details.location}`)
  if (details.day && details.kickoff_time) facts.push(`🕖 ${details.day}s · ${details.kickoff_time}`)
  if (details.player_count !== undefined) facts.push(`👥 ${details.player_count} players`)
  return facts
}

/** Returns true if at least one LeagueDetails field is non-null and non-empty. */
export function isLeagueDetailsFilled(details: LeagueDetails | null | undefined): boolean {
  if (!details) return false
  return !!(details.location || details.day || details.kickoff_time || details.bio)
}

/**
 * Width (in %) of the Team A segment of a played match card's margin bar.
 * Leans 6% per goal towards the winner from an even 50%, clamped to 20–80%.
 */
export function getMarginBarWidth(winner: Winner, goalDifference: number | null | undefined): number {
  const gd = Math.abs(goalDifference ?? 0)
  if (winner === 'teamA') return Math.min(80, 50 + gd * 6)
  if (winner === 'teamB') return Math.max(20, 50 - gd * 6)
  return 50
}

/**
 * Centre caption under a played match card's margin bar. Written in normal case;
 * the card uppercases it. `viewerWon` is true when the viewer's linked player was
 * on the winning side; a losing viewer keeps the neutral team caption.
 */
export function getMarginCaption(
  winner: Winner,
  goalDifference: number | null | undefined,
  viewerWon = false
): string | null {
  if (!winner) return null
  if (winner === 'draw') return 'Honours even'
  const subject = viewerWon ? 'You' : winner === 'teamA' ? 'Team A' : 'Team B'
  const gd = Math.abs(goalDifference ?? 0)
  if (gd === 0) return `${subject} won`
  return `${subject} won by ${gd} ${gd === 1 ? 'goal' : 'goals'}`
}

/**
 * Returns true if the game day 20:00 deadline has passed for the given date string.
 * Matches the local-time behavior of the existing NextMatchCard deadline logic.
 * Input format: 'DD MMM YYYY', e.g. '25 Mar 2026'
 */
export function isPastDeadline(dateStr: string): boolean {
  const [day, mon, yr] = dateStr.split(' ')
  const deadline = new Date(`${mon} ${day}, ${yr} 20:00:00`)
  return Date.now() > deadline.getTime()
}

/** 'DD MMM YYYY' → 'Thu 09 Apr', for fixture lines. */
export function formatFixtureDate(date: string): string {
  const [day, month] = date.split(' ')
  return `${DAY_SHORT[parseWeekDate(date).getDay()]} ${day.padStart(2, '0')} ${month}`
}

/**
 * The week the next match card should start from, derived on the server so the
 * Overview tab can render the card in its first paint.
 *
 * Takes the latest-dated row that is scheduled, cancelled or unrecorded:
 *   - unrecorded, or past the 20:00 deadline → null (the card is idle)
 *   - otherwise → that row as a ScheduledWeek
 */
export function getNextMatchSeed(weeks: Week[]): ScheduledWeek | null {
  const latest = sortWeeks(
    weeks.filter((w) => w.status === 'scheduled' || w.status === 'cancelled' || w.status === 'unrecorded')
  )[0]
  if (!latest || !latest.id) return null
  if (latest.status === 'unrecorded') return null
  if (isPastDeadline(latest.date)) return null
  return {
    id: latest.id,
    season: latest.season,
    week: latest.week,
    date: latest.date,
    format: latest.format ?? null,
    teamA: latest.teamA,
    teamB: latest.teamB,
    status: latest.status === 'cancelled' ? 'cancelled' : 'scheduled',
    lineupMetadata: latest.lineupMetadata ?? null,
    team_a_rating: latest.team_a_rating ?? null,
    team_b_rating: latest.team_b_rating ?? null,
  }
}

/** Cookie holding the browser's last measured viewport, 'narrow' (below lg) or 'wide'. */
export const VIEWPORT_COOKIE = 'viewport'

/**
 * Where a visitor lands when they open a league. Screens below lg get the
 * Overview tab (hidden at lg and above); everything else gets Results.
 * The viewport cookie is the source of truth once the browser has set it. On a
 * first visit the user agent stands in: phones and Android tablets get
 * Overview, everything else (including iPads, whose Safari sends a desktop
 * user agent) gets Results.
 */
export function leagueLandingPath(
  slug: string,
  userAgent: string | null | undefined,
  viewport?: string | null
): string {
  const smallScreen =
    viewport === 'narrow' ? true
    : viewport === 'wide' ? false
    : /Mobi|Android/i.test(userAgent ?? '')
  return `/${slug}/${smallScreen ? 'overview' : 'results'}`
}

export type OverviewViewerCard = 'sign-in' | 'link-profile' | 'your-stats' | null

/** Which card sits second on the Overview tab for this viewer. */
export function getOverviewViewerCard(viewer: {
  isAuthenticated: boolean
  tier: VisibilityTier
  claimStatus: PlayerClaimStatus | 'none'
  /** Claim approved and the player exists in the stats list. */
  hasLinkedPlayer: boolean
}): OverviewViewerCard {
  if (!viewer.isAuthenticated) return 'sign-in'
  if (viewer.tier === 'public') return null
  if (viewer.hasLinkedPlayer) return 'your-stats'
  if (viewer.tier === 'member' && viewer.claimStatus === 'none') return 'link-profile'
  return null
}

/**
 * Returns the date string ('DD MMM YYYY') of the most recent expected game day
 * that has already passed, or null if no game day can be determined.
 *
 * Uses leagueDayIndex if provided (0=Sun…6=Sat), otherwise infers from the most
 * recent played week. Returns null if neither source is available.
 *
 * NOTE: Only returns the immediately preceding game date — does not backfill
 * multiple missed weeks. Multi-week gaps are resolved by successive page loads.
 */
export function getMostRecentExpectedGameDate(
  weeks: Week[],
  leagueDayIndex?: number
): string | null {
  const played = getPlayedWeeks(sortWeeks(weeks))
  const dow = leagueDayIndex !== undefined
    ? leagueDayIndex
    : played.length > 0
      ? parseWeekDate(played[0].date).getDay()
      : null

  if (dow === null) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Walk backwards from today to find the most recent occurrence of this day-of-week
  const daysBack = (today.getDay() - dow + 7) % 7
  // If today IS the game day, include today (deadline check in caller decides if it's past)
  const candidate = new Date(today)
  candidate.setDate(today.getDate() - daysBack)
  return formatWeekDate(candidate)
}

/**
 * What is happening in a league right now, for the browser tab title: today's
 * result once it is in, "Match day" on a game day, "Match day tomorrow" the day
 * before. Null when there is nothing to say.
 *
 * A game day is a week row dated that day, or the league's regular day
 * (0=Sun…6=Sat) when no row exists yet.
 */
export function getLeagueTitleStatus(
  weeks: Week[],
  now: Date,
  leagueDayIndex?: number
): string | null {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  const todayWeek = weeks.find((w) => w.date === formatWeekDate(today))
  if (todayWeek) {
    switch (todayWeek.status) {
      case 'played':
        return todayWeek.winner === 'draw'
          ? 'Full time: draw'
          : `Full time: ${formatWinner(todayWeek.winner)} won`
      case 'dnf':
        return 'Did not finish'
      case 'cancelled':
        return 'Cancelled today'
      case 'unrecorded':
        return 'Awaiting result'
      case 'scheduled':
        return 'Match day'
    }
  }
  if (leagueDayIndex === today.getDay()) return 'Match day'

  const tomorrowWeek = weeks.find((w) => w.date === formatWeekDate(tomorrow))
  if (tomorrowWeek) return tomorrowWeek.status === 'scheduled' ? 'Match day tomorrow' : null
  if (leagueDayIndex === tomorrow.getDay()) return 'Match day tomorrow'

  return null
}

/**
 * Browser tab title for a league page, e.g. "(2) Results · The Boot Room".
 * The bracketed count (pending requests for admins) is left off at zero.
 */
export function buildLeagueTitle({
  page,
  leagueName,
  pendingCount = 0,
}: {
  page: string
  leagueName: string
  pendingCount?: number
}): string {
  const title = `${page} · ${leagueName}`
  return pendingCount > 0 ? `(${pendingCount}) ${title}` : title
}

const MILESTONE_SET = new Set([10, 25])
function isMilestone(n: number): boolean {
  if (MILESTONE_SET.has(n)) return true
  return n >= 50 && n % 50 === 0
}

/** 'st' | 'nd' | 'rd' | 'th' for a positive integer. */
export function ordinalSuffix(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

function ordinal(n: number): string {
  return `${n}${ordinalSuffix(n)}`
}

function playerWeeksDesc(playerName: string, weeks: Week[]): Week[] {
  return weeks
    .filter(w => w.status === 'played' && (w.teamA.includes(playerName) || w.teamB.includes(playerName)))
    .sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime())
}

function currentWinStreak(playerName: string, weeks: Week[]): number {
  const played = playerWeeksDesc(playerName, weeks)
  let count = 0
  for (const w of played) {
    const onTeamA = w.teamA.includes(playerName)
    const won = (w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA)
    if (won) count++
    else break
  }
  return count
}

function currentUnbeatenStreak(playerName: string, weeks: Week[]): number {
  const played = playerWeeksDesc(playerName, weeks)
  let count = 0
  for (const w of played) {
    const onTeamA = w.teamA.includes(playerName)
    const lost = (w.winner === 'teamA' && !onTeamA) || (w.winner === 'teamB' && onTeamA)
    if (!lost) count++
    else break
  }
  return count
}

/**
 * Builds a formatted plain-text share message for a saved result.
 * Returns { shareText, highlightsText } — shareText is the full message;
 * highlightsText is just the highlights block, rendered separately in the share step.
 */
export function buildResultShareText(params: {
  leagueName: string
  leagueSlug: string
  week: number
  date: string           // 'DD MMM YYYY'
  format: string
  teamA: string[]
  teamB: string[]
  winner: Winner
  goalDifference: number
  teamARating: number
  teamBRating: number
  players: Player[]
  weeks: Week[]          // includes the synthetic week for tonight
}): { shareText: string; highlightsText: string } {
  const {
    leagueName, leagueSlug, week, date, format,
    teamA, teamB, winner, goalDifference,
    teamARating, teamBRating, players, weeks,
  } = params

  const parsed = parseWeekDate(date)
  const [dd, mmm] = date.split(' ')
  const shortDate = `${DAY_SHORT[parsed.getDay()]} ${dd} ${mmm}`

  // ── Result headline ──────────────────────────────────────────────────────
  const resultLine =
    winner === 'draw'
      ? '🤝 Draw!'
      : winner === 'teamA'
        ? `🏆 Team A win! (+${goalDifference} goals)`
        : `🏆 Team B win! (+${goalDifference} goals)`

  // ── Highlights ───────────────────────────────────────────────────────────
  const highlights: string[] = []

  // Win streaks (winning team only)
  if (winner !== 'draw') {
    const winners = winner === 'teamA' ? teamA : teamB
    for (const name of winners) {
      const streak = currentWinStreak(name, weeks)
      if (streak >= 3) {
        highlights.push(`🔥 ${name} on a ${streak}-game winning streak`)
      }
    }
  }

  // Unbeaten streaks broken (losing team only, non-draw)
  if (winner !== 'draw') {
    const losers = winner === 'teamA' ? teamB : teamA
    // Compute streak from weeks BEFORE tonight (exclude last entry which is tonight)
    const priorWeeks = weeks.slice(0, -1)
    for (const name of losers) {
      const streak = currentUnbeatenStreak(name, priorWeeks)
      if (streak >= 5) {
        highlights.push(`💔 ${name}'s ${streak}-game unbeaten run is over`)
      }
    }
  }

  // Upset flag
  if (winner !== 'draw') {
    const upset =
      (winner === 'teamA' && teamBRating > teamARating) ||
      (winner === 'teamB' && teamARating > teamBRating)
    if (upset) {
      const [strongRating, weakRating] =
        winner === 'teamA'
          ? [teamBRating.toFixed(1), teamARating.toFixed(1)]
          : [teamARating.toFixed(1), teamBRating.toFixed(1)]
      const strongTeam = winner === 'teamA' ? 'Team B' : 'Team A'
      highlights.push(`😱 Upset! ${strongTeam} were stronger on paper (${strongRating} vs ${weakRating})`)
    }
  }

  // Milestones
  const allPlayers = [...teamA, ...teamB]
  for (const name of allPlayers) {
    const player = players.find(p => p.name === name)
    if (!player) continue
    const newPlayed = player.played + 1
    if (isMilestone(newPlayed)) {
      highlights.push(`🎖️ ${name} played their ${ordinal(newPlayed)} game tonight`)
    }
  }

  // ── Quarter table top 5 ──────────────────────────────────────────────────
  const tableLines: string[] = []
  // The quarter of the result being shared, not of today
  const q = Math.floor(parsed.getMonth() / 3) + 1
  const year = parsed.getFullYear()
  const qWeeks = weeks.filter(w => {
    const d = parseWeekDate(w.date)
    return Math.floor(d.getMonth() / 3) + 1 === q && d.getFullYear() === year
  })
  const tableEntries = computeStandings(qWeeks).slice(0, 5)
  if (tableEntries.length > 0) {
    const qLabel = `Q${q} ${year}`
    tableLines.push(`📊 ${qLabel} standings`)
    tableEntries.forEach((e, i) => {
      tableLines.push(`${i + 1}. ${e.name} — ${e.points}pts`)
    })
  }

  // ── In-form ──────────────────────────────────────────────────────────────
  const inFormLines: string[] = []
  // Inline in-form: PPG from recentForm for players who played tonight
  const tonight = new Set([...teamA, ...teamB])
  const inFormEntries = players
    .filter(p => tonight.has(p.name) && p.played >= 5)
    .map(p => {
      const chars = p.recentForm.split('').filter(c => c !== '-')
      if (chars.length === 0) return { name: p.name, ppg: 0 }
      const pts = chars.reduce((acc, c) => acc + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0)
      return { name: p.name, ppg: pts / chars.length }
    })
    .filter(e => e.ppg >= 1.5)
    .sort((a, b) => b.ppg - a.ppg)
  if (inFormEntries.length > 0) {
    const top = inFormEntries[0]
    inFormLines.push(`⚡ In form: ${top.name} (${top.ppg.toFixed(1)} PPG)`)
  }

  // ── Assemble highlightsText (no header, no teams, no URL) ────────────────
  // Each individual highlight and each block gets its own \n\n-separated entry
  // so every content block in the final share text is clearly separated.
  const highlightParts: string[] = [
    ...highlights,
    ...(tableLines.length > 0 ? [tableLines.join('\n')] : []),
    ...(inFormLines.length > 0 ? [inFormLines.join('\n')] : []),
  ]
  const highlightsText = highlightParts.join('\n\n')

  // ── Assemble full shareText ──────────────────────────────────────────────
  const parts: string[] = [
    `⚽ ${leagueName} — Week ${week}`,
    `📅 ${shortDate}${format ? ` · ${format}` : ''}`,
    '',
    resultLine,
    '',
    '🔵 Team A',
    teamA.join(', '),
    '',
    '🟣 Team B',
    teamB.join(', '),
  ]

  if (highlightsText.length > 0) {
    parts.push('')
    parts.push(highlightsText)
  }

  parts.push('')
  parts.push(`🔗 https://craft-football.com/${leagueSlug}`)

  return { shareText: parts.join('\n'), highlightsText }
}

export type ShareOutcome = 'shared' | 'copied' | 'failed'

/**
 * Shares text via the native share sheet on small screens, otherwise copies
 * it to the clipboard. Mirrors the long-standing MatchCard behaviour:
 * share-sheet dismissal (AbortError) returns 'failed' with no clipboard
 * fallback — callers show no feedback; any other share failure falls back
 * to the clipboard.
 */
export async function shareOrCopy(text: string): Promise<ShareOutcome> {
  async function copy(): Promise<ShareOutcome> {
    try {
      await navigator.clipboard.writeText(text)
      return 'copied'
    } catch {
      return 'failed'
    }
  }

  if (navigator.share && window.innerWidth < 768) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name !== 'AbortError') {
        return copy()
      }
      return 'failed'
    }
  }
  return copy()
}

/**
 * Builds the plain-text share message for a completed quarter on the
 * Honours tab. Pure function — all data comes from the QuarterSummary.
 */
export function buildQuarterShareText(params: {
  leagueName: string
  leagueSlug: string
  quarter: QuarterSummary
}): string {
  const { leagueName, leagueSlug, quarter } = params
  const { q, year, seasonName, dateRange, entries = [], awards = [], gamesPlayed = 0 } = quarter

  // dateRange strings are 'DD MMM YYYY'; the year already appears in the headline
  const stripYear = (d: string) => d.split(' ').slice(0, 2).join(' ')
  const gamesLabel = gamesPlayed === 1 ? '1 game' : `${gamesPlayed} games`

  const parts: string[] = [
    `🏁 That's a wrap on Q${q} ${year}!`,
    `⚽ ${leagueName} — ${seasonName} quarter`,
    `📅 ${stripYear(dateRange.from)} – ${stripYear(dateRange.to)} · ${gamesLabel}`,
  ]

  const champion = entries[0]?.name
  if (champion) {
    parts.push('')
    parts.push(`👑 Your ${seasonName} champion: ${champion} 🎉`)
  }

  const honours = awards.filter(a => a.key !== 'champion')
  if (honours.length > 0) {
    parts.push('')
    parts.push('🎖️ Quarter honours')
    for (const a of honours) {
      parts.push(`${a.icon} ${a.nickname} — ${a.player} (${a.stat})`)
    }
  }

  if (entries.length > 0) {
    parts.push('')
    parts.push('📊 Final standings')
    entries.slice(0, 10).forEach((e, i) => {
      parts.push(`${i + 1}. ${e.name} — ${e.points}pts (P${e.played} W${e.won} D${e.drew} L${e.lost})`)
    })
  }

  parts.push('')
  parts.push(`🔗 https://craft-football.com/${leagueSlug}/honours#q-${year}-${q}`)

  return parts.join('\n')
}

const AVATAR_PALETTE: { bg: string; border: string; text: string }[] = [
  { bg: '#1e1b4b', border: '#4f46e5', text: '#a5b4fc' }, // indigo
  { bg: '#1e3a5f', border: '#2563eb', text: '#93c5fd' }, // blue
  { bg: '#2e1065', border: '#7c3aed', text: '#c4b5fd' }, // violet
  { bg: '#0d2b2b', border: '#0d9488', text: '#5eead4' }, // teal
  { bg: '#2d0a16', border: '#e11d48', text: '#fda4af' }, // rose
  { bg: '#0c2233', border: '#0284c7', text: '#7dd3fc' }, // sky
]

/**
 * Returns up to two uppercase initials from a display name.
 * "Will Loveland" → "WL", "Madonna" → "M", "" → ""
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0][0].toUpperCase()
  return words[0][0].toUpperCase() + words[1][0].toUpperCase()
}

/**
 * Deterministically maps a display name to one of six dark-theme colour sets.
 * Same name always returns the same colour.
 */
export function getAvatarColor(name: string): { bg: string; border: string; text: string } {
  const index = name.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_PALETTE.length
  return { ...AVATAR_PALETTE[index] }
}

/**
 * Result-phrase portion of the share-step header, e.g. "Team A Wins! (+2 goals)".
 * Singular goal handled. DNF takes priority over winner inputs.
 */
export function buildResultHeadline(
  winner: Winner,
  goalDifference: number,
  isDnf: boolean
): string {
  if (isDnf) return 'Did Not Finish'
  if (winner === 'draw') return 'Draw'
  if (winner === 'teamA' || winner === 'teamB') {
    const teamLabel = winner === 'teamA' ? 'Team A' : 'Team B'
    const goalWord = goalDifference === 1 ? 'goal' : 'goals'
    return `${teamLabel} Wins! (+${goalDifference} ${goalWord})`
  }
  return ''
}
