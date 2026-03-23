// lib/defaults.ts
import type { FeatureKey } from './types'

export const DEFAULT_FEATURES: {
  feature: FeatureKey
  enabled: boolean
  config: object | null
  public_enabled: boolean
  public_config: object | null
}[] = [
  { feature: 'match_history',     enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'match_entry',       enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'team_builder',      enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'player_stats',      enabled: true,  config: { max_players: null, visible_stats: ['played','won','drew','lost','winRate','recentForm'] }, public_enabled: false, public_config: null },
  { feature: 'player_comparison', enabled: false, config: null, public_enabled: false, public_config: null },
  { feature: 'stats_in_form',         enabled: false, config: null, public_enabled: false, public_config: null },
  { feature: 'stats_quarterly_table', enabled: false, config: null, public_enabled: false, public_config: null },
  { feature: 'stats_team_ab',         enabled: false, config: null, public_enabled: false, public_config: null },
]
