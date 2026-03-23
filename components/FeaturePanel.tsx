'use client'

import { useState } from 'react'
import { TeamBuilderCard } from '@/components/TeamBuilderCard'
import { PlayerStatsCard } from '@/components/PlayerStatsCard'
import { StatsSidebarCard } from '@/components/StatsSidebarCard'
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
      <StatsSidebarCard
        leagueId={leagueId}
        feature={getFeature(features, 'stats_sidebar')}
        onChanged={onChanged}
      />
    </div>
  )
}
