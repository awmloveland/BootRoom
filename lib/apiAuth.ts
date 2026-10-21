// lib/apiAuth.ts
// The session and admin gates shared by every API route. Both return either
// the caller or the response to send back, so a handler reads as
//   const gate = await requireLeagueAdmin(id)
//   if ('response' in gate) return gate.response
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** The subset of the session a route handler needs. */
export interface ApiUser {
  id: string
  email: string | null
}

export type AuthGate = { user: ApiUser } | { response: NextResponse }

/** The signed-in caller, or a 401. */
export async function requireUser(): Promise<AuthGate> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { user: { id: user.id, email: user.email ?? null } }
}

/** The signed-in caller if they admin this league (via is_game_admin), else a 401 or 403. */
export async function requireLeagueAdmin(leagueId: string): Promise<AuthGate> {
  const gate = await requireUser()
  if ('response' in gate) return gate
  const supabase = await createClient()
  const { data: isAdmin, error } = await supabase.rpc('is_game_admin', { p_game_id: leagueId })
  if (error) console.error('[apiAuth] is_game_admin failed', error)
  if (!isAdmin) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return gate
}
