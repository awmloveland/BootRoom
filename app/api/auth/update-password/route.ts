import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!password || password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  const { error: claimError } = await supabase.rpc('claim_profile')
  if (claimError) {
    return NextResponse.json({ error: `Profile setup failed: ${claimError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Password updated.' })
}
