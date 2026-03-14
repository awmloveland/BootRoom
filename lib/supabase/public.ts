import { createServerClient } from '@supabase/ssr'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

/**
 * Unauthenticated Supabase client for use in public (anon) server components.
 * Makes requests under the `anon` role — subject to public RLS policies only.
 * No cookies are read or written, so no session is attached.
 */
export function createPublicClient() {
  return createServerClient(
    getSupabaseUrl(),
    getSupabaseAnonKey(),
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  )
}
