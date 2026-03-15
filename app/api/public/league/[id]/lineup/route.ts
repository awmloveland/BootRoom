import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

type Params = { params: Promise<{ id: string }> }

/** Verify the game has a public link and match_entry is public-enabled. */
async function verifyPublicMatchEntry(service: ReturnType<typeof createServiceClient>, gameId: string) {
  const [gameRes, featRes] = await Promise.all([
    service.from('games').select('public_results_enabled').eq('id', gameId).single(),
    service.from('league_features')
      .select('public_enabled')
      .eq('game_id', gameId)
      .eq('feature', 'match_entry')
      .maybeSingle(),
  ])
  if (!gameRes.data?.public_results_enabled) return false
  if (!featRes.data?.public_enabled) return false
  return true
}

/**
 * POST — save (or update) a lineup for the next match.
 * Body: { season, week, date, format, teamA, teamB }
 * Returns: { id: string }
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const service = createServiceClient()

  if (!(await verifyPublicMatchEntry(service, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { season, week, date, format, teamA, teamB } = body as {
    season: string
    week: number
    date: string
    format: string | null
    teamA: string[]
    teamB: string[]
  }

  const { data, error } = await service
    .from('weeks')
    .upsert(
      {
        game_id: id,
        season,
        week,
        date,
        status: 'scheduled',
        format: format ?? null,
        team_a: teamA,
        team_b: teamB,
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
 * DELETE — cancel a scheduled lineup.
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

  // Verify the week belongs to this game before deleting
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
