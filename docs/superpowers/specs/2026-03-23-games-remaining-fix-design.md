# Games Remaining Fix — Design Spec

**Date:** 2026-03-23
**Status:** Approved (v3 — spec review fixes applied)

---

## Problem

The `gamesLeft` value in the quarterly table sidebar widget is calculated as:

```ts
const gamesLeft = Math.max(0, QUARTER_GAME_COUNT - maxPlayed)
```

where `QUARTER_GAME_COUNT = 16` is a hardcoded constant. This is wrong because the number of times a game day falls within a calendar quarter varies (e.g. Q1 2026 has 13 Wednesdays, not 16). The count should be calendar-derived.

---

## Goal

`gamesLeft` should reflect the number of future occurrences of the league's recurring game day from today to the end of the current calendar quarter — regardless of how many games have been played or cancelled.

---

## Constraints

- The game day (day of week) is consistent throughout a league's lifetime.
- A cancelled future game day still counts as a remaining game (purely calendar-based).
- Future work will store the game day explicitly in league config; the fix must make that wiring trivial.
- New leagues with zero played weeks should show `gamesLeft = 0` (safe fallback).

---

## Design

### New helper: `gamesLeftInQuarter`

Counts forward occurrences of a given day-of-week (0=Sun…6=Sat, matching `Date.getDay()`) from tomorrow to the last day of the quarter.

```ts
function gamesLeftInQuarter(q: number, year: number, gameDay: number, now: Date): number {
  // q * 3 - 1 gives the 0-indexed month of the quarter's last month (e.g. Q1 → 2 = March)
  // new Date(year, month + 1, 0) gives the last day of `month` at local midnight
  // JavaScript's Date constructor with integer arguments always sets time to 00:00:00.000 local
  const quarterEndMonthIdx = q * 3 - 1
  const quarterEnd = new Date(year, quarterEndMonthIdx + 1, 0) // midnight, last day of quarter

  let count = 0
  const cursor = new Date(now)
  cursor.setDate(cursor.getDate() + 1) // start from tomorrow (today excluded)
  cursor.setHours(0, 0, 0, 0)          // normalize to midnight so cursor <= quarterEnd is reliable
  // Without this normalization, a mid-day cursor on the last day of the quarter would be
  // greater than the midnight quarterEnd, incorrectly excluding that final day.
  while (cursor <= quarterEnd) {
    if (cursor.getDay() === gameDay) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}
```

**`gameDay` values:** uses `Date.getDay()` convention — 0 = Sunday, 1 = Monday, …, 6 = Saturday.

**Quarter end month derivation:** `quarterEndMonthIdx = q * 3 - 1` gives the 0-indexed month of the last month of the quarter (Q1→2, Q2→5, Q3→8, Q4→11). Passing `quarterEndMonthIdx + 1` as the month and `0` as the day to `new Date()` yields the last day of `quarterEndMonthIdx` — this is a standard JS idiom.

### New helper: `inferGameDay`

Infers the league's game day from the most recent played week **across all history** (not just the current quarter). This is intentional: if a new quarter opens with a run of cancellations, there are no played weeks in the current quarter yet, but prior-quarter played weeks correctly identify the game day. Returns `null` only if there are zero played weeks across all history.

```ts
function inferGameDay(weeks: Week[]): number | null {
  const played = weeks.filter(w => w.status === 'played')
  if (played.length === 0) return null
  // reduce without initial value is safe here — `played` is guaranteed non-empty after the guard above
  const latest = played.reduce((a, b) => (parseWeekDate(a.date) > parseWeekDate(b.date) ? a : b))
  return parseWeekDate(latest.date).getDay()
}
```

### Updated signature: `computeQuarterlyTable`

Adds an optional `gameDay` parameter. If provided, it is used directly. If omitted, the game day is inferred via `inferGameDay`.

```ts
export function computeQuarterlyTable(
  weeks: Week[],
  now: Date = new Date(),
  gameDay?: number   // 0=Sun…6=Sat; if omitted, inferred from played weeks
): QuarterlyTableResult
```

`gamesLeft` is computed as:

```ts
const { q, year } = quarterOf(now)   // reuse — already derived earlier in the function for week filtering
const resolvedGameDay = gameDay ?? inferGameDay(weeks)
const gamesLeft = resolvedGameDay !== null
  ? gamesLeftInQuarter(q, year, resolvedGameDay, now)
  : 0
```

`q` and `year` come from `quarterOf(now)`, which is already called earlier in `computeQuarterlyTable` to determine which weeks belong to the current quarter. Reuse those values — do not call `quarterOf` a second time.

### Removed

- `QUARTER_GAME_COUNT` constant — deleted entirely.
- The subtraction-based `gamesLeft` calculation — replaced by the above.
- `Math.max(0, ...)` clamp — no longer needed; `gamesLeftInQuarter` is naturally non-negative.

### Breaking behavior change

All three existing `gamesLeft` tests must be replaced:

1. `'returns gamesLeft as QUARTER_GAME_COUNT minus maxPlayed'` — subtraction logic is gone.
2. `'returns QUARTER_GAME_COUNT as gamesLeft when entries is empty'` — empty input with no `gameDay` now returns `0`, not `16`.
3. `'clamps gamesLeft to 0 when maxPlayed exceeds QUARTER_GAME_COUNT'` — `maxPlayed` is no longer used; the `Math.max(0, ...)` clamp is also removed.

---

## Tests

All existing `gamesLeft` tests are replaced. New tests, each with concrete inputs:

| Scenario | Example inputs | Expected |
|---|---|---|
| Explicit `gameDay`, mid-quarter | `now = new Date(2026, 0, 7)` (7 Jan, Q1), `gameDay = 3` (Wednesday) | count of Wednesdays from 8 Jan to 31 Mar 2026 = 11 |
| `gameDay` inferred from played weeks in current quarter | Week dated `'07 Jan 2026'` (Wednesday); omit `gameDay` | inferred `gameDay = 3`; same count as above |
| `gameDay` inferred from prior-quarter history (current quarter has only cancelled weeks) | One played week in Q4 2025 on a Wednesday; all Q1 2026 weeks cancelled; `now` in Q1 2026 | inferred `gameDay = 3` from Q4 data; correct Q1 count |
| `now` is first day of quarter | `now = new Date(2026, 0, 1)` (1 Jan, Q1), `gameDay = 3` (Wednesday) | count of Wednesdays from 2 Jan to 31 Mar 2026 = 12 |
| `now` is last day of quarter | `now = new Date(2026, 2, 31)` (31 Mar, Q1), `gameDay = 2` (Tuesday — 31 Mar 2026 is a Tuesday) | `gamesLeft === 0` (cursor starts at 1 Apr, past `quarterEnd`) |
| `now` IS the last game day of the quarter | `now = new Date(2026, 2, 31)` (31 Mar 2026, a Tuesday), `gameDay = 2` | `gamesLeft === 0` (today excluded; cursor starts tomorrow, which is in Q2) |
| `now` IS a game day mid-quarter | `now = new Date(2026, 0, 7)` (7 Jan 2026, a Wednesday), `gameDay = 3` | today is excluded; count starts from 14 Jan |
| `now` is day before a game day | `now = new Date(2026, 0, 6)` (6 Jan, Tuesday), `gameDay = 3` (Wednesday) | 7 Jan counted; total = 13 |
| `gameDay = 0` (Sunday boundary) | `now = new Date(2026, 0, 1)`, `gameDay = 0` | count of Sundays from 2 Jan to 31 Mar 2026 |
| No weeks, no `gameDay` | empty `weeks`, no `gameDay` arg | `gamesLeft === 0` |

Tests pass `gameDay` explicitly wherever possible for determinism. The `inferGameDay` path is covered by the two inference scenarios, one of which exercises all-history lookup across quarter boundaries.

---

## Future work

When league config gains a `game_day` field, callers pass it as the `gameDay` argument. No changes to `computeQuarterlyTable` internals required.

---

## Files changed

| File | Change |
|---|---|
| `lib/sidebar-stats.ts` | Add `inferGameDay`, `gamesLeftInQuarter`; update `computeQuarterlyTable`; remove `QUARTER_GAME_COUNT` |
| `__tests__/sidebar-stats.test.ts` | Replace all three `QUARTER_GAME_COUNT`-based `gamesLeft` tests with calendar-aware tests |
