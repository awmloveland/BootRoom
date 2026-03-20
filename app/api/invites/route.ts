import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

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
  const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const gameId = typeof body?.gameId === 'string' ? body.gameId : null
  const role = body?.role === 'member' ? 'member' : 'admin'
  // Use '*' for open invite (anyone with the link can accept); otherwise require valid email
  const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : '*'
  if (!gameId) {
    return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  }

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: gameId })
  if (!isAdmin) {
    return NextResponse.json({ error: 'Not an admin of this game' }, { status: 403 })
  }

  const token = randomBytes(TOKEN_BYTES).toString('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS)

  const { error } = await supabase.from('game_invites').upsert(
    {
      game_id: gameId,
      email,
      invited_by: user.id,
      token,
      expires_at: expiresAt.toISOString(),
      role,
    },
    { onConflict: 'game_id,email,role' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const origin = request.headers.get('origin') || 'https://m.craft-football.com'
  const link = `${origin}/invite?token=${token}`

  return NextResponse.json({ link, expiresAt: expiresAt.toISOString() })
}
