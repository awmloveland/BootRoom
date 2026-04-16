import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifyRequesterOfReview } from '@/lib/email/send-join-request-notifications'

/** POST — approve or decline a pending join request. Admin/creator only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { requestId } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const action: string = body.action

  if (action !== 'approved' && action !== 'declined') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { error } = await supabase.rpc('review_join_request', {
    p_request_id: requestId,
    p_action: action,
  })

  if (error) {
    if (error.message.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (error.message.includes('Request not found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('[join-requests review POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const origin = request.headers.get('origin') ?? 'https://craft-football.com'
  notifyRequesterOfReview(requestId, action as 'approved' | 'declined', origin)
    .catch(err => console.error('[email:notifyRequesterOfReview]', err))

  return NextResponse.json({ success: true })
}
