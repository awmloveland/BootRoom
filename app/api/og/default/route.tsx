import { shareImageResponse } from '@/lib/ogImage'
import { GenericShareImage } from '@/components/og/frame'

export const runtime = 'nodejs'

const DEFAULT_CACHE_CONTROL = 'public, max-age=3600, s-maxage=86400'

/** GET — the site-wide default link-preview image. */
export async function GET() {
  return shareImageResponse(Promise.resolve(<GenericShareImage />), DEFAULT_CACHE_CONTROL)
}
