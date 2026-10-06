import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getWeeks } from '@/lib/fetchers'
import { weekPayers } from '@/lib/fees'
import { requireLeagueAdmin } from '@/lib/feesServer'

/**
 * PUT — admin-only. Ticks or unticks one payer for one played or DNF week.
 * Body: { payer: string, paid: boolean }. The payer must be in that week's
 * line-up: a player, or a guest by their guest name ('Alice +1').
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; weekId: string }> }
) {
  const { id, weekId } = await params
  const auth = await requireLeagueAdmin(id)
  if ('response' in auth) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = (body ?? {}) as Record<string, unknown>
  const payer = typeof b.payer === 'string' ? b.payer : ''
  if (!payer || typeof b.paid !== 'boolean') {
    return NextResponse.json({ error: 'payer and paid are required' }, { status: 400 })
  }

  const week = (await getWeeks(id)).find((w) => w.id === weekId)
  if (!week) return NextResponse.json({ error: 'Week not found' }, { status: 404 })
  if (!weekPayers(week).some((p) => p.payer === payer)) {
    return NextResponse.json({ error: 'payer did not play that week' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.from('week_payments').upsert(
    {
      week_id: weekId,
      game_id: id,
      payer,
      paid: b.paid,
      paid_at: b.paid ? new Date().toISOString() : null,
      marked_by: auth.user.id,
    },
    { onConflict: 'week_id,payer' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
