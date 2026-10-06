// lib/metadata.ts
import type { Metadata } from 'next'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled, isLeagueHidden } from '@/lib/features'
import { buildLeagueTitle, dayNameToIndex, getLeagueTitleStatus } from '@/lib/utils'
import { getGameBySlug, getAuthAndRole, getFeatures, getWeeks, getPendingBadgeCount } from '@/lib/fetchers'
import { buildLineupShareMetadata } from '@/lib/lineupShare'
import { loadSharedLineup } from '@/lib/lineupShareServer'

// Matches the labels in LeagueTabNav (a client module, so not importable here).
const PAGE_LABELS = {
  overview: 'Overview',
  results: 'Results',
  players: 'Players',
  honours: 'Seasons',
  records: 'Records',
  'lineup-lab': 'Lineup Lab',
  admin: 'Admin',
  settings: 'Settings',
} as const

export type LeaguePage = keyof typeof PAGE_LABELS

/**
 * Tab title for a league page. Overview and Results, the league's landing
 * tabs, swap their label for what is happening today ("Match day",
 * "Full time: Team A won") when the viewer can see match history. Admins get
 * their pending join requests and claims as a leading count.
 *
 * Shares the request-cached fetchers with the page and tabs layout, so it adds
 * no queries. With a `lineupToken` (from a shared lineup link) on Overview or
 * Results, it also adds the Open Graph tags that make the link unfurl.
 */
export async function leaguePageMetadata(
  slug: string,
  page: LeaguePage,
  lineupToken?: string
): Promise<Metadata> {
  const game = await getGameBySlug(slug)
  if (!game) return {}

  const wantsLineup = Boolean(lineupToken) && (page === 'overview' || page === 'results')
  const [{ userRole }, features, weeks, pendingCount, sharedLineup] = await Promise.all([
    getAuthAndRole(game.id),
    getFeatures(game.id),
    getWeeks(game.id),
    getPendingBadgeCount(game.id), // 0 for non-admins
    wantsLineup ? loadSharedLineup(lineupToken) : Promise.resolve(null),
  ])

  const tier = resolveVisibilityTier(userRole)
  const showStatus =
    (page === 'overview' || page === 'results') &&
    !isLeagueHidden(features, tier) &&
    (tier === 'admin' || isFeatureEnabled(features, 'match_history', tier))
  const status = showStatus
    ? getLeagueTitleStatus(weeks, new Date(), dayNameToIndex(game.day ?? null) ?? undefined)
    : null

  const title = {
    absolute: buildLeagueTitle({ page: status ?? PAGE_LABELS[page], leagueName: game.name, pendingCount }),
  }

  if (lineupToken && sharedLineup?.slug === slug) {
    return { title, ...buildLineupShareMetadata(sharedLineup, lineupToken) }
  }
  return { title }
}
