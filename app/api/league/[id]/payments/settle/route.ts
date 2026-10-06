import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getWeeks } from '@/lib/fetchers'
import { feeEntryKey, settlePayers } from '@/lib/fees'
import { requireLeagueAdmin } from '@/lib/feesServer'

/**
 * POST — admin-only. "Mark all paid": ticks the player's own entries and
 * their guests' entries in the given weeks (the weeks in the viewer's range).
 * Body: { player: string, weekIds: string[] }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireLeagueAdmin(id)
  if ('response' in auth) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = (body ?? {}) as Record<string, unknown>
  const player = typeof b.player === 'string' ? b.player : ''
  const weekIds = Array.isArray(b.weekIds) ? b.weekIds.filter((w): w is string => typeof w === 'string') : null
  if (!player || !weekIds) {
    return NextResponse.json({ error: 'player and weekIds are required' }, { status: 400 })
  }

  // getWeeks is scoped to this league, so ids from another league match nothing.
  const service = createServiceClient()
  const candidates = settlePayers(await getWeeks(id), player, weekIds)

  // Leave rows that are already paid alone so their paid_at stays accurate.
  const { data: alreadyPaid } = candidates.length
    ? await service
        .from('week_payments')
        .select('week_id, payer')
        .eq('game_id', id)
        .eq('paid', true)
        .in('week_id', [...new Set(candidates.map((r) => r.weekId))])
        .in('payer', [...new Set(candidates.map((r) => r.payer))])
    : { data: [] }
  const paidKeys = new Set(((alreadyPaid ?? []) as { week_id: string; payer: string }[]).map((r) => feeEntryKey(r.week_id, r.payer)))
  const rows = candidates.filter((r) => !paidKeys.has(feeEntryKey(r.weekId, r.payer)))
  if (rows.length === 0) return NextResponse.json({ ok: true, settled: 0 })

  const paidAt = new Date().toISOString()
  const { error } = await service.from('week_payments').upsert(
    rows.map(({ weekId, payer }) => ({
      week_id: weekId,
      game_id: id,
      payer,
      paid: true,
      paid_at: paidAt,
      marked_by: auth.user.id,
    })),
    { onConflict: 'week_id,payer' }
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, settled: rows.length })
}
