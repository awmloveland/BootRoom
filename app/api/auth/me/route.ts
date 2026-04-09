import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ user: null, profile: null })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()
  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile: profile
      ? { id: profile.id, first_name: profile.first_name, last_name: profile.last_name }
      : null,
  })
}
