# DNF Card Default-Open Fix

**Date:** 2026-04-27
**Status:** Approved

## Problem

When the results tab loads, the most recent result card should be expanded by default. Currently, if the most recent result is a DNF week, it stays collapsed and the previous played week is expanded instead.

**Root cause:** `ResultsSection.tsx` initialises `openWeek` using `getPlayedWeeks()`, which only considers weeks with `status === 'played'`. DNF weeks are excluded, so the fallback is the most recent played week.

`WeekList.tsx` already has the correct definition of "most recent result" — it filters `status === 'played' || status === 'dnf'` — but `ResultsSection` doesn't use the same logic.

## Design

**Single change: `components/ResultsSection.tsx`, lines 39–43.**

Replace:
```ts
const [openWeek, setOpenWeek] = useState<number | null>(() => {
  const played = getPlayedWeeks(weeks)
  if (played.length === 0) return null
  return sortWeeks(played)[0].week
})
```

With:
```ts
const [openWeek, setOpenWeek] = useState<number | null>(() => {
  const resulted = weeks.filter((w) => w.status === 'played' || w.status === 'dnf')
  if (resulted.length === 0) return null
  return sortWeeks(resulted)[0].week
})
```

This mirrors the existing logic in `WeekList.tsx` and makes the default-open week the most recent played-or-DNF week, whichever came last chronologically.

## Scope

- **One file changed:** `components/ResultsSection.tsx`
- **No new utilities** — the filter is a simple inline expression, identical to what WeekList already does
- **No type changes, no API changes, no migration**

## Success Criteria

- Loading the results tab when the most recent week is a DNF expands that DNF card by default
- When the most recent week is a played result (normal case), behaviour is unchanged
- When there are no played or DNF weeks, `openWeek` remains `null` (unchanged)
