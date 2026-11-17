import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { getAuthAndRole, getGameBySlug, getWeeks } from '@/lib/fetchers'
import { createServiceClient } from '@/lib/supabase/service'
import { dayNameToIndex, getPlayedWeeks, isSetupOver } from '@/lib/dates'
import { leagueLandingPath, VIEWPORT_COOKIE } from '@/lib/utils'
import { NEW_VISITOR_COOKIE } from './StepShell'
import { ResultsStep } from './ResultsStep'
import { latestPlayedMatchDay } from './confidence'
import type { DraftGame } from './ImportGameModal'

/** The past results step. Admins only, and only until the league has played a game. */
export async function ResultsScreen({ slug }: { slug: string }) {
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const { userRole } = await getAuthAndRole(game.id)
  const weeks = await getWeeks(game.id)
  // An import renumbers every week of the league: fine during setup, not for a league that has played.
  if ((userRole !== 'creator' && userRole !== 'admin') || isSetupOver(weeks, game.created_at)) {
    redirect(leagueLandingPath(slug, (await headers()).get('user-agent'), (await cookies()).get(VIEWPORT_COOKIE)?.value))
  }

  const { data: roster } = await createServiceClient().from('player_attributes').select('name').eq('game_id', game.id).order('name')
  // Already in the league, from an earlier visit or Back from Live: listed, counted, not re-imported.
  const imported: DraftGame[] = getPlayedWeeks(weeks).map((w) => ({
    id: w.id ?? w.date, date: w.date, teamA: w.teamA, teamB: w.teamB, winner: w.winner, goalDifference: w.goal_difference ?? 0,
  }))
  // The date stepper's upper bound.
  const latestMatchDay = latestPlayedMatchDay(dayNameToIndex(game.day), game.kickoff_time)
  const stepOffset = (await cookies()).get(NEW_VISITOR_COOKIE) ? 1 : 0

  return <ResultsStep leagueId={game.id} slug={slug} roster={(roster ?? []).map((r) => r.name as string)} imported={imported} latestMatchDay={latestMatchDay} stepOffset={stepOffset} />
}
