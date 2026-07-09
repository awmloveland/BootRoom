'use client'

import { useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import type { LeagueFeature } from '@/lib/types'

interface QuarterCelebrationCardProps {
  leagueId: string
  feature: LeagueFeature
  onChanged: () => void
}

export function QuarterCelebrationCard({ leagueId, feature, onChanged }: QuarterCelebrationCardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function update(patch: { enabled?: boolean; public_enabled?: boolean }) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...feature, ...patch }),
      })
      if (!res.ok) throw new Error('Failed to save')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-slate-700/60">
        <div className="text-sm font-semibold text-slate-100">Quarter Celebration</div>
        <div className="text-xs text-slate-500 mt-0.5">
          Show the champion + awards card on the Results tab when a quarter wraps.
          Admins always see it; choose who else does.
        </div>
      </div>
      <div className="rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/60 border-b border-slate-700/60">
          <span className="text-sm text-slate-300">Members</span>
          <Toggle enabled={feature.enabled} onChange={(v) => update({ enabled: v })} disabled={saving} />
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/60">
          <span className="text-sm text-slate-300">Public</span>
          <Toggle enabled={feature.public_enabled} onChange={(v) => update({ public_enabled: v })} disabled={saving} />
        </div>
      </div>
      {error && <div className="px-4 py-2 text-xs text-red-400">{error}</div>}
    </div>
  )
}
