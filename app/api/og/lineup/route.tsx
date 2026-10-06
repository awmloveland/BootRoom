import { ImageResponse } from 'next/og'
import { loadSharedLineup } from '@/lib/shareLinksServer'
import { loadOgFonts } from '@/lib/ogFonts'
import { GenericShareImage, LineupImage, OG_SIZE } from '@/components/og/LineupShareImage'

export const runtime = 'nodejs'

// The token changes whenever the lineups do, so the CDN can cache this by URL.
const LINEUP_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600'
// A null lineup can be a transient DB error, so don't pin the generic card at the CDN.
const GENERIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=60'

/**
 * GET ?t=<token> — the link-preview image for a shared lineup. Always a PNG:
 * a missing, malformed or stale token gets the generic card, cached only
 * briefly because it may stand in for a transient lookup failure.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  const [lineup, fonts] = await Promise.all([loadSharedLineup(token), loadOgFonts()])

  return new ImageResponse(lineup ? <LineupImage lineup={lineup} /> : <GenericShareImage />, {
    ...OG_SIZE,
    fonts,
    headers: { 'Cache-Control': lineup ? LINEUP_CACHE_CONTROL : GENERIC_CACHE_CONTROL },
  })
}
