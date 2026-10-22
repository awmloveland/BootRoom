import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/apiAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

export async function DELETE() {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const supabase = await createClient()

  // Delete profile row — cascades to game_members, player_claims, etc.
  const { error: profileErr } = await supabase
    .from('profiles')
    .delete()
    .eq('id', gate.user.id)

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  // Delete the auth user using the service-role client
  const service = createServiceClient()
  const { error: authErr } = await service.auth.admin.deleteUser(gate.user.id)

  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
