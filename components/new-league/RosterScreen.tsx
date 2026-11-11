// components/new-league/RosterScreen.tsx
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getAuthAndRole, getGameBySlug } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { ratingToStrength } from '@/lib/strength'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'
import type { Mentality } from '@/lib/types'
import { RosterWizard, type RosterPlayer } from './RosterWizard'

/**
 * The roster steps. Admins only. Seeds the wizard with whatever is already
 * saved, so coming back from Live (or a refresh after saving) shows the list
 * rather than an empty one; the viewer's own player comes from their claim.
 */
export async function RosterScreen({ slug }: { slug: string }) {
  const game = await getGameBySlug(slug)
  if (!game) notFound()

  const { user, userRole } = await getAuthAndRole(game.id)
  if (!user || (userRole !== 'creator' && userRole !== 'admin')) {
    redirect(leagueLandingPath(slug, (await headers()).get('user-agent'), (await cookies()).get(VIEWPORT_COOKIE)?.value))
  }

  const service = createServiceClient()
  const [{ data: claim }, { data: roster }] = await Promise.all([
    service.from('player_claims').select('player_name, admin_override_name').eq('game_id', game.id).eq('user_id', user.id).eq('status', 'approved').maybeSingle(),
    service.from('player_attributes').select('name, rating, mentality').eq('game_id', game.id).order('name'),
  ])
  const you = (claim?.admin_override_name as string | null) ?? (claim?.player_name as string | undefined)
  // Every league created through /new gives its creator a claim; without one there is no fixed row.
  if (!you) redirect(`/new/${slug}/live`)

  // Names are unique per league, so they serve as row ids; new rows get UUIDs.
  const saved: RosterPlayer[] = (roster ?? []).map((r) => ({
    id: r.name as string,
    name: r.name as string,
    you: r.name === you,
    mentality: r.mentality as Mentality,
    strength: ratingToStrength(Number(r.rating)) ?? 'average',
  }))
  const initial = [...saved.filter((p) => p.you), ...saved.filter((p) => !p.you)]
  return <RosterWizard leagueId={game.id} slug={slug} initial={initial} />
}
