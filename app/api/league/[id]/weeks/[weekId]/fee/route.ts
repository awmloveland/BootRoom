import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseFee, requireLeagueAdmin } from '@/lib/feesServer'

type Params = { params: Promise<{ id: string; weekId: string }> }

/** PUT — admin-only. Overrides the fee per player for one played week. Body: { fee: number } */
export async function PUT(req: Request, { params }: Params) {
  const { id, weekId } = await params
  const auth = await requireLeagueAdmin(id)
  if ('response' in auth) return auth.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const fee = parseFee((body as Record<string, unknown>)?.fee)
  if (fee === null) return NextResponse.json({ error: 'fee must be an amount of 0 or more' }, { status: 400 })

  const service = createServiceClient()
  const { data: week } = await service
    .from('weeks')
    .select('id, status')
    .eq('id', weekId)
    .eq('game_id', id)
    .maybeSingle()
  if (!week) return NextResponse.json({ error: 'Week not found' }, { status: 404 })
  if (week.status !== 'played') return NextResponse.json({ error: 'Only played weeks have a fee' }, { status: 400 })

  const { error } = await service
    .from('week_fees')
    .upsert({ week_id: weekId, game_id: id, fee_per_player: fee }, { onConflict: 'week_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, fee })
}

/** DELETE — admin-only. Clears the override so the week uses the league default again. */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, weekId } = await params
  const auth = await requireLeagueAdmin(id)
  if ('response' in auth) return auth.response

  const service = createServiceClient()
  const { error } = await service.from('week_fees').delete().eq('week_id', weekId).eq('game_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
