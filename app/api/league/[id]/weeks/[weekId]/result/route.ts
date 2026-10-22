import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin, rpcErrorStatus } from '@/lib/apiAuth'
import type { Mentality, RecordResultInput, Winner } from '@/lib/types'

const WINNERS: Exclude<Winner, null>[] = ['teamA', 'teamB', 'draw']
const MENTALITIES: Mentality[] = ['balanced', 'attacking', 'defensive', 'goalkeeper']
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object'
const isGuest = (g: unknown): g is RecordResultInput['guests'][number] =>
  isRecord(g) && typeof g.oldName === 'string' && typeof g.newName === 'string'
  && typeof g.rating === 'number' && typeof g.goalkeeper === 'boolean'
const isNewPlayer = (p: unknown): p is RecordResultInput['newPlayers'][number] =>
  isRecord(p) && typeof p.name === 'string' && typeof p.rating === 'number'
  && MENTALITIES.includes(p.mentality as Mentality) && typeof p.goalkeeper === 'boolean'

function parseBody(body: unknown): RecordResultInput | null {
  const b = body as Record<string, unknown>
  if (!b || typeof b !== 'object' || typeof b.dnf !== 'boolean') return null
  const winner = WINNERS.includes(b.winner as Exclude<Winner, null>) ? (b.winner as Winner) : null
  if (!b.dnf && !winner) return null
  const guests = Array.isArray(b.guests) ? b.guests : []
  const newPlayers = Array.isArray(b.newPlayers) ? b.newPlayers : []
  if (!guests.every(isGuest) || !newPlayers.every(isNewPlayer)) return null
  return {
    dnf: b.dnf,
    winner: b.dnf ? null : winner,
    notes: typeof b.notes === 'string' && b.notes.trim() ? b.notes.trim() : null,
    goalDifference: b.dnf ? null : typeof b.goalDifference === 'number' ? b.goalDifference : null,
    teamARating: b.dnf ? null : typeof b.teamARating === 'number' ? b.teamARating : null,
    teamBRating: b.dnf ? null : typeof b.teamBRating === 'number' ? b.teamBRating : null,
    guests,
    newPlayers,
  }
}

/**
 * POST — admin-only. Records a result (or DNF) via record_result, then names
 * roster guests and promotes new players, in that order, exactly as the
 * ResultModal did from the browser. The three RPCs are not one transaction:
 * if name_guests or promote_roster fails (including the 409 below) the week
 * is already played or dnf, and the admin recovers by saving again, which
 * name_guests tolerates. A duplicate guest name returns 409 with
 * `error: 'name_already_exists'`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string; weekId: string }> }) {
  const { id, weekId } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const input = parseBody(await req.json().catch(() => null))
  if (!input) return NextResponse.json({ error: 'Invalid result' }, { status: 400 })

  const supabase = await createClient()
  const { error: resultErr } = await supabase.rpc('record_result', {
    p_week_id: weekId,
    p_dnf: input.dnf,
    p_winner: input.winner,
    p_notes: input.notes,
    p_goal_difference: input.goalDifference,
    p_team_a_rating: input.teamARating,
    p_team_b_rating: input.teamBRating,
  })
  if (resultErr) return NextResponse.json({ error: resultErr.message }, { status: rpcErrorStatus(resultErr.message) })

  if (input.guests.length > 0) {
    const { error } = await supabase.rpc('name_guests', {
      p_week_id: weekId,
      p_guests: input.guests.map((g) => ({ old_name: g.oldName, new_name: g.newName, rating: g.rating, goalkeeper: g.goalkeeper })),
    })
    if (error?.message.includes('name_already_exists')) {
      return NextResponse.json({ error: 'name_already_exists' }, { status: 409 })
    }
    if (error) return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })
  }

  if (input.newPlayers.length > 0) {
    const { error } = await supabase.rpc('promote_roster', {
      p_game_id: id,
      p_entries: input.newPlayers.map((p) => ({ name: p.name, rating: p.rating, mentality: p.mentality, goalkeeper: p.goalkeeper })),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })
  }

  return NextResponse.json({ ok: true })
}
