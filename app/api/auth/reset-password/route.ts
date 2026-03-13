import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const body = await request.json()
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 })
  }

  const baseUrl = typeof body?.redirect_base === 'string' && body.redirect_base.startsWith('http')
    ? body.redirect_base.replace(/\/$/, '')
    : request.headers.get('origin')?.replace(/\/$/, '') || 'https://m.craft-football.com'

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${baseUrl}/reset-password`,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, message: 'Check your email for the password reset link.' })
}
