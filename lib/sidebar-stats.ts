import { parseWeekDate } from '@/lib/utils'
import type { Player, Week } from '@/lib/types'

// ─── gamesLeftInQuarter ───────────────────────────────────────────────────────

/**
 * Count occurrences of `gameDay` (0=Sun…6=Sat) from tomorrow to the last day
 * of the given quarter. `cursor` is normalized to midnight so the comparison
 * with `quarterEnd` (also midnight) is not skewed by time-of-day.
 */
function gamesLeftInQuarter(q: number, year: number, gameDay: number, now: Date): number {
  // quarterEndMonthIdx: 0-indexed last month of quarter (Q1→2, Q2→5, Q3→8, Q4→11)
  // new Date(year, month+1, 0) = last day of `month`, constructed at local midnight
  const quarterEndMonthIdx = q * 3 - 1
  const quarterEnd = new Date(year, quarterEndMonthIdx + 1, 0)

  let count = 0
  const cursor = new Date(now)
  cursor.setDate(cursor.getDate() + 1) // start from tomorrow — today excluded
  cursor.setHours(0, 0, 0, 0)          // normalize to midnight
  while (cursor <= quarterEnd) {
    if (cursor.getDay() === gameDay) count++
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

export function computeInForm(players: Player[]): InFormEntry[] {
  return players
    .filter(p => p.played >= 5)
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

export interface QuarterlyEntry {
  name: string
  played: number
  won: number
  drew: number
  lost: number
  points: number
}

export interface QuarterlyTableResult {
  quarterLabel: string
  entries: QuarterlyEntry[]
  lastChampion: string | null
  lastQuarterLabel: string | null
  gamesLeft: number
  gamesTotal: number
}

function quarterOf(d: Date): { q: number; year: number } {
  return { q: Math.floor(d.getMonth() / 3) + 1, year: d.getFullYear() }
}

function weekInQuarter(week: Week, q: number, year: number): boolean {
  const d = parseWeekDate(week.date)
  const wq = quarterOf(d)
  return wq.q === q && wq.year === year
}

function aggregateWeeks(weeks: Week[]): QuarterlyEntry[] {
  const map = new Map<string, QuarterlyEntry>()
  for (const w of weeks) {
    if (w.status !== 'played') continue
    const allPlayers = [...w.teamA, ...w.teamB]
    for (const name of allPlayers) {
      if (!map.has(name)) map.set(name, { name, played: 0, won: 0, drew: 0, lost: 0, points: 0 })
      const e = map.get(name)!
      e.played++
      const onTeamA = w.teamA.includes(name)
      if (w.winner === 'draw') { e.drew++; e.points += 1 }
      else if ((w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA)) { e.won++; e.points += 3 }
      else { e.lost++ }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.points - a.points || b.won - a.won || a.name.localeCompare(b.name))
}

export function computeQuarterlyTable(weeks: Week[], now: Date = new Date(), gameDay?: number): QuarterlyTableResult {
  const { q, year } = quarterOf(now)
  const yy = String(year).slice(-2)
  const quarterLabel = `Q${q} ${yy}`

  const currentWeeks = weeks.filter(w => weekInQuarter(w, q, year))
  const entries = aggregateWeeks(currentWeeks).slice(0, 5)

  const resolvedGameDay = gameDay ?? inferGameDay(weeks)
  const gamesLeft = resolvedGameDay !== null
    ? gamesLeftInQuarter(q, year, resolvedGameDay, now)
    : 0

  const gamesPlayed = currentWeeks.filter(w => w.status === 'played').length
  const gamesTotal = gamesPlayed + gamesLeft

  const prevQ = q === 1 ? 4 : q - 1
  const prevYear = q === 1 ? year - 1 : year
  const prevYY = String(prevYear).slice(-2)
  const prevWeeks = weeks.filter(w => weekInQuarter(w, prevQ, prevYear))
  const prevEntries = aggregateWeeks(prevWeeks)
  const lastChampion = prevEntries.length > 0 ? prevEntries[0].name : null
  const lastQuarterLabel = prevEntries.length > 0 ? `Q${prevQ} ${prevYY}` : null

  return { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft, gamesTotal }
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

  const sorted = [...played].sort((a, b) => b.week - a.week)
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
