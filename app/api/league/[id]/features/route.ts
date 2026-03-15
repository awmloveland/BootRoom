import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { FeatureKey } from '@/lib/types'

const DEFAULT_FEATURES: {
  feature: FeatureKey
  enabled: boolean
  config: object | null
  public_enabled: boolean
  public_config: object | null
}[] = [
  { feature: 'match_history',     enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'match_entry',       enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'team_builder',      enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'player_stats',      enabled: true,  config: { max_players: null, visible_stats: ['played','won','drew','lost','winRate','recentForm'] }, public_enabled: false, public_config: null },
  { feature: 'player_comparison', enabled: false, config: null, public_enabled: false, public_config: null },
]

/** GET — returns feature flags for a league. Any member can read. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Note: must use select('*') — narrow column selection causes PostgREST to
  // silently return null for the newly-added public_config JSONB column.
  const { data, error } = await supabase
    .from('league_features')
    .select('*')
    .eq('game_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Merge with defaults so missing rows don't break the UI
  const featureMap = Object.fromEntries((data ?? []).map((f) => [f.feature, f]))
  const features = DEFAULT_FEATURES.map((def) => featureMap[def.feature] ?? def)

  return NextResponse.json(features)
}

/** PATCH — update one or more feature flags. Admin only. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const updates: {
    feature: FeatureKey
    enabled: boolean
    config?: object | null
    public_enabled: boolean
    public_config?: object | null
  }[] = Array.isArray(body) ? body : [body]

  const rows = updates.map((u) => ({
    game_id: id,
    feature: u.feature,
    enabled: u.enabled,
    config: u.config ?? null,
    public_enabled: u.public_enabled,
    public_config: u.public_config ?? null,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase
    .from('league_features')
    .upsert(rows, { onConflict: 'game_id,feature' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
