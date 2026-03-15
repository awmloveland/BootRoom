import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { Winner } from '@/lib/types'

type Params = { params: Promise<{ id: string }> }

/**
 * POST — record a match result for a scheduled week.
 * Body: { weekId, winner, notes? }
 * Returns: { ok: true }
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const service = createServiceClient()

  // Verify public link is on
  const { data: game } = await service
    .from('games')
    .select('public_results_enabled')
    .eq('id', id)
    .single()

  if (!game?.public_results_enabled) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Verify match_entry is public-enabled
  const { data: feat } = await service
    .from('league_features')
    .select('public_enabled')
    .eq('game_id', id)
    .eq('feature', 'match_entry')
    .maybeSingle()

  if (!feat?.public_enabled) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { weekId, winner, notes } = body as { weekId: string; winner: Winner; notes?: string }

  // Verify the week belongs to this game
  const { data: weekRow } = await service
    .from('weeks')
    .select('game_id')
    .eq('id', weekId)
    .single()

  if (weekRow?.game_id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await service
    .from('weeks')
    .update({
      status: 'played',
      winner,
      notes: notes?.trim() || null,
    })
    .eq('id', weekId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
