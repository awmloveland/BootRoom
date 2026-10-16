'use client'

import { FeatureToggleCard } from '@/components/FeatureToggleCard'
import type { FeatureKey, LeagueFeature } from '@/lib/types'

interface FeaturePanelProps {
  leagueId: string
  features: LeagueFeature[]
  onChanged: () => void
}

interface FeatureCopy {
  title: string
  description: string
}

/** Card copy for each flagged feature. Add an entry alongside the FeatureKey. */
const FEATURE_COPY: Record<FeatureKey, FeatureCopy> = {}

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
      {features.map((feature) => {
        const copy: FeatureCopy = FEATURE_COPY[feature.feature]
        return (
          <FeatureToggleCard
            key={feature.feature}
            leagueId={leagueId}
            feature={feature}
            title={copy.title}
            description={copy.description}
            onChanged={onChanged}
          />
        )
      })}
    </div>
  )
}
