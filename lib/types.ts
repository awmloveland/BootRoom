import type { QuarterlyEntry } from './sidebar-stats';

export type Winner = 'teamA' | 'teamB' | 'draw' | null;
export type WeekStatus = 'played' | 'cancelled' | 'unrecorded' | 'scheduled' | 'dnf';

export interface Week {
  id?: string;         // DB row id — present for rows fetched from DB; absent in legacy test fixtures
  season: string;      // 4-digit calendar year, e.g. '2026'
  week: number;
  date: string;        // 'DD MMM YYYY'
  status: WeekStatus;
  format?: string;     // e.g. '6-a-side' (absent for cancelled/unrecorded)
  teamA: string[];     // empty array for cancelled/unrecorded/scheduled weeks; populated for dnf
  teamB: string[];     // empty array for cancelled/unrecorded/scheduled weeks; populated for dnf
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
  strength: Strength | null;   // null = unrated (legacy rating === 0)
  mentality: Mentality;
  played?: number;             // optional roster-context field; required when fetched from /api/league/[id]/players
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
  strength: Strength | null;
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
  | 'quarter_celebration'
  | 'lineup_share_image';

export interface FeatureConfig {
  max_players?: number | null;
  visible_stats?: string[];
  show_mentality?: boolean; // show ATT/BAL/DEF/GK badge on player cards (default true)
}

/** All-time winning margin stats. Built by computeMargins in lib/sidebar-stats.ts. */
export interface MarginStats {
  /** Mean margin of wins with a recorded margin. Draws excluded. */
  avgWinMargin: number | null;
  biggestWin: number | null;
  /** Eight counts: draws, then margins 1, 2, 3, 4, 5, 6, and 7+. */
  buckets: number[];
  /** Most common win margin (1–7, 7 meaning 7+). Ties go to the smaller margin. */
  modeMargin: number | null;
  /** (wins by 1 + draws) / counted, as a rounded whole percentage. */
  closeGamePct: number | null;
  /** Draws plus wins with a recorded margin. */
  counted: number;
  /** Wins with a recorded margin. Compared against MIN_MARGIN_WINS. */
  winCount: number;
}

export interface LeagueFeature {
  feature: FeatureKey;
  available: boolean;             // whether this feature is globally available (from feature_experiments)
  enabled: boolean;               // whether members can access this feature
  config?: FeatureConfig | null;
  public_enabled: boolean;
  public_config?: FeatureConfig | null;
}

/** A verified shared lineup, as drawn in its link-preview image. */
export interface SharedLineup {
  leagueName: string;
  slug: string;
  week: number;
  date: string;               // 'DD MMM YYYY'
  format: string | null;
  teamA: string[];
  teamB: string[];
  location: string | null;
  kickoffTime: string | null; // e.g. "19:00"
}

/** Icon next to a highlight line in the result preview image. */
export type ResultHighlightIcon = 'flame' | 'heart-crack' | 'zap' | 'award' | 'trending-up' | 'crown';

export interface ResultImageHighlight {
  icon: ResultHighlightIcon;
  text: string;
}

/** A played result, as drawn in its link-preview image. */
export interface SharedResult {
  leagueName: string;
  slug: string;
  week: number;
  date: string;               // 'DD MMM YYYY'
  winner: NonNullable<Winner>;
  goalDifference: number;
  teamA: string[];
  teamB: string[];
  highlights: ResultImageHighlight[]; // at most three, as of that game
}

/** A completed quarter with a champion, as drawn in its link-preview image. */
export interface SharedQuarter {
  leagueName: string;
  slug: string;
  year: number;
  q: number;
  seasonName: string;
  dateRange: { from: string; to: string }; // 'DD MMM YYYY'
  gamesPlayed: number;
  /** Top three of the final table; the first is the champion. Never empty. */
  podium: { name: string; points: number; won: number; drew: number }[];
}

/** A league card, as drawn in its link-preview image. */
export interface SharedLeague {
  leagueName: string;
  slug: string;
  gamesPlayed: number;
  playerCount: number;
  nextGame: { date: string; kickoffTime: string | null; location: string | null } | null;
}

/** An open invite, as drawn in its link-preview image. Never the role or email. */
export interface SharedInvite {
  leagueName: string;
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

export type Strength = 'below' | 'average' | 'above';

export interface GuestEntry {
  type: 'guest'            // runtime discriminant — not persisted to DB
  name: string             // e.g. "Alice +1"
  associatedPlayer: string // e.g. "Alice"
  goalkeeper?: boolean     // whether this guest is playing as goalkeeper
  strength: Strength       // drives wprOverride at resolution time
}

export interface NewPlayerEntry {
  type: 'new_player'       // runtime discriminant — not persisted to DB
  name: string
  mentality: Mentality     // balanced | attacking | defensive | goalkeeper
  strength: Strength       // drives wprOverride at resolution time
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

// ── All-time records (Records tab) ────────────────────────────────────────────

export type RecordBadge = 'tied' | 'live' | 'iron_man'

/** One row of a record's expanded top 5. */
export interface RecordEntry {
  name: string
  value: string
  sub?: string   // qualifier shown before the value, e.g. '18 GP', '20W 7D', 'Live'
}

/** One all-time record row. All display strings are pre-formatted in normal case. */
export interface LeagueRecord {
  key: string
  label: string          // 'Most appearances'
  holders: string[]      // empty when nobody qualifies yet
  holderLabel: string    // holders joined for display, or 'Nobody yet'
  value: string          // '45', '61%', '1.89'
  note: string           // mono subline, e.g. 'of 50 games'
  unit: string           // header of the top-5 value column, e.g. 'Games'
  badge?: RecordBadge
  top: RecordEntry[]     // up to 5; empty means the row does not expand
  foot?: string          // qualifier footnote under the top 5
}

/** One row of the Trophy cabinet: a champion, or a shared quarter. */
export interface TitleRow {
  key: string
  name: string           // 'Jaff', or 'Luke, Ian & Alice' for a shared quarter
  quarters: string       // 'Q3 2026 · on GD'
  count: number
  shared: boolean
}

export interface RivalryRecord {
  games: number
  draws: number
  leader: { name: string; wins: number }    // the side with more wins, shown left
  trailer: { name: string; wins: number }
}

export interface MilestoneBadge {
  threshold: number
  players: number
}

export interface BiggestWin {
  margin: number
  date: string           // 'DD MMM YYYY'
  season: string
  week: number
}

export interface RecordsData {
  totalGames: number
  career: LeagueRecord[]
  streaks: LeagueRecord[]
  waitForWin: LeagueRecord | null       // softened banter row, never expands
  quartersPlayed: number
  titles: TitleRow[]
  duos: LeagueRecord[]
  rivalry: RivalryRecord | null
  milestones: MilestoneBadge[]
  nextMilestone: LeagueRecord | null
  biggestWin: BiggestWin | null
  teamAB: { teamA: number; teamB: number; draws: number }
}

// ── Pitch fees (Admin tab) ────────────────────────────────────────────────────

/** Date range presets on the Admin tab. Numbers are days back from today. */
export type FeePreset = '30' | '90' | '180' | 'all' | 'custom'

/** One person's fee for one played week: a player's own game, or a guest they brought. */
export interface FeeEntry {
  key: string           // `${weekId}|${payer}`, also the week_payments key
  weekId: string
  payer: string         // who the payment row is keyed by: the player, or the guest's name ('Alice +1')
  date: string          // 'DD MMM YYYY'
  week: number
  cost: number          // pounds
  paid: boolean
  guest: boolean        // true for a +1 owed via this player
}

export interface PlayerBalance {
  name: string
  games: number         // own appearances in range
  guests: number        // +1s brought in range
  owed: number          // sum of unpaid entry costs
  entries: FeeEntry[]   // own games + guests' games, unpaid first, then newest first
}

export interface WeekFeeRow {
  weekId: string
  date: string          // 'DD MMM YYYY'
  week: number
  status: WeekStatus
  players: number       // own players (guests excluded)
  guests: number
  paid: number          // paid count
  payers: number        // players + guests
  cost: number          // per player, pounds
  overridden: boolean   // true when week_fees has a row for this week
}

export interface FeeRange {
  preset: FeePreset
  from: string          // 'YYYY-MM-DD', '' when unbounded (All time)
  to: string            // 'YYYY-MM-DD', '' when unbounded
  label: string         // 'Last 30 days', 'Custom range'
}

export interface AdminMoneyData {
  range: FeeRange
  span: string                        // '6 Sep – 1 Oct 2026', or 'No games'
  defaultFee: number
  games: WeekFeeRow[]                 // newest first, cancelled weeks included (dimmed)
  debtors: PlayerBalance[]            // owed > 0, sorted owed desc then name
  settled: PlayerBalance[]            // owed === 0 with ≥1 game, sorted by name
  totals: { owed: number; collected: number; expected: number; playedGames: number }
}

export type ResultHighlightItem =
  | { kind: 'win_streak'; player: string; count: number }
  | { kind: 'unbeaten_ended'; player: string; count: number }
  | { kind: 'upset'; strongerTeam: 'Team A' | 'Team B'; strongRating: string; weakRating: string }
  | { kind: 'milestone'; player: string; games: number };

export interface ResultHighlights {
  /** Win streaks, ended unbeaten runs, the upset, then milestones. */
  items: ResultHighlightItem[];
  /** Top five of the result's quarter, or null when nobody has played in it. */
  table: { q: number; year: number; entries: QuarterlyEntry[] } | null;
  inForm: { name: string; ppg: number } | null;
}

/** The player stats highlights need, as they stood before the game. */
export type HighlightPlayer = Pick<Player, 'name' | 'played' | 'recentForm'>;

/** What the browser can ask the share-link endpoint to sign. */
export type ShareLinkRequest =
  | { kind: 'result'; weekId: string }
  | { kind: 'quarter'; year: number; q: number };
