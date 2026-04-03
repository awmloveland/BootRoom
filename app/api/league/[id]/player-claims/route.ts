import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST — submit a player identity claim. Member only. */
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
  const player_name = typeof body?.player_name === 'string' ? body.player_name.trim() : ''

  if (!player_name) {
    return NextResponse.json({ error: 'player_name is required' }, { status: 400 })
  }

  const { error } = await supabase.rpc('submit_player_claim', {
    p_game_id: id,
    p_player_name: player_name,
  })

  if (error) {
    if (
      error.message?.includes('claim_already_exists') ||
      error.message?.includes('player_already_claimed')
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error.message?.includes('Not a member')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[player-claims POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
