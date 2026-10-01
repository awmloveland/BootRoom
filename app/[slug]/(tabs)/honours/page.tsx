// app/[slug]/(tabs)/honours/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { resolveVisibilityTier } from '@/lib/roles'
import { getGameBySlug, getAuthAndRole, getWeeks, getMyClaimInfo } from '@/lib/fetchers'
import { computeAllQuarters } from '@/lib/sidebar-stats'
import { HonoursSection } from '@/components/HonoursSection'
import { HonoursLoginPrompt } from '@/components/HonoursLoginPrompt'
import { ClaimOnboardingBanner } from '@/components/ClaimOnboardingBanner'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function HonoursPage({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  // Everything below is independent given leagueId, so it runs in one batch.
  // The tabs layout (header and sidebar) shares these cached fetchers.
  const [{ userRole, isAuthenticated }, weeks, claim] = await Promise.all([
    getAuthAndRole(leagueId),
    getWeeks(leagueId),
    getMyClaimInfo(leagueId),
  ])

  const tier = resolveVisibilityTier(userRole)

  // Onboarding banner for members with no claim.
  const showClaimBanner = tier === 'member' && claim.status === 'none'

  return (
    <>
      {showClaimBanner && <ClaimOnboardingBanner leagueId={leagueId} />}
      {tier === 'public' || !isAuthenticated ? (
        <HonoursLoginPrompt leagueSlug={slug} leagueName={game.name} />
      ) : (
        <HonoursSection
          data={computeAllQuarters(weeks, new Date())}
          leagueName={game.name}
          leagueSlug={slug}
        />
      )}
    </>
  )
}
