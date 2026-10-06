import { NextResponse } from 'next/server'
import { getAuthAndRole, getFeatures, getGame, getWeeks } from '@/lib/fetchers'
import { resolveVisibilityTier } from '@/lib/roles'
import { canSeeQuarterChampion, canSeeResults } from '@/lib/features'
import { UUID_RE, getShareSecret } from '@/lib/shareLinks'
import { quarterShareUrls, resultShareUrlFor } from '@/lib/shareLinksServer'
import { getCelebratedQuarters } from '@/lib/sidebar-stats'
import { quarterShareKey } from '@/lib/utils'
import type { ShareLinkRequest } from '@/lib/types'

function noLink() {
  return NextResponse.json({ url: null })
}

function parseRequest(body: unknown): ShareLinkRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (b.kind === 'result') {
    return typeof b.weekId === 'string' && UUID_RE.test(b.weekId) ? { kind: 'result', weekId: b.weekId } : null
  }
  if (b.kind === 'quarter') {
    const { year, q } = b
    const validYear = typeof year === 'number' && Number.isInteger(year) && year >= 1000 && year <= 9999
    const validQ = typeof q === 'number' && Number.isInteger(q) && q >= 1 && q <= 4
    return validYear && validQ ? { kind: 'quarter', year, q } : null
  }
  return null
}

/**
 * POST — signs a share link for a result or completed quarter the result
 * modal has just saved, so its preview can show it. Returns { url: null }
 * when the viewer can't see it, it isn't shareable yet, or signing isn't
 * configured; the modal then shares the plain link.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const req = parseRequest(await request.json().catch(() => null))
  if (!req) return NextResponse.json({ error: 'Invalid share link request' }, { status: 400 })
  if (!getShareSecret() || !UUID_RE.test(id)) return noLink()

  const [game, { userRole }, features] = await Promise.all([getGame(id), getAuthAndRole(id), getFeatures(id)])
  if (!game?.slug) return noLink()
  const tier = resolveVisibilityTier(userRole)

  if (req.kind === 'result') {
    if (!canSeeResults(features, tier)) return noLink()
    // getWeeks is scoped to this league, so a week from elsewhere is never found.
    const week = (await getWeeks(id)).find((w) => w.id === req.weekId)
    return NextResponse.json({ url: resultShareUrlFor(game.slug, week) })
  }

  if (!canSeeQuarterChampion(features, tier)) return noLink()
  const quarter = getCelebratedQuarters(await getWeeks(id)).find((s) => s.year === req.year && s.q === req.q)
  if (!quarter) return noLink()
  return NextResponse.json({ url: quarterShareUrls(game.slug, id, [quarter])[quarterShareKey(quarter)] ?? null })
}
