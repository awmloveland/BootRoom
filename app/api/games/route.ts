import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser, rpcErrorResponse } from '@/lib/apiAuth'
import { generateSlug, SLUG_CODE, slugCode } from '@/lib/utils'
import { revalidateLeague } from '@/lib/leagueCache'
import { HH_MM, LEAGUE_DAYS, parseLeagueText } from '@/lib/leagueDetails'

const PG_UNIQUE_VIOLATION = '23505'

/**
 * POST — any signed-in user. Creates a league through create_game, which also
 * makes the caller its creator and first player. Returns { id, slug }.
 * The address is the name plus a three-character code: the wizard's when it
 * sends a valid one, so its preview holds, otherwise a fresh one. create_game
 * refuses a sixth league from one account within 24 hours (429).
 */
export async function POST(req: Request) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const text = parseLeagueText(b)
  if ('error' in text) return NextResponse.json(text, { status: 400 })
  const { name, location, bio } = text
  if (!generateSlug(name)) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const day = typeof b?.day === 'string' && LEAGUE_DAYS.includes(b.day) ? b.day : null
  if (!day) return NextResponse.json({ error: 'Pick a match day' }, { status: 400 })
  const kickoff_time = typeof b?.kickoff_time === 'string' && HH_MM.test(b.kickoff_time) ? b.kickoff_time : null
  if (!kickoff_time) return NextResponse.json({ error: 'Pick a kick-off time' }, { status: 400 })

  const sentCode = typeof b?.code === 'string' && SLUG_CODE.test(b.code) ? b.code : null
  const supabase = await createClient()
  // No look-up first: the unique constraint is the check. One retry with a fresh code covers a clash.
  for (const code of [sentCode ?? slugCode(), slugCode()]) {
    const slug = `${generateSlug(name)}-${code}`
    const { data: id, error } = await supabase.rpc('create_game', {
      p_name: name,
      p_slug: slug,
      p_location: location,
      p_day: day,
      p_kickoff_time: kickoff_time,
      p_bio: bio,
    })
    if (!error) {
      revalidateLeague(id as string, [slug])
      return NextResponse.json({ id, slug })
    }
    if (error.message.includes('too_many_leagues')) {
      return NextResponse.json({ error: 'You have created five leagues in the last day. Try again tomorrow.' }, { status: 429 })
    }
    if (error.code !== PG_UNIQUE_VIOLATION) return rpcErrorResponse(error, 'Could not create the league. Try again.')
  }
  return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
}
