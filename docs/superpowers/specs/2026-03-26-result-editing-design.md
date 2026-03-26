# Result & Lineup Editing — Design Spec

**Date:** 2026-03-26
**Status:** Approved
**Scope:** Admin-only editing of past match results, lineups, and week metadata

---

## Overview

Admins can edit any previously recorded week directly from the results tab. Editing is done via a new `EditWeekModal` component triggered from the result card. Changes cascade automatically to player stats, league tables, and form since these are all computed from the `weeks` table.

---

## Entry Points

| Card state | How admin reaches edit |
|---|---|
| **Played** | "Edit result" button at the bottom of the expanded card body (right-aligned) |
| **Awaiting Result** | "Edit result" button at the bottom of the expanded card body (right-aligned) |
| **Cancelled** | Always-visible `✏️` icon button in the card header (muted, `text-slate-500`) |
| **Unrecorded** | Always-visible `✏️` icon button in the card header (muted, `text-slate-500`) |
| **Scheduled (upcoming)** | No edit access — managed by the existing NextMatchCard lineup builder |

Both entry points open the same `EditWeekModal`.

---

## EditWeekModal

A single-step modal (no wizard). Fields are conditionally rendered based on the selected status.

### Always-visible fields

| Field | Input type | Notes |
|---|---|---|
| **Date** | Text input | `DD MMM YYYY` format, matching existing data |
| **Status** | Dropdown | Options: Played / Cancelled / Unrecorded. "Awaiting Result" (scheduled past deadline) is not an option — opening the modal from that card defaults the status to Played, prompting the admin to fill in the result. |
| **Notes** | Textarea | Optional |

### Conditionally visible (status = Played only)

| Field | Input type | Notes |
|---|---|---|
| **Result** | Dropdown | Team A / Draw / Team B |
| **Margin** | Number stepper (1–20) | Hidden when Result = Draw |
| **Lineups** | Two-column editor + roster | See Lineup Editor section below |

### Lineup Editor

- Two columns: **Team A** and **Team B**
- Each player is a chip with an `×` delete button — removing returns them to the roster
- **Roster panel** sits below the two team columns, full-width
- Roster has a search input and shows all league players not currently assigned to either team
- Players are dragged from the roster into a team column
- Removing a player from a team (via `×`) returns them to the roster

### Status transitions

- Switching **to Played** reveals the lineup/result fields (empty if converting from a non-played state)
- Switching **away from Played** shows an inline warning beneath the status field: *"This will clear the recorded result and lineups."* No extra confirmation step — the warning is informational only
- Bi-directional: any status can be changed to any other status

### On save

- If status changed away from Played: `winner`, `goal_difference`, `team_a`, `team_b`, `team_a_rating`, `team_b_rating` are all nulled
- On any save where a result previously existed: `team_a_rating` and `team_b_rating` are nulled (no recalculation — historical snapshots are cleared rather than replaced with stale data)
- Player stats, league tables, and form update automatically on next page load (computed views)

---

## API & RPC Layer

### New Supabase RPC: `edit_week`

Admin-only (checks caller is `creator` or `admin` on the league). No feature flag check.

```sql
edit_week(
  p_week_id         UUID,
  p_date            TEXT,
  p_status          TEXT,           -- played | cancelled | unrecorded
  p_winner          TEXT DEFAULT NULL,
  p_notes           TEXT DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL,
  p_team_a          JSONB DEFAULT NULL,
  p_team_b          JSONB DEFAULT NULL
)
```

Behaviour:
- Always sets `team_a_rating = NULL`, `team_b_rating = NULL`
- If `p_status != 'played'`: also sets `winner = NULL`, `goal_difference = NULL`, `team_a = NULL`, `team_b = NULL`
- Uses `SECURITY DEFINER` with an admin role check (same pattern as `record_result`)

### New API route: `PATCH /api/league/[id]/weeks/[weekId]/edit`

Dedicated route, separate from the existing `PATCH /api/league/[id]/weeks/[weekId]` (which handles scheduled week cancellation). Validates admin role, calls `edit_week` RPC, returns `{ ok: true }`.

---

## What is NOT in scope

- Building or modifying lineups for upcoming (pre-deadline) weeks — handled by the existing NextMatchCard lineup builder
- Re-calculating team strength ratings on edit — ratings are nulled, not recalculated
- Guest/new player promotion during editing — the edit modal does not run the roster-promotion flow from `ResultModal`
- Player profile pages or any other non-results UI
