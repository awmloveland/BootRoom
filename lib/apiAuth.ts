// lib/apiAuth.ts
// The session and admin gates shared by every API route, plus the error
// mapping and recorded-week guard the write routes share. The gates return
// either the caller or the response to send back, so a handler reads as
//   const gate = await requireLeagueAdmin(id)
//   if ('response' in gate) return gate.response
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser, type SessionUser } from '@/lib/supabase/session'

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
 * A 409 when the (season, week) row already holds a result, else null.
 * save_lineup and cancel_week upsert on that key, so a wrong key would replace
 * a played game. The RPCs carry the same guard; this one also covers a database
 * that has not had migration 20261022000001 applied yet.
 */
export async function recordedWeekConflict(
  leagueId: string,
  season: string,
  week: number,
): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('weeks')
    .select('status')
    .eq('game_id', leagueId)
    .eq('season', season)
    .eq('week', week)
    .maybeSingle()
  if (data?.status !== 'played' && data?.status !== 'dnf') return null
  return NextResponse.json({ error: 'This week already has a result' }, { status: 409 })
}

/** Status for a Supabase RPC error, by the message the SQL raised. */
export function rpcErrorStatus(message: string): number {
  if (/Access denied/i.test(message)) return 403
  if (/not[ _]found/i.test(message)) return 404
  if (/already_exists/i.test(message) || /already has a result/i.test(message)) return 409
  if (/^invalid_/i.test(message) || /must be/i.test(message)) return 400
  return 500
}
