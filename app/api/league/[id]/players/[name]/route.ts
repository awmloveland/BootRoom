import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parsePlayerPatch } from '@/lib/playerUtils'

/** PATCH — update a player's rating and/or mentality. Admin only. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name } = await params
  const playerName = decodeURIComponent(name)

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const patch = parsePlayerPatch(body)
  if (!patch) return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })

  const { data, error } = await supabase
    .from('player_attributes')
    .update(patch)
    .eq('game_id', id)
    .eq('name', playerName)
    .select('name, rating, mentality')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  return NextResponse.json(data)
}
