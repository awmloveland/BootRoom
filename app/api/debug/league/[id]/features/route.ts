import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

/** Temporary debug endpoint — reads raw DB state via service role */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('league_features')
    .select('feature, enabled, config, public_enabled, public_config, updated_at')
    .eq('game_id', id)
    .order('feature')
  return NextResponse.json({ data, error })
}
