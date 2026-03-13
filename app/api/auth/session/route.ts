import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  return NextResponse.json({ session: data.user ? { user: data.user } : null })
}
