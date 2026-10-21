import { createServiceClient } from '@/lib/supabase/service'
import { requireLeagueAdmin } from '@/lib/apiAuth'
import { revalidateLeague } from '@/lib/leagueCache'
import { NextResponse } from 'next/server'

/** PATCH — admin-only, updates the date on a scheduled week. Body: { date: "DD MMM YYYY" } */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; weekId: string }> }
) {
  const { id, weekId } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const date = typeof b.date === 'string' ? b.date.trim() : ''
  if (!date || !/^\d{2} [A-Za-z]{3} \d{4}$/.test(date)) {
    return NextResponse.json({ error: 'date must be "DD MMM YYYY" format' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service
    .from('weeks')
    .update({ date })
    .eq('id', weekId)
    .eq('game_id', id)
    .eq('status', 'scheduled')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidateLeague(id)
  return NextResponse.json({ ok: true })
}
