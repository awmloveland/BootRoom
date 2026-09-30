// app/experiments/page.tsx
// Middleware already guards this route — only developers reach this page.
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { FeatureKey } from '@/lib/types'

const FEATURE_LABELS: Record<FeatureKey, string> = {
  match_history:       'Match History',
  match_entry:         'Match Entry',
  player_stats:        'Player Stats',
  player_comparison:   'Player Comparison',
  quarter_celebration: 'Quarter Celebration',
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
      <h1 className="text-xl font-semibold text-[#f4f9ff] mb-2">Experiments</h1>
      <p className="text-sm text-[#8ba4c4] mb-6">
        Global feature availability. Turning a feature off removes it from all leagues immediately.
      </p>

      {loading ? (
        <p className="text-[#8ba4c4] text-sm">Loading…</p>
      ) : (
        <div className="space-y-2">
          {experiments.map((exp) => (
            <div
              key={exp.feature}
              className="flex items-center justify-between p-4 rounded-xl bg-[#0a1421] border border-[#1b2c46]"
            >
              <div>
                <p className="text-sm font-medium text-[#dff1ff]">
                  {FEATURE_LABELS[exp.feature] ?? exp.feature}
                </p>
                <p className="text-xs text-[#6f88a8] mt-0.5">Ship to all leagues</p>
              </div>
              <button
                onClick={() => toggle(exp.feature, exp.available)}
                disabled={toggling === exp.feature}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 disabled:opacity-50',
                  exp.available ? 'bg-[#38bdf8]' : 'bg-[#223a5c]',
                )}
                role="switch"
                aria-checked={exp.available}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full transition-transform duration-200',
                    exp.available ? 'translate-x-4 bg-[#05101d]' : 'translate-x-0 bg-[#8ba4c4]',
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
