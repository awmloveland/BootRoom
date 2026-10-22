// lib/recordedWeek.ts
// Guard for the routes that upsert a week by (season, week).
import { NextResponse } from 'next/server'
import type { createClient } from '@/lib/supabase/server'

type ServerClient = Awaited<ReturnType<typeof createClient>>

/**
 * A 409 when the (season, week) row already holds a result, a 500 when the
 * check itself fails, else null. save_lineup and cancel_week upsert on that
 * key, so a wrong key would replace a played game. The RPCs carry the same
 * guard; this one also covers a database that has not had migration
 * 20261022000001 applied yet, so it fails closed.
 */
export async function recordedWeekConflict(
  supabase: ServerClient,
  leagueId: string,
  season: string,
  week: number,
): Promise<NextResponse | null> {
  const { data, error } = await supabase
    .from('weeks')
    .select('status')
    .eq('game_id', leagueId)
    .eq('season', season)
    .eq('week', week)
    .maybeSingle()
  if (error) {
    console.error('[recordedWeek] week lookup failed', error)
    return NextResponse.json({ error: 'Could not check this week' }, { status: 500 })
  }
  if (data?.status !== 'played' && data?.status !== 'dnf') return null
  return NextResponse.json({ error: 'This week already has a result' }, { status: 409 })
}
