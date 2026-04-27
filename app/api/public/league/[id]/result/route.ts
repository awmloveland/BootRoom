import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { Winner } from '@/lib/types'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const service = createServiceClient()

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
  const { weekId, winner, notes, goalDifference, teamARating, teamBRating, dnf } = body as {
    weekId: string
    winner: Winner
    notes?: string
    goalDifference: unknown
    teamARating: unknown
    teamBRating: unknown
    dnf?: boolean
  }

  if (dnf !== undefined && typeof dnf !== 'boolean') {
    return NextResponse.json({ error: 'dnf must be a boolean' }, { status: 400 })
  }

  if (dnf && (winner !== undefined && winner !== null)) {
    return NextResponse.json({ error: 'DNF games cannot have a winner' }, { status: 422 })
  }

  function safeRating(val: unknown): number | null {
    if (typeof val === 'number' && isFinite(val)) return val
    return null
  }

  if (!dnf && !Number.isInteger(goalDifference)) {
    return NextResponse.json({ error: 'goalDifference must be an integer' }, { status: 400 })
  }

  const goalDiff = dnf ? null : (goalDifference as number)

  const { data: weekRow } = await service
    .from('weeks')
    .select('game_id, team_a, team_b')
    .eq('id', weekId)
    .single()

  if (weekRow?.game_id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await service
    .from('weeks')
    .update(
      dnf
        ? {
            status: 'dnf',
            winner: null,
            notes: notes?.trim() || null,
            goal_difference: null,
            team_a_rating: null,
            team_b_rating: null,
          }
        : {
            status: 'played',
            winner,
            notes: notes?.trim() || null,
            goal_difference: goalDiff,
            team_a_rating: safeRating(teamARating),
            team_b_rating: safeRating(teamBRating),
          }
    )
    .eq('id', weekId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  function toStringArray(val: unknown): string[] {
    return Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : []
  }
  const names = [...toStringArray(weekRow.team_a), ...toStringArray(weekRow.team_b)]
  if (names.length > 0) {
    const { error: syncError } = await service
      .from('player_attributes')
      .upsert(
        names.map((name) => ({ game_id: id, name })),
        { onConflict: 'game_id,name', ignoreDuplicates: true }
      )
    if (syncError) console.error('[result] player_attributes sync failed:', syncError.message)
  }

  return NextResponse.json({ ok: true })
}
