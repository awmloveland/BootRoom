// lib/shareText.ts
// Share messages, signed share links and the sizes the preview images use.

import type { HighlightPlayer, Player, ResultHighlightItem, ResultHighlights, ResultImageHighlight, ShareLinkRequest, Week, Winner } from './types'
import type { QuarterSummary } from './sidebar-stats'
import { DAY_SHORT, dayNameToIndex, formatWeekDate, getNextMatchDate, isPastDeadline, parseWeekDate } from './dates'
import { winCopy, winProbability } from './rating'
import { computeStandings, ordinalSuffix } from './standings'

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
  /** Signed lineup link from the share endpoint; falls back to the league link. */
  shareUrl?: string
}): string {
  const { leagueName, leagueSlug, week, date, format, teamA, teamB, teamARating, teamBRating, shareUrl } = params
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
    `🔗 ${shareUrl ?? `https://craft-football.com/${leagueSlug}`}`,
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

const MILESTONE_SET = new Set([10, 25])

function isMilestone(n: number): boolean {
  if (MILESTONE_SET.has(n)) return true
  return n >= 50 && n % 50 === 0
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
 * Everything worth calling out about a result. `weeks` must include the
 * result itself, in any order; it is matched on its date. `players` are the
 * stats from before it. Shared by the share text and the result preview image.
 */
export function computeResultHighlights(params: {
  date: string           // 'DD MMM YYYY'
  teamA: string[]
  teamB: string[]
  winner: Winner
  teamARating: number
  teamBRating: number
  players: HighlightPlayer[]
  weeks: Week[]
}): ResultHighlights {
  const { date, teamA, teamB, winner, teamARating, teamBRating, players, weeks } = params
  const items: ResultHighlightItem[] = []

  if (winner !== 'draw') {
    // Win streaks (winning team only)
    for (const name of winner === 'teamA' ? teamA : teamB) {
      const count = currentWinStreak(name, weeks)
      if (count >= 3) items.push({ kind: 'win_streak', player: name, count })
    }
    // Unbeaten streaks broken (losing team only), from the weeks before tonight
    const priorWeeks = weeks.filter((w) => w.date !== date)
    for (const name of winner === 'teamA' ? teamB : teamA) {
      const count = currentUnbeatenStreak(name, priorWeeks)
      if (count >= 5) items.push({ kind: 'unbeaten_ended', player: name, count })
    }
    // Upset: the winners were weaker on paper
    const upset =
      (winner === 'teamA' && teamBRating > teamARating) ||
      (winner === 'teamB' && teamARating > teamBRating)
    if (upset) {
      const [strongRating, weakRating] =
        winner === 'teamA'
          ? [teamBRating.toFixed(1), teamARating.toFixed(1)]
          : [teamARating.toFixed(1), teamBRating.toFixed(1)]
      items.push({ kind: 'upset', strongerTeam: winner === 'teamA' ? 'Team B' : 'Team A', strongRating, weakRating })
    }
  }

  // Milestones
  for (const name of [...teamA, ...teamB]) {
    const player = players.find((p) => p.name === name)
    if (!player) continue
    const games = player.played + 1
    if (isMilestone(games)) items.push({ kind: 'milestone', player: name, games })
  }

  // Quarter table top 5: the quarter of the result, not of today
  const parsed = parseWeekDate(date)
  const q = Math.floor(parsed.getMonth() / 3) + 1
  const year = parsed.getFullYear()
  const qWeeks = weeks.filter((w) => {
    const d = parseWeekDate(w.date)
    return Math.floor(d.getMonth() / 3) + 1 === q && d.getFullYear() === year
  })
  const entries = computeStandings(qWeeks).slice(0, 5)
  const table = entries.length > 0 ? { q, year, entries } : null

  // In form: best recent PPG among tonight's players
  const tonight = new Set([...teamA, ...teamB])
  const inForm = players
    .filter((p) => tonight.has(p.name) && p.played >= 5)
    .map((p) => {
      const chars = p.recentForm.split('').filter((c) => c !== '-')
      if (chars.length === 0) return { name: p.name, ppg: 0 }
      const pts = chars.reduce((acc, c) => acc + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0)
      return { name: p.name, ppg: pts / chars.length }
    })
    .filter((e) => e.ppg >= 1.5)
    .sort((a, b) => b.ppg - a.ppg)[0] ?? null

  return { items, table, inForm }
}

function highlightLine(item: ResultHighlightItem): string {
  switch (item.kind) {
    case 'win_streak':
      return `🔥 ${item.player} on a ${item.count}-game winning streak`
    case 'unbeaten_ended':
      return `💔 ${item.player}'s ${item.count}-game unbeaten run is over`
    case 'upset':
      return `😱 Upset! ${item.strongerTeam} were stronger on paper (${item.strongRating} vs ${item.weakRating})`
    case 'milestone':
      return `🎖️ ${item.player} played their ${ordinal(item.games)} game tonight`
  }
}

/**
 * Builds a formatted plain-text share message for a saved result.
 * Returns { shareText, highlightsText, highlightLines }: shareText is the full
 * message; highlightsText is just the highlights block, rendered separately in
 * the share step; highlightLines are the record and highlight lines alone,
 * without the quarter table or in-form line.
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
  recordLines?: string[] // from findRecordBreaks, shown first in the highlights
}): { shareText: string; highlightsText: string; highlightLines: string[] } {
  const {
    leagueName, leagueSlug, week, date, format,
    teamA, teamB, winner, goalDifference,
    teamARating, teamBRating, players, weeks,
    recordLines = [],
  } = params

  const parsed = parseWeekDate(date)
  const [dd, mmm] = date.split(' ')
  const shortDate = `${DAY_SHORT[parsed.getDay()]} ${dd} ${mmm}`

  // ── Result headline, with the teams straight underneath ──────────────────
  // A win lists only the winners, under a headline that already names them;
  // a draw lists neither team.
  const margin = goalDifference > 0 ? ` (+${goalDifference} ${goalDifference === 1 ? 'goal' : 'goals'})` : ''
  const resultLines =
    winner === 'draw'
      ? ['🤝 Draw!']
      : winner === 'teamA'
        ? [`🏆 Team A win!${margin}`, `🔵 ${teamA.join(', ')}`]
        : [`🏆 Team B win!${margin}`, `🟣 ${teamB.join(', ')}`]

  // ── Highlights ───────────────────────────────────────────────────────────
  const { items, table, inForm } = computeResultHighlights({
    date, teamA, teamB, winner, teamARating, teamBRating, players, weeks,
  })
  const highlights = [...recordLines, ...items.map(highlightLine)]
  const tableLines = table
    ? [`📊 Q${table.q} ${table.year} standings`, ...table.entries.map((e, i) => `${i + 1}. ${e.name} — ${e.points}pts`)]
    : []
  const inFormLines = inForm ? [`⚡ In form: ${inForm.name} (${inForm.ppg.toFixed(1)} PPG)`] : []

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
    ...resultLines,
  ]

  if (highlightsText.length > 0) {
    parts.push('')
    parts.push(highlightsText)
  }

  parts.push('')
  parts.push(`🔗 https://craft-football.com/${leagueSlug}`)

  return { shareText: parts.join('\n'), highlightsText, highlightLines: highlights }
}

/**
 * The result image's highlight lines: up to three, in priority order (streaks,
 * ended runs, upset, milestones, in form, quarter leader), with short copy.
 */
export function resultImageHighlights(h: ResultHighlights): ResultImageHighlight[] {
  const out: ResultImageHighlight[] = h.items.map((item): ResultImageHighlight => {
    switch (item.kind) {
      case 'win_streak':
        return { icon: 'flame', text: `${item.player} · ${item.count}-game win streak` }
      case 'unbeaten_ended':
        return { icon: 'heart-crack', text: `${item.player}'s ${item.count}-game unbeaten run is over` }
      case 'upset':
        return { icon: 'zap', text: `Upset · ${item.strongerTeam} stronger on paper` }
      case 'milestone':
        return { icon: 'award', text: `${item.player}'s ${ordinal(item.games)} game` }
    }
  })
  if (h.inForm) out.push({ icon: 'trending-up', text: `In form · ${h.inForm.name} · ${h.inForm.ppg.toFixed(1)} PPG` })
  const leader = h.table?.entries[0]
  if (h.table && leader) out.push({ icon: 'crown', text: `Q${h.table.q} leader · ${leader.name} · ${leader.points} pts` })
  return out.slice(0, 3)
}

function byDateThenWeek(a: Week, b: Week): number {
  return parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime() || a.week - b.week
}

/** Weeks up to and including the one with `targetId`, oldest first; empty when it is missing. */
export function weeksUpTo(weeks: Week[], targetId: string): Week[] {
  const ordered = [...weeks].sort(byDateThenWeek)
  const index = ordered.findIndex((w) => w.id === targetId)
  return index === -1 ? [] : ordered.slice(0, index + 1)
}

/**
 * Games played and last five results (newest first, like Player.recentForm)
 * per player, from played weeks with a winner only. Stands in for the stored
 * player stats when highlights must be worked out as of an earlier game.
 */
export function playerStatsAsOf(weeks: Week[]): HighlightPlayer[] {
  const stats = new Map<string, { name: string; played: number; results: string[] }>()
  for (const w of [...weeks].filter((x) => x.status === 'played' && x.winner).sort(byDateThenWeek)) {
    for (const name of [...w.teamA, ...w.teamB]) {
      const onTeamA = w.teamA.includes(name)
      const result = w.winner === 'draw' ? 'D'
        : (w.winner === 'teamA') === onTeamA ? 'W' : 'L'
      const entry = stats.get(name) ?? { name, played: 0, results: [] }
      entry.played++
      entry.results.push(result)
      stats.set(name, entry)
    }
  }
  return Array.from(stats.values()).map(({ name, played, results }) => ({
    name,
    played,
    recentForm: results.slice(-5).reverse().join(''),
  }))
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
 * Layout numbers for the lineup preview image (components/og). Names sit in
 * two 480px columns with ~440px of height between the team heading and the
 * wordmark; charWidth approximates Inter Bold's average glyph width in em.
 */
export const LINEUP_IMAGE = {
  maxFont: 40,
  minFont: 24,
  namesHeight: 440,
  columnWidth: 480,
  lineHeight: 1.28,
  charWidth: 0.58,
} as const

/**
 * Name size for the lineup preview image: as large as fits both the row count
 * and the longest name, between minFont and maxFont. Names that still don't
 * fit at minFont are cut off with an ellipsis by the image itself.
 */
export function lineupImageFontSize(rowCount: number, longestNameLength: number): number {
  const byHeight = LINEUP_IMAGE.namesHeight / (LINEUP_IMAGE.lineHeight * Math.max(rowCount, 1))
  const byWidth = LINEUP_IMAGE.columnWidth / (LINEUP_IMAGE.charWidth * Math.max(longestNameLength, 1))
  return Math.max(
    LINEUP_IMAGE.minFont,
    Math.min(LINEUP_IMAGE.maxFont, Math.floor(byHeight), Math.floor(byWidth))
  )
}

async function postForShareUrl(path: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { url?: unknown }
    return typeof json.url === 'string' ? json.url : null
  } catch {
    return null
  }
}

/**
 * Asks the server for a signed share link for a scheduled lineup. Null when
 * the server declines (feature off, not visible, not configured) or the
 * request fails; callers fall back to the plain league link.
 */
export function fetchLineupShareUrl(leagueId: string, weekId: string): Promise<string | null> {
  return postForShareUrl(`/api/league/${leagueId}/lineup-share`, { weekId })
}

/** Signed result or quarter link for something just saved in the browser. Null when declined or failed. */
export function fetchShareLink(leagueId: string, request: ShareLinkRequest): Promise<string | null> {
  return postForShareUrl(`/api/league/${leagueId}/share-link`, request)
}

/**
 * Swaps the final "🔗 <url>" line of a share message for a signed link. Every
 * share text builder ends with that line. Unchanged without a URL.
 */
export function withShareLink(text: string, url: string | null | undefined): string {
  if (!url) return text
  const lines = text.split('\n')
  const last = lines.length - 1
  if (!lines[last].startsWith('🔗 ')) return text
  lines[last] = `🔗 ${url}`
  return lines.join('\n')
}

/** The page being viewed, carrying a signed league token instead of any other share token. */
export function leagueShareHref(href: string, token: string): string {
  const url = new URL(href)
  for (const key of ['lineup', 'result', 'quarter', 'league', 'open_join']) url.searchParams.delete(key)
  url.searchParams.set('league', token)
  url.hash = ''
  return url.toString()
}

/**
 * Largest font size (px) at which `length` characters fit `width`, between
 * `min` and `max`. `charWidth` approximates Space Grotesk Bold's average glyph
 * width in em. Text that still doesn't fit is cut off by the image.
 */
export function fitFontSize(length: number, width: number, max: number, min: number, charWidth = 0.6): number {
  const fit = Math.floor(width / (Math.max(length, 1) * charWidth))
  return Math.max(min, Math.min(max, fit))
}

/** Key for a quarter in share URL maps: '2026-3'. Matches the Seasons card keys. */
export function quarterShareKey(quarter: { year: number; q: number }): string {
  return `${quarter.year}-${quarter.q}`
}

/** '07 Jul – 29 Sep · 12 games': the quarter's dates without the year. */
export function quarterRangeLabel(dateRange: { from: string; to: string }, gamesPlayed: number): string {
  const stripYear = (d: string) => d.split(' ').slice(0, 2).join(' ')
  const games = gamesPlayed === 1 ? '1 game' : `${gamesPlayed} games`
  return `${stripYear(dateRange.from)} – ${stripYear(dateRange.to)} · ${games}`
}

/**
 * The league's next game, as the Overview next game card picks it: the
 * earliest scheduled week before its deadline, otherwise the next date from
 * the league's game day, skipping any date that is cancelled. Null when
 * neither exists.
 */
export function nextLeagueGame(
  weeks: Week[],
  league: { day: string | null; kickoff_time: string | null; location: string | null }
): { date: string; kickoffTime: string | null; location: string | null } | null {
  const scheduled = weeks
    .filter((w) => w.status === 'scheduled' && !isPastDeadline(w.date))
    .sort((a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime())[0]
  const dayIndex = dayNameToIndex(league.day)
  let date = scheduled?.date ?? (dayIndex !== null ? getNextMatchDate(weeks, dayIndex) : null)
  if (date && !scheduled) {
    // Never announce a game day that has been cancelled: step on a week at a time.
    const cancelled = new Set(weeks.filter((w) => w.status === 'cancelled').map((w) => w.date))
    for (let i = 0; i < 8 && cancelled.has(date); i++) {
      const next = parseWeekDate(date)
      next.setDate(next.getDate() + 7)
      date = formatWeekDate(next)
    }
  }
  return date ? { date, kickoffTime: league.kickoff_time, location: league.location } : null
}

/** The game that completed a quarter, shared at the top of the quarter wrap. */
export interface FinalGameShare {
  result: 'teamA' | 'teamB' | 'draw' | 'dnf'
  goalDifference: number
  teamA: string[]
  teamB: string[]
  /** Record breaks and highlights, as `highlightLines` from buildResultShareText. */
  highlights: string[]
}

/**
 * The final game block of the quarter wrap: headline, the winners, then the
 * highlights. A draw lists neither team; a DNF has no teams or highlights.
 */
export function buildFinalGameLines(game: FinalGameShare): string[] {
  const { result, goalDifference, teamA, teamB, highlights } = game
  if (result === 'dnf') return ['⚠️ Final game: called off (DNF)']
  if (result === 'draw') return ['🤝 Final game: Draw!', ...highlights]
  const margin = goalDifference > 0 ? ` (+${goalDifference} ${goalDifference === 1 ? 'goal' : 'goals'})` : ''
  return result === 'teamA'
    ? [`🏆 Final game: Team A win!${margin}`, `🔵 ${teamA.join(', ')}`, ...highlights]
    : [`🏆 Final game: Team B win!${margin}`, `🟣 ${teamB.join(', ')}`, ...highlights]
}

/**
 * Builds the plain-text share message for a completed quarter. Pure function:
 * all data comes from the QuarterSummary, plus the game that completed it
 * when shared straight after recording that game.
 */
export function buildQuarterShareText(params: {
  leagueName: string
  leagueSlug: string
  quarter: QuarterSummary
  finalGame?: FinalGameShare
}): string {
  const { leagueName, leagueSlug, quarter, finalGame } = params
  const { q, year, seasonName, dateRange, entries = [], awards = [], gamesPlayed = 0 } = quarter

  const parts: string[] = [
    `🏁 That's a wrap on Q${q} ${year}!`,
    `⚽ ${leagueName} — ${seasonName} quarter`,
    `📅 ${quarterRangeLabel(dateRange, gamesPlayed)}`,
  ]

  if (finalGame) {
    parts.push('')
    parts.push(...buildFinalGameLines(finalGame))
  }

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
