// lib/platform.ts
// The platform admin portal at /platform: who may open it, and the sums its
// dashboard shows. Access is a list of user ids in a server-only variable, so
// it cannot be granted through the database.
import type { PlatformLeague } from '@/lib/types'

const DAY_MS = 86_400_000

/** A league with results is Stalled once this many days pass without a week being saved. */
export const STALLED_AFTER_DAYS = 28

/** True when this user id is listed in PLATFORM_ADMIN_IDS. Unset or empty means nobody. */
export function isPlatformAdmin(userId: string): boolean {
  if (!userId) return false
  return (process.env.PLATFORM_ADMIN_IDS ?? '').split(',').some((id) => id.trim() === userId)
}

export type LeagueStatus = 'Active' | 'Stalled' | 'Not started'

export function leagueStatus(league: Pick<PlatformLeague, 'results' | 'last_activity'>, now = new Date()): LeagueStatus {
  if (league.results === 0) return 'Not started'
  const last = league.last_activity ? new Date(league.last_activity).getTime() : 0
  return now.getTime() - last <= STALLED_AFTER_DAYS * DAY_MS ? 'Active' : 'Stalled'
}

/** The instant `days` days before `now`, as an ISO string for a `created_at` filter. */
export function daysAgo(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString()
}

/** How many of these timestamps fall within the last `days` days. */
export function countSince(dates: (string | null)[], days: number, now = new Date()): number {
  const from = daysAgo(days, now)
  return dates.filter((d) => d !== null && new Date(d).toISOString() >= from).length
}

/** How many leagues reached each setup milestone. Counts, not a funnel: a league can reach them in any order. */
export function platformMilestones(leagues: PlatformLeague[]): { label: string; count: number }[] {
  const count = (reached: (l: PlatformLeague) => boolean) => leagues.filter(reached).length
  return [
    { label: 'Created', count: leagues.length },
    // The creator is added as a player automatically, so a roster starts at two.
    { label: 'Roster added', count: count((l) => l.players >= 2) },
    { label: 'First result', count: count((l) => l.results >= 1) },
    { label: 'Second member joined', count: count((l) => l.members >= 2) },
    { label: 'Four results', count: count((l) => l.results >= 4) },
  ]
}

/** '9 Nov 2026', on the league clock. */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' })
}
