import type { ReactElement } from 'react'
import { ImageResponse } from 'next/og'
import { loadOgFonts } from '@/lib/ogFonts'
import { GenericShareImage, OG_SIZE } from '@/components/og/frame'

// A null image can stand in for a transient DB error, so don't pin the generic card at the CDN.
export const GENERIC_CACHE_CONTROL = 'public, max-age=60, s-maxage=60'

/**
 * The PNG for a link preview. `image` resolves to the element to draw, or to
 * null for the generic card. Always a 200 PNG; only a font read failure
 * surfaces as an (uncached) error.
 */
export async function shareImageResponse(
  image: Promise<ReactElement | null>,
  cacheControl: string
): Promise<ImageResponse> {
  const [element, fonts] = await Promise.all([image, loadOgFonts()])
  return new ImageResponse(element ?? <GenericShareImage />, {
    ...OG_SIZE,
    fonts,
    headers: { 'Cache-Control': element ? cacheControl : GENERIC_CACHE_CONTROL },
  })
}
