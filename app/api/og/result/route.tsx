import { loadSharedResult } from '@/lib/shareLinksServer'
import { shareImageResponse } from '@/lib/ogImage'
import { ResultImage } from '@/components/og/ResultShareImage'

export const runtime = 'nodejs'

// The token changes whenever the result does, so the CDN can cache this by URL.
const RESULT_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600'

/** GET ?t=<token> — the link-preview image for a shared result. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('t')
  return shareImageResponse(
    loadSharedResult(token).then((result) => (result ? <ResultImage result={result} /> : null)),
    RESULT_CACHE_CONTROL
  )
}
