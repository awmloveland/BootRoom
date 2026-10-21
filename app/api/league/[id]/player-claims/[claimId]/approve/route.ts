import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/apiAuth'
import { approveErrorResponse, parseApproveBody } from '@/lib/playerUtils'

/**
 * POST — approve an existing member's player claim, linking them to the
 * chosen player (created first if create_player). Admin/creator only.
 * Body: { player_name, create_player? }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; claimId: string }> }
) {
  const { claimId } = await params
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const supabase = await createClient()

  const parsed = parseApproveBody(await request.json().catch(() => null))
  if (!parsed) {
    return NextResponse.json({ error: 'Enter a player name.' }, { status: 400 })
  }

  const { error } = await supabase.rpc('approve_player_claim', {
    p_claim_id: claimId,
    p_player_name: parsed.player_name,
    p_create_player: parsed.create_player,
  })

  if (error) {
    const { status, error: message } = approveErrorResponse(error.message ?? '', parsed.player_name)
    if (status === 500) console.error('[player-claims approve POST]', error)
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ ok: true })
}
