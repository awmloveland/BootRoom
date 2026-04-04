import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST — directly assign a player link to a member. Admin/creator only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const target_user_id = typeof body?.user_id === 'string' ? body.user_id : ''
  const player_name = typeof body?.player_name === 'string' ? body.player_name.trim() : ''

  if (!target_user_id || !player_name) {
    return NextResponse.json({ error: 'user_id and player_name are required' }, { status: 400 })
  }

  const { error } = await supabase.rpc('assign_player_link', {
    p_game_id: id,
    p_user_id: target_user_id,
    p_player_name: player_name,
  })

  if (error) {
    if (error.message?.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[player-claims assign POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
