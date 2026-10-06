import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getWeeks } from '@/lib/fetchers'
import { computeFees, parseFeeRange } from '@/lib/fees'
import { getFeeRows, parseFee, requireLeagueAdmin } from '@/lib/feesServer'

/** GET — admin-only. Who owes what over `?range=30|90|180|all|custom&from=&to=`. Returns AdminMoneyData. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await requireLeagueAdmin(id)
  if ('response' in auth) return auth.response

  const search = new URL(req.url).searchParams
  const range = parseFeeRange({ range: search.get('range'), from: search.get('from'), to: search.get('to') })
  const [weeks, { defaultFee, fees, payments }] = await Promise.all([getWeeks(id), getFeeRows(id)])

  return NextResponse.json(computeFees(weeks, fees, payments, defaultFee, range))
}

/** PATCH — admin-only. Sets the league's default fee per player. Body: { defaultFee: number } */
export async function PATCH(
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

  const defaultFee = parseFee((body as Record<string, unknown>)?.defaultFee)
  if (defaultFee === null) return NextResponse.json({ error: 'defaultFee must be an amount of 0 or more' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service.from('games').update({ fee_per_player: defaultFee }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, defaultFee })
}
