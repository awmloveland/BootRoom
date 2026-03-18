// app/page.tsx
export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Signed-in: show their leagues
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

    return (
      <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-100 mb-6">Your leagues</h1>
        {leagues.length === 0 ? (
          <p className="text-slate-400 text-sm">You&apos;re not in any leagues yet.</p>
        ) : (
          <div className="space-y-2">
            {leagues.map((league) => (
              <Link
                key={league.id}
                href={`/${league.id}/results`}
                className="block p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
              >
                <p className="text-sm font-medium text-slate-200">{league.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 capitalize">{league.role}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    )
  }

  // Unauthenticated: show public league directory
  const service = createServiceClient()

  // Only list leagues where at least one feature is both globally available
  // AND publicly enabled by the league admin
  const [experimentsRes, publicLeaguesRes] = await Promise.all([
    service.from('feature_experiments').select('feature').eq('available', true),
    service.from('league_features').select('game_id, feature, games(id, name)').eq('public_enabled', true),
  ])

  const globallyAvailable = new Set((experimentsRes.data ?? []).map((e) => e.feature))
  const publicLeagues = (publicLeaguesRes.data ?? []).filter((row) => globallyAvailable.has(row.feature))

  // Deduplicate by game_id
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
    <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-100 mb-6">Leagues</h1>
      {directory.length === 0 ? (
        <p className="text-slate-400 text-sm">No public leagues yet.</p>
      ) : (
        <div className="space-y-2">
          {directory.map((league) => (
            <Link
              key={league.id}
              href={`/${league.id}/results`}
              className="block p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <p className="text-sm font-medium text-slate-200">{league.name}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
