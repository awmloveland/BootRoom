import { createClient } from '@supabase/supabase-js'
import { getSupabaseAnonKey, getSupabaseUrl } from './env'

/**
 * Unauthenticated Supabase client for use in public server components.
 * Uses the anon key with no session — all requests run as the anon role.
 * Using @supabase/supabase-js directly avoids cookie/session complexity
 * that can interfere with @supabase/ssr in server-component contexts.
 */
export function createPublicClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
    // Explicitly bypass Next.js Data Cache — without this, supabase-js fetch calls
    // can serve stale cached responses even when the page uses force-dynamic.
    global: {
      fetch: (url, options = {}) =>
        fetch(url as RequestInfo, { ...(options as RequestInit), cache: 'no-store' }),
    },
  })
}
