// lib/utils.ts
// cn(), season helpers and the next match seed; re-exports the domain modules.
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { LeagueDetails, PlayerClaimStatus, ScheduledWeek, Week } from './types'
import type { VisibilityTier } from './roles'
import { formatWeekDate, isAwaitingWindowOver, isPastDeadline, leagueNow, sortWeeks } from './dates'
import { formatWinner } from './standings'

// Domain modules. Import from them directly in new code; these re-exports
// keep existing imports working.
export * from './dates'
export * from './rating'
export * from './shareText'
export * from './standings'
export * from './review'

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

/** Season (calendar year) a match date belongs to. `date` is 'DD MMM YYYY'. */
export function seasonOfDate(date: string): string {
  return date.split(' ')[2]
}

/**
 * Next week number within `season`: highest existing week in that season plus
 * one, or 1 if none. Take `season` from the match date (seasonOfDate), so both
 * halves of the (season, week) key come from the same clock.
 */
export function getNextWeekNumber(weeks: Week[], season: string): number {
  const inSeason = weeks.filter((w) => w.season === season)
  if (inSeason.length === 0) return 1
  return Math.max(...inSeason.map((w) => w.week)) + 1
}

/**
 * Returns the played-week count for the current season used in the
 * "X of 52 weeks · N% complete" header. Uses the max `week` from the current
 * year's played/cancelled weeks, falling back to the previous year if the
 * current year has none yet.
 */
export function getSeasonPlayedWeekCount(weeks: Week[]): number {
  const relevant = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled' || w.status === 'dnf')
  const currentYear = String(leagueNow().getFullYear())
  const currentYearWeeks = relevant.filter((w) => w.season === currentYear)
  if (currentYearWeeks.length > 0) {
    return Math.max(...currentYearWeeks.map((w) => w.week))
  }
  const prevYear = String(leagueNow().getFullYear() - 1)
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
  const currentYear = String(leagueNow().getFullYear())
  if (relevant.some((w) => w.season === currentYear)) return currentYear
  const prevYear = String(leagueNow().getFullYear() - 1)
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
  return seasons[0] ?? String(leagueNow().getFullYear())
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

/** The site tagline, used by the root metadata and the preview images. */
export const SITE_TAGLINE = 'Results, stats and fair teams for your weekly game.'

/** "1 player", "38 players": a count with its regular plural. */
export function pluralise(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** "5-a-side" for an even squad of 10, "6v5" for 11 where one side has an extra player. */
export function squadFormat(n: number): string {
  if (n === 0) return ''
  if (n % 2 === 0) return `${n / 2}-a-side`
  return `${Math.ceil(n / 2)}v${Math.floor(n / 2)}`
}

/** "1 game played", "142 games played". */
export function gamesPlayedLabel(n: number): string {
  return `${n} ${n === 1 ? 'game' : 'games'} played`
}

/**
 * The week the next match card should start from, derived on the server so the
 * Overview tab can render the card in its first paint.
 *
 * Takes the latest-dated row that is scheduled, cancelled or unrecorded:
 *   - unrecorded → null (the card is idle)
 *   - cancelled and past kick-off → null
 *   - scheduled and the day after the game has ended → null. Until then a
 *     kicked-off game stays on the card, waiting for its result.
 *   - otherwise → that row as a ScheduledWeek
 */
export function getNextMatchSeed(weeks: Week[], kickoffTime?: string | null): ScheduledWeek | null {
  const latest = sortWeeks(
    weeks.filter((w) => w.status === 'scheduled' || w.status === 'cancelled' || w.status === 'unrecorded')
  )[0]
  if (!latest || !latest.id) return null
  if (latest.status === 'unrecorded') return null
  if (latest.status === 'cancelled' && isPastDeadline(latest.date, kickoffTime)) return null
  if (latest.status === 'scheduled' && isAwaitingWindowOver(latest.date)) return null
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

/**
 * The Results tab's starting week: getNextMatchSeed, except that a scheduled
 * game that has kicked off returns null, because the Results week list shows
 * it as an Awaiting Result card and the next match card must not show the
 * same game twice. Overview has no week list, so it keeps the awaiting window.
 */
export function getResultsNextMatchSeed(weeks: Week[], kickoffTime?: string | null): ScheduledWeek | null {
  const seed = getNextMatchSeed(weeks, kickoffTime)
  if (seed?.status === 'scheduled' && isPastDeadline(seed.date, kickoffTime)) return null
  return seed
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
