export const dynamic = 'force-dynamic'

import { notFound, redirect } from 'next/navigation'
import {
  getGameBySlug, getAuthAndRole, getPlayerStats, getLeagueMembers, getRosterPlayers,
  getPendingJoinRequests, getAllPlayerClaims, getFeatures,
} from '@/lib/fetchers'
import { LeagueSettings, type SettingsSection } from '@/components/LeagueSettings'
import { DEFAULT_FEATURES } from '@/lib/defaults'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const SECTIONS: SettingsSection[] = ['details', 'members', 'players', ...(DEFAULT_FEATURES.length > 0 ? ['features' as const] : [])]

/**
 * Admin settings for one league. The proxy requires a session with a profile; this page
 * checks the role and gathers every panel's data in one batch so the client
 * shell renders with no fetch waterfall.
 */
export default async function LeagueSettingsPage({ params, searchParams }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()

  const { userRole } = await getAuthAndRole(game.id)
  if (userRole !== 'creator' && userRole !== 'admin') redirect(`/${slug}/results`)

  const [players, members, roster, requests, claims, features, query] = await Promise.all([
    getPlayerStats(game.id),
    getLeagueMembers(game.id),
    getRosterPlayers(game.id),
    getPendingJoinRequests(game.id),
    getAllPlayerClaims(game.id),
    getFeatures(game.id),
    searchParams,
  ])

  const tab = typeof query.tab === 'string' ? query.tab : ''
  const initialSection = (SECTIONS as string[]).includes(tab) ? (tab as SettingsSection) : 'details'

  return (
    <LeagueSettings
      leagueId={game.id}
      leagueSlug={slug}
      leagueName={game.name}
      initialSection={initialSection}
      details={{
        location: game.location ?? null,
        day: game.day ?? null,
        kickoff_time: game.kickoff_time ?? null,
        bio: game.bio ?? null,
      }}
      playerCount={players.length}
      members={members}
      roster={roster}
      requests={requests}
      claims={claims.filter((c) => c.status === 'pending')}
      features={features}
    />
  )
}
