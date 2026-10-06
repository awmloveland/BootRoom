// lib/metadata.ts
import type { Metadata } from 'next'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled, isLeagueHidden } from '@/lib/features'
import { buildLeagueTitle, dayNameToIndex, getLeagueTitleStatus } from '@/lib/utils'
import { getGameBySlug, getAuthAndRole, getFeatures, getWeeks, getPendingBadgeCount } from '@/lib/fetchers'
import {
  buildLeagueShareMetadata,
  buildLineupShareMetadata,
  buildQuarterShareMetadata,
  buildResultShareMetadata,
} from '@/lib/shareLinks'
import { loadSharedLeague, loadSharedLineup, loadSharedQuarter, loadSharedResult } from '@/lib/shareLinksServer'

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

export type PageSearchParams = Record<string, string | string[] | undefined>

/**
 * Tab title for a league page. Overview and Results, the league's landing
 * tabs, swap their label for what is happening today ("Match day",
 * "Full time: Team A won") when the viewer can see match history. Admins get
 * their pending join requests and claims as a leading count.
 *
 * Shares the request-cached fetchers with the page and tabs layout, so it adds
 * no queries. A share token in the query string (see sharePreview) also adds
 * the Open Graph tags that make the shared link unfurl.
 */
export async function leaguePageMetadata(
  slug: string,
  page: LeaguePage,
  searchParams: PageSearchParams = {}
): Promise<Metadata> {
  const game = await getGameBySlug(slug)
  if (!game) return {}

  const [{ userRole }, features, weeks, pendingCount, preview] = await Promise.all([
    getAuthAndRole(game.id),
    getFeatures(game.id),
    getWeeks(game.id),
    getPendingBadgeCount(game.id), // 0 for non-admins
    sharePreview(slug, page, searchParams),
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
  return preview ? { title, ...preview } : { title }
}

/**
 * Open Graph tags for the first share token in the query string that
 * resolves to this league. Lineup and result links land on Overview or
 * Results, quarter links on Seasons, and league links on any tab.
 */
async function sharePreview(slug: string, page: LeaguePage, searchParams: PageSearchParams): Promise<Metadata | null> {
  const param = (key: string) => {
    const value = searchParams[key]
    return typeof value === 'string' && value ? value : undefined
  }
  const landing = page === 'overview' || page === 'results'
  const lineupToken = landing ? param('lineup') : undefined
  const resultToken = landing ? param('result') : undefined
  const quarterToken = page === 'honours' ? param('quarter') : undefined
  const leagueToken = param('league')

  const [lineup, result, quarter, league] = await Promise.all([
    lineupToken ? loadSharedLineup(lineupToken) : null,
    resultToken ? loadSharedResult(resultToken) : null,
    quarterToken ? loadSharedQuarter(quarterToken) : null,
    leagueToken ? loadSharedLeague(leagueToken) : null,
  ])

  if (lineupToken && lineup?.slug === slug) return buildLineupShareMetadata(lineup, lineupToken)
  if (resultToken && result?.slug === slug) return buildResultShareMetadata(result, resultToken)
  if (quarterToken && quarter?.slug === slug) return buildQuarterShareMetadata(quarter, quarterToken)
  if (leagueToken && league?.slug === slug) return buildLeagueShareMetadata(league, leagueToken)
  return null
}
