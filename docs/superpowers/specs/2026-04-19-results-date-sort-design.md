# Results tab: sort weeks by date

**Status:** Design
**Date:** 2026-04-19
**Author:** Will Loveland
**Related PR (cause):** #98 — "per-year season stats, week resets, and results cleanup"

## Problem

After PR #98 shipped, the Results tab displays matches in a confusing order. The user's specific complaint: they see two cards labelled "Week 11" near each other — one from 2025, one from 2026 — and cannot be sure the data is correct.

### Why this happens

PR #98 introduced two changes that interact:

1. **Migration `20260417000001_season_year_reset.sql`** backfilled `weeks.season` to the calendar year (`split_part(date, ' ', 3)`) and renumbered `weeks.week` within each `(game_id, season)` partition using the **old sequential week number** as the ordering key:
   ```sql
   ROW_NUMBER() OVER (PARTITION BY game_id, season ORDER BY week ASC)
   ```
   This renumbering is correct only if every old `week` value was strictly chronological for its league. Any retroactive entry or out-of-order fix in the old data carries its non-chronological ordering into the new numbering.

2. **`sortWeeks()` in `lib/utils.ts:18`** sorts by `(season DESC, week DESC)` — it never consults the `date` column. Combined with (1), any week whose renumbered `week` value doesn't match its date's position now renders in the wrong slot.

The symptom the user sees — two "Week 11" cards visible in the same viewport — is a direct consequence of the per-year reset: every year now has its own Week 1, Week 2, … Week N. That's by design, but it makes non-chronological glitches much more visually jarring than they would have been with the old global numbering.

## Goal

Results (and every other "most recent" / "order weeks" surface) must display in true chronological order, using the `date` column as the ground truth. Week numbers remain useful **as labels** but stop being used **as a sort key**.

## Non-goals

- No changes to the database. `weeks.season` and `weeks.week` stay as the migration left them.
- No revert of PR #98. Year dividers, YearStats, per-year progress bar, and the PlayerCard year toggle all stay.
- No change to how new weeks are numbered when recorded.

## Approach

Change the sort key everywhere it's load-bearing from `(season, week)` to the parsed `date`.

### Primary change — `sortWeeks()`

In `lib/utils.ts:18-22`, replace:

```ts
export function sortWeeks(weeks: Week[]): Week[] {
  return [...weeks].sort((a, b) =>
    a.season !== b.season ? b.season.localeCompare(a.season) : b.week - a.week
  )
}
```

with:

```ts
export function sortWeeks(weeks: Week[]): Week[] {
  return [...weeks].sort(
    (a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime()
  )
}
```

`parseWeekDate()` already exists in `lib/utils.ts:304` and handles the canonical `'DD MMM YYYY'` format used across the app.

### Collapse duplicate "most recent" finders

Four files currently find "most recent played week" by re-implementing the `(season, week)` comparator. With `sortWeeks` now sorting by date, each of these becomes a one-liner: `sortWeeks(playedWeeks)[0]`.

| File | Line(s) | Current | Replace with |
|---|---|---|---|
| `components/WeekList.tsx` | 37-41 | `playedWeeks.reduce((a, b) => a.season > b.season \|\| (a.season === b.season && a.week > b.week) ? a : b)` | `sortWeeks(playedWeeks)[0] ?? null` |
| `components/PublicMatchList.tsx` | 16-20 | (same pattern) | `sortWeeks(playedWeeks)[0] ?? null` |
| `components/ResultsSection.tsx` | 42 | `played.reduce((a, b) => (a.week > b.week ? a : b)).week` | `sortWeeks(played)[0].week` |
| `lib/utils.ts` `deriveSeason` | 414-422 | Sort by season/week, pick first | `sortWeeks(played)[0].season` |

All four continue to compare `openWeek === week.week` for expand/collapse state — that stays keyed on `week` (per-year) because every render path works within a single rendered order and `week` is unique within a year.

### Align other per-year sorts to use date

These don't directly drive the results list, but they use `week` as an ordering proxy and will silently pick the wrong entry if the per-year numbering isn't chronological. Fix them for consistency:

| File | Line(s) | Change |
|---|---|---|
| `lib/utils.ts` `computeYearStats` recent form | 401-402 | Sort by `parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime()` instead of `b.week - a.week`. `yearPlayed` is already filtered to a single year. |
| `components/NextMatchCard.tsx` `deriveLastPlayedDates` | 55-57 | Sort played weeks by date desc (replace `b.week - a.week`). |
| `lib/sidebar-stats.ts` `computeTeamAB` streak | 356 | Sort by date desc for the current-streak walk. |

Already-correct sites (already sort by date): `lib/utils.ts:536 playerWeeksDesc`, `lib/sidebar-stats.ts:39` latest-week reduce, `lib/sidebar-stats.ts:140 longestWinStreak`. No change.

### Next-scheduled-week lookup

`app/[slug]/results/page.tsx:127` currently picks the scheduled week with the **lowest `week` number**:

```ts
const first = weeks.filter((w) => w.status === 'scheduled').sort((a, b) => a.week - b.week)[0]
```

Scheduled weeks were also renumbered by the backfill migration, so for the same correctness reason, switch to date ascending:

```ts
const first = weeks.filter((w) => w.status === 'scheduled')
  .sort((a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime())[0]
```

In practice there's usually one scheduled week in flight, but this removes the last remaining `week`-as-sort-key site.

### Divider rendering is unaffected

`WeekList.tsx:62-67` and `PublicMatchList.tsx:31-36` compute dividers as "did `season` / month-key change versus the previous card?" That adjacency check works for any ordering where same-year and same-month cards are contiguous. Sorting by date keeps them contiguous, and the `YearDivider` still reads its label from `week.season`, which the migration populated with the calendar year. No divider-code changes.

## Tests

Add unit tests in `lib/__tests__/utils.season.test.ts` (extends an existing file) covering:

1. `sortWeeks` returns an array ordered by parsed date descending for a mixed-year input.
2. `sortWeeks` orders by **date** even when the `week` number is non-chronological within a year — the regression test for the data scenario that motivated this spec. Input: two weeks in the same season with `{ week: 5, date: '10 Mar 2026' }` and `{ week: 6, date: '03 Mar 2026' }`. Expected output: week-6 (Mar 3) comes after week-5 (Mar 10) — date wins over week number.
3. `sortWeeks` places a later-dated year above an earlier-dated year regardless of week numbers (smoke test for year ordering).

## Rollout

Single PR. No migration. No feature flag. Deploy in one step.

## Risks

- **Minor key drift in stable-sort behaviour for same-date weeks.** Two played weeks can't share a date in practice (one game per day), but scheduled/cancelled placeholder rows could. `Array.prototype.sort` is spec-stable since ES2019, so input order is preserved on ties.
- **Parse cost on every render path.** `sortWeeks` is already called eagerly in `getWeeks()` on the server and a handful of client renders. The new comparator calls `parseWeekDate` for each comparison — O(n log n) parses vs O(n log n) string/number comparisons. Negligible at current data sizes (≤ ~100 weeks per league).

## Out of scope follow-ups

- Consider a future migration to replace `season text` + `week int` with a single `date`-derived view, eliminating the sort-key ambiguity at the schema level.
- Consider adding a `parsedDate` field to the `Week` type computed at `mapWeekRow` time to avoid re-parsing.
