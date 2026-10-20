import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/apiAuth'
import { notifyAdminsOfJoinRequest } from '@/lib/email/send-join-request-notifications'

/** GET — return pending join requests for a league. Admin/creator only. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const supabase = await createClient()

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
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const supabase = await createClient()

  const body = await request.json().catch(() => ({}))
  const message = typeof body?.message === 'string' ? body.message : null
  const playerName =
    typeof body?.player_name === 'string' && body.player_name.trim()
      ? body.player_name.trim()
      : null

  const playedBefore = typeof body?.played_before === 'boolean' ? body.played_before : null

  // Only records what they chose. The player link is made when an admin
  // approves (approve_join_request).
  const { error } = await supabase.rpc('submit_join_request', {
    p_game_id: id,
    p_message: message,
    p_player_name: playerName,
    p_played_before: playedBefore,
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
    { userId: gate.user.id, email: gate.user.email ?? '', message },
    origin
  ).catch(err => console.error('[email:notifyAdminsOfJoinRequest]', err))

  return NextResponse.json({ ok: true }, { status: 201 })
}
