import Link from 'next/link'

export default function WebsitePage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-700">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
          <h1 className="text-2xl font-bold">Craft Football</h1>
          <p className="text-slate-400 mt-1">The Boot Room 5-a-side league</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-16">
        <div className="prose prose-invert max-w-none">
          <h2 className="text-xl font-semibold text-slate-100 mb-4">
            Match history & player stats
          </h2>
          <p className="text-slate-400 mb-8">
            Browse results, team lineups, and player stats for The Boot Room league.
          </p>

          <a
            href="https://m.craft-football.com"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
          >
            Open app
            <span aria-hidden>→</span>
          </a>
        </div>
      </main>
    </div>
  )
}
