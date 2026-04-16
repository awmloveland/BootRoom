import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyAdminsOfJoinRequest } from '@/lib/email/send-join-request-notifications'

/** GET — return pending join requests for a league. Admin/creator only. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_join_requests', {
    p_game_id: id,
  })

  if (error) {
    if (error.message.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

/** POST — submit a join request for a league. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const message = typeof body?.message === 'string' ? body.message : null
  const playerName =
    typeof body?.player_name === 'string' && body.player_name.trim()
      ? body.player_name.trim()
      : null

  // player_name is passed into submit_join_request which creates the claim
  // directly (SECURITY DEFINER bypasses the member check — user isn't a member yet).
  const { error } = await supabase.rpc('submit_join_request', {
    p_game_id: id,
    p_message: message,
    p_player_name: playerName,
  })

  if (error) {
    if (
      error.message?.includes('Request already pending') ||
      error.message?.includes('Already a member')
    ) {
      return NextResponse.json(
        { error: 'Request already exists or you are already a member' },
        { status: 409 }
      )
    }
    if (error.message?.includes('profile_not_found')) {
      return NextResponse.json({ error: 'profile_not_found' }, { status: 422 })
    }
    console.error('[join-requests POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const origin = request.headers.get('origin') ?? 'https://craft-football.com'
  notifyAdminsOfJoinRequest(
    id,
    { userId: user.id, email: user.email ?? '', message },
    origin
  ).catch(err => console.error('[email:notifyAdminsOfJoinRequest]', err))

  return NextResponse.json({ ok: true }, { status: 201 })
}
