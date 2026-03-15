export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { PublicHeader } from '@/components/PublicHeader'
import { PublicMatchList } from '@/components/PublicMatchList'
import { PublicMatchEntrySection } from '@/components/PublicMatchEntrySection'
import { sortWeeks } from '@/lib/utils'
import type { Week, FeatureKey } from '@/lib/types'
import type { ScheduledWeek } from '@/components/NextMatchCard'

interface Props {
  params: Promise<{ id: string }>
}

export default async function PublicResultsPage({ params }: Props) {
  const { id } = await params

  const publicSupabase = createPublicClient()

  const { data: game } = await publicSupabase
    .from('games')
    .select('id, name, public_results_enabled')
    .eq('id', id)
    .maybeSingle()

  if (!game || !game.public_results_enabled) notFound()

  // Use the service role to fetch data — bypasses anon RLS restrictions.
  // Safe because we already confirmed public_results_enabled = true above.
  const serviceSupabase = createServiceClient()

  // Fetch weeks and feature flags in parallel
  const [weeksResult, featuresResult] = await Promise.all([
    serviceSupabase
      .from('weeks')
      .select('week, date, status, format, team_a, team_b, winner, notes')
      .eq('game_id', id)
      .in('status', ['played', 'cancelled'])
      .order('week', { ascending: false }),
    serviceSupabase
      .from('league_features')
      .select('*')
      .eq('game_id', id)
      .eq('public_enabled', true),
  ])

  type PublicWeekRow = {
    week: number; date: string; status: string; format: string | null;
    team_a: string[] | null; team_b: string[] | null; winner: string | null; notes: string | null;
  }
  const weeks: Week[] = sortWeeks(
    (weeksResult.data as PublicWeekRow[] ?? []).map((row) => ({
      week: row.week,
      date: row.date,
      status: row.status as Week['status'],
      format: row.format ?? undefined,
      teamA: row.team_a ?? [],
      teamB: row.team_b ?? [],
      winner: row.winner as Week['winner'] ?? null,
      notes: row.notes ?? undefined,
    }))
  )

  // Build a map of features that have public_enabled = true
  if (featuresResult.error) {
    console.error('[public/results] league_features query error:', featuresResult.error)
  }
  const dbPublicFeatures = featuresResult.data ?? []
  console.log('[public/results] public features:', dbPublicFeatures.map((f) => f.feature))
  function isPublic(key: FeatureKey): boolean {
    return dbPublicFeatures.some((f) => f.feature === key && f.public_enabled)
  }
  // Conditionally find next scheduled week for match_entry section
  let nextWeek: ScheduledWeek | null = null
  if (isPublic('match_entry')) {
    const { data: scheduledRows } = await serviceSupabase
      .from('weeks')
      .select('id, week, date, format, team_a, team_b')
      .eq('game_id', id)
      .eq('status', 'scheduled')
      .order('week', { ascending: true })
      .limit(1)
    if (scheduledRows && scheduledRows.length > 0) {
      const row = scheduledRows[0]
      nextWeek = {
        id: row.id as string,
        week: row.week,
        date: row.date,
        format: row.format ?? null,
        teamA: (row.team_a as string[]) ?? [],
        teamB: (row.team_b as string[]) ?? [],
      }
    }
  }

  let isAuthenticated = false
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    isAuthenticated = !!user
  } catch {
    // treat as unauthenticated
  }

  const playedCount = weeks.filter((w) => w.status === 'played').length

  return (
    <div className="min-h-screen bg-slate-900">
      <PublicHeader
        leagueName={game.name}
        leagueId={id}
        isAuthenticated={isAuthenticated}
        currentPage="results"
        showPlayersNav={isPublic('player_stats')}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4 space-y-8">

        {/* Next match — full interactive card for public when match_entry is enabled */}
        {isPublic('match_entry') && (
          <PublicMatchEntrySection
            gameId={id}
            weeks={weeks}
            initialScheduledWeek={nextWeek}
          />
        )}

        {/* Match history — only shown when match_history is public */}
        {isPublic('match_history') && (
          <section>
            <div className="mb-4 pb-3 border-b border-slate-800">
              <p className="text-xs text-slate-500">
                Public results · {game.name} · {playedCount} matches played
              </p>
            </div>
            <PublicMatchList weeks={weeks} />
          </section>
        )}

        {!isPublic('match_history') && !isPublic('player_stats') && !isPublic('match_entry') && (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">Nothing to show here yet.</p>
            {!isAuthenticated && (
              <p className="text-xs text-slate-600 mt-2">
                Sign in for full access to your league.
              </p>
            )}
          </div>
        )}

        {(isPublic('match_history') || isPublic('player_stats') || isPublic('match_entry')) && !isAuthenticated && (
          <p className="text-xs text-slate-600 text-center pb-4">
            Sign in for full access to your league.
          </p>
        )}
      </main>
    </div>
  )
}
