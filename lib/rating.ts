// lib/rating.ts
// Player and team strength: WPR per player, EWPT per team, win probability.

import type { Player, Strength } from './types'
import { strengthToRating } from './strength'

// --- Per-player score (wprScore) ---
const WPR_PPG_WEIGHT = 0.60            // shrunk points-per-game contribution
const WPR_FORM_WEIGHT = 0.25           // recency-weighted form contribution
const WPR_RATING_WEIGHT = 0.15         // rating prior contribution (fades with games played)
const RUSTINESS_MULTIPLIER = 0.88      // applied when calendar-rusty or intermittent
const RUSTINESS_DAYS = 28              // calendar threshold for rustiness
const MIN_RECENT_GAMES = 2             // fewer played slots in recentForm → intermittent

// --- Team score (ewptScore, post-1.2) ---
const GK_BASE_BONUS = 0.5              // minimum GK bonus when exactly one keeper present
const GK_WPR_SCALE = 2.0               // added per unit of (gkWpr / 100)
const NO_GK_PENALTY = -1.5
const DUAL_GK_PENALTY = -1
const VARIETY_BONUS = 2
const VARIETY_MIN_MENTALITIES = 3      // post-1.3: outfielders only
const DEPTH_BASELINE = 5               // team size where depth bonus = 0
const DEPTH_PER_EXTRA_PLAYER = 0.5
const DEPTH_MAX_BONUS = 3              // cap on cumulative depth bonus

// --- Win probability ---
const WIN_PROB_SCALE = 8               // logistic scale: diff / SCALE drives the sigmoid
/** Rating points an extra player is worth when teams are uneven (5 ≈ a 65% win chance at equal strength). */
export const MAN_ADVANTAGE_PER_PLAYER = 5

/**
 * Weighted Performance Rating (WPR) score for a player.
 *
 * Three base components:
 *  - 60%: Points per game (W=3, D=1, L=0) with Bayesian shrinkage toward
 *          average (1.5 PPG) so small samples don't inflate the score.
 *  - 25%: Recent form (last 5 games) with recency weighting — more recent
 *          games count more, so improving players rank above fading ones.
 *  - 15%: Quality rating prior (1–3 scale), which fades to zero by ~10 games
 *          so it only influences players with very few results.
 *
 * Two penalties are applied after the base score:
 *  - Experience penalty (×0.85–0.95): players with 1–3 games played are still
 *    learning the league. Multiplier ramps from 0.85 at 1 game to 0.95 at 3 games.
 *  - Rustiness penalty (×0.88): applied if either (a) the player has not played
 *    in more than 28 calendar days (requires `lastPlayedWeekDate` to be set), or
 *    (b) fewer than 2 of the last 5 `recentForm` slots are real games.
 *    Both conditions trigger the same penalty; they can stack with the experience penalty.
 *
 * Players below the minimum games threshold (qualified === false) are ranked
 * last regardless of score.
 *
 * @param referenceDate - The date to compare against for the calendar rustiness check.
 *   Defaults to today. Pass a fixed date in tests for deterministic results.
 */
export function wprScore(player: Player, referenceDate?: Date): number {
  if (player.wprOverride !== undefined) return player.wprOverride

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
  // Denominator excludes '-' (unplayed) slots so short-history players aren't penalised.
  const maxFormScore = formChars.reduce(
    (acc, c, i) => (c === '-' ? acc : acc + 3 * (1 - i * 0.15)),
    0,
  )
  const formScore = maxFormScore > 0 ? (rawFormScore / maxFormScore) * 100 : 0

  // Component 3: strength prior (Strength → 0–100), fades as played increases
  const normRating = player.strength === null
    ? 50
    : ((strengthToRating(player.strength) - 1) / 2) * 100
  const ratingWeight = Math.max(0, 1 - player.played / 10)
  const ratingScore = normRating * ratingWeight

  let score = ppgScore * WPR_PPG_WEIGHT + formScore * WPR_FORM_WEIGHT + ratingScore * WPR_RATING_WEIGHT

  // Experience penalty: players with 1–3 games are still learning the league.
  // Multiplier ramps from 0.85 (1 game) to 0.95 (3 games), then full weight at 4+.
  if (player.played >= 1 && player.played < 4) {
    score *= 0.85 + 0.05 * (player.played - 1)
  }

  // Rustiness penalty: not recently active (calendar absence or intermittent attendance).
  const recentGameCount = player.recentForm.split('').filter((c) => c !== '-').length
  const isIntermittent = recentGameCount < MIN_RECENT_GAMES

  let isCalendarRusty = false
  if (player.lastPlayedWeekDate) {
    const lastPlayed = new Date(player.lastPlayedWeekDate)
    const ref = referenceDate ?? new Date()
    const diffDays = (ref.getTime() - lastPlayed.getTime()) / (1000 * 60 * 60 * 24)
    isCalendarRusty = diffDays > RUSTINESS_DAYS
  }

  if (isIntermittent || isCalendarRusty) {
    score *= RUSTINESS_MULTIPLIER
  }

  return score
}

/**
 * Estimated Weighted Team Performance Indicator (EWTPI).
 *
 * Returns a single 0–100 score for a group of players representing a team.
 *
 *  - Average WPR — overall team quality (form is already baked in per-player)
 *  - GK modifier: scaled by GK WPR — 0.5 + (wprScore(gk)/100)*2, range [+0.5,+2.5];
 *                 -1.5 for no GK, -1 for two (wasted slot)
 *  - Variety bonus: +2 if outfielders cover 3+ different mentalities
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
  // Variety bonus rewards tactical diversity among outfielders.
  // Goalkeepers are excluded — they're already credited via `gkModifier`.
  const outfielderMentalities = new Set(
    players.filter((p) => p.mentality !== 'goalkeeper').map((p) => p.mentality),
  )
  const varietyBonus = outfielderMentalities.size >= VARIETY_MIN_MENTALITIES ? VARIETY_BONUS : 0
  const depthBonus = Math.min(
    (players.length - DEPTH_BASELINE) * DEPTH_PER_EXTRA_PLAYER,
    DEPTH_MAX_BONUS,
  )
  return Math.min(
    100,
    Math.max(0, avgWpr + gkModifier + varietyBonus + depthBonus),
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
 * `ewptScore` (notably `Player.lastPlayedWeekDate` and the per-guest
 * `wprOverride`) are not persisted, so the recomputed value drifts from
 * the snapshot a member saw pre-game.
 */
export function resolveTeamRatingForResult(
  snapshot: number | null | undefined,
  recomputePlayers: Player[],
): number {
  if (snapshot !== null && snapshot !== undefined) return snapshot
  return parseFloat(ewptScore(recomputePlayers).toFixed(3))
}

/**
 * Computes the median WPR score of all players with 5 or more games played.
 * Used as the default strength for new players and guests when auto-picking.
 * Falls back to 50 if fewer than 3 qualified players exist (very new league).
 */
export function leagueMedianWpr(players: Player[]): number {
  const qualified = players.filter((p) => p.played >= 5)
  if (qualified.length < 3) return 50
  const scores = qualified.map((p) => wprScore(p)).sort((a, b) => a - b)
  const mid = Math.floor(scores.length / 2)
  return scores.length % 2 === 0
    ? (scores[mid - 1] + scores[mid]) / 2
    : scores[mid]
}

export interface WprPercentiles {
  p25: number
  p50: number
  p75: number
}

/**
 * Computes WPR percentiles (p25 / p50 / p75) for all players with 5+ games played.
 * Used to calibrate strength hint offsets dynamically rather than using a fixed ±15.
 * Falls back to { p25: 40, p50: 50, p75: 60 } when fewer than 3 qualified players exist.
 */
export function leagueWprPercentiles(players: Player[]): WprPercentiles {
  const qualified = players.filter((p) => p.played >= 5)
  if (qualified.length < 3) return { p25: 40, p50: 50, p75: 60 }
  const scores = qualified.map((p) => wprScore(p)).sort((a, b) => a - b)
  const n = scores.length
  const p25 = scores[Math.ceil(n * 0.25) - 1]
  const p50 = n % 2 === 0
    ? (scores[n / 2 - 1] + scores[n / 2]) / 2
    : scores[Math.floor(n / 2)]
  const p75 = scores[Math.ceil(n * 0.75) - 1]
  return { p25, p50, p75 }
}

/**
 * Maps a strength hint to a WPR value using the league's WPR percentiles.
 * Used to assign a `wprOverride` to guests and new players for the team-build.
 *
 * The multipliers discount the percentile to reflect that an unrated player's
 * true strength is uncertain. "Average" carries no information (default when
 * the admin doesn't know the guest), so it gets the strongest discount —
 * equivalent to the experience-penalty multiplier a real 1-game player would
 * receive in `wprScore`. "Below" and "Above" carry explicit but uncertain
 * information, so they get a lighter discount roughly equivalent to 3 games
 * of observed play.
 *
 * The final values are clamped so `below ≤ average ≤ above` for any percentile
 * spread. Without the clamp, tightly-clustered percentiles (e.g. p25=49, p50=50)
 * can flip the order because 0.92 / 0.85 ≈ 1.082 — an explicit "Below" hint
 * would then rate a guest higher than the "Average" default.
 */
export const HINT_UNKNOWN_MULTIPLIER = 0.85

export const HINT_EXPLICIT_MULTIPLIER = 0.92

export function hintToWpr(
  hint: Strength | null | undefined,
  percentiles: WprPercentiles,
): number {
  const avg = percentiles.p50 * HINT_UNKNOWN_MULTIPLIER
  if (hint === 'above') {
    return Math.max(avg, Math.min(100, percentiles.p75) * HINT_EXPLICIT_MULTIPLIER)
  }
  if (hint === 'below') {
    return Math.min(avg, Math.max(0, percentiles.p25) * HINT_EXPLICIT_MULTIPLIER)
  }
  return avg
}

/**
 * Handicap for uneven teams, signed from Team A's point of view: positive
 * when Team A has more players, negative when Team B does, zero when even.
 * Add it to Team A's rating wherever the two teams are compared.
 */
export function manAdvantage(sizeA: number, sizeB: number): number {
  return (sizeA - sizeB) * MAN_ADVANTAGE_PER_PLAYER
}

/**
 * Probability that Team A wins. `advantageA` is the man-advantage handicap
 * from `manAdvantage` (0 for even teams), added to Team A's score.
 */
export function winProbability(scoreA: number, scoreB: number, advantageA = 0): number {
  if (scoreA === 0 && scoreB === 0) return 0.5
  return 1 / (1 + Math.exp(-(scoreA + advantageA - scoreB) / WIN_PROB_SCALE))
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
