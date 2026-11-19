// app/api/platform/leagues/[id]/route.ts
import { NextResponse } from 'next/server'
import { requirePlatformAdmin, rpcErrorResponse } from '@/lib/apiAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidateLeague } from '@/lib/leagueCache'

/**
 * DELETE — platform admins only. Body: { confirm: "<the league's address>" }.
 * platform_delete_league saves the league's rows to platform_audit_log and
 * deletes the league in one transaction; every child table cascades.
 * A daily database job clears that saved copy after 30 days.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requirePlatformAdmin()
  if ('response' in gate) return gate.response
  const { id } = await params

  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null
  const service = createServiceClient()
  // An id that is not a uuid fails this look-up and lands on the 404 too.
  const { data: game } = await service.from('games').select('slug').eq('id', id).maybeSingle()
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (body?.confirm !== game.slug) {
    return NextResponse.json({ error: 'Type the league address to confirm.' }, { status: 400 })
  }

  const { error } = await service.rpc('platform_delete_league', { p_game_id: id, p_actor: gate.user.id })
  if (error) return rpcErrorResponse(error, 'Could not delete the league. Try again.')

  revalidateLeague(id, [game.slug])
  return NextResponse.json({ ok: true })
}
