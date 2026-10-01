'use client'

import { useEffect } from 'react'
import { VIEWPORT_COOKIE } from '@/lib/utils'

/**
 * Records whether the viewport is below lg in a cookie, so the league root
 * redirect can send small screens to Overview even when the user agent looks
 * like a desktop (a narrow browser window, or an iPad in portrait).
 */
export function ViewportCookie() {
  useEffect(() => {
    const largeScreen = window.matchMedia('(min-width: 1024px)')
    const record = () => {
      const value = largeScreen.matches ? 'wide' : 'narrow'
      document.cookie = `${VIEWPORT_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`
    }
    record()
    largeScreen.addEventListener('change', record)
    return () => largeScreen.removeEventListener('change', record)
  }, [])

  return null
}
