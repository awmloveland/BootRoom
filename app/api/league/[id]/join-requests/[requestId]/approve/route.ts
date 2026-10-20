import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/apiAuth'
import { approveErrorResponse, parseApproveBody } from '@/lib/playerUtils'
import { notifyRequesterOfReview } from '@/lib/email/send-join-request-notifications'

/**
 * POST — approve a join request in one step: link an existing player or
 * create a new one, add the member, and mark the request approved.
 * Admin/creator only. Body: { player_name, create_player? }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { requestId } = await params
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const supabase = await createClient()

  const parsed = parseApproveBody(await request.json().catch(() => null))
  if (!parsed) {
    return NextResponse.json({ error: 'Enter a player name.' }, { status: 400 })
  }

  const { error } = await supabase.rpc('approve_join_request', {
    p_request_id: requestId,
    p_player_name: parsed.player_name,
    p_create_player: parsed.create_player,
  })

  if (error) {
    const { status, error: message } = approveErrorResponse(error.message ?? '', parsed.player_name)
    if (status === 500) console.error('[join-requests approve POST]', error)
    return NextResponse.json({ error: message }, { status })
  }

  const origin = request.headers.get('origin') ?? 'https://craft-football.com'
  notifyRequesterOfReview(requestId, 'approved', origin)
    .catch(err => console.error('[email:notifyRequesterOfReview]', err))

  return NextResponse.json({ ok: true })
}
