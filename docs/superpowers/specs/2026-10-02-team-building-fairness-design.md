# Team building fairness: implementation spec

_Date: 2026-10-02. Source: the team-building audit of 1 to 2 Oct 2026 (50 played games, read-only snapshot)._

This document is written for a coding agent with no prior context. It contains every change agreed after the audit, grouped into four phases. **Each phase is one pull request** and must leave the app working and all tests green on its own.

Line numbers refer to commit `a96a0bd` and will drift. Function names are the reliable anchor.

---

## 1. Background

The team builder has three parts:

| Part | Where | What it does |
|---|---|---|
| Player rating | `wprScore()` in `lib/utils.ts` | One number per player, built from results plus the admin's below / average / above label |
| Team score | `ewptScore()` in `lib/utils.ts` | Average player rating plus goalkeeper, variety and depth modifiers |
| Picker | `autoPick()` in `lib/autoPick.ts` | Tries every split of the squad and returns the five with the closest team scores |

The real call site is `components/NextMatchCard.tsx` (`resolvePlayersForAutoPick`, `handleAutoPick`, `handleSaveLineup`). `components/LineupLab.tsx` is a sandbox that calls the same picker.

What the audit found, in short:

- A date bug will overwrite a played game on the first lineup saved in January 2027.
- A player's rating is dominated by noise: the last result is counted twice, a newcomer's rating is thrown to the top or bottom of the squad after one game, and a "rusty" penalty depends on which day the teams are built.
- The picker has rare but real structural faults: a guest goalkeeper can land with the other keeper, a player can vanish when two share a name, and several guests on one side can produce uneven teams.
- The win bar claims more certainty than the results support.

## 2. Decisions already made (do not relitigate)

1. **The admin's strength label is a starting guess that fades out.** It must not become a permanent part of the rating, and the picker must not balance teams on labels. The fade stays at 10 games (`LABEL_FADE_GAMES = 10`). The owner may change that number later; make it a named constant and do not change its value.
2. **No new rating system.** No Elo, no plus-minus, no goal-margin weighting.
3. **The lone-goalkeeper handicap keeps its present real-world size.** The new rating spreads players about 40% less widely, which would make the unchanged keeper constants count for roughly twice as much. They are therefore halved in Phase 2 (section 6.4) to hold the handicap steady. Do not change them further.
4. **No new feature flags.** These are changes to the existing, unflagged team builder (the `team_builder` flag was removed in migration `20260327000001`).
5. **No new dependencies.** Client-side TypeScript only, as per `CLAUDE.md`.

## 3. Ground rules for every phase

- Follow `CLAUDE.md` in full (Tailwind only, `cn()`, types in `lib/types.ts`, British English, no em dashes in UI copy).
- Write the failing test first, then the code.
- Before opening a PR run `npm test`, `npm run lint` and `npm run build`. All three must pass.
- Local development uses the **production** Supabase project. Do not click write actions in a locally running app and do not run migrations yourself. SQL migrations are applied by the owner in the Supabase SQL Editor; say so in the PR description.
- Existing test files that will need updating: `lib/__tests__/utils.wpr.test.ts`, `lib/__tests__/autoPick.test.ts`, `lib/__tests__/goalkeeper.test.ts`, `lib/__tests__/utils.season.test.ts`, `lib/__tests__/utils.winCopy.test.ts`, `lib/__tests__/utils.resolveTeamRatingForResult.test.ts`. Update or delete tests that assert removed behaviour; do not leave them skipped.

## 4. Recommendation index

| # | Recommendation | Phase | Section |
|---|---|---|---|
| 1 | Stop January from overwriting an old game | 1 | 5 |
| 2 | Let a new player's label fade slowly instead of vanishing after one game | 2 | 6.1, 6.3 |
| 3 | Make the starting label fair in both directions | 2 | 6.1 |
| 4 | Stop last week's result dominating the rating | 2 | 6.1 |
| 5 | Do not trust a short record too much | 2 | 6.1 |
| 6 | Count missed games, not days, for rusty players | 2 | 6.2 |
| 7 | Delete the broken "intermittent attendance" rule | 2 | 6.1 |
| 8 | Make guest goalkeepers count as goalkeepers | 3 | 7.2 |
| 9 | Do not lose a player when two share a name | 3 | 7.2, 7.5 |
| 10 | Remove the variety bonus (and rescale the keeper constants to match the new rating) | 2 | 6.4 |
| 11 | Spread out guest and new-player ratings | 2 | 6.3 |
| 12 | Record what the picker did | 4 | 8.1 |
| 13 | Among equally fair line-ups, prefer teams that look alike | 3 | 7.3 |
| 14 | Make the win bar honest | 4 | 8.2 |
| 15 | Make Lineup Lab and the real builder agree | 2 | 6.5 |
| 16 | Keep teams even when one player brings several guests | 3 | 7.2, 7.6 |
| 17 | Make "Shuffle teams" show different teams | 3 | 7.4 |
| 18 | Flip a coin for Team A and Team B | 3 | 7.4 |
| 19 | Speed up large squads | 3 | 7.7 |

---

## 5. Phase 1: January rollover (urgent, ship first)

### 5.1 Problem

`NextMatchCard.tsx:205-206` derives the two halves of a week's key from different clocks:

- `season` comes from `deriveSeason(weeks)`: the season of the most recent **played** week.
- `nextWeekNum` comes from `getNextWeekNumber(weeks)`: max week number among weeks whose season equals the **current calendar year**, plus one.

On the first match day of January 2027 this yields season `2026`, week `1`, which is the key of the played game of 5 Jan 2026. `save_lineup` (latest definition in `supabase/migrations/20260330000001_save_lineup_ratings.sql`) upserts on `(game_id, season, week)` with `DO UPDATE` and no status check, so that game's teams, date and status are replaced. The same pair of calls is used by `handleCancelGame` and by `ensureUnrecordedWeek` in `lib/fetchers.ts:330-331`.

In the current data every week's `season` equals the year in its `date` (54 of 54 rows), so deriving the season from the match date is consistent with history.

### 5.2 Client changes

`lib/utils.ts`:

```ts
/** Season (calendar year) a match date belongs to. `date` is 'DD MMM YYYY'. */
export function seasonOfDate(date: string): string {
  return date.split(' ')[2]
}

/** Next week number within `season`: highest existing week in that season plus one, or 1 if none. */
export function getNextWeekNumber(weeks: Week[], season: string): number {
  const inSeason = weeks.filter((w) => w.season === season)
  if (inSeason.length === 0) return 1
  return Math.max(...inSeason.map((w) => w.week)) + 1
}
```

`components/NextMatchCard.tsx`:

- Replace the two memos at lines 205-206 with a season and week number derived from `nextDate`:
  `const nextSeason = seasonOfDate(nextDate)` and `const nextWeekNum = getNextWeekNumber(weeks, nextSeason)`.
- In `handleSaveLineup` and `handleCancelGame`, when a `scheduledWeek` exists use **its** `season` and `week`; otherwise use `nextSeason` and `nextWeekNum`. Every place that currently sends `season` (RPC params, public API body, `setScheduledWeek`) must send this resolved season.

`lib/fetchers.ts`, `ensureUnrecordedWeek`: use `seasonOfDate(recentDate)` and `getNextWeekNumber(weeks, thatSeason)`.

`deriveSeason` then has no callers. Delete it and its tests, and remove it from the `lib/utils.ts` line in the repository structure section of `CLAUDE.md`.

### 5.3 Queries that order by week number alone

Week numbers restart each year, so ordering by `week` without `season` breaks at the boundary. The database already holds cancelled rows for 2025 weeks 9, 14 and 15.

- **`NextMatchCard.tsx:299-306` (`load`)** finds the pending week with `.in('status', ['scheduled', 'cancelled', 'unrecorded']).order('week', { ascending: false }).limit(1)`. From January until the new season passes week 15, that returns the old cancelled 2025 week 15 instead of the lineup just saved, and the card falls back to idle. Order by season first: `.order('season', { ascending: false }).order('week', { ascending: false })`. (`season` is a four-digit year stored as text, so text ordering is correct.)
- Apply the same two-key ordering, keeping each query's direction, to the other queries that order by `week` alone: `app/page.tsx:131` and `:137`, `app/api/league/[id]/weeks/scheduled/route.ts:16`, `app/api/weeks/route.ts:32` and `lib/data.ts:42`.

`getNextMatchSeed` in `lib/utils.ts` already sorts by date and needs no change.

### 5.4 Server guard (defence in depth)

New migration `supabase/migrations/20261002000001_guard_recorded_weeks.sql`. Re-create `save_lineup` and `cancel_week` with their current bodies (copy from `20260330000001_save_lineup_ratings.sql` and `20260317000003_cancel_week.sql`), adding this block immediately after the `can_do_match_entry` check in each:

```sql
  IF EXISTS (
    SELECT 1 FROM weeks
    WHERE game_id = p_game_id AND season = p_season AND week = p_week
      AND status IN ('played', 'dnf')
  ) THEN
    RAISE EXCEPTION 'Week % of season % already has a result', p_week, p_season;
  END IF;
```

Keep the signatures and `GRANT` statements identical to the current ones.

Public routes `app/api/public/league/[id]/lineup/route.ts` (POST) and `app/api/public/league/[id]/cancel/route.ts` (POST): before the upsert, select the existing row for `(game_id, season, week)`; if its status is `played` or `dnf`, return `409` with `{ error: 'This week already has a result' }`.

### 5.5 Tests

In `lib/__tests__/utils.season.test.ts`:

- `seasonOfDate('04 Jan 2027')` is `'2027'`.
- `getNextWeekNumber(weeks, '2027')` is `1` when `weeks` holds only season `2026` weeks 1 to 39; `getNextWeekNumber(weeks, '2026')` is `40`.
- A year-boundary case: with season `2026` weeks 1 to 39 present and a next match date of `04 Jan 2027`, the resolved key is `('2027', 1)` and no existing week has that key.
- A late-December build for a January date: next match date `04 Jan 2027` built while the clock reads December 2026 still resolves to `('2027', 1)`.

For 5.3 there is no existing test that exercises the card's `load()` query (`__tests__/next-match-card-overview.test.tsx` covers the overview variant, which takes its week from the server). Add one if the Supabase client can be mocked cleanly there, asserting that the pending-week query orders by `season` before `week`; otherwise say in the PR description that 5.3 was verified by reading.

---

## 6. Phase 2: rating v2

### 6.1 New `wprScore` (recommendations 2, 3, 4, 5, 7)

**Current behaviour** (`lib/utils.ts:158-214`): 60% shrunk points per game (5 phantom games), 25% recency-weighted last-five form, 15% label fading to zero at 10 games, then a 0.85 to 0.95 multiplier for 1 to 3 games and a 0.88 multiplier for "intermittent or calendar-rusty".

Faults being fixed:

- Form counts the last five results a second time; a win versus a loss is worth about 9 points to a 30-game player, more than the spread between regulars, and form does not predict the next result.
- Five phantom games is too little shrinkage; one debut result moves a newcomer by up to 26 points.
- The label term is not centred: "average" adds 7.5, "above" adds 15, "below" adds 0, so anyone with a few games is inflated.
- The "intermittent" rule counts non-`-` characters in `recentForm`, but the SQL never emits `-`. It only fires for players with 0 or 1 games, stacking an undocumented extra 12% cut.

**Required behaviour.** Replace the body of `wprScore` with:

```ts
// --- Per-player score (wprScore, v2) ---
const WPR_RESULTS_WEIGHT = 0.85        // shrunk points per game, normalised 0-100
const WPR_LABEL_POINTS = 7.5           // 'above' adds this, 'below' subtracts it, 'average' adds 0
const LABEL_FADE_GAMES = 10            // label weight reaches 0 at this many games (owner decision, do not change)
const PRIOR_GAMES = 12                 // phantom average games used to shrink points per game
const PRIOR_AVG_PPG = 1.5

export function wprScore(player: Player): number {
  const shrunkPpg = (player.points + PRIOR_GAMES * PRIOR_AVG_PPG) / (player.played + PRIOR_GAMES)
  const resultsScore = (shrunkPpg / 3) * 100 * WPR_RESULTS_WEIGHT

  const labelOffset =
    player.strength === 'above' ? WPR_LABEL_POINTS
    : player.strength === 'below' ? -WPR_LABEL_POINTS
    : 0
  const labelWeight = Math.max(0, 1 - player.played / LABEL_FADE_GAMES)

  const score = resultsScore + labelOffset * labelWeight
  return score * newcomerMultiplier(player.played) * rustMultiplier(player.gamesMissed ?? 0)
}

/** Players still new to the league are discounted: 0 or 1 game 0.85, 2 games 0.90, 3 games 0.95, 4+ games 1. */
function newcomerMultiplier(played: number): number {
  if (played <= 1) return 0.85
  if (played === 2) return 0.90
  if (played === 3) return 0.95
  return 1
}
```

`rustMultiplier` is defined in 6.2.

What is removed:

- The form term and `WPR_FORM_WEIGHT`, `WPR_PPG_WEIGHT`, `WPR_RATING_WEIGHT`. `recentForm` stays on `Player` because the UI displays it; `wprScore` no longer reads it.
- The intermittent rule and `MIN_RECENT_GAMES`.
- The `referenceDate` parameter and every `new Date()` inside `wprScore`. The function becomes pure.
- The `wprOverride` early return (see 6.3).

Rewrite the JSDoc above `wprScore` to describe the v2 formula.

**Acceptance values** (assert with `toBeCloseTo(value, 3)`; all with `gamesMissed` 0):

| Player | Expected |
|---|---|
| 0 games, below / average / above / `null` | 29.750 / 36.125 / 42.500 / 36.125 |
| Average strength, 1 game: win / draw / loss | 38.904 / 35.199 / 33.346 |
| Average strength, 2 games: two wins / two losses | 43.714 / 32.786 |
| Average strength, 3 games: three wins / three losses | 48.450 / 32.300 |
| Average strength, 4 games: four wins / four losses | 53.125 / 31.875 |
| 5 games, 7.5 points, below / average / above | 38.750 / 42.500 / 46.250 |
| 10 games, 15 points, below / average / above | 42.500 / 42.500 / 42.500 |
| 25 games, 36 points, above | 41.351 |
| 25 games, 45 points, below | 48.243 |
| 30 games: 45 points, then 48 points (one loss flipped to a win) | 42.500, 44.524 |

Also assert: changing `recentForm` does not change the score.

### 6.2 Rust by missed games (recommendation 6)

**Current behaviour** (`lib/utils.ts:197-211`, `NextMatchCard.tsx:60-72`): a 0.88 multiplier when more than 28 days separate the player's last played game from the moment the button is pressed. In a weekly league a player who missed exactly three games sits on the boundary, so the answer flips with the build day. DNF games do not count as having played. League-wide breaks count against everyone.

**Required behaviour.**

`lib/types.ts`, `Player`: remove `lastPlayedWeekDate`, add

```ts
gamesMissed?: number; // league games since this player's last appearance; derived at runtime, not persisted
```

`lib/utils.ts`:

```ts
/**
 * For each player name, the number of league games (status 'played' or 'dnf') dated after
 * that player's most recent appearance in a 'played' or 'dnf' week. Players who have never
 * appeared are absent from the map (treat as 0).
 */
export function gamesMissedByPlayer(weeks: Week[]): Map<string, number>

/** Returns copies of `players` with `gamesMissed` set from `weeks`. */
export function enrichPlayersForRating(players: Player[], weeks: Week[]): Player[]

/** 0 to 2 missed games: 1. 3 missed: 0.96. 4 missed: 0.92. 5 or more: 0.88. */
function rustMultiplier(gamesMissed: number): number
```

Order weeks with `parseWeekDate`. Cancelled, scheduled and unrecorded weeks are ignored. An appearance is the player's name in `teamA` or `teamB`.

Remove `RUSTINESS_DAYS` and `RUSTINESS_MULTIPLIER`; the multipliers now live inside `rustMultiplier`. Delete `deriveLastPlayedDates` from `NextMatchCard.tsx` and use `enrichPlayersForRating(allPlayers, weeks)` in `handleAutoPick`.

**Tests.**

- 20 games, 30 points, average strength, `gamesMissed` 0, 1, 2, 3, 4, 5, 6 gives 42.500, 42.500, 42.500, 40.800, 39.100, 37.400, 37.400.
- `gamesMissedByPlayer`: a player whose last appearance is followed by two played weeks and one cancelled week has 2; a player whose last appearance was a `dnf` week that is the most recent game has 0; a player in no week is absent from the map.
- `wprScore` gives the same value whatever the system clock is (use jest fake timers to move the clock by a year).

### 6.3 Guests, new players and zero-game roster players on one scale (recommendations 2, 11)

**Current behaviour.** Guests and new players get `wprOverride: hintToWpr(strength, leagueWprPercentiles(allPlayers))` (`NextMatchCard.tsx:83-116`). The percentile pool is half lapsed players, so the three hints come out as roughly 29.8, 32.7 and 37.8 against a regular's median of 38.5. With v2 the regulars' ratings bunch closer together, which would squash the hints further (the ordering clamp in `hintToWpr` makes "below" equal "average" once p25 / p50 exceeds 0.924). Zero-game roster players and the `unknown|` fallback take the normal `wprScore` path and land on a different scale again.

**Required behaviour.** Everyone with zero games is rated by `wprScore` itself: 29.750 / 36.125 / 42.500 for below / average / above. A new player then moves smoothly from that value as results arrive (see the table in 6.1) instead of jumping.

- In `resolvePlayersForAutoPick`, stop setting `wprOverride` on guests and new players. They are plain `Player` objects with `played: 0`, `points: 0` and `strength` set from the entry. The `unknown|` fallback keeps `strength: null`.
- Delete `hintToWpr`, `HINT_UNKNOWN_MULTIPLIER`, `HINT_EXPLICIT_MULTIPLIER`, `leagueWprPercentiles`, `WprPercentiles` and `leagueMedianWpr` from `lib/utils.ts`, with their tests. Confirm by grep that nothing else imports them.
- Remove `wprOverride` from `Player` in `lib/types.ts` and from every object literal and test that sets it. Update the two `// drives wprOverride at resolution time` comments on `GuestEntry.strength` and `NewPlayerEntry.strength`.
- `lib/__tests__/autoPick.test.ts` uses `wprOverride` in its fixtures to give players exact ratings. Replace that with a test helper that builds a veteran with a chosen rating: `played: 40`, `strength: null`, `points: rating * 52 * 3 / 85 - 18` (fractional points are fine in tests). With `PRIOR_GAMES = 12` this gives `wprScore === rating` for any rating from about 10 to 80.
- In `handleAutoPick`, `unknownIds` must also include roster players with `played === 0`.
- Update the JSDoc of `resolveTeamRatingForResult`, which still mentions `lastPlayedWeekDate` and `wprOverride`.

**Tests.** A guest, a new player and a zero-game roster player with the same strength get the same `wprScore`. Above is greater than average, which is greater than below, for zero-game players.

### 6.4 Team score: remove the variety bonus, rescale the keeper constants (recommendation 10)

**Variety bonus, current behaviour** (`lib/utils.ts:21-22, 242-247`): a team whose outfielders cover three mentalities gets +2. When only one team qualifies, the picker reaches a level score by giving that team players worth 2.0 less on average. In this league it hinges on two "defensive" labels.

**Required behaviour.** Delete `VARIETY_BONUS`, `VARIETY_MIN_MENTALITIES` and the `varietyBonus` term from `ewptScore`. Mentality remains on `Player` for display and for goalkeeper handling. Update the `ewptScore` JSDoc. Leave the depth term as it is.

**Keeper constants.** The goalkeeper modifier is a fixed number of team-score points, and v2 ratings are far less spread out (standard deviation among regulars 4.5 against 7.2 today). Left alone, a lone keeper's handicap would go from about half to about one standard deviation of the difference between random splits, and in simulation the true skill shifted to the keeperless side doubles (from about 0.3 to about 0.6 goals). Halving the constants restores today's size (about 0.3 goals):

| Constant | Today | New |
|---|---|---|
| `GK_BASE_BONUS` | 0.5 | 0.25 |
| `GK_WPR_SCALE` | 2.0 | 1.0 |
| `NO_GK_PENALTY` | -1.5 | -0.75 |
| `DUAL_GK_PENALTY` | -1 | -0.5 |

The logic in `ewptScore` is otherwise unchanged. Update the comments and JSDoc that quote the old range ("+0.5 to +2.5").

**Tests.** Two teams with identical ratings and keeper status score the same whatever their outfield mentalities. Remove the tests that assert the +2. Update `lib/__tests__/goalkeeper.test.ts` and any `ewptScore` tests for the new keeper values: a team of five players each rated 40.000 scores 40.000 - 0.75 = 39.250 with no keeper; with one keeper rated 40.000 it scores 40.000 + 0.25 + 0.4 = 40.650; with two keepers 40.000 - 0.5 = 39.500.

### 6.5 One enrichment path for both call sites (recommendation 15)

**Current behaviour.** `LineupLab.tsx:72-80` passes players straight to `autoPick` with no last-played data, so the Lab never applies rust and shows different teams and scores from the match card for the same squad.

**Required behaviour.**

- `app/[slug]/(tabs)/lineup-lab/page.tsx`: also fetch `getWeeks(leagueId)` (already cached) and pass `weeks` to `LineupLab`.
- `components/LineupLab.tsx`: accept `weeks: Week[]`, and build its player list with `enrichPlayersForRating(allPlayers, weeks)` (memoised) so every score and the Auto-Balance call use enriched players.
- `NextMatchCard.tsx` uses the same helper (6.2). The `Player` objects held in `localTeamA` / `localTeamB` are the enriched ones, so the live scores, the saved snapshot and the picker agree.

**Test.** For the same players and weeks, `ewptScore` of a team built from the Lab's player list equals `ewptScore` of the same team built from the match card's resolved list.

### 6.6 Documentation

- Rewrite the constants block comments at the top of `lib/utils.ts`.
- In `docs/superpowers/specs/2026-04-21-team-building/3-deferred-notes.md`, mark the cadence-aware rust item (3.4) as resolved by this spec.

### 6.7 Notes for the PR description

Team ratings saved before this phase (`weeks.team_a_rating`, `team_b_rating`) are on the old scale. Nothing needs migrating: `resolveTeamRatingForResult` keeps using the stored snapshot. Phase 4 adds a version marker so the two eras can be told apart.

What to expect, from a simulation of this exact formula against today's (100 seeded leagues per scenario, real attendance pattern):

- Match balance is better than today in every scenario tested: 2% to 11% over 150 weeks and 1% to 9% over the first 50, including scenarios where a goalkeeper genuinely helps and where labels are pure noise.
- A regular's rating moves about 1.1 points per appearance instead of 4.1.
- A newcomer's rating moves about 3.6 points between debut and second game instead of 11.5.
- The rating tracks true ability better among regulars (correlation about 0.55 against 0.43).

---

## 7. Phase 3: picker v2

Depends on Phase 2. Rewrite the search in `lib/autoPick.ts`; keep the public signature.

```ts
export interface AutoPickResult {
  suggestions: AutoPickSuggestion[]   // up to SUGGESTION_COUNT, ordered as in 7.3; may be fewer
  bestDiff: number                    // smallest diff in the valid set (7.2), or 0 when empty
  warning?: 'uneven-teams'            // set when pair constraints make equal sizes impossible
}

export function autoPick(
  players: Player[],
  pairs?: Array<[string, string]>,    // [guestName, hostName]
  unknownIds?: Set<string>,
  random?: () => number,
): AutoPickResult
```

`findAssocTeam` is no longer needed; delete it and its tests. `bestDiff` is not read anywhere in the UI today, so redefining it is safe. With fewer than two players return `{ suggestions: [], bestDiff: 0 }` as today.

A plain-JavaScript prototype built from this section was run against the acceptance tests in 7.9 and handled a 20-player squad in about 20 ms, so the design is known to be implementable and the tests are known to be satisfiable.

### 7.1 Faults being fixed

| Fault | Cause in current code |
|---|---|
| Guest keeper lands with the roster keeper about half the time | Guests are removed from the keeper pool (`autoPick.ts:98-99`) and placed by a coin flip |
| A player vanishes when two attendees share a `playerId` | Team B is built as "pool minus the ids in Team A" (`autoPick.ts:168-169`) |
| Four or more guests on one side give 6 v 4 or 7 v 3 | Pins are placed before sizes are computed; `sizeA` is only clamped at 0 (`autoPick.ts:161`) |
| Unknown players stacked on one side | Pin order plus an all-or-nothing filter with silent fallback (`autoPick.ts:202-209`) |
| Best split depends on the random seed and tap order when anything is pinned | Pair sides, keeper pins and the odd-squad slot are coin flips made before the search |
| Five suggestions collapse to near-copies with same-hint newcomers | Dedup key uses `playerId` only (`autoPick.ts:219-222`) |
| A lone keeper is always Team A; with no keeper the first player tapped is | `pinnedA = gkPlayers[0]`; mirror duplicates resolved by enumeration order |
| Biased shuffle | `sort(() => rng() - 0.5)` (`autoPick.ts:100, 175`) |
| Slow at 18 to 20 players | `combinations()` materialises every subset and `wprScore` is recomputed for every player in every split |

### 7.2 Search and constraints (recommendations 8, 9, 16)

1. **Identity is the array index.** Never use `playerId` or `name` to decide team membership. Resolve each `[guestName, hostName]` pair to indices once: the guest is the first index with that name that has not already been taken as the guest of an earlier pair; the host is the first index with that name. Ignore a pair whose guest is not found, whose host is not found, or whose guest and host are the same index.
2. **Units.** A host and all of that host's present guests form one unit that is always placed on the same side. Every other player is a unit of one. If a host is themselves someone's guest (the UI cannot produce this), the chain forms a single unit.
3. **Sizes.** Enumerate assignments of units to sides. A split is size-valid when the team sizes differ by 0 (even `n`) or 1 (odd `n`). For odd `n` both orientations are searched. If no assignment is size-valid, find the smallest size difference that the unit sizes allow (a subset-sum over unit sizes is enough), treat splits with that difference as size-valid, and set `warning: 'uneven-teams'`.
4. **Keepers.** Among size-valid splits keep only those with the smallest `|keepersA - keepersB|` found among them, counting every player whose `mentality` is `'goalkeeper'`, guests and new players included.
5. **Unknowns.** Among those, keep only the splits with the smallest `|unknownA - unknownB|` found among them, where unknown means `playerId` is in `unknownIds`. This replaces `COUNT_BALANCE_SLACK` and its fallback. No special case is needed for a single unknown.

The rules are applied strictly in that order: sizes, then keepers, then unknowns. A later rule never overrides an earlier one. Call the splits that survive steps 3 to 5 the **valid set**. `bestDiff` is the smallest `diff` in the valid set.

**Large squads.** For `n > EXHAUSTIVE_THRESHOLD` (keep 20), build a sample instead of enumerating:

1. Shuffle the units with a Fisher-Yates shuffle driven by the injected `rng`.
2. Choose the target size for one side: `n / 2` for even `n`; for odd `n` (or when step 3 above found two acceptable sizes) pick one of the acceptable sizes with `rng`.
3. Walk the shuffled units, adding each to that side if it still fits. If the side does not land exactly on the target, discard the attempt.
4. Repeat until 500 size-valid assignments are collected or 20,000 attempts have been made, then carry on with whatever was collected.

Apply steps 4 and 5 and section 7.3 to the sample. Remove every `sort(() => rng() - 0.5)`.

### 7.3 Choosing among level splits (recommendation 13)

Ratings are far noisier than the differences the old picker ranked on (the top five were typically 0.02 points apart; one result moves a team difference by more than a point). Treat every split close to the best as level and use the freedom to make the teams look alike.

```ts
const LEVEL_BAND = 0.5      // team-score points; splits within this of bestDiff are treated as level
const NEWCOMER_GAMES = 5    // players with fewer games than this count as newcomers when spreading them
```

1. `diff = |scoreA - scoreB|` as today.
2. The **band** is every valid split with `diff <= bestDiff + LEVEL_BAND`.
3. Order the band by, in turn:
   1. `newcomerGap` ascending: `|count of players with played < NEWCOMER_GAMES on A - same on B|`.
   2. `profileGap` ascending: sort each team's player ratings descending and sum `|a[k] - b[k]|` over `k = 0 .. min(sizeA, sizeB) - 1`.
   3. `diff` ascending.
   4. Exact ties on all three keep enumeration order (use a stable sort).
4. Walk that order, skipping duplicates (7.4), until `SUGGESTION_COUNT` (5) suggestions are collected. If the band runs out first, continue with the remaining valid splits ordered by `diff` ascending. If the valid set itself holds fewer than five distinct splits, return what there is; fewer than five suggestions is a valid result.

The suggestions are therefore **not** sorted by diff any more, and `suggestions[0].diff` can exceed `bestDiff` by up to `LEVEL_BAND`. Update the `AutoPickResult` comment and the `autoPick` JSDoc, and replace tests that assert diff-ascending order.

Measured on 150 realistic 14-player squads with the prototype: the first suggestion's diff averages 0.22 (maximum 0.51) instead of 0.004, the newcomer gap falls from 1.45 to 0.43, and the gap between the two teams' best two players falls from 7.3 to 5.7 points.

### 7.4 Duplicates and labels (recommendations 17, 18)

- **Duplicate key.** Two splits are the same suggestion when their teams match as unordered pairs of multisets of player keys. A player's key is the array index, except for a "free unknown" (in `unknownIds` and in a unit of one), whose key is `u|<rating>|<mentality>` using the unrounded rating (identical inputs give identical numbers). Swapping two newcomers with identical rating and mentality therefore does not create a new suggestion.
- **Mirror splits.** Enumerate each partition once (for example by fixing the unit that contains index 0 on one side).
- **Team labels.** After the suggestions are chosen, draw `rng() < 0.5` once; if true, swap `teamA` / `teamB` and `scoreA` / `scoreB` in **all** suggestions together. This is the only use of `rng` on the exhaustive path, so the teams for a given squad are the same on every press and only the labels can flip.
- **Order within a team.** Goalkeepers first (in input order among themselves), then the rest in input order. A guest is not moved next to their host.

### 7.5 Name collisions in the UI (recommendation 9)

- `components/AddPlayerModal.tsx`: add a prop `existingNewPlayers: NewPlayerEntry[]` (passed from `NextMatchCard`), and give `NewPlayerForm` `existingNames` = roster names + current new-player names + current guest names. The existing case-insensitive check then blocks a second "Tom". For a collision with a non-roster entry show `A player named "<name>" is already in this lineup.`
- `deriveGuestName` (`AddPlayerModal.tsx:33-37`): number a guest as the highest existing `+N` suffix among that host's guests plus one, not the count plus one, so removing `+1` and adding another cannot produce a second `+2`.
- `handleEditLineup` (`NextMatchCard.tsx:499-523`): drop any guest or new-player entry from the saved metadata whose name matches a roster name case-insensitively, so a newcomer who has since been added to the roster is not listed twice.

### 7.6 Uneven-teams warning (recommendation 16)

When `autoPickResult.warning === 'uneven-teams'`, show this line where the build error is shown in `NextMatchCard` (same `text-[#e2686f]` style): `Teams are uneven because too many guests are tied to one player.` Confirm Lineup stays enabled.

### 7.7 Performance (recommendation 19)

- Compute `wprScore` once per player per `autoPick` call.
- Add an internal helper so team scores can be computed from precomputed ratings, and have `ewptScore` use it:

  ```ts
  /** Team score from precomputed player ratings. `ewptScore(players)` equals `ewptScoreFromRatings(players, players.map(wprScore))`. */
  export function ewptScoreFromRatings(players: Player[], ratings: number[]): number
  ```

- Do not build an array holding every split. Repeated passes over the enumeration are fine: one to find the minimum keeper gap, unknown gap and `bestDiff`, one to collect the band, and a further one only when the band yields fewer than five distinct suggestions.
- Target: a 20-player squad returns in well under half a second in Node. Today it takes from about 0.3 seconds warm to several seconds on a cold first click, with roughly 250 MB of allocations. Check by hand with a script; do not add a timing assertion to the test suite.

### 7.8 Call-site changes

- `NextMatchCard.handleAutoPick`: no change to the arguments beyond the Phase 2 `unknownIds` addition. Handle `warning` (7.6).
- `LineupLab.handleAutoBalance`: unchanged call; it now gets both odd-squad orientations searched.

### 7.9 Acceptance tests (`lib/__tests__/autoPick.test.ts`)

Use the existing seeded RNG helper (`lib/__tests__/helpers/seeded-rng`). "Every seed" means at least 50 different seeds. That helper's first draw is below 0.5 for every seed from 0 to 200, so where a test depends on the label coin use well-spread seeds such as `seededRng(i * 7919)`.

1. **Every player once.** For random squads of 2 to 20 players, every suggestion contains each input object exactly once.
2. **Duplicate ids.** A 14-player squad containing two free players with the same `playerId` and `name`: every suggestion is 7 v 7 and contains both objects.
3. **Equal sizes.** Even `n` gives equal teams; odd `n` gives sizes differing by exactly one.
4. **Guest with host.** Each guest is on the same team as their present host in every suggestion, including two guests of one host and a guest whose host is a goalkeeper.
5. **Guest keeper.** One roster keeper plus a guest keeper whose host is an outfielder: the two keepers are on opposite teams for every seed and in every suggestion.
6. **Forced keeper pair.** A guest keeper whose host is the roster keeper: both are on the same team (the pair rule wins) and no error is thrown.
7. **Keeper counts.** Three keepers split 2 and 1; four keepers split 2 and 2; one keeper is allowed.
8. **Unknown balance.** Four unknowns with no pairs split 2 and 2. With one keeper, a guest of that keeper, a guest of an outfielder and **no other unknowns**, the two guests end up on opposite teams. (With further unknowns present the two guests may share a team, because the rule balances the total count.)
9. **Oversized unit.** `n = 10`, one keeper, one host with four guests: 5 v 5 for every seed, no warning (only one split exists, so one suggestion is returned). `n = 10`, one host with five guests: 6 v 4 and `warning === 'uneven-teams'`.
10. **Seed independence.** For `n <= 20`, the set of partitions returned (ignoring which side is called A) is identical for every seed.
11. **Input-order independence.** Shuffling the input array does not change `bestDiff` (compare to 9 decimal places). The suggestions themselves may differ on exact ties, so do not assert on them.
12. **Band.** `bestDiff` equals the brute-force minimum diff over the valid set. Every suggestion taken from the band has `diff <= bestDiff + 0.5`, and `suggestions[0]` has the smallest `newcomerGap` in the band.
13. **Interchangeable newcomers.** Fourteen players of which four are unknown with identical strength and mentality: no two suggestions are equal once those four are treated as interchangeable.
14. **Labels.** A lone keeper is on Team A for between 30% and 70% of 200 well-spread seeds.
15. **Score consistency.** For every suggestion, `scoreA` equals `ewptScore(teamA)` and `scoreB` equals `ewptScore(teamB)` to 9 decimal places, and `diff` equals their absolute difference.
16. **Large squads.** `n = 22` and `n = 24` with no pairs return five suggestions. With pairs they return between one and five. In both cases every suggestion is size-valid and respects the pair and keeper rules. A 22-player squad made of units of 8, 7 and 7 returns 14 v 8 with `warning === 'uneven-teams'`.

---

## 8. Phase 4: audit trail and honest display

### 8.1 Record what the picker did (recommendation 12)

**Current behaviour.** `lineup_metadata` stores only guests and new players. Nothing records which suggestion was used, whether it was edited by hand, or the ratings the picker saw. Three of the last 17 saved lineups were 3.9 to 7.6 points apart with nothing to show why.

**Types** (`lib/types.ts`):

```ts
export interface AutoPickAudit {
  algorithm: number          // TEAM_BUILDER_VERSION at save time
  suggestionIndex: number    // which of the suggestions was on screen (0-based)
  suggestionCount: number
  edited: boolean            // true when players were moved by hand after the pick
  bestDiff: number           // autoPickResult.bestDiff: the closest split that was available
  savedDiff: number          // |teamARating - teamBRating| as saved
  builtAt: string            // ISO timestamp
}

export interface LineupRatingEntry {
  name: string
  team: 'A' | 'B'
  wpr: number                // wprScore at save time, 3 decimals
  strength: Strength | null
  played: number
  gamesMissed: number
  kind: 'roster' | 'guest' | 'new'
}

export interface LineupMetadata {
  guests: GuestEntry[]
  new_players: NewPlayerEntry[]
  autoPick?: AutoPickAudit
  ratings?: LineupRatingEntry[]
}
```

Add `export const TEAM_BUILDER_VERSION = 2` to `lib/autoPick.ts`.

**Stored JSON.** Follow the existing snake_case convention in `lineupMetadataForDB` (`NextMatchCard.tsx:385-399`):

```json
{
  "guests": [],
  "new_players": [],
  "auto_pick": { "algorithm": 2, "suggestion_index": 0, "suggestion_count": 5, "edited": false, "best_diff": 0.012, "saved_diff": 0.012, "built_at": "2026-10-05T17:02:11.000Z" },
  "ratings": [ { "name": "…", "team": "A", "wpr": 41.351, "strength": "above", "played": 25, "games_missed": 0, "kind": "roster" } ]
}
```

**Writing.** In `handleSaveLineup`, build both blocks from `localTeamA`, `localTeamB`, `autoPickResult`, `suggestionIndex` and `isManuallyEdited`. `kind` comes from the `playerId` prefix (`guest|`, `new|`, otherwise `roster`). `save_lineup` already accepts arbitrary JSONB, so no migration is needed.

**Reading.** Map the two new keys in both places that parse `lineup_metadata`: `mapWeekRow` in `lib/fetchers.ts` and the inline parse in `NextMatchCard.tsx:324-340`. Both must tolerate the keys being absent.

**Display.** On the saved lineup card (`cardState === 'lineup'`, the "LINEUP body" block in `NextMatchCard.tsx`), when `scheduledWeek.lineupMetadata?.autoPick?.edited` is true, show a small tag under the two team lists reading `Adjusted by hand`, styled like the Draw badge: `font-plex text-[9.5px] font-bold uppercase tracking-[.16em] text-[#8ba4c4] border border-[#223a5c] rounded px-1.5 py-0.5`.

The public lineup route does not store `lineup_metadata` today; leave that as it is.

**Tests.** A unit test for the mapping (present, absent, partial). A component test that the tag renders only when `edited` is true.

### 8.2 Honest win bar (recommendation 14)

**Current behaviour.** `winProbability` uses `WIN_PROB_SCALE = 8` ("a 10-point gap is about 73%"). Over 50 games the fitted slope is indistinguishable from zero and sides shown at 70% or more won 8 of 14. For an untouched auto-picked lineup the bar only ever restates the picker's own target.

**Required behaviour.**

- `lib/utils.ts`: set `WIN_PROB_SCALE = 16` and update the `winProbability` JSDoc (a 10-point gap is about 65%). Remove the redundant `scoreA === 0 && scoreB === 0` branch.
- `winCopy`: change the even text to `Too close to call, this one could go either way` (the current string contains an em dash, which the copy rules forbid). Thresholds are unchanged.
- `NextMatchCard.tsx:833-868` (the block under the two team columns in auto-pick mode): when `isManuallyEdited` is false, do not render the two percentages or the bar; render only the caption `Even on paper` in the existing even-caption style (`text-[#8ba4c4]`). When `isManuallyEdited` is true, render the bar and `winCopy` text as today.
- `LineupLab.tsx` keeps the bar (every lineup there is hand-built).
- `buildShareText` (`lib/utils.ts:384-422`): change `teamARating` and `teamBRating` to `number | null`. When either is null, omit the rating in brackets after each team name and omit the `📊` prediction line (the same pattern `buildDnfShareText` already uses). Its only caller is `NextMatchCard.tsx:461-471`, which passes `?? 0`; change that to `?? null`. Leave `buildResultShareText` alone.

**Tests.** Update `utils.winCopy.test.ts` for the new string and scale (for example `winProbability(10, 0)` is about 0.651). Add `buildShareText` cases with null ratings. Add a component test that an unedited auto-pick shows `Even on paper` and no percentage, and that a manual swap brings the bar back.

---

## 9. Out of scope

Do not implement these; they are listed so nobody adds them by accident.

- Balancing on labels, a permanent label weight, or changing `LABEL_FADE_GAMES`. The owner has ruled the first two out and has not yet decided the third.
- Elo, plus-minus, goal-margin weighting, peer ratings, a five-level strength scale.
- Any change to the goalkeeper modifier beyond the halving in 6.4.
- A guest `+1` name that later exists as a roster row being rated from that row's results (latent; no such rows exist today).
- `edit_week` clearing rating snapshots when only the score changes.
- Storing `lineup_metadata` from the public lineup route.
- Ordering `recentForm` by date instead of `(season, week)` in the SQL RPCs (they agree once Phase 1 ships).
