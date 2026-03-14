import { createPublicClient } from '@/lib/supabase/public'
import { NextResponse } from 'next/server'

/** Unauthenticated endpoint — returns whether a league has public results enabled. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createPublicClient()

  const { data, error } = await supabase
    .from('games')
    .select('public_results_enabled')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return NextResponse.json({ public_results_enabled: false })
  }

  return NextResponse.json({ public_results_enabled: data.public_results_enabled })
}
