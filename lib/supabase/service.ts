import { createClient } from '@supabase/supabase-js'
import { getSupabaseUrl } from './env'

/**
 * Service-role Supabase client for trusted server-side operations.
 * Bypasses RLS entirely — only use after performing your own authorization check.
 * Never import this in client components or API routes accessible to the browser.
 */
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
  return createClient(getSupabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
