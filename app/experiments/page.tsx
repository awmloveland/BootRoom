// app/experiments/page.tsx
// Middleware already guards this route — only developers reach this page.
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { FeatureKey } from '@/lib/types'

const FEATURE_LABELS: Record<FeatureKey, string> = {
  match_history:     'Match History',
  match_entry:       'Match Entry',
  player_stats:      'Player Stats',
  player_comparison: 'Player Comparison',
  stats_sidebar:     'Stats Sidebar',
}

interface Experiment {
  feature: FeatureKey
  available: boolean
  updated_at: string
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/experiments', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setExperiments(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  async function toggle(feature: FeatureKey, current: boolean) {
    setToggling(feature)
    try {
      const res = await fetch('/api/experiments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, available: !current }),
        credentials: 'include',
      })
      if (res.ok) {
        setExperiments((prev) =>
          prev.map((e) => e.feature === feature ? { ...e, available: !current } : e)
        )
      }
    } finally {
      setToggling(null)
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-100 mb-2">Experiments</h1>
      <p className="text-sm text-slate-400 mb-6">
        Global feature availability. Turning a feature off removes it from all leagues immediately.
      </p>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : (
        <div className="space-y-2">
          {experiments.map((exp) => (
            <div
              key={exp.feature}
              className="flex items-center justify-between p-4 rounded-lg bg-slate-800 border border-slate-700"
            >
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {FEATURE_LABELS[exp.feature] ?? exp.feature}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Ship to all leagues</p>
              </div>
              <button
                onClick={() => toggle(exp.feature, exp.available)}
                disabled={toggling === exp.feature}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 disabled:opacity-50',
                  exp.available ? 'bg-sky-600' : 'bg-slate-600',
                )}
                role="switch"
                aria-checked={exp.available}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
                    exp.available ? 'translate-x-4' : 'translate-x-0',
                  )}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
