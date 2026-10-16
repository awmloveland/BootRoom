// app/[slug]/(tabs)/players/page.tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { leaguePageMetadata } from '@/lib/metadata'
import { resolveVisibilityTier } from '@/lib/roles'
import { getGameBySlug, getAuthAndRole, getPlayerStats, getWeeks, getMyClaimInfo } from '@/lib/fetchers'
import { PublicPlayerList } from '@/components/PublicPlayerList'
import { ClaimOnboardingBanner } from '@/components/ClaimOnboardingBanner'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return leaguePageMetadata((await params).slug, 'players', await searchParams)
}

export default async function LeaguePlayersPage({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  // Everything below is independent given leagueId, so it runs in one batch.
  // The tabs layout (header and sidebar) shares these cached fetchers.
  const [
    { userRole },
    players,
    weeks,
    claim,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getMyClaimInfo(leagueId),
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  // Onboarding banner for members with no claim.
  const showClaimBanner = tier === 'member' && claim.status === 'none'

  return (
    <>
      {showClaimBanner && <ClaimOnboardingBanner leagueId={leagueId} />}
      <PublicPlayerList
        leagueId={leagueId}
        isAdmin={isAdmin}
        players={players}
        weeks={weeks}
      />
    </>
  )
}
