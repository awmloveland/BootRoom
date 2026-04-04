import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST — approve or reject a player claim. Admin/creator only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> }
) {
  const { claimId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const action: string = body.action
  const override_name: string | null =
    typeof body.override_name === 'string' ? body.override_name.trim() || null : null

  if (action !== 'approved' && action !== 'rejected') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { error } = await supabase.rpc('review_player_claim', {
    p_claim_id: claimId,
    p_action: action,
    p_override_name: override_name,
  })

  if (error) {
    if (error.message?.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (error.message?.includes('Claim not found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('[player-claims review POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
