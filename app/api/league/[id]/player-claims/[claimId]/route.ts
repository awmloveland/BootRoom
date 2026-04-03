import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** DELETE — cancel a pending player claim. Claim owner only. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> }
) {
  const { claimId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase.rpc('cancel_player_claim', {
    p_claim_id: claimId,
  })

  if (error) {
    if (error.message?.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[player-claims DELETE]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
