import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin } from '@/lib/apiAuth'
import { revalidateLeague } from '@/lib/leagueCache'
import { NextResponse } from 'next/server'

const VALID_STATUSES = ['played', 'cancelled', 'unrecorded', 'dnf'] as const
type EditStatus = typeof VALID_STATUSES[number]

/** PATCH — admin-only, edits any field on an existing week. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; weekId: string }> }
) {
  const { id, weekId } = await params
  // Ownership of the week is enforced inside the edit_week RPC (which derives game_id
  // from the week row and re-checks is_game_admin against that derived id).
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response
  const supabase = await createClient()

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
      { error: 'status must be played, cancelled, unrecorded, or dnf' },
      { status: 400 }
    )
  }

  const VALID_WINNERS = ['teamA', 'teamB', 'draw'] as const
  const winner = typeof b.winner === 'string' && VALID_WINNERS.includes(b.winner as typeof VALID_WINNERS[number])
    ? b.winner
    : null
  if (status === 'played' && !winner) {
    return NextResponse.json({ error: 'winner must be teamA, teamB, or draw for a played week' }, { status: 400 })
  }
  const notes = typeof b.notes === 'string' ? b.notes : null
  const goalDifference = typeof b.goalDifference === 'number' ? b.goalDifference : null
  // Unsigned win margin: the winner is stored separately, so negatives are invalid
  if (goalDifference !== null && (!Number.isInteger(goalDifference) || goalDifference < 0)) {
    return NextResponse.json({ error: 'goalDifference must be a non-negative integer' }, { status: 400 })
  }
  const teamA = Array.isArray(b.teamA) && b.teamA.every((e: unknown) => typeof e === 'string')
    ? (b.teamA as string[])
    : null
  const teamB = Array.isArray(b.teamB) && b.teamB.every((e: unknown) => typeof e === 'string')
    ? (b.teamB as string[])
    : null

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
  revalidateLeague(id)
  return NextResponse.json({ ok: true })
}
