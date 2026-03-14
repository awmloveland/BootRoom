import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase/public'
import { createClient } from '@/lib/supabase/server'
import { PublicHeader } from '@/components/PublicHeader'
import { PublicMatchList } from '@/components/PublicMatchList'
import bootRoomData from '@/data/boot_room.json'
import { sortWeeks } from '@/lib/utils'
import type { Week } from '@/lib/types'

const LEGACY_BOOT_ROOM_ID = '00000000-0000-0000-0000-000000000001'

interface Props {
  params: Promise<{ id: string }>
}

export default async function PublicResultsPage({ params }: Props) {
  const { id } = await params
  const isLegacy = id === LEGACY_BOOT_ROOM_ID

  // Check if this league has public results enabled (anon client)
  const publicSupabase = createPublicClient()

  let gameName = ''
  let weeks: Week[] = []

  if (isLegacy) {
    // Legacy Boot Room: data lives in static JSON, not Supabase weeks table.
    // Still check public_results_enabled via the authenticated client (service role reads game row).
    const authSupabase = await createClient()
    const { data: game } = await authSupabase
      .from('games')
      .select('name, public_results_enabled')
      .eq('id', id)
      .maybeSingle()

    if (!game || !game.public_results_enabled) notFound()

    gameName = game.name
    const raw = (bootRoomData.weeks ?? []) as Week[]
    weeks = sortWeeks(raw.filter((w) => (w.status as string) !== 'scheduled'))
  } else {
    const { data: game } = await publicSupabase
      .from('games')
      .select('id, name, public_results_enabled')
      .eq('id', id)
      .maybeSingle()

    if (!game || !game.public_results_enabled) notFound()

    gameName = game.name

    const { data: weeksRaw } = await publicSupabase
      .from('weeks')
      .select('week, date, status, format, team_a, team_b, winner, notes')
      .eq('game_id', id)
      .in('status', ['played', 'cancelled'])
      .order('week', { ascending: false })

    weeks = (weeksRaw ?? []).map((row) => ({
      week: row.week,
      date: row.date,
      status: row.status,
      format: row.format ?? undefined,
      teamA: row.team_a ?? [],
      teamB: row.team_b ?? [],
      winner: row.winner ?? null,
      notes: row.notes ?? undefined,
    }))
  }

  // Check if the visitor is already authenticated (server-side, no redirects)
  let isAuthenticated = false
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    isAuthenticated = !!user
  } catch {
    // If Supabase env not configured (e.g. SSG), treat as unauthenticated
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <PublicHeader
        leagueName={gameName}
        leagueId={id}
        isAuthenticated={isAuthenticated}
      />
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
        <div className="mb-4 pb-3 border-b border-slate-800">
          <p className="text-xs text-slate-500">
            Public results · {gameName} · {weeks.filter((w) => w.status === 'played').length} matches played
          </p>
        </div>
        <PublicMatchList weeks={weeks} />
      </main>
    </div>
  )
}
