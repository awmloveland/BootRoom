import { notFound } from 'next/navigation'
import { getGameBySlug, getAuthAndRole, getFeatures } from '@/lib/fetchers'

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function LeagueLayout({ children, params }: Props) {
  const { slug } = await params
  // Resolve slug → game (includes UUID). Pre-warm all shared fetchers in parallel.
  // Pages call these same cached functions — no extra DB queries.
  const game = await getGameBySlug(slug)
  if (!game) notFound()

  await Promise.all([
    getAuthAndRole(game.id),
    getFeatures(game.id),
  ])

  return <>{children}</>
}
