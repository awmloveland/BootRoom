# In-Form Recency Filter

**Date:** 2026-03-31
**Status:** Approved

## Problem

The "Most In Form" sidebar widget ranks players by PPG across their last 5 games ever. There is no recency check, so a player who had a strong run months ago and hasn't played since can sit permanently at the top of the list.

## Decision

Add an 8-week hard cutoff to `computeInForm`. Any player whose last played game was more than 8 weeks before today is excluded from the widget, regardless of their PPG. All other behaviour — scoring, display, the `recentForm` string, every other consumer of player data — is unchanged.

## Scope

**Only affected:**
- `computeInForm` in `lib/sidebar-stats.ts` — gains a `weeks: Week[]` parameter and an inactivity filter
- `InFormWidget` in `components/StatsSidebar.tsx` — passes `weeks` to `computeInForm`
- `__tests__/sidebar-stats.test.ts` — new test cases for the recency filter

**Explicitly not affected:**
- `recentForm` string: not modified, not recomputed
- SQL / `get_player_stats` RPC: no changes
- `Player` type in `lib/types.ts`: no new fields
- `wprScore`, `playerFormScore` in `lib/utils.ts`: untouched
- `FormDots`, `RecentForm` display components: untouched
- Player stats table, lineup lab, next match card, public player list: untouched
- `computeQuarterlyTable`, `computeTeamAB`: untouched

## Changes

### `lib/sidebar-stats.ts`

`computeInForm` signature changes from:

```ts
export function computeInForm(players: Player[]): InFormEntry[]
```

to:

```ts
export function computeInForm(players: Player[], weeks: Week[], now?: Date): InFormEntry[]
```

`now` defaults to `new Date()` so callers that don't care about time can omit it (tests can inject a fixed date).

**Implementation:**

1. Build a `Map<string, Date>` of each player name → their most recent played game date, derived by iterating `weeks` filtered to `status === 'played'` and checking `teamA` and `teamB` membership.
2. Compute `cutoff = now - 56 days` (8 × 7).
3. In the existing `.filter()`, add: player must have a last-played date that is ≥ cutoff. Players with no entry in the map (never played a week, which shouldn't happen given `played >= 5`) are also excluded.
4. Everything else — PPG computation, sort, slice(0, 5) — stays the same.

### `components/StatsSidebar.tsx`

`InFormWidget` props change from `{ players: Player[] }` to `{ players: Player[], weeks: Week[] }`.

`computeInForm(players)` call becomes `computeInForm(players, weeks)`.

`StatsSidebar` already receives `weeks` — it passes it to `InFormWidget` alongside `players`.

### `__tests__/sidebar-stats.test.ts`

Add a new `describe` block inside `computeInForm`:

- Player with last game 4 weeks ago is included
- Player with last game exactly 8 weeks ago is included (boundary: inclusive)
- Player with last game 9 weeks ago is excluded
- Player with no week entry (fallback) is excluded
- Existing tests continue to pass by injecting a `now` date that puts all test players within the 8-week window

## Empty state

If 0 players pass the filter, `computeInForm` returns `[]`. `InFormWidget` already handles this with the existing `"Not enough data yet"` empty state — no new UI is needed.

## Recency reference point

The 8-week window is measured from `now` (runtime `new Date()`), not from the date of the most recent game. A league on a long hiatus will correctly show a sparse or empty list.
