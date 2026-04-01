# Quarterly Table Holdover Design

**Date:** 2026-04-01
**Status:** Approved

---

## Problem

The `QuarterlyTableWidget` resets to an empty state the moment a new calendar quarter begins, because `computeQuarterlyTable()` always computes for the quarter containing `now`. On 2026-04-01 (first day of Q2), Q2 has zero played games, so the table appears blank even though Q1 just ended with meaningful standings.

## Goal

Show the previous quarter's final standings until the first game of the new quarter has been resulted. Once that game exists, switch to live current-quarter data.

---

## Design

### 1. `computeQuarterlyTable()` — holdover logic

**File:** `lib/sidebar-stats.ts`

Add a check at the top of the function, after determining the current quarter:

1. Filter `weeks` to those in the current calendar quarter with `status === 'played'`.
2. If that set is **empty**, step back one quarter (handling the Q4 → Q1 year wrap: Q1 of year N steps back to Q4 of year N−1).
3. Compute the table for the stepped-back quarter.
4. Set `isHoldover: true` and `holdoverQuarter: { q, year }` on the result.

If the current quarter has at least one played week, compute as normal with `isHoldover: false`.

The existing `label` field (e.g. `"Q2 26"`) reflects the *displayed* quarter, so during holdover it naturally reads `"Q1 26"`.

### 2. `QuarterlyTableResult` type update

Add two fields to the return type:

```ts
isHoldover: boolean
holdoverQuarter?: { q: number; year: number }
```

### 3. `QuarterlyTableWidget` — rendering changes

**When `isHoldover` is true:**
- Append `· Final` after the quarter label (e.g. `"Q1 26 · Final"`).
- Hide the games-left progress bar and counter (irrelevant for a completed quarter).
- Champion banner renders as normal — it derives from Q1's final computed state, so it updates immediately after the last Q1 game is resulted, as it does today.

**When `isHoldover` is false:**
- No change to existing rendering.

### 4. Quarter step-back logic

```
previous quarter of (q, year):
  if q > 1 → (q - 1, year)
  if q = 1 → (4, year - 1)
```

This is the only new helper needed; it can live inline in `computeQuarterlyTable()` or as a small named function.

---

## What does NOT change

- `getWeeks()` — already fetches all weeks; previous quarter data is in memory.
- Champion banner logic — no changes; derives naturally from holdover quarter data.
- All-time player stats table (`/players` page) — unaffected.
- Feature flags — no new flag needed; this is a display behaviour fix.

---

## Testing

- `computeQuarterlyTable()` with `now` = first day of Q2, no Q2 played weeks → returns Q1 data, `isHoldover: true`.
- `computeQuarterlyTable()` with `now` = first day of Q2, one Q2 played week → returns Q2 data, `isHoldover: false`.
- `computeQuarterlyTable()` with `now` = first day of Q1 (Jan 1), no Q1 played weeks → steps back to Q4 of previous year.
- Existing tests continue to pass unchanged.
