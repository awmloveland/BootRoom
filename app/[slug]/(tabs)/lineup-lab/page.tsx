// app/[slug]/(tabs)/lineup-lab/page.tsx
export const dynamic = 'force-dynamic'

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { leaguePageMetadata } from '@/lib/metadata'
import { getGameBySlug, getAuthAndRole, getPlayerStats } from '@/lib/fetchers'
import { LineupLab } from '@/components/LineupLab'
import { LineupLabLoginPrompt } from '@/components/LineupLabLoginPrompt'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return leaguePageMetadata((await params).slug, 'lineup-lab')
}

export default async function LineupLabPage({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  // The tabs layout (header and sidebar) shares these cached fetchers.
  const [{ isAuthenticated }, players] = await Promise.all([
    getAuthAndRole(leagueId),
    getPlayerStats(leagueId),
  ])

  return isAuthenticated
    ? <LineupLab allPlayers={players} />
    : <LineupLabLoginPrompt leagueSlug={slug} leagueName={game.name} />
}
