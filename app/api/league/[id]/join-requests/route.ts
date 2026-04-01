import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** POST — submit a join request for a league. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const message = typeof body?.message === 'string' ? body.message : null

  const { error } = await supabase.rpc('submit_join_request', {
    p_game_id: id,
    p_message: message,
  })

  if (error) {
    if (error.message === 'duplicate_request') {
      return NextResponse.json({ error: 'already_requested' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
