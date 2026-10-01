// app/[slug]/(tabs)/honours/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { resolveVisibilityTier } from '@/lib/roles'
import { getGameBySlug, getAuthAndRole, getWeeks, getMyClaimInfo } from '@/lib/fetchers'
import { dayNameToIndex } from '@/lib/utils'
import { computeAllQuarters, computeQuarterlyTable, getQuarterStanding } from '@/lib/sidebar-stats'
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

  // The in-progress quarter shows the same live table as the sidebar.
  const now = new Date()
  const liveTable = computeQuarterlyTable(weeks, now, dayNameToIndex(game.day ?? null) ?? undefined)
  // claim.playerName is only set for an approved claim.
  const standing = getQuarterStanding(liveTable.allEntries, claim.playerName)

  return (
    <>
      {showClaimBanner && <ClaimOnboardingBanner leagueId={leagueId} />}
      {tier === 'public' || !isAuthenticated ? (
        <HonoursLoginPrompt leagueSlug={slug} leagueName={game.name} />
      ) : (
        <HonoursSection
          data={computeAllQuarters(weeks, now)}
          liveTable={liveTable}
          standing={standing}
          leagueName={game.name}
          leagueSlug={slug}
        />
      )}
    </>
  )
}
