import { NextResponse } from 'next/server'
import { getGame } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { UUID_RE, getShareSecret, lineupShareUrl, signLineupToken } from '@/lib/shareLinks'

function noLink() {
  return NextResponse.json({ url: null })
}

/**
 * POST — signs a share link for one of the league's scheduled lineups so its
 * link preview can show the teams. Line-ups are public, so anyone can ask.
 * Returns { url: null } when the week isn't a scheduled line-up of this
 * league or signing isn't configured; the card then shares the plain league
 * link.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = (await request.json().catch(() => null)) as { weekId?: unknown } | null
  const weekId = typeof body?.weekId === 'string' ? body.weekId : ''
  if (!UUID_RE.test(weekId)) return NextResponse.json({ error: 'weekId is required' }, { status: 400 })

  const secret = getShareSecret()
  if (!secret) return noLink()

  const game = await getGame(id)
  if (!game?.slug) return noLink()

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
