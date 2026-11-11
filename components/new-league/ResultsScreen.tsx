import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getAuthAndRole, getGameBySlug } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { dayNameToIndex, formatWeekDate, getMostRecentExpectedGameDate, leagueNow } from '@/lib/dates'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'
import { NEW_VISITOR_COOKIE } from './StepShell'
import { ResultsStep } from './ResultsStep'

/** The past results step. Admins only. */
export async function ResultsScreen({ slug }: { slug: string }) {
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const { userRole } = await getAuthAndRole(game.id)
  if (userRole !== 'creator' && userRole !== 'admin') {
    redirect(leagueLandingPath(slug, (await headers()).get('user-agent'), (await cookies()).get(VIEWPORT_COOKIE)?.value))
  }

  const { data: roster } = await createServiceClient().from('player_attributes').select('name').eq('game_id', game.id).order('name')
  const dayIndex = dayNameToIndex(game.day)
  // The stepper's upper bound: the league's last match day up to today, or today without a match day.
  const latestMatchDay = (dayIndex === null ? null : getMostRecentExpectedGameDate([], dayIndex)) ?? formatWeekDate(leagueNow())
  const stepOffset = (await cookies()).get(NEW_VISITOR_COOKIE) ? 1 : 0

  return <ResultsStep leagueId={game.id} slug={slug} roster={(roster ?? []).map((r) => r.name as string)} latestMatchDay={latestMatchDay} stepOffset={stepOffset} />
}
