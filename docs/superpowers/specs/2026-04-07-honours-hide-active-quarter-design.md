# Design: Hide Active Quarter from Honours Tab

**Date:** 2026-04-07

## Problem

The Honours tab shows quarterly standings for all quarters whose weeks are all resulted (played or cancelled). But if future weeks for the current quarter haven't been created in the DB yet, the current quarter has no `unrecorded` or `scheduled` rows — so it passes the "complete" check and appears in Honours while still being an active quarter.

## Rule

A quarter appears in Honours if and only if:
1. Its calendar end date has passed (today is after the last day of the quarter), **and**
2. All its DB weeks are played or cancelled (existing check), **and**
3. At least one week was played (existing check).

## Changes

### `lib/sidebar-stats.ts` — `computeAllCompletedQuarters`

- Add `now: Date = new Date()` parameter.
- For each bucket `(year, q)`, compute the quarter end date: `new Date(year, q * 3, 0)` (last day of the last month of the quarter — same pattern as `gamesLeftInQuarter`).
- Skip the bucket if `now <= quarterEnd` (quarter not yet over).
- Existing `hasIncomplete` and no-played-weeks checks are unchanged.

### `honours/page.tsx`

- Change `computeAllCompletedQuarters(weeks)` → `computeAllCompletedQuarters(weeks, new Date())`.

### `__tests__/sidebar-stats.test.ts`

- Existing tests pass unchanged (all use 2024/2025 dates; default `now` in 2026 is past them).
- Add one new test: a quarter whose weeks are all resulted but whose calendar end date is in the future is excluded.

## Non-changes

- No DB schema changes.
- No changes to `HonoursSection`, `HonoursLoginPrompt`, or any other component.
- No feature flag changes.
