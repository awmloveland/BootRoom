import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()
  const code = typeof body?.code === 'string' ? body.code : null
  const tokenHash = typeof body?.token_hash === 'string' ? body.token_hash : null

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return NextResponse.json({ error: 'Reset link expired or invalid. Request a new one from the sign-in page.' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' })
    if (error) {
      return NextResponse.json({ error: 'Reset link expired or invalid. Request a new one from the sign-in page.' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Code or token_hash required' }, { status: 400 })
}
