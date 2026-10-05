'use client'

import { useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import type { LeagueFeature } from '@/lib/types'

interface FeatureToggleCardProps {
  leagueId: string
  feature: LeagueFeature
  title: string
  description: string
  onChanged: () => void
}

/** Members / Public on-off card for a feature with no extra config. */
export function FeatureToggleCard({ leagueId, feature, title, description, onChanged }: FeatureToggleCardProps) {
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
    <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-[#1b2c46]">
        <div className="text-sm font-semibold text-[#f4f9ff]">{title}</div>
        <div className="text-xs text-[#6f88a8] mt-0.5">{description}</div>
      </div>
      <div className="rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0c1728] border-b border-[#1b2c46]">
          <span className="text-sm text-[#cfe0f4]">Members</span>
          <Toggle enabled={feature.enabled} onChange={(v) => update({ enabled: v })} disabled={saving} />
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0c1728]">
          <span className="text-sm text-[#cfe0f4]">Public</span>
          <Toggle enabled={feature.public_enabled} onChange={(v) => update({ public_enabled: v })} disabled={saving} />
        </div>
      </div>
      {error && <div className="px-4 py-2 text-xs text-[#e2686f]">{error}</div>}
    </div>
  )
}
