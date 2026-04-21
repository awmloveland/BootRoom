export type Winner = 'teamA' | 'teamB' | 'draw' | null;
export type WeekStatus = 'played' | 'cancelled' | 'unrecorded' | 'scheduled';

export interface Week {
  id?: string;         // DB row id — present for rows fetched from DB; absent in legacy test fixtures
  season: string;      // 4-digit calendar year, e.g. '2026'
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
  linked_user_id?: string | null;
  linked_display_name?: string | null;
}

// "Is this player a goalkeeper?" lives on `mentality === 'goalkeeper'` only.
// `Player.goalkeeper: boolean` was removed (2026-04-21) in favour of the single mentality enum.
// GuestEntry.goalkeeper is a separate UI signal and intentionally retained.
//
// `playerId` is a synthetic identity stamped at the resolution boundary
// (resolvePlayersForAutoPick / lib/data.ts / lib/fetchers.ts) so downstream
// comparisons don't collide on shared names. Prefix convention:
//   'known|<name>' — roster player, 'roster|<dbId>' when DB id is available
//   'guest|<name>' — guest (someone's +1)
//   'new|<name>'   — first-time player added via the new-player flow
export interface Player {
  playerId: string;
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
  mentality: Mentality;
  rating: number;
  recentForm: string; // e.g. 'WWDLW' or '--WLW'
  wprOverride?: number; // if set, wprScore returns this directly — used for guests/new players
  lastPlayedWeekDate?: string; // 'DD MMM YYYY' — derived at runtime before auto-pick; not persisted
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
  slug: string;
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
  linked_player_name: string | null;
}

export interface ScheduledWeek {
  id: string;
  season: string;
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

export type StrengthHint = 'below' | 'average' | 'above';

export interface GuestEntry {
  type: 'guest'            // runtime discriminant — not persisted to DB
  name: string             // e.g. "Alice +1"
  associatedPlayer: string // e.g. "Alice"
  rating: number           // 1–3, kept for DB backwards compat — no longer drives scoring
  goalkeeper?: boolean     // whether this guest is playing as goalkeeper
  strengthHint: StrengthHint // drives wprOverride at resolution time
}

export interface NewPlayerEntry {
  type: 'new_player'       // runtime discriminant — not persisted to DB
  name: string
  rating: number           // 1–3, kept for DB backwards compat — no longer drives scoring
  mentality: Mentality     // balanced | attacking | defensive | goalkeeper
  strengthHint: StrengthHint // drives wprOverride at resolution time
}

export interface LineupMetadata {
  guests: GuestEntry[]
  new_players: NewPlayerEntry[]
}

export type SortKey = 'name' | 'played' | 'won' | 'winRate' | 'recentForm'

export interface YearStats {
  played: number
  won: number
  drew: number
  lost: number
  winRate: number   // rounded to 1 decimal, e.g. 60.7
  points: number    // W=3, D=1, L=0
  recentForm: string  // last 5 games in that year newest-first, padded with '-', e.g. 'WWDL-'
  qualified: boolean  // played >= 5 within that year
}

export type JoinRequestStatus = 'none' | 'pending' | 'approved' | 'declined'

export interface PendingJoinRequest {
  id: string
  user_id: string
  email: string
  display_name: string
  message: string | null
  status: JoinRequestStatus
  created_at: string
}

export interface JoinRequest {
  id: string
  game_id: string
  user_id: string
  email: string
  display_name: string | null
  message: string | null
  status: JoinRequestStatus
  reviewed_by: string | null
  created_at: string
  updated_at: string
}

export type PlayerClaimStatus = 'pending' | 'approved' | 'rejected'

export interface PlayerClaim {
  id: string
  game_id: string
  user_id: string
  player_name: string
  admin_override_name: string | null
  status: PlayerClaimStatus
  reviewed_by: string | null
  created_at: string
  updated_at: string
  // Derived — populated in admin views
  display_name?: string | null
  email?: string
}
