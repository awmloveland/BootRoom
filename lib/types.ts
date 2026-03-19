export type Winner = 'teamA' | 'teamB' | 'draw' | null;
export type WeekStatus = 'played' | 'cancelled';

export interface Week {
  week: number;
  date: string;        // 'DD MMM YYYY'
  status: WeekStatus;  // 'played' | 'cancelled'
  format?: string;     // e.g. '6-a-side' (absent for cancelled)
  teamA: string[];     // empty array for cancelled weeks
  teamB: string[];     // empty array for cancelled weeks
  winner: Winner;      // null for cancelled weeks
  notes?: string;      // result notes or cancellation reason
}

export type Mentality = 'balanced' | 'attacking' | 'defensive' | 'goalkeeper';

export interface Player {
  name: string;
  played: number;
  won: number;
  drew: number;
  lost: number;
  timesTeamA: number;
  timesTeamB: number;
  winRate: number;
  qualified: boolean;
  points: number;
  goalkeeper: boolean;
  mentality: Mentality;
  rating: number;
  recentForm: string; // e.g. 'WWDLW' or '--WLW'
}

export interface BootRoomData {
  league: string;
  weeks: Week[];
  players: Player[];
  config: Record<string, unknown>;
}

export type GameRole = 'creator' | 'admin' | 'member';

export type ProfileRole = 'user' | 'developer';

export interface Game {
  id: string;
  name: string;
  created_at: string;
  role: GameRole;
}

export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'team_builder'
  | 'player_stats'
  | 'player_comparison';

export interface FeatureConfig {
  max_players?: number | null;
  visible_stats?: string[];
  show_mentality?: boolean; // show ATT/BAL/DEF/GK badge on player cards (default true)
}

export interface LeagueFeature {
  feature: FeatureKey;
  available: boolean;             // whether this feature is globally available (from feature_experiments)
  enabled: boolean;               // whether members can access this feature
  config?: FeatureConfig | null;
  public_enabled: boolean;
  public_config?: FeatureConfig | null;
}

export interface LeagueMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: GameRole;
  joined_at: string;
}

export interface ScheduledWeek {
  id: string;
  week: number;
  date: string;
  format: string | null;
  teamA: string[];
  teamB: string[];
  status: 'scheduled' | 'cancelled';
}
