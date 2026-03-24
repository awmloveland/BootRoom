import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

/** GET — returns the first scheduled week for the league, or null. No auth required (service role read). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('weeks')
    .select('id, week, date')
    .eq('game_id', id)
    .eq('status', 'scheduled')
    .order('week', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ week: data ?? null })
}
