'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Detects when a page is restored from the browser's bfcache (back/forward
 * navigation) and triggers a Next.js router refresh so server components
 * re-fetch fresh data rather than showing a stale DOM snapshot.
 */
export function BfcacheRefresh() {
  const router = useRouter()

  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        router.refresh()
      }
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [router])

  return null
}
