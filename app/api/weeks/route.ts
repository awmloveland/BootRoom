import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const ACCESS_KEY_COOKIE = 'app_access'

export async function GET(request: Request) {
  const key = process.env.APP_ACCESS_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key || !serviceKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 })
  }
  const cookieStore = await cookies()
  const cookieKey = cookieStore.get(ACCESS_KEY_COOKIE)?.value
  if (cookieKey !== key) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) {
    return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  }
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  )
  const { data, error } = await supabase
    .from('weeks')
    .select('week, date, status, format, team_a, team_b, winner, notes, goal_difference')
    .eq('game_id', gameId)
    .in('status', ['played', 'cancelled', 'dnf'])
    .order('week', { ascending: false })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data ?? [])
}
