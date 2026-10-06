// app/[slug]/(tabs)/admin/page.tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { leaguePageMetadata } from '@/lib/metadata'
import { resolveVisibilityTier } from '@/lib/roles'
import { getGameBySlug, getAuthAndRole, getWeeks } from '@/lib/fetchers'
import { isChargeable, isoDate, parseFeeRange } from '@/lib/fees'
import { getFeeRows } from '@/lib/feesServer'
import { HonoursLoginPrompt } from '@/components/HonoursLoginPrompt'
import { NoAccessState } from '@/components/NoAccessState'
import { AdminMoneyView } from '@/components/admin/AdminMoneyView'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return leaguePageMetadata((await params).slug, 'admin')
}

/**
 * Admin tab: pitch fees, who has paid and who owes. Admins only. Signed-out
 * visitors get a sign-in prompt (they may be an admin on a shared link);
 * signed-in non-admins are told they have no access, with a way back.
 * Nothing about fees is read for either.
 */
export default async function AdminPage({ params, searchParams }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  const [{ userRole, isAuthenticated }, weeks, query] = await Promise.all([
    getAuthAndRole(leagueId),
    getWeeks(leagueId),
    searchParams,
  ])
  if (!isAuthenticated) return <HonoursLoginPrompt leagueSlug={slug} leagueName={game.name} tab="admin" />
  if (resolveVisibilityTier(userRole) !== 'admin') {
    return <NoAccessState leagueSlug={slug} leagueName={game.name} page="Admin" />
  }

  const { defaultFee, fees, payments } = await getFeeRows(leagueId)

  return (
    <AdminMoneyView
      leagueId={leagueId}
      leagueName={game.name}
      // Only played, DNF and cancelled weeks carry fees or show in Games.
      weeks={weeks.filter((w) => isChargeable(w.status) || w.status === 'cancelled')}
      defaultFee={defaultFee}
      fees={fees}
      payments={payments}
      initialRange={parseFeeRange(query)}
      today={isoDate(new Date())}
    />
  )
}
