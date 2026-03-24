# Margin of Victory — Design Spec

**Date:** 2026-03-24
**Status:** Approved

---

## Overview

Add a dedicated `goal_difference` integer field to the match result flow, replacing the informal practice of recording margin in the free-text `notes` field. Historic notes will be parsed and backfilled automatically.

---

## Requirements

- Margin is stored as a positive integer (e.g. `3` = won by 3 goals)
- Margin is **required** when recording a win; draws auto-submit `0`
- Notes field remains for free-text context (injuries, attendance, etc.)
- Historic notes matching `+N goals` are backfilled automatically; non-matching rows stay `NULL`
- Margin is displayed in the expanded match card body, hidden for draws and null values

---

## Data Model

### Migration

One new migration (`20260324000001_add_goal_difference.sql`):

```sql
-- 1. Add column
ALTER TABLE weeks
  ADD COLUMN IF NOT EXISTS goal_difference integer;

-- 2. Backfill from notes
UPDATE weeks
SET goal_difference = (regexp_match(notes, '^\+(\d+)\s*goals?', 'i'))[1]::integer
WHERE status = 'played'
  AND notes ~* '^\+(\d+)\s*goals?'
  AND goal_difference IS NULL;
```

**Schema after migration:**

| Column | Type | Notes |
|---|---|---|
| `goal_difference` | `integer` | nullable; `NULL` = not recorded; `0` = draw |

---

## Backend

### `record_result` RPC (`20260314000005_match_entry_member_rpcs.sql`)

Add parameter `p_goal_difference integer DEFAULT NULL`, written to `goal_difference` alongside `winner` and `notes`.

```sql
CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL
)
```

### Public result API (`/api/public/league/[id]/result`)

Accept `goalDifference?: number` in the POST body, pass through to the `weeks` update.

### TypeScript types (`lib/types.ts`)

Add to the `Week` interface:

```ts
goal_difference?: number | null;  // null = not recorded; 0 = draw
```

---

## UI

### ResultModal — winner step

- Selecting **Team A** or **Team B** reveals a "Margin of Victory" row with label, sub-label ("Goals [Team] won by"), and a `−` / `+` stepper (minimum value: 1, no maximum)
- Selecting **Draw** hides the row and submits `goal_difference: 0`
- The **Confirm Result** / **Next →** button is disabled until:
  - A winner is selected, **and**
  - If a winner (not draw): a margin ≥ 1 is set
- The stepper initialises at `1` when a winner is first selected
- The existing notes textarea remains below the margin row, unchanged

### MatchCard — expanded body

Below the team line-ups and the divider, margin and notes are rendered as matching pills side by side:

```
[ MARGIN  +3 goals ]  [ NOTES  Good intensity, played through the rain. ]
```

- Pills are left-aligned with an 8px gap
- Margin pill is hidden when `goal_difference` is `null` (unbackfilled historic records)
- Margin pill is hidden when `goal_difference` is `0` (draws — result is self-evident)
- Notes pill is hidden when `notes` is null or empty (existing behaviour, unchanged)

---

## Backfill Strategy

The migration regex `^\+(\d+)\s*goals?` (case-insensitive) matches patterns like:
- `+3 Goals`
- `+1 goal`
- `+3 goals, great match`  ← note: only if at start of string

Weeks where notes do not match (missing data, or notes contain only non-margin text) will have `goal_difference = NULL`. This is acceptable — the display hides null margin values gracefully.

---

## Out of Scope

- No stats or aggregations on `goal_difference` in this iteration
- No editing of `goal_difference` after a result is saved (future admin edit flow)
- No validation that margin is plausible relative to the score
