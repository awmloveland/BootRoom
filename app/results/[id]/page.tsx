import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { createClient } from '@/lib/supabase/server'
import { PublicHeader } from '@/components/PublicHeader'
import { PublicMatchList } from '@/components/PublicMatchList'
import { sortWeeks } from '@/lib/utils'
import type { Week } from '@/lib/types'

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

  const { data: weeksRaw } = await publicSupabase
    .rpc('get_public_weeks', { p_game_id: id })

  type PublicWeekRow = {
    week: number; date: string; status: string; format: string | null;
    team_a: string[] | null; team_b: string[] | null; winner: string | null; notes: string | null;
  }
  const weeks: Week[] = sortWeeks(
    (weeksRaw as PublicWeekRow[] ?? []).map((row) => ({
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

  let isAuthenticated = false
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    isAuthenticated = !!user
  } catch {
    // treat as unauthenticated
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <PublicHeader
        leagueName={game.name}
        leagueId={id}
        isAuthenticated={isAuthenticated}
      />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <div className="mb-4 pb-3 border-b border-slate-800">
          <p className="text-xs text-slate-500">
            Public results · {game.name} · {weeks.filter((w) => w.status === 'played').length} matches played
          </p>
        </div>
        <PublicMatchList weeks={weeks} />
      </main>
    </div>
  )
}
