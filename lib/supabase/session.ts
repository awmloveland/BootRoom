// lib/supabase/session.ts
import type { SupabaseClient } from '@supabase/supabase-js'

/** The two session facts server code needs. */
export interface SessionUser {
  id: string
  email: string | null
}

/**
 * The signed-in user from the request's access token. getClaims verifies the
 * JWT locally against the project's cached public signing key, so this costs
 * no network call once asymmetric keys are enabled in the Supabase dashboard
 * (Project Settings → JWT Keys). With a symmetric secret it behaves like
 * getUser and calls the Auth server.
 */
export async function getSessionUser(supabase: Pick<SupabaseClient, 'auth'>): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  return { id: claims.sub, email: typeof claims.email === 'string' ? claims.email : null }
}