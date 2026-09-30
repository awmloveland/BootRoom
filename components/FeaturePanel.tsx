'use client'

import { PlayerStatsCard } from '@/components/PlayerStatsCard'
import { QuarterCelebrationCard } from '@/components/QuarterCelebrationCard'
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
      <div className="bg-[#38bdf8]/8 border border-[#38bdf8]/35 rounded-lg px-3.5 py-2.5 mb-3.5">
        <div className="text-xs font-semibold text-[#38bdf8] mb-0.5">You always see everything</div>
        <div className="text-xs text-[#8ba4c4]">
          As a league admin, your own view is never restricted by these settings. Changes here only
          affect members and public visitors. Test with a member account to verify.
        </div>
      </div>
      <PlayerStatsCard
        leagueId={leagueId}
        feature={getFeature(features, 'player_stats')}
        onChanged={onChanged}
      />
      <QuarterCelebrationCard
        leagueId={leagueId}
        feature={getFeature(features, 'quarter_celebration')}
        onChanged={onChanged}
      />
    </div>
  )
}
