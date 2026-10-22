// lib/standings.ts
// Points, tables and result formatting.

import type { Week, Winner, YearStats } from './types'
import type { QuarterlyEntry } from './sidebar-stats'
import { parseWeekDate } from './dates'

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

/** Points per game for a standings row, or 0 before any game is played. */
export function pointsPerGame(entry: Pick<QuarterlyEntry, 'points' | 'played'>): number {
  return entry.played > 0 ? entry.points / entry.played : 0
}

/** Points per game for standings tables, to two decimal places, e.g. '2.33'. */
export function formatPointsPerGame(entry: Pick<QuarterlyEntry, 'points' | 'played'>): string {
  return pointsPerGame(entry).toFixed(2)
}

/**
 * Standings order without the alphabetical last resort: points, then PPG, then
 * GD, then fewer games played, then wins. Negative when `a` ranks above `b`, 0
 * when the two are level on every key.
 */
export function compareStandings(a: QuarterlyEntry, b: QuarterlyEntry): number {
  return (
    b.points - a.points ||
    // PPG compared by cross-multiplying, so float rounding never splits a tie.
    b.points * a.played - a.points * b.played ||
    b.goalDiff - a.goalDiff ||
    a.played - b.played ||
    b.won - a.won
  )
}

/**
 * Ranked standings for a set of weeks (only played weeks count). Used by the
 * sidebar and honours quarter tables and the result share text, so they all
 * agree on order: points, then PPG, then GD, then fewer games played, then
 * wins, then name.
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
