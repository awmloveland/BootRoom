// app/api/experiments/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { FeatureKey } from '@/lib/types'

/** GET — returns all feature_experiments rows. Any authenticated user can read. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('feature_experiments')
    .select('feature, available, updated_at')
    .order('feature')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/** PATCH — update availability for one feature. Developer only. */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check developer role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'developer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json() as { feature: FeatureKey; available: boolean }
  if (!body.feature || typeof body.available !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body: feature and available required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('feature_experiments')
    .update({ available: body.available, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('feature', body.feature)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
