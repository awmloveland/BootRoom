import { notFound, redirect } from 'next/navigation'
import { getGameBySlug, getGame, getAuthAndRole, getFeatures } from '@/lib/fetchers'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function LeagueLayout({ children, params }: Props) {
  const { slug } = await params
  // Resolve slug → game (includes UUID). Pre-warm all shared fetchers in parallel.
  // Pages call these same cached functions — no extra DB queries.
  let game = await getGameBySlug(slug)
  if (!game) {
    // Old URLs used /{uuid}/results — detect UUID in slug position and redirect.
    if (UUID_RE.test(slug)) {
      const gameById = await getGame(slug)
      if (gameById?.slug) redirect(`/${gameById.slug}/results`)
    }
    notFound()
  }

  await Promise.all([
    getAuthAndRole(game.id),
    getFeatures(game.id),
  ])

  return <>{children}</>
}
