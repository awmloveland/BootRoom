# Game-count fixes: sidebar "games left" + honours quarter date range

**Date:** 2026-07-07
**Status:** Approved
**Scope:** `lib/sidebar-stats.ts`, `__tests__/sidebar-stats.test.ts`

## Problem

Two game-count displays are wrong, both computed in `lib/sidebar-stats.ts`:

1. **Stats sidebar league table — "X games left".** `gamesLeftInQuarter()` walks
   calendar game days starting from **tomorrow**, so on a game day whose result has
   not yet been recorded the count is one short (shows "1 game left" when tonight's
   game plus one more remain). The count is purely calendar-based and never consults
   week data.
2. **Honours tab — in-progress quarter date range.** `computeAllQuarters()` derives a
   quarter's date range as min/max of the weeks recorded so far. Correct for
   completed quarters; for an in-progress quarter it shows "quarter start → latest
   recorded week" instead of the full planned span.

## Agreed behaviour

- **Games left:** a game day counts as "left" until a week dated on that day exists
  with a settled status (`played`, `cancelled`, `dnf`, `unrecorded`). `scheduled`
  weeks and days with no week row still count. This applies uniformly to today and
  future days, so a pre-cancelled future week also stops counting as a game left.
- **In-progress quarter range:** *from* = earliest recorded week in the quarter when
  one exists, else first game day on/after the calendar quarter start; *to* = last
  game day on or before the calendar quarter end. When no game day can be inferred,
  fall back to raw calendar quarter bounds. Completed and upcoming quarters keep
  their existing logic. `weekRange` is unchanged (future week numbers don't exist).

## Design

### 1. `gamesLeftInQuarter` becomes fixture-aware

New signature: `gamesLeftInQuarter(q, year, gameDay, now, weeks: Week[])` (module-private).

- Build a `Set<number>` of midnight-normalised timestamps for all weeks with
  `status !== 'scheduled'`.
- Walk from **today** (midnight-normalised `now`) through the quarter's calendar end
  inclusive; count days matching `gameDay` whose timestamp is not in the settled set.
- `computeQuarterlyTable` passes its `weeks` argument through. Public signature,
  holdover behaviour (`gamesLeft = 0`), and `gamesTotal = gamesPlayed + gamesLeft`
  are unchanged. Empty weeks data degrades to a pure calendar count.

### 2. `computeAllQuarters` in-progress date range

Insert a `status === 'in_progress'` branch ahead of the existing date-range logic:

```ts
if (status === 'in_progress') {
  const from = qWeeks.length > 0
    ? new Date(Math.min(...qWeeks.map(w => parseWeekDate(w.date).getTime())))
    : gameDay !== null ? firstWeekdayOnOrAfter(gameDay, qStart) : qStart
  const to = gameDay !== null ? lastWeekdayOnOrBefore(gameDay, qEnd) : qEnd
  dateRange = { from: formatDate(from), to: formatDate(to) }
}
```

Existing `qWeeks.length > 0` / game-day-inference / calendar-fallback branches remain
for completed and upcoming quarters.

### 3. Tests

In `__tests__/sidebar-stats.test.ts`:

- Rewrite the test asserting today is excluded: today's unplayed game day now counts;
  once a `played` (or `cancelled`) week dated today exists, it no longer counts.
- New: a future `cancelled` week does not count as a game left.
- New (honours): in-progress quarter `to` equals the final game day on or before the
  quarter's calendar end; `from` equals the earliest recorded week; with no
  inferable game day the range falls back to calendar quarter bounds.

Verification: `npm test` and `npx tsc --noEmit`.

## Out of scope

- Holdover edge case: a new quarter whose first game is today but unplayed still
  shows the previous quarter with `gamesLeft = 0` (pre-existing behaviour).
- Upcoming quarters that already contain scheduled weeks keep min/max behaviour.
- Pre-creating scheduled week rows for whole quarters (data-driven schedule) —
  rejected as beyond the scope of two display bugs.
