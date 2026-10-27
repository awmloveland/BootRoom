// components/new-league/RosterScreen.tsx
import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getAuthAndRole, getGameBySlug } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'
import { RosterWizard } from './RosterWizard'

/** The roster steps. Admins only; the viewer's player comes from their approved claim. */
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
    service.from('player_attributes').select('name').eq('game_id', game.id),
  ])
  const you = (claim?.admin_override_name as string | null) ?? (claim?.player_name as string | undefined)
  // Every league created through /new gives its creator a claim; without one there is no fixed row.
  if (!you) redirect(`/new/${slug}/live`)

  const existingNames = (roster ?? []).map((r) => r.name as string).filter((n) => n !== you)
  return <RosterWizard leagueId={game.id} slug={slug} you={you} existingNames={existingNames} />
}
