// app/[slug]/(tabs)/admin/page.tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { leaguePageMetadata } from '@/lib/metadata'
import { resolveVisibilityTier } from '@/lib/roles'
import { getGameBySlug, getAuthAndRole, getWeeks } from '@/lib/fetchers'
import { isoDate, parseFeeRange } from '@/lib/fees'
import { getFeeRows } from '@/lib/feesServer'
import { AdminMoneyView } from '@/components/admin/AdminMoneyView'

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return leaguePageMetadata((await params).slug, 'admin')
}

/**
 * Admin tab: pitch fees, who has paid and who owes. Admins only; for anyone
 * else the tab does not exist, so the route 404s rather than prompting a login.
 */
export default async function AdminPage({ params, searchParams }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  const [{ userRole }, weeks, query] = await Promise.all([
    getAuthAndRole(leagueId),
    getWeeks(leagueId),
    searchParams,
  ])
  if (resolveVisibilityTier(userRole) !== 'admin') notFound()

  const { defaultFee, fees, payments } = await getFeeRows(leagueId)

  return (
    <AdminMoneyView
      leagueId={leagueId}
      leagueName={game.name}
      // Only played and cancelled weeks carry fees or show in Games.
      weeks={weeks.filter((w) => w.status === 'played' || w.status === 'cancelled')}
      defaultFee={defaultFee}
      fees={fees}
      payments={payments}
      initialRange={parseFeeRange(query)}
      today={isoDate(new Date())}
    />
  )
}
