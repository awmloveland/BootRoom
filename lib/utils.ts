import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { LeagueDetails, Player, Week, Winner } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Sort weeks descending by week number (most recent first). */
export function sortWeeks(weeks: Week[]): Week[] {
  return [...weeks].sort((a, b) => b.week - a.week)
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
 * Weighted Performance Rating (WPR) score for a player.
 *
 * Three components:
 *  - 60%: Points per game (W=3, D=1, L=0) with Bayesian shrinkage toward
 *          average (1.5 PPG) so small samples don't inflate the score.
 *  - 25%: Recent form (last 5 games) with recency weighting — more recent
 *          games count more, so improving players rank above fading ones.
 *  - 15%: Quality rating prior (1–3 scale), which fades to zero by ~10 games
 *          so it only influences players with very few results.
 *
 * Players below the minimum games threshold (qualified === false) are ranked
 * last regardless of score.
 */
export function wprScore(player: Player): number {
  const PRIOR_GAMES = 5         // shrinkage strength
  const PRIOR_AVG_PPG = 1.5    // 50% win rate equivalent

  // Component 1: shrunk points per game (0–3 scale → normalised 0–100)
  const shrunkPpg = (player.points + PRIOR_GAMES * PRIOR_AVG_PPG) / (player.played + PRIOR_GAMES)
  const ppgScore = (shrunkPpg / 3) * 100

  // Component 2: recency-weighted form (most recent game has full weight)
  const formChars = player.recentForm.split('')
  const rawFormScore = formChars.reduce((acc, c, i) => {
    const pts = c === 'W' ? 3 : c === 'D' ? 1 : 0
    const weight = 1 - i * 0.15
    return acc + pts * weight
  }, 0)
  const maxFormScore = formChars.reduce((acc, _, i) => acc + 3 * (1 - i * 0.15), 0)
  const formScore = maxFormScore > 0 ? (rawFormScore / maxFormScore) * 100 : 0

  // Component 3: rating prior (1–3 → 0–100), fades as played increases
  const normRating = player.rating > 0 ? ((player.rating - 1) / 2) * 100 : 50
  const ratingWeight = Math.max(0, 1 - player.played / 10)
  const ratingScore = normRating * ratingWeight

  return ppgScore * 0.60 + formScore * 0.25 + ratingScore * 0.15
}

/** Raw form score for a player (used internally by ewptScore). */
function playerFormScore(player: Player): number {
  let score = 0
  for (const c of player.recentForm) {
    if (c === 'W') score += 3
    else if (c === 'D') score += 1
  }
  // Normalise to 0–100 (max is 3 pts × 5 games = 15)
  return (score / 15) * 100
}

/**
 * Estimated Weighted Team Performance Indicator (EWTPI).
 *
 * Returns a single 0–100 score for a group of players representing a team.
 *
 *  - 55%: Average WPR — overall team quality floor
 *  - 20%: Max WPR — star player has outsized impact in 5-a-side
 *  - 25%: Average normalised recent form
 *  - GK modifier: +3 for exactly one GK, -3 for none, -2 for two (wasted slot)
 *  - Variety bonus: +2 if team covers 3+ different mentalities
 *  - Depth modifier: small bonus/penalty relative to a 5-player baseline
 */
export function ewptScore(players: Player[]): number {
  if (players.length === 0) return 0
  const wprScores = players.map((p) => wprScore(p)).sort((a, b) => b - a)
  const avgWpr = wprScores.reduce((sum, s) => sum + s, 0) / players.length
  // Average of top 2 WPR scores — rewards having multiple strong players,
  // not just a single standout
  const top2Avg = wprScores.length >= 2
    ? (wprScores[0] + wprScores[1]) / 2
    : wprScores[0]
  const avgForm = players.reduce((sum, p) => sum + playerFormScore(p), 0) / players.length
  const gkCount = players.filter((p) => p.mentality === 'goalkeeper' || p.goalkeeper).length
  const gkModifier = gkCount === 1 ? 3 : gkCount === 0 ? -3 : -2
  const mentalities = new Set(players.map((p) => p.mentality))
  const varietyBonus = mentalities.size >= 3 ? 2 : 0
  const depthBonus = Math.min((players.length - 5) * 0.5, 3)
  return Math.min(
    100,
    Math.max(
      0,
      avgWpr * 0.50 + top2Avg * 0.25 + avgForm * 0.25 + gkModifier + varietyBonus + depthBonus,
    ),
  )
}

/**
 * Given EWTPI scores for two teams, returns the probability (0–1) that team A wins.
 * Uses a logistic function so a 10-point gap ≈ 73% likelihood.
 */
export function winProbability(scoreA: number, scoreB: number): number {
  if (scoreA === 0 && scoreB === 0) return 0.5
  return 1 / (1 + Math.exp(-(scoreA - scoreB) / 8))
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
  leagueId: string
  week: number
  date: string        // 'DD MMM YYYY' — the canonical app date format
  format: string
  teamA: string[]
  teamB: string[]
  teamARating: number
  teamBRating: number
}): string {
  const { leagueName, leagueId, week, date, format, teamA, teamB, teamARating, teamBRating } = params
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
    `🔗 https://craft-football.com/${leagueId}`,
  ].join('\n')
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

/** Return the next week number (max existing week + 1, or 1 if none). */
export function getNextWeekNumber(weeks: Week[]): number {
  if (weeks.length === 0) return 1
  return Math.max(...weeks.map((w) => w.week)) + 1
}

/**
 * Derive a season string like "2025–26" from the played weeks.
 * Uses the calendar year of the first and last played game.
 */
export function deriveSeason(weeks: Week[]): string {
  const played = getPlayedWeeks(weeks)
  if (played.length === 0) return ''
  const sorted = [...played].sort((a, b) => a.week - b.week)
  const firstYear = sorted[0].date.split(' ')[2]
  const lastYear = sorted[sorted.length - 1].date.split(' ')[2]
  if (firstYear === lastYear) return firstYear
  return `${firstYear}\u2013${lastYear.slice(-2)}`  // en-dash + last 2 digits
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

/** Returns true if the match card should render the meta row (margin and/or notes). */
export function shouldShowMeta(
  goal_difference: number | null | undefined,
  notes: string | undefined
): boolean {
  return (goal_difference != null && goal_difference !== 0) || !!(notes && notes.trim() !== '')
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
 * Parses first and last name from Supabase Google OAuth user_metadata.
 * Priority: given_name/family_name fields → split full_name → split name → empty strings.
 */
export function parseGoogleName(meta: Record<string, unknown>): { firstName: string; lastName: string } {
  const givenName = typeof meta.given_name === 'string' ? meta.given_name : null
  const familyName = typeof meta.family_name === 'string' ? meta.family_name : null

  if (givenName !== null || familyName !== null) {
    return { firstName: givenName ?? '', lastName: familyName ?? '' }
  }

  const fullStr = typeof meta.full_name === 'string'
    ? meta.full_name
    : typeof meta.name === 'string'
      ? meta.name
      : ''

  const parts = fullStr.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  }
}

const MILESTONE_SET = new Set([10, 25])
function isMilestone(n: number): boolean {
  if (MILESTONE_SET.has(n)) return true
  return n >= 50 && n % 50 === 0
}

function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
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
 * highlightsText is just the highlights block, used by ResultSuccessPanel.
 */
export function buildResultShareText(params: {
  leagueName: string
  leagueId: string
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
    leagueName, leagueId, week, date, format,
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
  // Inline quarterly table
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3) + 1
  const year = now.getFullYear()
  const qWeeks = weeks.filter(w => {
    if (w.status !== 'played') return false
    const d = parseWeekDate(w.date)
    const wq = Math.floor(d.getMonth() / 3) + 1
    return wq === q && d.getFullYear() === year
  })
  const tableMap = new Map<string, number>()
  for (const w of qWeeks) {
    for (const name of [...w.teamA, ...w.teamB]) {
      const prev = tableMap.get(name) ?? 0
      const onTeamA = w.teamA.includes(name)
      const pts = w.winner === 'draw' ? 1
        : (w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA) ? 3 : 0
      tableMap.set(name, prev + pts)
    }
  }
  const tableEntries = Array.from(tableMap.entries())
    .sort(([,a],[,b]) => b - a)
    .slice(0, 5)
  if (tableEntries.length > 0) {
    const qLabel = `Q${q} ${year}`
    tableLines.push(`📊 ${qLabel} standings`)
    tableEntries.forEach(([name, pts], i) => {
      tableLines.push(`${i + 1}. ${name} — ${pts}pts`)
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
  parts.push(`🔗 https://craft-football.com/${leagueId}`)

  return { shareText: parts.join('\n'), highlightsText }
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
