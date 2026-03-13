import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const LEGACY_GAME_ID = '00000000-0000-0000-0000-000000000001'
const TOKEN_BYTES = 32
const EXPIRY_DAYS = 7

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  const { data: member } = await supabase
    .from('game_members')
    .select('game_id')
    .eq('game_id', LEGACY_GAME_ID)
    .eq('user_id', user.id)
    .single()

  if (!member) {
    return NextResponse.json({ error: 'Not an admin of this game' }, { status: 403 })
  }

  const token = randomBytes(TOKEN_BYTES).toString('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS)

  const { error } = await supabase.from('game_invites').upsert(
    {
      game_id: LEGACY_GAME_ID,
      email,
      invited_by: user.id,
      token,
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: 'game_id,email' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const origin = request.headers.get('origin') || 'https://m.craft-football.com'
  const link = `${origin}/invite?token=${token}`

  return NextResponse.json({ link, expiresAt: expiresAt.toISOString() })
}
