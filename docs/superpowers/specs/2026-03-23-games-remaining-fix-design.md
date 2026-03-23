# Games Remaining Fix — Design Spec

**Date:** 2026-03-23
**Status:** Approved

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

Counts forward occurrences of a given day-of-week from tomorrow to the last day of the quarter.

```ts
function gamesLeftInQuarter(q: number, year: number, gameDay: number, now: Date): number {
  const quarterEndMonth = q * 3 - 1                        // 0-indexed month of quarter end
  const quarterEnd = new Date(year, quarterEndMonth + 1, 0) // last day of that month

  let count = 0
  const cursor = new Date(now)
  cursor.setDate(cursor.getDate() + 1) // start from tomorrow
  while (cursor <= quarterEnd) {
    if (cursor.getDay() === gameDay) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}
```

### New helper: `inferGameDay`

Infers the league's game day from the most recent played week across all history. Returns `null` if no played weeks exist.

```ts
function inferGameDay(weeks: Week[]): number | null {
  const played = weeks.filter(w => w.status === 'played')
  if (played.length === 0) return null
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
const resolvedGameDay = gameDay ?? inferGameDay(weeks)
const gamesLeft = resolvedGameDay !== null
  ? gamesLeftInQuarter(q, year, resolvedGameDay, now)
  : 0
```

### Removed

- `QUARTER_GAME_COUNT` constant — deleted entirely.
- The subtraction-based `gamesLeft` calculation — replaced by the above.

---

## Tests

All existing `gamesLeft` tests are replaced. New tests:

| Scenario | Approach |
|---|---|
| Explicit `gameDay` passed | Assert count equals manually computed forward occurrences |
| `gameDay` inferred from played weeks | Pass weeks on a known day, omit `gameDay`, assert correct count |
| `now` is last day of quarter | Assert `gamesLeft === 0` |
| `now` is day before a game day | Assert that game day is included in count |
| No weeks, no `gameDay` | Assert `gamesLeft === 0` |

Tests pass `gameDay` explicitly wherever possible for determinism.

---

## Future work

When league config gains a `game_day` field, callers pass it as the `gameDay` argument. No changes to `computeQuarterlyTable` internals required.

---

## Files changed

| File | Change |
|---|---|
| `lib/sidebar-stats.ts` | Add `inferGameDay`, `gamesLeftInQuarter`; update `computeQuarterlyTable`; remove `QUARTER_GAME_COUNT` |
| `__tests__/sidebar-stats.test.ts` | Replace `QUARTER_GAME_COUNT`-based `gamesLeft` tests with calendar-aware tests |
