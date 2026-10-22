import { createClient } from '@/lib/supabase/server'
import { requireLeagueAdmin, requireUser } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const TOKEN_BYTES = 32
const EXPIRY_DAYS = 7

export async function POST(request: Request) {
  // Session first so a signed-out caller gets 401 before any body validation, as before.
  const session = await requireUser()
  if ('response' in session) return session.response

  const body = await request.json()
  const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const gameId = typeof body?.gameId === 'string' ? body.gameId : null
  const role = body?.role === 'member' ? 'member' : 'admin'
  // Use '*' for open invite (anyone with the link can accept); otherwise require valid email
  const email = rawEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : '*'
  if (!gameId) {
    return NextResponse.json({ error: 'gameId required' }, { status: 400 })
  }

  const gate = await requireLeagueAdmin(gameId)
  if ('response' in gate) return gate.response
  const supabase = await createClient()

  const token = randomBytes(TOKEN_BYTES).toString('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + EXPIRY_DAYS)

  const { error } = await supabase.from('game_invites').upsert(
    {
      game_id: gameId,
      email,
      invited_by: gate.user.id,
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
