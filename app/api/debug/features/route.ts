import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('league_features')
    .select('*')
    .eq('game_id', '9cf13e81-4382-428b-a4ec-c94cb8e2567e')
    .eq('feature', 'player_stats')
    .maybeSingle()
  return NextResponse.json(data)
}
