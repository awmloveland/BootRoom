import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Join games with the current user's membership row to return their role
  const { data, error } = await supabase
    .from('games')
    .select('id, name, created_at, game_members!inner(role)')
    .eq('game_members.user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const games = (data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    created_at: g.created_at,
    role: (g.game_members as unknown as { role: string }[])[0]?.role ?? 'member',
  }))

  return NextResponse.json(games)
}
