import { createClient } from '@/lib/supabase/server'
import { ratingToStrength, strengthToRating } from '@/lib/strength'
import { parseAddPlayerBody } from '@/lib/playerUtils'
import { NextResponse } from 'next/server'

/** GET — returns all players in a league with linked member info. Admin only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [playersResult, membersResult, statsResult] = await Promise.all([
    supabase
      .from('player_attributes')
      .select('name, rating, mentality')
      .eq('game_id', id)
      .order('name', { ascending: true }),
    supabase.rpc('get_league_members', { p_game_id: id }),
    supabase.rpc('get_player_stats_public', { p_game_id: id }),
  ])

  if (playersResult.error) {
    return NextResponse.json({ error: playersResult.error.message }, { status: 500 })
  }

  // Build map: player_name -> { linked_user_id, linked_display_name }
  type LinkInfo = { linked_user_id: string; linked_display_name: string }
  const linkMap = new Map<string, LinkInfo>()
  for (const m of membersResult.data ?? []) {
    if (m.linked_player_name) {
      linkMap.set(m.linked_player_name, {
        linked_user_id: m.user_id,
        linked_display_name: m.display_name || m.email,
      })
    }
  }

  // Build map: player_name -> played count
  const playedMap = new Map<string, number>()
  for (const s of (statsResult.data ?? []) as Array<{ name: string; played: number }>) {
    playedMap.set(s.name, Number(s.played ?? 0))
  }

  const result = (playersResult.data ?? []).map((p) => ({
    name: p.name,
    strength: ratingToStrength(Number(p.rating ?? 0)),
    mentality: p.mentality,
    played: playedMap.get(p.name) ?? 0,
    ...(linkMap.get(p.name) ?? { linked_user_id: null, linked_display_name: null }),
  }))

  return NextResponse.json(result)
}

/** POST — create a new roster player. Admin only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseAddPlayerBody(body)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { name, strength, mentality } = parsed

  // Case-insensitive collision check against existing roster
  const { data: existing, error: existingErr } = await supabase
    .from('player_attributes')
    .select('name')
    .eq('game_id', id)
    .ilike('name', name)
    .maybeSingle()

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 })
  }
  if (existing) {
    return NextResponse.json(
      { error: `A player named "${existing.name}" already exists in this league.` },
      { status: 409 }
    )
  }

  // Upsert via promote_roster RPC (same path used by lineup result confirmation)
  const entries = [{
    name,
    rating: strengthToRating(strength),
    mentality,
    goalkeeper: mentality === 'goalkeeper',
  }]

  const { error: rpcErr } = await supabase.rpc('promote_roster', {
    p_game_id: id,
    p_entries: entries,
  })

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({
    name,
    strength,
    mentality,
    played: 0,
    linked_user_id: null,
    linked_display_name: null,
  })
}
