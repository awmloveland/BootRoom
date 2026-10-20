import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'

/** GET — returns all members of a league. Admin only (enforced by RPC). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('get_league_members', { p_game_id: id })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

/** PATCH — update a member's role or remove them. Admin only. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const supabase = await createClient()

  const body = await request.json()
  const action = typeof body?.action === 'string' ? body.action : ''
  const targetUserId = typeof body?.user_id === 'string' ? body.user_id : ''

  if (!targetUserId) return NextResponse.json({ error: 'user_id required' }, { status: 400 })

  if (action === 'remove') {
    const { error } = await supabase.rpc('remove_member', {
      p_game_id: id,
      p_user_id: targetUserId,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'set_role') {
    const role = typeof body?.role === 'string' ? body.role : ''
    if (!role) return NextResponse.json({ error: 'role required' }, { status: 400 })
    const { error } = await supabase.rpc('update_member_role', {
      p_game_id: id,
      p_user_id: targetUserId,
      p_role: role,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
