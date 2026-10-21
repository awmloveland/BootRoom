import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/apiAuth'

/** GET — return all player claims for the league. Admin/creator only. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_player_claims', { p_game_id: id })

  if (error) {
    if (error.message?.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[player-claims all GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
