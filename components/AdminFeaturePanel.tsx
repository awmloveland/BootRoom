'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { LeagueFeature, FeatureKey, FeatureConfig } from '@/lib/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const ALL_STATS = [
  { key: 'played',     label: 'Played' },
  { key: 'won',        label: 'Won' },
  { key: 'drew',       label: 'Drew' },
  { key: 'lost',       label: 'Lost' },
  { key: 'winRate',    label: 'Win Rate' },
  { key: 'recentForm', label: 'Recent Form' },
  { key: 'points',     label: 'Points' },
  { key: 'timesTeamA', label: 'Times Team A' },
  { key: 'timesTeamB', label: 'Times Team B' },
]

type Tier = 'members' | 'public'

// ─── Primitive components ─────────────────────────────────────────────────────

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        enabled ? 'bg-sky-600' : 'bg-slate-600',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
          enabled ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  )
}

function TabBar({
  active,
  onChange,
}: {
  active: Tier
  onChange: (t: Tier) => void
}) {
  return (
    <div className="flex gap-1 p-1 bg-slate-900 rounded-lg w-fit">
      {(['members', 'public'] as Tier[]).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            'px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize',
            active === t
              ? 'bg-slate-700 text-slate-100'
              : 'text-slate-500 hover:text-slate-300',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

/** Stat columns + max players config — shown inside the expanded players page */
function StatsConfig({
  config,
  disabled,
  onUpdate,
}: {
  config: FeatureConfig | null | undefined
  disabled?: boolean
  onUpdate: (patch: Partial<FeatureConfig>) => void
}) {
  const visibleStats = config?.visible_stats ?? ALL_STATS.map((s) => s.key)
  const maxPlayers = config?.max_players ?? null
  const showMentality = config?.show_mentality ?? true

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-slate-400 mb-1.5">
          Max players shown{' '}
          <span className="text-slate-600">(leave blank for unlimited)</span>
        </label>
        <input
          type="number"
          min={1}
          value={maxPlayers ?? ''}
          disabled={disabled}
          placeholder="Unlimited"
          onChange={(e) => {
            const val = e.target.value
            onUpdate({ max_players: val === '' ? null : parseInt(val, 10) })
          }}
          className="w-28 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-40"
        />
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-2">Player card badges</p>
        <label className="flex items-center gap-2 cursor-pointer group">
          <input
            type="checkbox"
            checked={showMentality}
            disabled={disabled}
            onChange={() => onUpdate({ show_mentality: !showMentality })}
            className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-400 disabled:opacity-40"
          />
          <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
            Show mentality badge (ATT / BAL / DEF / GK)
          </span>
        </label>
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-2">Visible stat columns</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-3">
          {ALL_STATS.map((stat) => {
            const checked = visibleStats.includes(stat.key)
            return (
              <label key={stat.key} className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => {
                    const next = checked
                      ? visibleStats.filter((s) => s !== stat.key)
                      : [...visibleStats, stat.key]
                    onUpdate({ visible_stats: next })
                  }}
                  className="rounded border-slate-600 bg-slate-700 text-sky-500 focus:ring-sky-400 disabled:opacity-40"
                />
                <span className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors">
                  {stat.label}
                </span>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** A single sub-feature row inside an expanded page card */
function SubFeatureRow({
  label,
  description,
  enabled,
  disabled,
  comingSoon,
  onToggle,
}: {
  label: string
  description: string
  enabled: boolean
  disabled?: boolean
  comingSoon?: boolean
  onToggle?: (v: boolean) => void
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 py-3 px-4 rounded-lg bg-slate-900/60',
        (disabled || comingSoon) && 'opacity-50',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm text-slate-300">{label}</p>
          {comingSoon && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-500 border border-slate-700">
              Coming soon
            </span>
          )}
        </div>
        <p className="text-xs text-slate-600 mt-0.5">{description}</p>
      </div>
      {!comingSoon && onToggle && (
        <div className="shrink-0 pt-0.5">
          <Toggle enabled={enabled} disabled={disabled} onChange={onToggle} />
        </div>
      )}
    </div>
  )
}

// ─── Page cards ───────────────────────────────────────────────────────────────

interface PageCardProps {
  title: string
  description: string
  saving: FeatureKey | null
  getFeature: (key: FeatureKey) => LeagueFeature
  updateFeature: (f: LeagueFeature) => void
}

/** Results page card — master: match_history, sub: match_entry */
function ResultsPageCard({ title, description, saving, getFeature, updateFeature }: PageCardProps) {
  const [tab, setTab] = useState<Tier>('members')

  const history = getFeature('match_history')
  const entry   = getFeature('match_entry')

  const masterEnabled  = tab === 'members' ? history.enabled       : history.public_enabled
  const entryEnabled   = tab === 'members' ? entry.enabled         : entry.public_enabled
  const isSavingMaster = saving === 'match_history'
  const isSavingEntry  = saving === 'match_entry'

  function toggleMaster(val: boolean) {
    if (tab === 'members') updateFeature({ ...history, enabled: val })
    else                   updateFeature({ ...history, public_enabled: val })
  }

  function toggleEntry(val: boolean) {
    if (tab === 'members') updateFeature({ ...entry, enabled: val })
    else                   updateFeature({ ...entry, public_enabled: val })
  }

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-200">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <TabBar active={tab} onChange={setTab} />
      </div>

      {/* Body */}
      <div className="border-t border-slate-700/60 px-4 py-4 space-y-3">
        {/* Page visible master toggle */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-300">Page visible</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {tab === 'members' ? 'Members can open the results page.' : 'Anyone with the link can view the results page.'}
            </p>
          </div>
          <Toggle
            enabled={masterEnabled}
            disabled={isSavingMaster}
            onChange={toggleMaster}
          />
        </div>

        {/* Sub-features — only shown when master is on */}
        {masterEnabled && (
          <div className="pt-1 space-y-2 border-t border-slate-700/40">
            <p className="text-xs text-slate-600 pt-1">Features</p>
            <SubFeatureRow
              label="Match Entry"
              description="Next match card and the ability to record results."
              enabled={entryEnabled}
              disabled={isSavingEntry}
              onToggle={toggleEntry}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** Players page card — master: player_stats, sub: team_builder, player_comparison */
function PlayersPageCard({ title, description, saving, getFeature, updateFeature }: PageCardProps) {
  const [tab, setTab] = useState<Tier>('members')

  const stats   = getFeature('player_stats')
  const builder = getFeature('team_builder')

  const masterEnabled   = tab === 'members' ? stats.enabled       : stats.public_enabled
  const builderEnabled  = tab === 'members' ? builder.enabled     : builder.public_enabled
  const isSavingStats   = saving === 'player_stats'
  const isSavingBuilder = saving === 'team_builder'

  const activeConfig = tab === 'members' ? stats.config : stats.public_config

  function toggleMaster(val: boolean) {
    if (tab === 'members') updateFeature({ ...stats, enabled: val })
    else                   updateFeature({ ...stats, public_enabled: val })
  }

  function toggleBuilder(val: boolean) {
    if (tab === 'members') updateFeature({ ...builder, enabled: val })
    else                   updateFeature({ ...builder, public_enabled: val })
  }

  function updateConfig(patch: Partial<FeatureConfig>) {
    if (tab === 'members') {
      updateFeature({ ...stats, config: { ...stats.config, ...patch } })
    } else {
      updateFeature({ ...stats, public_config: { ...stats.public_config, ...patch } })
    }
  }

  return (
    <div className="rounded-xl bg-slate-800 border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-200">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <TabBar active={tab} onChange={setTab} />
      </div>

      {/* Body */}
      <div className="border-t border-slate-700/60 px-4 py-4 space-y-3">
        {/* Page visible master toggle */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-300">Page visible</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {tab === 'members' ? 'Members can open the players page.' : 'Anyone with the link can view the players page.'}
            </p>
          </div>
          <Toggle
            enabled={masterEnabled}
            disabled={isSavingStats}
            onChange={toggleMaster}
          />
        </div>

        {/* Sub-features + config — only shown when master is on */}
        {masterEnabled && (
          <div className="pt-1 space-y-4 border-t border-slate-700/40">
            {/* Stats column config */}
            <div className="pt-2">
              <p className="text-xs text-slate-600 mb-3">Data visible on the players page</p>
              <StatsConfig
                config={activeConfig}
                disabled={isSavingStats}
                onUpdate={updateConfig}
              />
            </div>

            {/* Sub-feature toggles */}
            <div className="space-y-2 border-t border-slate-700/40 pt-3">
              <p className="text-xs text-slate-600">Features</p>
              {tab === 'members' ? (
                <SubFeatureRow
                  label="Team Builder"
                  description="Drag-and-drop tool to split players into balanced teams."
                  enabled={builderEnabled}
                  disabled={isSavingBuilder}
                  onToggle={toggleBuilder}
                />
              ) : (
                <div className="flex items-start justify-between gap-4 py-3 px-4 rounded-lg bg-slate-900/60 opacity-50">
                  <div>
                    <p className="text-sm text-slate-300">Team Builder</p>
                    <p className="text-xs text-slate-600 mt-0.5">Requires sign in — not available on the public view.</p>
                  </div>
                </div>
              )}
              <SubFeatureRow
                label="Player Comparison"
                description="Side-by-side stat comparison between two players."
                enabled={false}
                comingSoon
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface AdminFeaturePanelProps {
  leagueId: string
  features: LeagueFeature[]
  onChanged: () => void
}

export function AdminFeaturePanel({ leagueId, features, onChanged }: AdminFeaturePanelProps) {
  const [saving, setSaving] = useState<FeatureKey | null>(null)
  const [error, setError] = useState<string | null>(null)

  function getFeature(key: FeatureKey): LeagueFeature {
    return (
      features.find((f) => f.feature === key) ?? {
        feature: key,
        enabled: key !== 'player_comparison',
        config: null,
        public_enabled: false,
        public_config: null,
      }
    )
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
      console.log('[AdminFeaturePanel] PATCH sent:', JSON.stringify(update))
      console.log('[AdminFeaturePanel] PATCH response:', JSON.stringify(data))
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(null)
    }
  }

  const shared = { saving, getFeature, updateFeature }

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      <div className="rounded-lg bg-sky-950/40 border border-sky-900/60 px-4 py-3">
        <p className="text-xs font-medium text-sky-400 mb-0.5">You always see everything</p>
        <p className="text-xs text-slate-400">
          As a league admin, your own view is never restricted by these settings.
          Changes here only affect <span className="text-slate-300">members</span> and <span className="text-slate-300">public visitors</span> — test with a member account to verify.
        </p>
      </div>

      <ResultsPageCard
        title="Results page"
        description="Match history feed and upcoming game card."
        {...shared}
      />

      <PlayersPageCard
        title="Players page"
        description="Player statistics, visible data columns, and team building tools."
        {...shared}
      />
    </div>
  )
}
