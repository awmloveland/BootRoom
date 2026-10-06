'use client'

import { PlayerStatsCard } from '@/components/PlayerStatsCard'
import { FeatureToggleCard } from '@/components/FeatureToggleCard'
import { MIN_MARGIN_WINS } from '@/lib/sidebar-stats'
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
      <FeatureToggleCard
        leagueId={leagueId}
        feature={getFeature(features, 'quarter_celebration')}
        title="Quarter Celebration"
        description="Show the champion + awards card on the Results tab when a quarter wraps. Admins always see it; choose who else does."
        onChanged={onChanged}
      />
      <FeatureToggleCard
        leagueId={leagueId}
        feature={getFeature(features, 'lineup_share_image')}
        title="Lineup Share Image"
        description="Add a picture of both teams to shared lineup links in WhatsApp, iMessage, Slack and Discord. Admins always get it; choose who else does."
        onChanged={onChanged}
      />
      <FeatureToggleCard
        leagueId={leagueId}
        feature={getFeature(features, 'margin_stats')}
        title="Winning Margins"
        description={`Show the average winning margin, biggest win and close games under Head to Head, once the league has ${MIN_MARGIN_WINS} wins. Admins always see it; choose who else does.`}
        onChanged={onChanged}
      />
    </div>
  )
}
