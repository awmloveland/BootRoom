import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  const displayName = typeof body?.display_name === 'string' ? body.display_name.trim() : ''

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName || email.split('@')[0],
        name: displayName || email.split('@')[0],
      },
    },
  })

  if (error) {
    const msg = error.message?.toLowerCase().includes('already registered') || error.message?.toLowerCase().includes('already exists')
      ? 'An account with this email already exists. Use "Forgot password?" below to set a password.'
      : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  if (data.session) {
    const { error: claimError } = await supabase.rpc('claim_profile')
    if (claimError) {
      return NextResponse.json({ error: `Profile setup failed: ${claimError.message}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true, signed_in: true, message: 'Welcome!' })
  }

  return NextResponse.json({
    ok: true,
    message: 'Account created. Check your email to confirm, or if confirmation is disabled, sign in below.',
  })
}
