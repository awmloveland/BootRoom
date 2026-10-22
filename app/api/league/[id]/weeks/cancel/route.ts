import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordedWeekConflict, requireLeagueAdmin, rpcErrorStatus } from '@/lib/apiAuth'
import { revalidateLeague } from '@/lib/leagueCache'

/** POST — admin-only. Marks a game day cancelled via cancel_week. Body: { season, week, date }. Returns { weekId }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b.season !== 'string' || typeof b.week !== 'number' || typeof b.date !== 'string') {
    return NextResponse.json({ error: 'season, week and date are required' }, { status: 400 })
  }

  const conflict = await recordedWeekConflict(id, b.season, b.week)
  if (conflict) return conflict

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cancel_week', {
    p_game_id: id, p_season: b.season, p_week: b.week, p_date: b.date,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })
  revalidateLeague(id)
  return NextResponse.json({ weekId: data as string })
}
