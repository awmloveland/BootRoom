import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const VALID_STATUSES = ['played', 'cancelled', 'unrecorded'] as const
type EditStatus = typeof VALID_STATUSES[number]

/** PATCH — admin-only, edits any field on an existing week. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; weekId: string }> }
) {
  const { id, weekId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>

  const date = typeof b.date === 'string' ? b.date.trim() : ''
  if (!date || !/^\d{2} [A-Za-z]{3} \d{4}$/.test(date)) {
    return NextResponse.json({ error: 'date must be "DD MMM YYYY" format' }, { status: 400 })
  }

  const status = typeof b.status === 'string' ? b.status : ''
  if (!VALID_STATUSES.includes(status as EditStatus)) {
    return NextResponse.json(
      { error: 'status must be played, cancelled, or unrecorded' },
      { status: 400 }
    )
  }

  const winner = typeof b.winner === 'string' ? b.winner : null
  const notes = typeof b.notes === 'string' ? b.notes : null
  const goalDifference = typeof b.goalDifference === 'number' ? b.goalDifference : null
  const teamA = Array.isArray(b.teamA) ? b.teamA : null
  const teamB = Array.isArray(b.teamB) ? b.teamB : null

  const { error } = await supabase.rpc('edit_week', {
    p_week_id: weekId,
    p_date: date,
    p_status: status,
    p_winner: winner,
    p_notes: notes,
    p_goal_difference: goalDifference,
    p_team_a: teamA,
    p_team_b: teamB,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
