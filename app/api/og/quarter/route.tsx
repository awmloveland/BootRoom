import { loadSharedQuarter } from '@/lib/shareLinksServer'
import { shareImageResponse } from '@/lib/ogImage'
import { QuarterImage } from '@/components/og/QuarterShareImage'

export const runtime = 'nodejs'

// A completed quarter rarely changes.
const QUARTER_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600'

/** GET ?t=<token> — the link-preview image for a shared quarter. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  return shareImageResponse(
    loadSharedQuarter(token).then((quarter) => (quarter ? <QuarterImage quarter={quarter} /> : null)),
    QUARTER_CACHE_CONTROL
  )
}
