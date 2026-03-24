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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown>
  const location    = typeof b.location     === 'string' ? b.location.trim()     || null : null
  const day         = typeof b.day          === 'string' && VALID_DAYS.includes(b.day) ? b.day : null
  const kickoff_time = typeof b.kickoff_time === 'string' ? b.kickoff_time.trim() || null : null
  const bio         = typeof b.bio          === 'string' ? b.bio.trim()          || null : null
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

  const service = createServiceClient()
  const { error } = await service
    .from('games')
    .update({ name, location, day, kickoff_time, bio })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
