'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The Overview tab only exists below lg. If a large screen ends up on
 * /overview (shared link, or a tablet rotated to landscape), send it to Results.
 */
export function OverviewDesktopRedirect({ leagueSlug }: { leagueSlug: string }) {
  const router = useRouter()

  useEffect(() => {
    const largeScreen = window.matchMedia('(min-width: 1024px)')
    const redirectIfLarge = () => {
      if (largeScreen.matches) router.replace(`/${leagueSlug}/results`)
    }
    redirectIfLarge()
    largeScreen.addEventListener('change', redirectIfLarge)
    return () => largeScreen.removeEventListener('change', redirectIfLarge)
  }, [router, leagueSlug])

  return null
}
