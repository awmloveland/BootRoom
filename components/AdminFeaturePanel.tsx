'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { LeagueFeature, FeatureKey } from '@/lib/types'

const FEATURE_META: Record<FeatureKey, { label: string; description: string }> = {
  match_entry: {
    label: 'Match Entry',
    description: 'Members can see the next match card, build teams, and record results.',
  },
  team_builder: {
    label: 'Team Builder',
    description: 'Members can use the team builder tool on the players page.',
  },
  player_stats: {
    label: 'Player Stats',
    description: 'Members can view the players page and stats.',
  },
  player_comparison: {
    label: 'Player Comparison',
    description: 'Members can compare players side by side.',
  },
}

const ALL_STATS = [
  { key: 'played',      label: 'Played' },
  { key: 'won',         label: 'Won' },
  { key: 'drew',        label: 'Drew' },
  { key: 'lost',        label: 'Lost' },
  { key: 'winRate',     label: 'Win Rate' },
  { key: 'recentForm',  label: 'Recent Form' },
  { key: 'points',      label: 'Points' },
  { key: 'timesTeamA',  label: 'Times Team A' },
  { key: 'timesTeamB',  label: 'Times Team B' },
]

interface AdminFeaturePanelProps {
  leagueId: string
  features: LeagueFeature[]
  onChanged: () => void
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-50 disabled:cursor-not-allowed',
        enabled ? 'bg-sky-600' : 'bg-slate-600'
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
          enabled ? 'translate-x-4' : 'translate-x-0'
        )}
      />
    </button>
  )
}

export function AdminFeaturePanel({ leagueId, features, onChanged }: AdminFeaturePanelProps) {
  const [saving, setSaving] = useState<FeatureKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  function getFeature(key: FeatureKey): LeagueFeature {
    return features.find((f) => f.feature === key) ?? { feature: key, enabled: true, config: null }
  }

  async function updateFeature(update: LeagueFeature) {
    setSaving(update.feature)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
        credentials: 'include',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  const playerStats = getFeature('player_stats')
  const visibleStats: string[] = playerStats.config?.visible_stats ?? ALL_STATS.map((s) => s.key)
  const maxPlayers: number | null = playerStats.config?.max_players ?? null

  async function updatePlayerStatsConfig(patch: { visible_stats?: string[]; max_players?: number | null }) {
    await updateFeature({
      ...playerStats,
      config: {
        ...playerStats.config,
        ...patch,
      },
    })
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-400">{error}</p>}
      <p className="text-xs text-slate-500">
        These settings apply to members only. Admins always have full access.
      </p>

      {(['match_entry', 'team_builder', 'player_comparison'] as FeatureKey[]).map((key) => {
        const feature = getFeature(key)
        const meta = FEATURE_META[key]
        return (
          <div
            key={key}
            className="flex items-start justify-between gap-4 p-4 rounded-lg bg-slate-800 border border-slate-700"
          >
            <div>
              <p className="text-sm font-medium text-slate-200">{meta.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
            </div>
            <Toggle
              enabled={feature.enabled}
              disabled={saving === key}
              onChange={(enabled) => updateFeature({ ...feature, enabled })}
            />
          </div>
        )
      })}

      {/* Player Stats — has extra config options */}
      <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-200">{FEATURE_META.player_stats.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{FEATURE_META.player_stats.description}</p>
          </div>
          <Toggle
            enabled={playerStats.enabled}
            disabled={saving === 'player_stats'}
            onChange={(enabled) => updateFeature({ ...playerStats, enabled })}
          />
        </div>

        {playerStats.enabled && (
          <>
            {/* Max players visible */}
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Max players visible to members{' '}
                <span className="text-slate-600">(leave blank for unlimited)</span>
              </label>
              <input
                type="number"
                min={1}
                value={maxPlayers ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                  updatePlayerStatsConfig({ max_players: val === '' ? null : parseInt(val, 10) })
                }}
                placeholder="Unlimited"
                className="w-28 px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>

            {/* Visible stats columns */}
            <div>
              <p className="text-xs text-slate-400 mb-2">Visible stat columns for members</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ALL_STATS.map((stat) => {
                  const isChecked = visibleStats.includes(stat.key)
                  return (
                    <label
                      key={stat.key}
                      className="flex items-center gap-2 cursor-pointer group"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          const next = isChecked
                            ? visibleStats.filter((s) => s !== stat.key)
                            : [...visibleStats, stat.key]
                          updatePlayerStatsConfig({ visible_stats: next })
                        }}
                        className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-400"
                      />
                      <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                        {stat.label}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
