'use client'

import { useEffect } from 'react'

/** Matches the Supabase session cookie, including the `.0`, `.1` chunks of a split one. */
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=]*-auth-token/

/**
 * Keeps a signed-in visitor's session fresh while the site is open. The
 * browser client refreshes the token before it expires, and again when the tab
 * comes back into view, and writes it to the cookie, so server renders and tab
 * prefetches always arrive with a valid token instead of each refreshing the
 * same one at once. The proxy covers the first request after a long absence.
 */
export function SessionKeepAlive() {
  useEffect(() => {
    if (!SESSION_COOKIE.test(document.cookie)) return
    // Loaded on demand, so signed-out visitors never download the auth client.
    void import('@/lib/supabase/client').then(({ createClient }) => createClient())
  }, [])

  return null
}
