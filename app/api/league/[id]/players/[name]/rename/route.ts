import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseRenameName } from '@/lib/playerUtils'

/** PATCH — rename a player and cascade through all league data. Admin only. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name: oldName } = await params

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const newName = parseRenameName(body?.new_name)
  if (!newName) return NextResponse.json({ error: 'new_name is required' }, { status: 400 })

  const { error } = await supabase.rpc('admin_rename_player', {
    p_game_id: id,
    p_old_name: decodeURIComponent(oldName),
    p_new_name: newName,
  })

  if (error) {
    if (error.message.includes('name_already_exists')) {
      return NextResponse.json({ error: 'Name already exists in this league' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, new_name: newName })
}
