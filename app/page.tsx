// app/page.tsx
export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_IDX: Record<string, number> = Object.fromEntries(MONTH_SHORT.map((m, i) => [m, i]))

function parseWeekDate(date: string): Date {
  const [d, m, y] = date.split(' ')
  return new Date(parseInt(y), MONTH_IDX[m], parseInt(d))
}

function formatWeekDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  return `${d} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

function formatDisplayDate(weekDateStr: string): string {
  const date = parseWeekDate(weekDateStr)
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * Compute the next match date for a league's home page card.
 * - If a scheduled (lineup-set) week exists, use its date.
 * - Otherwise, derive the recurring day-of-week from recent played weeks
 *   and find the next upcoming occurrence.
 * - Skip any cancelled dates, advancing by 7 days each time.
 */
function computeNextMatchDate(
  scheduledDate: string | null,
  lastPlayedDate: string | null,
  cancelledDates: Set<string>,
): string | null {
  let candidate: Date

  if (scheduledDate) {
    candidate = parseWeekDate(scheduledDate)
  } else if (lastPlayedDate) {
    const lastDate = parseWeekDate(lastPlayedDate)
    const dow = lastDate.getDay()
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    let daysUntil = (dow - today.getDay() + 7) % 7
    if (daysUntil === 0) daysUntil = 7
    candidate = new Date(today)
    candidate.setDate(today.getDate() + daysUntil)
  } else {
    return null
  }

  // Skip cancelled dates (up to 8 weeks ahead)
  for (let i = 0; i < 8; i++) {
    const dateStr = formatWeekDate(candidate)
    if (!cancelledDates.has(dateStr)) break
    candidate.setDate(candidate.getDate() + 7)
  }

  return formatWeekDate(candidate)
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: memberships } = await supabase
      .from('game_members')
      .select('game_id, role, games(id, name)')
      .eq('user_id', user.id)

    const leagues = (memberships ?? []).map((m) => {
      const game = (m.games as unknown as { id: string; name: string } | null)
      return {
        id: game?.id ?? '',
        name: game?.name ?? '',
        role: m.role,
      }
    })

    const validLeagues = leagues.filter((l) => l.id)
    if (validLeagues.length === 1) {
      redirect(`/${validLeagues[0].id}/results`)
    }

    const service = createServiceClient()
    const gameIds = validLeagues.map((l) => l.id)

    // Batch-fetch all relevant weeks for these leagues in 2 queries
    const [scheduledRes, playedRes, cancelledRes] = await Promise.all([
      service
        .from('weeks')
        .select('game_id, date')
        .in('game_id', gameIds)
        .eq('status', 'scheduled')
        .order('week', { ascending: true }),
      service
        .from('weeks')
        .select('game_id, date')
        .in('game_id', gameIds)
        .eq('status', 'played')
        .order('week', { ascending: false }),
      service
        .from('weeks')
        .select('game_id, date')
        .in('game_id', gameIds)
        .eq('status', 'cancelled'),
    ])

    // First scheduled date per league
    const scheduledByLeague: Record<string, string> = {}
    for (const row of scheduledRes.data ?? []) {
      if (!scheduledByLeague[row.game_id]) scheduledByLeague[row.game_id] = row.date
    }

    // Most recent played date per league
    const lastPlayedByLeague: Record<string, string> = {}
    for (const row of playedRes.data ?? []) {
      if (!lastPlayedByLeague[row.game_id]) lastPlayedByLeague[row.game_id] = row.date
    }

    // Set of cancelled dates per league
    const cancelledByLeague: Record<string, Set<string>> = {}
    for (const row of cancelledRes.data ?? []) {
      if (!cancelledByLeague[row.game_id]) cancelledByLeague[row.game_id] = new Set()
      cancelledByLeague[row.game_id].add(row.date)
    }

    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-100 mb-6">Your leagues</h1>
        {leagues.length === 0 ? (
          <p className="text-slate-400 text-sm">You&apos;re not in any leagues yet.</p>
        ) : (
          <div className="space-y-2">
            {leagues.map((league) => {
              const nextDate = computeNextMatchDate(
                scheduledByLeague[league.id] ?? null,
                lastPlayedByLeague[league.id] ?? null,
                cancelledByLeague[league.id] ?? new Set(),
              )
              return (
                <Link
                  key={league.id}
                  href={`/${league.id}/results`}
                  className="flex items-center justify-between p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-100">{league.name}</p>
                    {nextDate ? (
                      <p className="text-xs text-slate-400 mt-1.5">Next match {formatDisplayDate(nextDate)}</p>
                    ) : (
                      <p className="text-xs text-slate-400 mt-1.5">No upcoming match</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 ml-4" />
                </Link>
              )
            })}
          </div>
        )}
      </main>
    )
  }

  // Unauthenticated: show public league directory
  const service = createServiceClient()

  const [experimentsRes, publicLeaguesRes] = await Promise.all([
    service.from('feature_experiments').select('feature').eq('available', true),
    service.from('league_features').select('game_id, feature, games(id, name)').eq('public_enabled', true),
  ])

  const globallyAvailable = experimentsRes.error
    ? null
    : new Set((experimentsRes.data ?? []).map((e) => e.feature))
  const publicLeagues = (publicLeaguesRes.data ?? []).filter(
    (row) => globallyAvailable === null || globallyAvailable.has(row.feature)
  )

  const seen = new Set<string>()
  const directory = (publicLeagues ?? [])
    .filter((row) => {
      const game = (row.games as unknown as { id: string } | null)
      const id = game?.id
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
    .map((row) => {
      const game = (row.games as unknown as { id: string; name: string } | null)
      return {
        id: game?.id ?? '',
        name: game?.name ?? '',
      }
    })

  return (
    <main className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-100 mb-6">Leagues</h1>
      {directory.length === 0 ? (
        <p className="text-slate-400 text-sm">No public leagues yet.</p>
      ) : (
        <div className="space-y-2">
          {directory.map((league) => (
            <Link
              key={league.id}
              href={`/${league.id}/results`}
              className="flex items-center justify-between p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <p className="text-sm font-medium text-slate-100">{league.name}</p>
              <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 ml-4" />
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
