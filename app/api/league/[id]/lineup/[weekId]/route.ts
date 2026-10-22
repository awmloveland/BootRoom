import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin, rpcErrorStatus } from '@/lib/apiAuth'
import { revalidateLeague } from '@/lib/leagueCache'

/** DELETE — admin-only. Removes a scheduled or cancelled week's line-up via cancel_lineup. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; weekId: string }> }) {
  const { id, weekId } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  const supabase = await createClient()
  const { error } = await supabase.rpc('cancel_lineup', { p_week_id: weekId })
  if (error) return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })
  revalidateLeague(id)
  return NextResponse.json({ ok: true })
}
