'use client'

import { useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import type { LeagueFeature } from '@/lib/types'

interface StatsSidebarCardProps {
  leagueId: string
  feature: LeagueFeature
  onChanged: () => void
}

export function StatsSidebarCard({ leagueId, feature, onChanged }: StatsSidebarCardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function updateFeature(updated: LeagueFeature) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updated),
      })
      if (!res.ok) throw new Error('Failed to save')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
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
        <div className="text-sm font-semibold text-slate-100">Stats Sidebar</div>
        <div className="text-xs text-slate-500 mt-0.5">
          Live stats widgets shown alongside match results and player pages.
        </div>
      </div>
      <div className="px-4">
        <div className="flex items-center justify-between py-2.5">
          <div>
            <span className="text-sm text-slate-300">Public</span>
            <span className="text-xs text-slate-500 ml-2">visible to anyone with the league link</span>
          </div>
          <Toggle
            enabled={feature.public_enabled}
            onChange={(val) => updateFeature({ ...feature, public_enabled: val })}
            disabled={saving}
          />
        </div>
      </div>
      {error && <div className="px-4 pb-3 text-xs text-red-400">{error}</div>}
      {saved && <div className="px-4 pb-3 text-xs text-sky-400">Saved</div>}
    </div>
  )
}
