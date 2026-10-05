import { ImageResponse } from 'next/og'
import { loadSharedLineup } from '@/lib/lineupShareServer'
import { loadOgFonts } from '@/lib/ogFonts'
import { GenericShareImage, LineupImage, OG_SIZE } from '@/components/og/LineupShareImage'

export const runtime = 'nodejs'

/**
 * GET ?t=<token> — the link-preview image for a shared lineup. Always a PNG:
 * a missing, malformed or stale token gets the generic card. The token
 * changes whenever the lineups do, so the CDN can cache by URL.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  const [lineup, fonts] = await Promise.all([loadSharedLineup(token), loadOgFonts()])

  return new ImageResponse(lineup ? <LineupImage lineup={lineup} /> : <GenericShareImage />, {
    ...OG_SIZE,
    fonts,
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=3600' },
  })
}
