# Form Display Direction Fix

**Date:** 2026-03-26
**Status:** Approved

## Problem

The recent form string (e.g. `WWDWL`) is built by SQL with `ORDER BY week DESC`, making index 0 the most recent result. Both display components (`RecentForm`, `FormDots`) render the string left-to-right without reversal, so the most recent result appears on the **left**. The football stats convention is oldest on the left, newest on the right — the same direction used by BBC Sport, FotMob, and similar products.

## Decision

Reverse the form string at the **render layer only**, inside the two display components. No changes to the data model, SQL, scoring logic, or any other consumer.

## Changes

### `components/RecentForm.tsx`

Reverse the `form` prop before mapping over characters:

```tsx
[...form].reverse().map((char, i) => ...)
```

### `components/FormDots.tsx`

Same reversal:

```tsx
[...form].reverse().map((char, i) => ...)
```

## What does NOT change

- The `recentForm` string stored in the DB and passed as props remains newest-first (index 0 = most recent). This ordering is correct for `wprScore` in `lib/utils.ts`, which weights index 0 with the highest recency factor (`1 - i * 0.15`).
- All sorting and scoring logic in `lib/utils.ts`, `lib/sidebar-stats.ts`, and `components/PublicPlayerList.tsx` is unaffected.
- No SQL migrations required.
- No label or reading-direction hint is added to the UI — the convention is self-evident.

## Affected surfaces

All surfaces automatically pick up the fix via the two components:

- Player stats table (`PlayerCard`, `PlayerStatsCard`)
- Stats sidebar top-form widget (`StatsSidebar`)
- Lineup lab player cards (`LineupLab`)
- Next match card player lists (`NextMatchCard`)
- Public player list (`PublicPlayerList` via `FormDots` / `RecentForm`)
