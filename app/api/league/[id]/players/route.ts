import { createClient } from '@/lib/supabase/server'
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

  const [playersResult, membersResult] = await Promise.all([
    supabase
      .from('player_attributes')
      .select('name, rating, mentality')
      .eq('game_id', id)
      .order('name', { ascending: true }),
    supabase.rpc('get_league_members', { p_game_id: id }),
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

  const result = (playersResult.data ?? []).map((p) => ({
    ...p,
    ...(linkMap.get(p.name) ?? { linked_user_id: null, linked_display_name: null }),
  }))

  return NextResponse.json(result)
}
