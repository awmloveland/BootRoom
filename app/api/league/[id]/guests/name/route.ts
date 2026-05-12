import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { strengthToRating } from '@/lib/strength'
import type { Mentality, StrengthHint } from '@/lib/types'

interface Body {
  weekId?: string
  oldName?: string
  newName?: string
  mentality?: Mentality
  strengthHint?: StrengthHint
}

const VALID_MENTALITIES: Mentality[] = ['balanced', 'attacking', 'defensive', 'goalkeeper']
const VALID_STRENGTHS: StrengthHint[] = ['below', 'average', 'above']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const weekId = typeof body.weekId === 'string' ? body.weekId : ''
  const oldName = typeof body.oldName === 'string' ? body.oldName : ''
  const newName = typeof body.newName === 'string' ? body.newName.trim() : ''
  const mentality = body.mentality
  const strengthHint = body.strengthHint

  if (!weekId || !oldName || !newName) {
    return NextResponse.json({ error: 'weekId, oldName and newName are required' }, { status: 400 })
  }
  if (!mentality || !VALID_MENTALITIES.includes(mentality)) {
    return NextResponse.json({ error: 'invalid_mentality' }, { status: 400 })
  }
  if (!strengthHint || !VALID_STRENGTHS.includes(strengthHint)) {
    return NextResponse.json({ error: 'invalid_strength_hint' }, { status: 400 })
  }

  const rating = strengthToRating(strengthHint)

  const { error } = await supabase.rpc('admin_name_guest', {
    p_game_id: id,
    p_week_id: weekId,
    p_old_name: oldName,
    p_new_name: newName,
    p_mentality: mentality,
    p_rating: rating,
  })

  if (error) {
    if (error.message.includes('name_already_exists')) {
      return NextResponse.json({ error: 'name_taken' }, { status: 409 })
    }
    if (error.message.includes('guest_not_found')) {
      return NextResponse.json({ error: 'guest_not_found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, new_name: newName })
}
