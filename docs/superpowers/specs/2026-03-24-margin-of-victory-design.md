# Margin of Victory — Design Spec

**Date:** 2026-03-24
**Status:** Draft

---

## Overview

Add a dedicated `goal_difference` integer field to the match result flow, replacing the informal practice of recording margin in the free-text `notes` field. Historic notes will be parsed and backfilled automatically.

---

## Requirements

- Margin is stored as a non-negative integer (`0` = draw, `1–20` = win by N goals)
- Margin is **required** when recording a win; draws auto-submit `0`; cancelled weeks store `NULL`
- Notes field remains unchanged
- Historic notes matching `+N goals` at the start of the string are backfilled automatically; non-matching rows stay `NULL`
- Margin is displayed in the expanded match card body; hidden when `goal_difference` is `null` or `0`

---

## Data Model

Two new migration files are required. Existing migration files must not be edited.

**Migration 1 — `20260324000001_add_goal_difference.sql`** — adds the column and backfills:

```sql
-- Add column. DEFAULT NULL is written explicitly for clarity.
ALTER TABLE weeks
  ADD COLUMN IF NOT EXISTS goal_difference integer DEFAULT NULL;

-- Backfill from notes where pattern matches at start of string.
-- The ^ anchor is intentional: notes embedding the pattern mid-sentence
-- (e.g. "Good game, +3 goals") will NOT match and will be left as NULL.
-- The known historic format in this league is "+N Goals" or "+N goals" at
-- the start of the notes field, which is what the ResultModal placeholder
-- text ("Optional notes (e.g. +3 goals, injuries…)") encouraged. A note
-- without a leading '+' (e.g. "Won by 3") will not match and stays NULL.
-- This narrow pattern is intentional and acceptable for this backfill.
-- The WHERE filter and SET expression both run the regex; this is intentional —
-- the WHERE guards the UPDATE while the regexp_match extracts the value.
UPDATE weeks
SET goal_difference = (regexp_match(notes, '^\+(\d+)\s*goals?', 'i'))[1]::integer
WHERE status = 'played'
  AND notes ~* '^\+(\d+)\s*goals?';
```

**Migration 2 — `20260324000002_record_result_with_margin.sql`** — replaces the `record_result` RPC:

```sql
CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game_id UUID;
BEGIN
  SELECT game_id INTO v_game_id FROM weeks WHERE id = p_week_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Week not found'; END IF;

  IF NOT can_do_match_entry(v_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE weeks
  SET status = 'played',
      winner = p_winner,
      notes = p_notes,
      goal_difference = p_goal_difference
  WHERE id = p_week_id;
END;
$$;
```

The RPC is passive — it writes whatever `p_goal_difference` value it receives. There is no in-function coercion or validation. It is entirely the caller's responsibility to pass `0` for draws and an integer 1–20 for wins.

**`get_public_weeks` RPC:** Dead code — the public results page uses the service client directly. Not updated.

**Schema after migrations:**

| Column | Type | Notes |
|---|---|---|
| `goal_difference` | `integer` | `NULL` = not recorded or cancelled; `0` = draw; `1–20` = win margin |

---

## Backend

There are two write paths and two read paths, all of which must be updated.

**Shared client-side obligation for both write paths:** the `ResultModal` (and any future caller) must always send:
- `goal_difference: 0` for draws (never omit it)
- `goal_difference: N` (1–20) for wins
- `goal_difference: null` (or omit) only for cancelled weeks, which go through a separate flow

This rule is the same regardless of which write path is used. The public API route does not distinguish wins from draws — it validates that the field is present and is an integer. The 400 rejection for absent/non-integer is intentional and absolute; omitting `goalDifference` for any result (including draws) is always a client error.

### Write path 1 — `record_result` RPC (authenticated member path)

Updated by Migration 2. Called from `ResultModal` via `supabase.rpc('record_result', { ... })` when `publicMode` is `false`.

The `p_goal_difference INTEGER DEFAULT NULL` parameter has a default for backward-compatibility only — existing callers that predate this feature (e.g. an older cached client) will continue to work without breaking. For all new code written as part of this feature, the client must always pass the value explicitly per the shared obligation above. The DEFAULT is a deployment safety net, not a signal that omitting the field is correct behaviour. Server-side enforcement is out of scope; client-side validation (disabled confirm button) is the primary guard.

### Write path 2 — Public result API

**File:** `app/api/public/league/[id]/result/route.ts`

Used when the `match_entry` feature flag has `public_enabled = true`. Writes directly to `weeks` via the service client.

Validation and write logic:
- All results (wins and draws) go through the same validation path. `Number.isInteger(0)` is `true`, so draws pass cleanly — no separate draw branch is needed
- Validate `Number.isInteger(goalDifference)`. Reject with 400 if absent, non-integer, or `NaN`
- Add `goal_difference: goalDifference` to the existing `.update({...})` call
- Range validation (1–20) is client-side only; the server does not enforce it

### Read path 1 — `lib/data.ts`

**File:** `lib/data.ts`

Update `fetchWeeks` in three specific places:

1. **Supabase path `.select()` string** — add `goal_difference` to the column list (e.g. `'week, date, status, format, team_a, team_b, winner, notes, goal_difference'`)
2. **Supabase path `.map()` callback** — add `goal_difference: row.goal_difference ?? null`
3. **Access-key path `.map()` callback** (the branch that calls `/api/weeks`) — add `goal_difference: row.goal_difference ?? null`. Note: this branch constructs the `Week` object manually from raw API response rows; `goal_difference` will not appear unless explicitly mapped here.

### Read path 2 — `app/api/weeks/route.ts`

**File:** `app/api/weeks/route.ts`

Add `goal_difference` to the `.select()` string. The route returns raw DB rows as JSON without mapping; the field is present as `goal_difference` (snake_case), matching what `lib/data.ts` reads.

### TypeScript types — `lib/types.ts`

Add `goal_difference` to the existing `Week` interface (canonical type location per `CLAUDE.md`):

```ts
export interface Week {
  week: number;
  date: string;
  status: WeekStatus;
  format?: string;
  teamA: string[];
  teamB: string[];
  winner: Winner;
  notes?: string;
  // Non-negative integer. 0 = draw. Positive = win margin (UI enforces 1–20, but DB has no constraint).
  // null = not recorded or cancelled. Display code must handle any positive integer gracefully.
  goal_difference?: number | null;
}
```

The type is `number | null` because TypeScript has no integer type. The 1–20 range is enforced by the stepper client-side only — the database has no constraint. The display (`+{goal_difference} goals`) must handle any positive integer value, not just 1–20.

---

## UI

### Stepper component

A new inline stepper is required — no existing stepper exists in the codebase. Per `CLAUDE.md`, it must be written by hand using Tailwind utility classes. It is defined as a local component inside `ResultModal.tsx` (not shared — only used here).

Spec:
- Three elements in a row: `−` button | value display | `+` button, in a single bordered container
- Min: `1`, Max: `20`. The `−` button is visually disabled (`opacity-40 cursor-not-allowed`) when value is `1`; the `+` button likewise when value is `20`
- Styling: outer `border border-slate-700 rounded-md overflow-hidden`; buttons `bg-slate-800 text-slate-400 hover:text-slate-100`; value display `bg-slate-900 text-slate-100 font-bold`

### ResultModal — winner step

`publicMode` is a boolean prop already present on `ResultModal` that determines which write path is used: `false` = RPC (authenticated), `true` = public API route.

`hasReviewStep` is an existing boolean derived inside `ResultModal` — it is `true` when the lineup has guests or new players (i.e. when `guests.length > 0 || newPlayers.length > 0`). It controls whether the multi-step review flow is shown.

Behaviour changes to the winner step:
- Selecting **Team A** or **Team B** reveals a "Margin of Victory" row:
  - Title: `"Margin of Victory"` (12px semibold, `text-slate-100`)
  - Sub-label: `"Goals [Team Name] won by"` — dynamic, e.g. `"Goals Team A won by"` (10px, `text-slate-500`)
  - Stepper initialised at `1` when a winner is first selected
- Selecting **Draw** hides the margin row entirely. On save, the client passes `goal_difference: 0` explicitly on both write paths
- The **Confirm Result** / **Next →** button remains disabled until a winner is selected and — if not a draw — a margin between 1 and 20 is set
- The notes textarea remains below the margin row, unchanged

**Confirm step** (rendered only when `hasReviewStep` is `true`): add a margin summary row when a win was selected:

```
Winner    Team A
Margin    +3 goals
```

Omit the margin row when the result is a draw (`goal_difference === 0`). The winner buttons remain visible on the winner step, so the user has already confirmed "Draw" before clicking Next — no additional margin affordance is needed for the draw + confirm-step path.

**Direct-save path** (`hasReviewStep` is `false`): the user saves directly from the winner step by clicking "Confirm Result". For wins, the stepper value is visible at that moment. For draws, the "Draw" button is visually selected and the margin row is hidden — this is sufficient confirmation; no additional summary is required.

**Error handling:** No new error states. If the save call fails, the modal remains open and the existing error message is shown.

### MatchCard — expanded body

The existing expanded body renders team lists followed by notes as an italic paragraph. Changes:

- The conditional divider (`border-t border-slate-700`) and the meta-row container are both rendered only when **at least one pill is visible** — i.e. when `(goal_difference != null && goal_difference !== 0) || (notes && notes.trim() !== '')`
- Inside the meta-row, render pills left-aligned with `gap-2` (8px)

**Margin pill** — rendered when `goal_difference` is not `null` and not `0`:
- Container: `bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic`
- Label `MARGIN`: `text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1`
- Value: `+{goal_difference} goals`

**Notes pill** — rendered when `notes` is a non-empty string:
- Same container and label styling as margin pill
- Label: `NOTES`
- Value: `{notes}`

The case of a draw (`goal_difference === 0`) with no notes produces no visible pills, no divider, and no meta-row container — the expanded body shows only the team lists.

---

## Backfill Strategy

The regex `^\+(\d+)\s*goals?` (case-insensitive) anchors to the start of the `notes` string. This is intentional — mid-sentence occurrences will not match. Based on the known note format in this league (`+3 Goals`, `+1 goal`), the match rate is expected to be high. Any weeks with `NULL` margin after backfill display gracefully — no margin pill is shown.

---

## Out of Scope

- No stats or aggregations on `goal_difference` in this iteration
- No editing of `goal_difference` after a result is saved
- No server-side plausibility validation
- No server-side enforcement that wins have a non-null margin (client-side only)
- No server-side range validation (1–20 is client-side only)
- `get_public_weeks` RPC is not updated (dead code — not called by any live path)
