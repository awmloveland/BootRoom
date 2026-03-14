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

export interface Game {
  id: string;
  name: string;
  created_at: string;
  role: GameRole;
}

export type FeatureKey = 'match_entry' | 'team_builder' | 'player_stats' | 'player_comparison';

export interface FeatureConfig {
  max_players?: number | null;
  visible_stats?: string[];
}

export interface LeagueFeature {
  feature: FeatureKey;
  enabled: boolean;
  config?: FeatureConfig | null;
}

export interface LeagueMember {
  user_id: string;
  email: string;
  display_name: string | null;
  role: GameRole;
  joined_at: string;
}
