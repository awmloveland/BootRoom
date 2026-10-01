import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getGameBySlug, getGame, getAuthAndRole, getFeatures } from '@/lib/fetchers'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Props {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}

export default async function LeagueLayout({ children, params }: Props) {
  const { slug } = await params
  // Resolve slug → game (includes UUID). Warm shared fetchers without awaiting them.
  // Pages call these same cached functions — no extra DB queries.
  let game = await getGameBySlug(slug)
  if (!game) {
    // Old URLs used /{uuid}/subpath — detect UUID in slug position and redirect,
    // preserving the sub-path (results, players, settings, etc.).
    if (UUID_RE.test(slug)) {
      const gameById = await getGame(slug)
      if (gameById?.slug) {
        const headersList = await headers()
        const pathname = headersList.get('x-pathname') ?? `/${slug}/results`
        redirect(pathname.replace(slug, gameById.slug))
      }
    }
    notFound()
  }

  // Warm the per-request cache without blocking. React cache() memoises the
  // in-flight promise, so the page's own calls join these rather than
  // re-fetching, and the layout renders as soon as the slug resolves — which
  // is what lets each tab's loading.tsx appear promptly.
  void getAuthAndRole(game.id)
  void getFeatures(game.id)

  return <>{children}</>
}
