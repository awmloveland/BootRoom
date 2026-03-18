import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

type Params = { params: Promise<{ id: string }> }

/** Verify match_entry is public-enabled for this league. */
async function verifyPublicMatchEntry(service: ReturnType<typeof createServiceClient>, gameId: string) {
  const { data: feat } = await service
    .from('league_features')
    .select('public_enabled')
    .eq('game_id', gameId)
    .eq('feature', 'match_entry')
    .maybeSingle()
  return feat?.public_enabled === true
}

/**
 * POST — cancel the upcoming game week (creates or updates to 'cancelled').
 * Body: { season, week, date }
 * Returns: { id: string }
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const service = createServiceClient()

  if (!(await verifyPublicMatchEntry(service, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { season, week, date } = body as { season: string; week: number; date: string }

  const { data, error } = await service
    .from('weeks')
    .upsert(
      {
        game_id: id,
        season,
        week,
        date,
        status: 'cancelled',
        team_a: [],
        team_b: [],
        winner: null,
        notes: null,
      },
      { onConflict: 'game_id,season,week' }
    )
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}

/**
 * DELETE — reactivate a cancelled week (deletes the row, returning to idle).
 * Body: { weekId: string }
 * Returns: { ok: true }
 */
export async function DELETE(request: Request, { params }: Params) {
  const { id } = await params
  const service = createServiceClient()

  if (!(await verifyPublicMatchEntry(service, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { weekId } = body as { weekId: string }

  const { data: weekRow } = await service
    .from('weeks')
    .select('game_id')
    .eq('id', weekId)
    .single()

  if (weekRow?.game_id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await service.from('weeks').delete().eq('id', weekId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
