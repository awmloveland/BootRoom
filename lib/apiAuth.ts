// lib/apiAuth.ts
// The session and admin gates shared by every API route. Both return either
// the caller or the response to send back, so a handler reads as
//   const gate = await requireLeagueAdmin(id)
//   if ('response' in gate) return gate.response
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser, type SessionUser } from '@/lib/supabase/session'
import { isPlatformAdmin } from '@/lib/platform'

/** The subset of the session a route handler needs. */
export type ApiUser = SessionUser

export type AuthGate = { user: ApiUser } | { response: NextResponse }

/** The signed-in caller, or a 401. */
export async function requireUser(): Promise<AuthGate> {
  const supabase = await createClient()
  const user = await getSessionUser(supabase)
  if (!user) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { user }
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

/**
 * The signed-in caller if they are a platform admin. Everyone else, signed
 * in or not, gets a 404, so the routes look like they do not exist.
 */
export async function requirePlatformAdmin(): Promise<AuthGate> {
  const supabase = await createClient()
  const user = await getSessionUser(supabase)
  if (!user || !isPlatformAdmin(user.id)) {
    return { response: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  }
  return { user }
}

/**
 * The response for a failed RPC. The SQL's own message goes back for the
 * statuses it raises on purpose; anything unexpected is logged and answered
 * with `fallback`, so constraint and column names stay on the server.
 */
export function rpcErrorResponse(error: { message: string }, fallback: string): NextResponse {
  const status = rpcErrorStatus(error.message)
  if (status === 500) console.error('[api] rpc failed', error)
  return NextResponse.json({ error: status === 500 ? fallback : error.message }, { status })
}

/**
 * The response for a failed table query. Its message is never meant for
 * people, so it is logged and answered with `fallback` and a 500.
 */
export function dbErrorResponse(error: unknown, fallback: string): NextResponse {
  console.error('[api] query failed', error)
  return NextResponse.json({ error: fallback }, { status: 500 })
}

/** Status for a Supabase RPC error, by the message the SQL raised. */
export function rpcErrorStatus(message: string): number {
  if (/Access denied/i.test(message)) return 403
  if (/not[ _]found/i.test(message)) return 404
  if (/already_exists/i.test(message) || /already has a result/i.test(message)) return 409
  if (/^invalid_/i.test(message) || /must be/i.test(message)) return 400
  return 500
}
