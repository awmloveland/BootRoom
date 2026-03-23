'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import type { LeagueFeature, FeatureConfig } from '@/lib/types'

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

interface PlayerStatsCardProps {
  leagueId: string
  feature: LeagueFeature
  onChanged: () => void
}

export function PlayerStatsCard({ leagueId, feature, onChanged }: PlayerStatsCardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [localMembersConfig, setLocalMembersConfig] = useState<FeatureConfig | null>(
    feature.config ?? null
  )
  const [localPublicConfig, setLocalPublicConfig] = useState<FeatureConfig | null>(
    feature.public_config ?? null
  )

  const saveMembersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savePublicTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // featureRef: always points to the latest feature prop so debounced callbacks
  // don't capture a stale snapshot
  const featureRef = useRef(feature)
  useEffect(() => { featureRef.current = feature }, [feature])

  // Only sync from server when no debounce save is pending
  useEffect(() => {
    if (!saveMembersTimerRef.current) setLocalMembersConfig(feature.config ?? null)
  }, [feature.config])
  useEffect(() => {
    if (!savePublicTimerRef.current) setLocalPublicConfig(feature.public_config ?? null)
  }, [feature.public_config])

  useEffect(() => {
    return () => {
      if (saveMembersTimerRef.current) clearTimeout(saveMembersTimerRef.current)
      if (savePublicTimerRef.current) clearTimeout(savePublicTimerRef.current)
    }
  }, [])

  const updateFeature = useCallback(async (updated: LeagueFeature) => {
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
  }, [leagueId, onChanged])

  function handleMembersStatChange(key: string, checked: boolean) {
    const current = localMembersConfig?.visible_stats ?? ALL_STATS.map(s => s.key)
    const nextStats = checked
      ? current.includes(key) ? current : [...current, key]
      : current.filter(k => k !== key)
    const nextConfig: FeatureConfig = { ...(localMembersConfig ?? {}), visible_stats: nextStats }
    setLocalMembersConfig(nextConfig)
    if (saveMembersTimerRef.current) clearTimeout(saveMembersTimerRef.current)
    saveMembersTimerRef.current = setTimeout(() => {
      saveMembersTimerRef.current = null
      updateFeature({ ...featureRef.current, config: nextConfig })
    }, 600)
  }

  function handlePublicStatChange(key: string, checked: boolean) {
    const current = localPublicConfig?.visible_stats ?? ALL_STATS.map(s => s.key)
    const nextStats = checked
      ? current.includes(key) ? current : [...current, key]
      : current.filter(k => k !== key)
    const nextConfig: FeatureConfig = { ...(localPublicConfig ?? {}), visible_stats: nextStats }
    setLocalPublicConfig(nextConfig)
    if (savePublicTimerRef.current) clearTimeout(savePublicTimerRef.current)
    savePublicTimerRef.current = setTimeout(() => {
      savePublicTimerRef.current = null
      updateFeature({ ...featureRef.current, public_config: nextConfig })
    }, 600)
  }

  function handleMentalityMembersChange(val: boolean) {
    const nextConfig: FeatureConfig = { ...(localMembersConfig ?? {}), show_mentality: val }
    setLocalMembersConfig(nextConfig)
    updateFeature({ ...featureRef.current, config: nextConfig })
  }

  function handleMentalityPublicChange(val: boolean) {
    const nextConfig: FeatureConfig = { ...(localPublicConfig ?? {}), show_mentality: val }
    setLocalPublicConfig(nextConfig)
    updateFeature({ ...featureRef.current, public_config: nextConfig })
  }

  const membersStats = localMembersConfig?.visible_stats ?? ALL_STATS.map(s => s.key)
  const publicStats = localPublicConfig?.visible_stats ?? ALL_STATS.map(s => s.key)
  const membersMentality = localMembersConfig?.show_mentality ?? true
  const publicMentality = localPublicConfig?.show_mentality ?? true

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-slate-700/60">
        <div className="text-sm font-semibold text-slate-100">Player Stats</div>
        <div className="text-xs text-slate-500 mt-0.5">
          Choose which stat columns and badges are visible on the players page for each audience.
        </div>
      </div>
      <div className="px-4 py-2.5 flex flex-col gap-3.5">

        {/* Members stat columns */}
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Members</div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
            {ALL_STATS.map(stat => {
              const checked = membersStats.includes(stat.key)
              return (
                <label key={stat.key} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => handleMembersStatChange(stat.key, e.target.checked)}
                    className="sr-only"
                  />
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-sm flex-shrink-0 flex items-center justify-center border',
                    checked ? 'bg-sky-600 border-sky-600' : 'bg-slate-700 border-slate-600'
                  )}>
                    {checked && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="white">
                        <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{stat.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Public stat columns */}
        <div className="border-t border-slate-700/60 pt-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Public</div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
            {ALL_STATS.map(stat => {
              const checked = publicStats.includes(stat.key)
              return (
                <label key={stat.key} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => handlePublicStatChange(stat.key, e.target.checked)}
                    className="sr-only"
                  />
                  <div className={cn(
                    'w-3.5 h-3.5 rounded-sm flex-shrink-0 flex items-center justify-center border',
                    checked ? 'bg-sky-600 border-sky-600' : 'bg-slate-700 border-slate-600'
                  )}>
                    {checked && (
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="white">
                        <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">{stat.label}</span>
                </label>
              )
            })}
          </div>
        </div>

        {/* Player card badges */}
        <div className="border-t border-slate-700/60 pt-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Player card badges</div>
          <div className="text-xs text-slate-300 mb-2">
            Mentality badge <span className="text-slate-500 text-[10px]">(ATT / BAL / DEF / GK)</span>
          </div>
          <div className="rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900/60 border-b border-slate-700/60">
              <span className="text-sm text-slate-300">Members</span>
              <Toggle enabled={membersMentality} onChange={handleMentalityMembersChange} disabled={saving} />
            </div>
            <div className="flex items-center justify-between px-3 py-2 bg-slate-900/60">
              <span className="text-sm text-slate-300">Public</span>
              <Toggle enabled={publicMentality} onChange={handleMentalityPublicChange} disabled={saving} />
            </div>
          </div>
        </div>

      </div>
      {error && <div className="px-4 pb-3 text-xs text-red-400">{error}</div>}
      {saved && <div className="px-4 pb-3 text-xs text-sky-400">Saved</div>}
    </div>
  )
}
