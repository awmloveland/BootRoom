// lib/rating.ts
// Player and team strength: WPR per player, EWPT per team, win probability.

import type { Player, Week } from './types'
import { parseWeekDate } from './dates'

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
/** Rating points an extra player is worth when teams are uneven (5 ≈ a 65% win chance at equal strength). */
export const MAN_ADVANTAGE_PER_PLAYER = 5

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
 * Guests, new players and zero-game roster players all go through this same
 * formula, so they share one scale with the regulars.
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

/**
 * Returns copies of `players` with `gamesMissed` set from `weeks`. Every
 * team builder (the match card and Lineup Lab) rates players through this, so
 * they agree on every score.
 */
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
