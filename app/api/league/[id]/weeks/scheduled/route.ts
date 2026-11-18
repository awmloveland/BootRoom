import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'
import { dbErrorResponse } from '@/lib/apiAuth'

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
    // Week numbers restart each season, so order by season first.
    .order('season', { ascending: true })
    .order('week', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) return dbErrorResponse(error, 'Could not load the next game. Try again.')
  return NextResponse.json({ week: data ?? null })
}
