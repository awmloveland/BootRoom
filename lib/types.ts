export type Winner = 'teamA' | 'teamB' | 'draw' | null;
export type WeekStatus = 'played' | 'cancelled' | 'unrecorded' | 'scheduled';

export interface Week {
  id?: string;         // DB row id — present for rows fetched from DB; absent in legacy test fixtures
  week: number;
  date: string;        // 'DD MMM YYYY'
  status: WeekStatus;
  format?: string;     // e.g. '6-a-side' (absent for cancelled/unrecorded)
  teamA: string[];     // empty array for cancelled/unrecorded weeks
  teamB: string[];     // empty array for cancelled/unrecorded weeks
  winner: Winner;      // null for non-played weeks
  notes?: string;      // result notes or cancellation reason
  // Non-negative integer. 0 = draw. Positive = win margin (UI enforces 1–20, DB has no constraint).
  // null = not recorded or cancelled. Display code must handle any positive integer gracefully.
  goal_difference?: number | null;
  team_a_rating?: number | null;  // ewptScore snapshot at game time; null for pre-migration games
  team_b_rating?: number | null;
  lineupMetadata?: LineupMetadata | null; // populated for 'scheduled' (awaiting result) weeks
}

export type Mentality = 'balanced' | 'attacking' | 'defensive' | 'goalkeeper';

export interface PlayerAttribute {
  name: string;
  rating: number;   // 1–3
  mentality: Mentality;
}

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

export interface LeagueDetails {
  location: string | null;
  day: string | null;           // stored singular: "Thursday"
  kickoff_time: string | null;  // e.g. "6:30pm"
  bio: string | null;
  player_count?: number;        // derived from players.length — omitted if players not fetched
}

export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'player_stats'
  | 'player_comparison'
  | 'stats_sidebar';

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
  lineupMetadata?: LineupMetadata | null;
  team_a_rating?: number | null;
  team_b_rating?: number | null;
}

export interface GuestEntry {
  type: 'guest'            // runtime discriminant — not persisted to DB
  name: string             // e.g. "Alice +1"
  associatedPlayer: string // e.g. "Alice"
  rating: number           // 1–3
  goalkeeper?: boolean     // whether this guest is playing as goalkeeper
}

export interface NewPlayerEntry {
  type: 'new_player'       // runtime discriminant — not persisted to DB
  name: string
  rating: number           // 1–3
  mentality: Mentality     // balanced | attacking | defensive | goalkeeper
  goalkeeper?: boolean     // derived: mentality === 'goalkeeper'. Keep for DB backwards compat.
}

export interface LineupMetadata {
  guests: GuestEntry[]
  new_players: NewPlayerEntry[]
}

export type SortKey = 'name' | 'played' | 'won' | 'winRate' | 'recentForm'

export type JoinRequestStatus = 'none' | 'pending' | 'approved' | 'declined'

export interface JoinRequest {
  id: string
  game_id: string
  user_id: string
  email: string
  display_name: string
  message: string | null
  status: JoinRequestStatus
  reviewed_by: string | null
  created_at: string
  updated_at: string
}
