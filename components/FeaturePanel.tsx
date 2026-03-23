'use client'

import { useState } from 'react'
import { TeamBuilderCard } from '@/components/TeamBuilderCard'
import { PlayerStatsCard } from '@/components/PlayerStatsCard'
import type { FeatureKey, LeagueFeature } from '@/lib/types'

interface FeaturePanelProps {
  leagueId: string
  features: LeagueFeature[]
  onChanged: () => void
}

function getFeature(features: LeagueFeature[], key: FeatureKey): LeagueFeature {
  return features.find(f => f.feature === key) ?? {
    feature: key,
    available: false,
    enabled: false,
    config: null,
    public_enabled: false,
    public_config: null,
  }
}

// ─── Simple toggle row for stats widgets (no per-tier config needed) ──────────

interface StatsFeatureRowProps {
  leagueId: string
  feature: LeagueFeature
  label: string
  onChanged: () => void
}

function StatsFeatureRow({ leagueId, feature, label, onChanged }: StatsFeatureRowProps) {
  const [saving, setSaving] = useState(false)

  async function toggle(field: 'enabled' | 'public_enabled') {
    setSaving(true)
    await fetch(`/api/league/${leagueId}/features`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...feature,
        [field]: !feature[field],
      }),
    })
    setSaving(false)
    onChanged()
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-3.5 py-2.5 mb-2">
      <span className="text-sm text-slate-200">{label}</span>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            className="accent-blue-500"
            checked={feature.enabled}
            disabled={saving}
            onChange={() => toggle('enabled')}
          />
          Members
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            className="accent-blue-500"
            checked={feature.public_enabled}
            disabled={saving}
            onChange={() => toggle('public_enabled')}
          />
          Public
        </label>
      </div>
    </div>
  )
}

export function FeaturePanel({ leagueId, features, onChanged }: FeaturePanelProps) {
  return (
    <div>
      <div className="bg-sky-950/40 border border-sky-900/40 rounded-lg px-3.5 py-2.5 mb-3.5">
        <div className="text-xs font-semibold text-sky-400 mb-0.5">You always see everything</div>
        <div className="text-xs text-slate-400">
          As a league admin, your own view is never restricted by these settings. Changes here only
          affect members and public visitors — test with a member account to verify.
        </div>
      </div>
      <TeamBuilderCard
        leagueId={leagueId}
        feature={getFeature(features, 'team_builder')}
        onChanged={onChanged}
      />
      <PlayerStatsCard
        leagueId={leagueId}
        feature={getFeature(features, 'player_stats')}
        onChanged={onChanged}
      />

      {/* Stats sidebar widgets */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-0.5">
          Stats Sidebar
        </div>
        <StatsFeatureRow
          leagueId={leagueId}
          feature={getFeature(features, 'stats_sidebar')}
          label="Stats Sidebar"
          onChanged={onChanged}
        />
      </div>
    </div>
  )
}
