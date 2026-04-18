# Season / Year Filtering Design

**Date:** 2026-04-17
**Status:** Approved

---

## Overview

Leagues accumulate results across multiple calendar years. This feature makes year-based navigation and per-year stats accessible to members and public visitors, without hiding or re-routing any existing content.

Two surfaces are affected:
- **Results page** — a floating year-jump nav for quickly scrolling to a year's section
- **Players page** — a per-card year toggle for viewing a player's stats scoped to a specific season

A prerequisite data model change ensures week numbers reset each calendar year, making them meaningful as a progress indicator (e.g. "Week 14 of 52").

---

## 1. Data Model

### `weeks.season`
Changes from a derived range string (e.g. `"2025–26"`) to a plain 4-digit calendar year string (e.g. `"2026"`). Season is always the calendar year of the week's `date` field.

The existing `UNIQUE(season, week)` constraint on `weeks` is already correct for this model — no schema change needed, only data changes.

### `weeks.week` — annual reset
Week numbers reset to 1 at the start of each calendar year. Week 1 of 2026 is the first game played in 2026, regardless of the total week count from prior years.

### `Week` type (`lib/types.ts`)
Add `season: string` to the `Week` interface so components can group and anchor by year without re-parsing the date string.

### Migration (`supabase/migrations/YYYYMMDD_season_year_reset.sql`)
1. Drop the `UNIQUE(season, week)` constraint temporarily.
2. For each row, set `season = split_part(date, ' ', 3)` (extracts the 4-digit year from `'DD MMM YYYY'`).
3. Renumber `week` within each `(game_id, season)` group using `ROW_NUMBER() OVER (PARTITION BY game_id, season ORDER BY week ASC)` — preserving relative order.
4. Recreate the `UNIQUE(game_id, season, week)` constraint.

---

## 2. Backend & Utility Changes

### `get_player_stats` and `get_public_player_stats` RPCs
`recentForm` currently orders by `week DESC`. Since week numbers now reset per year, week 1 of 2026 would incorrectly sort before week 50 of 2025. Fix: change the `ORDER BY` clause in the `ranked` CTE to `ORDER BY season DESC, week DESC`.

### `getNextWeekNumber` (`lib/utils.ts`)
Currently returns `max(week) + 1` across all weeks. Change to filter weeks to the current calendar year first, then return `max(week) + 1` within that year, or `1` if no weeks exist yet this year. Current year is derived from `new Date().getFullYear()`.

### `deriveSeason` (`lib/utils.ts`)
Simplify: return the `season` value from the most recent played week, or `String(new Date().getFullYear())` as fallback. The complex range-derivation logic (`"2025–26"`) is no longer needed.

### `getWeeks` fetcher (`lib/fetchers.ts`)
`season` is not currently in the `select` list. Add it to the `.select(...)` call and to the `mapWeekRow` mapping so it surfaces on every returned `Week`.

### `create_unrecorded_week` RPC
No signature change needed. The server-side code that calls it already derives `season` via `deriveSeason(weeks)` — after this change, that returns the plain 4-digit year string, which is correct.

---

## 3. Results Page — Year-Jump Nav

Only rendered when the league has played weeks spanning more than one calendar year.

### Year anchors
A `<div id="year-{YYYY}">` anchor is inserted just before the first week of each year in `WeekList` and `PublicMatchList`. A year-level divider heading (e.g. `— 2025 —`) is shown when the year changes between weeks, at the same visual level as existing month groupings.

### `YearJumpNav` component
A new `'use client'` component rendered above the week list. Shows years in descending order (most recent first) as pill buttons. Clicking a year calls `document.getElementById('year-YYYY')?.scrollIntoView({ behavior: 'smooth' })`. Hidden when `availableYears.length <= 1`.

**Responsive priority:** The year-jump nav is the first element to disappear as viewport narrows. The stats sidebar takes priority and must remain visible at intermediate widths before it eventually collapses into the mobile FAB. Concretely: `YearJumpNav` is hidden below the breakpoint where the sidebar starts to be squeezed (i.e. `hidden lg:block` or similar), while the sidebar follows its existing hide/FAB pattern at the mobile breakpoint.

### Progress bar (`LeaguePageHeader`)
Currently shows `playedCount / 52` (all-time). Change to show the current calendar year's week count: the highest `week` number among played/cancelled weeks in the current year. Falls back to the previous year's final week count if no games have been played in the current year yet (e.g. early January). For a past year shown in context this would show that year's final count.

---

## 4. Players Page — Per-Card Year Toggle

### Placement & visibility
The year selector lives in the `PlayerCard` header, but is **only visible when the card is open**. It animates in (fade + expand from `max-width: 0`) alongside the player name as the card expands.

Format: `Will - All Time ▾` where `All Time ▾` is `text-sky-400` link-style text with a small chevron. The dash is a standard hyphen-minus (`-`), not an em dash.

Clicking the blue text opens a dropdown listing `All Time` followed by years in ascending order (oldest first). The dropdown is a standard Radix UI popover or a small absolute-positioned menu styled to match the existing app palette (`bg-slate-950`, `border-slate-700`).

### Conditional rendering
The year selector only renders if the player has appeared in weeks across more than one calendar year. Single-season players show a clean header with no toggle.

### Year-filtered stats — `computeYearStats`
A new utility function in `lib/utils.ts`:

```ts
export interface YearStats {
  played: number
  won: number
  drew: number
  lost: number
  winRate: number
  points: number
  recentForm: string   // last 5 games in that year, newest-first, e.g. 'WWDL-'
  qualified: boolean   // played >= 5 within that year
}

export function computeYearStats(playerName: string, weeks: Week[], year: string): YearStats
```

Filters `weeks` to `status === 'played'` and `season === year`, aggregates W/D/L, derives `recentForm` from the last 5 ordered by `week DESC`, and applies `qualified = played >= 5`. Points use W=3, D=1, L=0. `YearStats` is added to `lib/types.ts`.

Attributes that are not year-specific (`mentality`, `rating`, `goalkeeper`) always come from the all-time player data.

### `weeks` prop on the players page
`getWeeks` is already called on the players page (passed to `StatsSidebar`). Pass the same `weeks` array down to `PublicPlayerList` → `PlayerCard` so each card can run `computeYearStats` client-side without an extra fetch.

---

## 5. Affected Files Summary

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDD_season_year_reset.sql` | New migration: set season = year, renumber weeks per year |
| `supabase/migrations/YYYYMMDD_fix_recent_form_ordering.sql` | Update `get_player_stats` + `get_public_player_stats` ORDER BY |
| `lib/types.ts` | Add `season: string` to `Week` interface |
| `lib/utils.ts` | Simplify `deriveSeason`, update `getNextWeekNumber`, add `computeYearStats` |
| `lib/fetchers.ts` | Ensure `season` is selected and mapped in `getWeeks` |
| `components/PlayerCard.tsx` | Add year dropdown (animates in on open, conditional on multi-year data) |
| `components/PublicPlayerList.tsx` | Pass `weeks` prop through to `PlayerCard` |
| `components/WeekList.tsx` | Add year anchor dividers |
| `components/PublicMatchList.tsx` | Add year anchor dividers |
| `components/YearJumpNav.tsx` | New client component — floating year-jump pill nav |
| `app/[slug]/results/page.tsx` | Render `YearJumpNav`, update progress bar to current-year count |
| `app/[slug]/players/page.tsx` | Pass `weeks` to `PublicPlayerList` |
