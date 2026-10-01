// app/[slug]/(tabs)/records/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { resolveVisibilityTier } from '@/lib/roles'
import { getGameBySlug, getAuthAndRole, getWeeks, getMyClaimInfo } from '@/lib/fetchers'
import { computeRecords } from '@/lib/records'
import { RecordsSection } from '@/components/RecordsSection'
import { HonoursLoginPrompt } from '@/components/HonoursLoginPrompt'
import { ClaimOnboardingBanner } from '@/components/ClaimOnboardingBanner'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function RecordsPage({ params }: Props) {
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

  // Like Seasons, Records is for signed-in members only.
  const signedOut = tier === 'public' || !isAuthenticated

  // Onboarding banner for members with no claim.
  const showClaimBanner = tier === 'member' && claim.status === 'none'

  return (
    <>
      {showClaimBanner && <ClaimOnboardingBanner leagueId={leagueId} />}
      {signedOut ? (
        <HonoursLoginPrompt leagueSlug={slug} leagueName={game.name} tab="records" />
      ) : (
        <RecordsSection data={computeRecords(weeks, new Date())} leagueSlug={slug} />
      )}
    </>
  )
}
