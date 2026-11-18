import { createServiceClient } from '@/lib/supabase/service'
import { dbErrorResponse, requireLeagueAdmin } from '@/lib/apiAuth'
import { revalidateLeague } from '@/lib/leagueCache'
import { NextResponse } from 'next/server'
import { HH_MM, LEAGUE_DAYS, parseLeagueText } from '@/lib/leagueDetails'

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

  if (error) return dbErrorResponse(error, 'Could not load the league details. Try again.')
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: playersData } = await supabase.rpc('get_player_stats_public', { p_game_id: id })
  const player_count = (playersData as unknown[])?.length ?? 0

  return NextResponse.json({ ...game, player_count })
}

/** PATCH — admin-only, updates the details. The slug is fixed at creation, so it never changes here. Returns { ok, slug }. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const gate = await requireLeagueAdmin(id)
  if ('response' in gate) return gate.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const b = body as Record<string, unknown> | null
  const text = parseLeagueText(b)
  if ('error' in text) return NextResponse.json(text, { status: 400 })
  const { name, location, bio } = text
  const day = typeof b?.day === 'string' && LEAGUE_DAYS.includes(b.day) ? b.day : null
  const kickoff_time = typeof b?.kickoff_time === 'string' ? b.kickoff_time.trim() || null : null
  if (kickoff_time && !HH_MM.test(kickoff_time)) return NextResponse.json({ error: 'Pick a kick-off time' }, { status: 400 })

  const service = createServiceClient()
  // The slug never changes on rename; it is returned so the form's redirect
  // logic keeps working unchanged.
  const { data: current } = await service.from('games').select('slug').eq('id', id).maybeSingle()
  const slug = (current?.slug as string | null | undefined) ?? null

  const { error } = await service
    .from('games')
    .update({ name, location, day, kickoff_time, bio })
    .eq('id', id)

  if (error) return dbErrorResponse(error, 'Could not save the league details. Try again.')
  revalidateLeague(id, slug ? [slug] : [])
  return NextResponse.json({ ok: true, slug })
}
