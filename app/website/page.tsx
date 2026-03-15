import Link from 'next/link'
import { createPublicClient } from '@/lib/supabase/public'

export const dynamic = 'force-dynamic'

async function getPublicLeagues() {
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('games')
    .select('id, name')
    .eq('public_results_enabled', true)
    .order('name')
  return data ?? []
}

export default async function WebsitePage() {
  const leagues = await getPublicLeagues()

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700 h-14 flex items-center">
        <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 flex items-center justify-between">
          <span className="text-xl font-bold text-slate-100">⚽ Craft Football</span>
          <nav className="flex items-center gap-6">
            <Link
              href="/sign-in"
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/sign-in?mode=signup"
              className="text-sm text-slate-400 hover:text-slate-100 transition-colors"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-100">Leagues</h2>
          <p className="text-sm text-slate-400 mt-1">
            Select a league to view results and player stats.
          </p>
        </div>

        {leagues.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-500">No public leagues yet.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {leagues.map((league) => (
              <Link
                key={league.id}
                href={`/results/${league.id}`}
                className="flex items-center justify-between px-4 py-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-500 transition-colors group"
              >
                <span className="text-sm font-medium text-slate-100 group-hover:text-white transition-colors">
                  {league.name}
                </span>
                <span className="text-slate-500 group-hover:text-slate-300 transition-colors text-sm">
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
