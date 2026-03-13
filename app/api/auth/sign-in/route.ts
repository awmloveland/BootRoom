import { createClient } from '@/lib/supabase/server'
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    getSupabaseUrl()
    getSupabaseAnonKey()
  } catch (e) {
    console.error('[sign-in] Missing Supabase env:', String(e))
    return NextResponse.json(
      { error: 'Server misconfigured. Check NEXT_PUBLIC_SUPABASE_URL and keys.' },
      { status: 503 }
    )
  }

  const supabase = await createClient()
  const body = await request.json()
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    const code = error.message?.toLowerCase()
    let msg = error.message
    if (code?.includes('invalid') || code?.includes('credentials')) {
      msg = 'Invalid email or password. Use "Forgot password?" to set a new one.'
    } else if (code?.includes('email not confirmed')) {
      msg = 'Check your email and click the confirmation link first.'
    }
    // Log full details for debugging (visible in Vercel Functions logs)
    console.error('[sign-in] Auth error:', { message: error.message, code: error.code, status: error.status, email })
    return NextResponse.json({ error: msg, code: error.code }, { status: 401 })
  }

  const { error: claimError } = await supabase.rpc('claim_profile')
  if (claimError) {
    return NextResponse.json({ error: `Profile setup failed: ${claimError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, user: data.user?.id })
}
