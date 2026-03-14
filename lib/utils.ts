import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { Player, Week, Winner } from './types'

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
