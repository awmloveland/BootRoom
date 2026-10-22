import { createClient } from '@/lib/supabase/server'
import { requireUser } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'

export async function GET() {
  const gate = await requireUser()
  if ('response' in gate) return gate.response
  const supabase = await createClient()

  // Join games with the current user's membership row to return their role
  const { data, error } = await supabase
    .from('games')
    .select('id, name, slug, created_at, game_members!inner(role)')
    .eq('game_members.user_id', gate.user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const games = (data ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    slug: g.slug,
    created_at: g.created_at,
    role: (g.game_members as unknown as { role: string }[])[0]?.role ?? 'member',
  }))

  return NextResponse.json(games)
}
