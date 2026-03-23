import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** GET — public, reads location/day/kickoff_time/bio from games row */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data: game, error } = await supabase
    .from('games')
    .select('location, day, kickoff_time, bio')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: playersData } = await supabase.rpc('get_player_stats_public', { p_game_id: id })
  const player_count = (playersData as unknown[])?.length ?? 0

  return NextResponse.json({ ...game, player_count })
}

/** PATCH — admin-only, validates caller is game admin via RPC then updates */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const VALID_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
  const VALID_TIMES = [
    '5:00pm','5:30pm','6:00pm','6:30pm','7:00pm','7:30pm','8:00pm','8:30pm','9:00pm',
  ]

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const location = typeof (body as Record<string, unknown>).location === 'string' ? ((body as Record<string, unknown>).location as string).trim() || null : null
  const day = typeof (body as Record<string, unknown>).day === 'string' && VALID_DAYS.includes((body as Record<string, unknown>).day as string) ? (body as Record<string, unknown>).day : null
  const kickoff_time = typeof (body as Record<string, unknown>).kickoff_time === 'string' && VALID_TIMES.includes((body as Record<string, unknown>).kickoff_time as string) ? (body as Record<string, unknown>).kickoff_time : null
  const bio = typeof (body as Record<string, unknown>).bio === 'string' ? ((body as Record<string, unknown>).bio as string).trim() || null : null

  const service = createServiceClient()
  const { error } = await service
    .from('games')
    .update({ location, day, kickoff_time, bio })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
