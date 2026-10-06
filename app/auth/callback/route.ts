import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { safeRedirectPath } from '@/lib/utils'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Only ever a path on this site: `${origin}@evil.example` would leave it.
  const redirect = safeRedirectPath(searchParams.get('redirect'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await supabase.rpc('claim_profile')
      return NextResponse.redirect(`${origin}${redirect}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback`)
}
