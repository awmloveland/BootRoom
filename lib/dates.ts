// lib/dates.ts
// Week dates ('DD MMM YYYY'), league game days and kick-off deadlines.

import type { Week } from './types'

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

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

/**
 * A league kick-off time: 'HH:MM' (24-hour, as the league details form saves
 * it) or the older '6:30pm' / '7pm' form. Null when missing or unreadable.
 */
export function parseKickoffTime(value: string | null | undefined): { hours: number; minutes: number } | null {
  if (!value) return null
  const v = value.trim().toLowerCase()

  const h24 = v.match(/^(\d{1,2}):(\d{2})$/)
  if (h24) {
    const hours = Number(h24[1])
    const minutes = Number(h24[2])
    return hours < 24 && minutes < 60 ? { hours, minutes } : null
  }

  const h12 = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (h12) {
    const hour = Number(h12[1])
    const minutes = Number(h12[2] ?? 0)
    if (hour < 1 || hour > 12 || minutes > 59) return null
    return { hours: (hour % 12) + (h12[3] === 'pm' ? 12 : 0), minutes }
  }

  return null
}

/**
 * True once a game on `dateStr` ('DD MMM YYYY', local time) is waiting for its
 * result: from the league's kick-off time when it has one, otherwise from 20:00.
 */
export function isPastDeadline(dateStr: string, kickoffTime?: string | null): boolean {
  const { hours, minutes } = parseKickoffTime(kickoffTime) ?? { hours: 20, minutes: 0 }
  const deadline = parseWeekDate(dateStr)
  deadline.setHours(hours, minutes, 0, 0)
  return Date.now() > deadline.getTime()
}

/**
 * True from midnight at the end of the day after the game. Until then the
 * Overview card keeps a kicked-off game on screen, waiting for its result.
 */
export function isAwaitingWindowOver(dateStr: string): boolean {
  const closes = parseWeekDate(dateStr)
  closes.setDate(closes.getDate() + 2)
  return Date.now() >= closes.getTime()
}

/** 'DD MMM YYYY' → 'Thu 09 Apr', for fixture lines. */
export function formatFixtureDate(date: string): string {
  const [day, month] = date.split(' ')
  return `${DAY_SHORT[parseWeekDate(date).getDay()]} ${day.padStart(2, '0')} ${month}`
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

/** "just now", "5 minutes ago", "2 days ago", or "1 Sept" after 30 days. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days <= 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
