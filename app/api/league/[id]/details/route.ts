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
  return NextResponse.json(game)
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
    '5:00pm','5:30pm','6:00pm','6:30pm','7:00pm','7:30pm','8:00pm','8:30pm','9:00pm','9:30pm',
    '10:00am','10:30am','11:00am','11:30am','12:00pm','12:30pm','1:00pm','1:30pm','2:00pm','2:30pm',
    '3:00pm','3:30pm','4:00pm','4:30pm',
  ]

  const body = await req.json()
  const location = typeof body.location === 'string' ? body.location.trim() || null : null
  const day = typeof body.day === 'string' && VALID_DAYS.includes(body.day) ? body.day : null
  const kickoff_time = typeof body.kickoff_time === 'string' && VALID_TIMES.includes(body.kickoff_time) ? body.kickoff_time : null
  const bio = typeof body.bio === 'string' ? body.bio.trim() || null : null

  const service = createServiceClient()
  const { error } = await service
    .from('games')
    .update({ location, day, kickoff_time, bio })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
