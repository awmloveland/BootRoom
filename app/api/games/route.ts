import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireUser, rpcErrorStatus } from '@/lib/apiAuth'
import { resolveUniqueSlug } from '@/lib/slug'
import { generateSlug } from '@/lib/utils'

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/
const PG_UNIQUE_VIOLATION = '23505'

/**
 * POST — any signed-in user. Creates a league through create_game, which also
 * makes the caller its creator and first player. Returns { id, slug }.
 * 409 slug_taken means another league took the slug between the wizard's
 * preview and this request; the client retries once.
 */
export async function POST(req: Request) {
  const gate = await requireUser()
  if ('response' in gate) return gate.response

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const name = typeof b?.name === 'string' ? b.name.trim() : ''
  if (!name || !generateSlug(name)) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  if (name.length > 80) return NextResponse.json({ error: 'Name must be 80 characters or fewer' }, { status: 400 })
  const day = typeof b?.day === 'string' && VALID_DAYS.includes(b.day) ? b.day : null
  if (!day) return NextResponse.json({ error: 'Pick a match day' }, { status: 400 })
  const kickoff_time = typeof b?.kickoff_time === 'string' && HH_MM.test(b.kickoff_time) ? b.kickoff_time : null
  if (!kickoff_time) return NextResponse.json({ error: 'Pick a kick-off time' }, { status: 400 })
  const location = typeof b?.location === 'string' ? b.location.trim() || null : null
  const bio = typeof b?.bio === 'string' ? b.bio.trim() || null : null

  const slug = await resolveUniqueSlug(name)
  const supabase = await createClient()
  const { data: id, error } = await supabase.rpc('create_game', {
    p_name: name,
    p_slug: slug,
    p_location: location,
    p_day: day,
    p_kickoff_time: kickoff_time,
    p_bio: bio,
  })
  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) return NextResponse.json({ error: 'slug_taken' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: rpcErrorStatus(error.message) })
  }
  return NextResponse.json({ id, slug })
}
