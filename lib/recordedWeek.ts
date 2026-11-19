// lib/recordedWeek.ts
// Guard for the routes that upsert a week by (season, week).
import { NextResponse } from 'next/server'
import type { createClient } from '@/lib/supabase/server'
import type { createServiceClient } from '@/lib/supabase/service'
import { seasonOfDate } from '@/lib/utils'

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

/**
 * Once a week's date has been changed to `date`, move its (season, week) key
 * to that date's year if it crossed one, so the week shows under the right
 * Results year. Returns the query error, or null.
 */
export async function moveWeekToSeasonOfDate(
  service: ReturnType<typeof createServiceClient>,
  leagueId: string,
  weekId: string,
  date: string,
) {
  const season = seasonOfDate(date)
  const own = await service.from('weeks').select('season, date').eq('id', weekId).eq('game_id', leagueId).maybeSingle()
  if (own.error) return own.error
  // A different stored date means the date change did not apply to this week.
  if (!own.data || own.data.date !== date || own.data.season === season) return null

  // shortcut: numbered after the season's last week, not slotted in by date;
  // renumber by date (as import_weeks does) if moving old results between years becomes common.
  const last = await service
    .from('weeks').select('week').eq('game_id', leagueId).eq('season', season)
    .order('week', { ascending: false }).limit(1).maybeSingle()
  if (last.error) return last.error

  const { error } = await service
    .from('weeks').update({ season, week: (last.data?.week ?? 0) + 1 })
    .eq('id', weekId).eq('game_id', leagueId)
  return error
}
