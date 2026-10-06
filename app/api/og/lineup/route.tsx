import { loadSharedLineup } from '@/lib/shareLinksServer'
import { shareImageResponse } from '@/lib/ogImage'
import { LineupImage } from '@/components/og/LineupShareImage'

export const runtime = 'nodejs'

// The token changes whenever the lineups do, so the CDN can cache this by URL.
const LINEUP_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600'

/** GET ?t=<token> — the link-preview image for a shared lineup. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  return shareImageResponse(
    loadSharedLineup(token).then((lineup) => (lineup ? <LineupImage lineup={lineup} /> : null)),
    LINEUP_CACHE_CONTROL
  )
}
