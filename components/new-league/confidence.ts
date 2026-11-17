// components/new-league/confidence.ts
// Copy and numbers for the Lineup confidence card, and the draft-date rules
// for the import modal. Pure, so the step can be tested without a browser.
import { formatWeekDate, parseWeekDate } from '@/lib/dates'

export type Tone = 'muted' | 'sky' | 'lime'

export function lineupConfidence(games: number): { percent: number; line: string; tone: Tone } {
  const percent = Math.min(100, games * 10)
  const tone: Tone = games >= 10 ? 'lime' : games >= 5 ? 'sky' : 'muted'
  const line =
    games === 0 ? 'Optional. Every past result makes your first lineups fairer.'
    : games <= 2 ? 'Every game you add makes your first lineups fairer.'
    : games <= 5 ? 'Good start. More games, fairer lineups.'
    : games <= 9 ? 'Plenty to start with. Add more if you have them.'
    : 'Full confidence. Lineups run on real results.'
  return { percent, line, tone }
}

/** 'DD MMM YYYY' moved by whole weeks. */
export function shiftWeeks(date: string, weeks: number): string {
  const d = parseWeekDate(date)
  d.setDate(d.getDate() + 7 * weeks)
  return formatWeekDate(d)
}

/** Where a new draft starts: a week before the oldest saved game, else the latest match day. */
export function nextDraftDate(savedDates: string[], latestMatchDay: string): string {
  if (savedDates.length === 0) return latestMatchDay
  const oldest = savedDates.map(parseWeekDate).sort((a, b) => a.getTime() - b.getTime())[0]
  return shiftWeeks(formatWeekDate(oldest), -1)
}

/** 'n-a-side' for equal sides, else 'bigger v smaller', matching import_weeks. */
export function sidesFormat(a: number, b: number): string {
  return a === b ? `${a}-a-side` : `${Math.max(a, b)}v${Math.min(a, b)}`
}
