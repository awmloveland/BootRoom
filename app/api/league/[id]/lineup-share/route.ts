import { NextResponse } from 'next/server'
import { getAuthAndRole, getFeatures, getGame } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { canSeeNextLineup, isFeatureEnabled } from '@/lib/features'
import { getShareSecret, lineupShareUrl, signLineupToken } from '@/lib/lineupShare'

function noLink() {
  return NextResponse.json({ url: null })
}

/**
 * POST — signs a share link for one of the league's scheduled lineups so its
 * link preview can show the teams. Returns { url: null } when the viewer
 * can't see the lineup, the feature is off for them, or signing isn't
 * configured; the card then shares the plain league link.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { weekId?: unknown } | null
  const weekId = typeof body?.weekId === 'string' ? body.weekId : ''
  if (!weekId) return NextResponse.json({ error: 'weekId is required' }, { status: 400 })

  const secret = getShareSecret()
  if (!secret) return noLink()

  const [game, { userRole }, features] = await Promise.all([
    getGame(id),
    getAuthAndRole(id),
    getFeatures(id),
  ])
  if (!game?.slug) return noLink()

  const tier = resolveVisibilityTier(userRole)
  if (!isFeatureEnabled(features, 'lineup_share_image', tier) || !canSeeNextLineup(features, tier)) {
    return noLink()
  }

  const { data: week } = await createServiceClient()
    .from('weeks')
    .select('id, status, team_a, team_b')
    .eq('id', weekId)
    .eq('game_id', id)
    .maybeSingle()
  const teamA: string[] = week?.team_a ?? []
  const teamB: string[] = week?.team_b ?? []
  if (!week || week.status !== 'scheduled' || teamA.length === 0 || teamB.length === 0) return noLink()

  const token = signLineupToken(secret, week.id, { teamA, teamB })
  return NextResponse.json({ url: lineupShareUrl(game.slug, token) })
}
