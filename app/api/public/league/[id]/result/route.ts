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
  const { weekId, winner, notes, goalDifference } = body as {
    weekId: string
    winner: Winner
    notes?: string
    goalDifference: unknown
  }

  // Validate goalDifference — must be present and a whole number.
  // Both wins (1–20) and draws (0) must always include this field.
  // Number.isInteger(null) and Number.isInteger(undefined) both return false,
  // so absent or null values are rejected here too.
  if (!Number.isInteger(goalDifference)) {
    return NextResponse.json({ error: 'goalDifference must be an integer' }, { status: 400 })
  }

  // Safe to cast — we've validated it is an integer
  const goalDiff = goalDifference as number

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
      goal_difference: goalDiff,
    })
    .eq('id', weekId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
