import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getGame, getWeeks } from '@/lib/fetchers'
import { computeFees, parseFeeRange, weeksSinceCreation } from '@/lib/fees'
import { getFeeRows, parseFee, requireLeagueAdmin } from '@/lib/feesServer'
import { revalidateLeague } from '@/lib/leagueCache'

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
  const [game, weeks, { defaultFee, fees, payments }] = await Promise.all([getGame(id), getWeeks(id), getFeeRows(id)])

  // Imported history is not fee debt: the same cut-off the Admin page applies.
  return NextResponse.json(computeFees(weeksSinceCreation(weeks, game?.created_at), fees, payments, defaultFee, range))
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
  revalidateLeague(id)
  return NextResponse.json({ ok: true, defaultFee })
}
