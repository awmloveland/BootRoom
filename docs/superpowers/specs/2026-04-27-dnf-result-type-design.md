# DNF (Did Not Finish) Result Type

**Date:** 2026-04-27  
**Status:** Approved  

---

## Overview

A new game outcome for matches that began but could not be completed (injury, weather, or other unforeseen reasons). DNF is recorded alongside the standard result outcomes (Team A Won, Team B Won, Draw) in the result recording flow.

**Key rule:** lineups and the week itself are recorded and visible, but the game has zero competitive weight — it is excluded from all player stats, win/loss records, recent form, points, and honours/quarter standings. It does count as a week that has passed in the season progress counter.

---

## Data Model

### `WeekStatus` (`lib/types.ts`)

```ts
export type WeekStatus = 'played' | 'cancelled' | 'unrecorded' | 'scheduled' | 'dnf';
```

### DNF week record shape

| Field | Value |
|---|---|
| `status` | `'dnf'` |
| `team_a` | populated with lineup |
| `team_b` | populated with lineup |
| `winner` | `null` |
| `goal_difference` | `null` |
| `notes` | optional — reason for abandonment |
| `format` | preserved |

### Database migration

Update the `CHECK` constraint on `weeks.status` to include `'dnf'`:

```sql
ALTER TABLE weeks DROP CONSTRAINT weeks_status_check;
ALTER TABLE weeks ADD CONSTRAINT weeks_status_check
  CHECK (status IN ('played', 'cancelled', 'scheduled', 'unrecorded', 'dnf'));
```

### Stats queries — no changes required

All player stats RPCs (`get_player_stats`, `get_player_stats_public`) filter `WHERE status = 'played'`. DNF is automatically excluded from all competitive metrics. Honours and quarter standings derive from these RPCs — also automatically excluded.

### Season progress counter

Queries that count weeks passed currently filter `status IN ('played', 'cancelled')`. Update to `status IN ('played', 'cancelled', 'dnf')`. A DNF week is a week that happened, even if the result doesn't count.

### `fetchWeeks()` (`lib/data.ts`)

Update the status filter from `['played', 'cancelled']` to `['played', 'cancelled', 'dnf']` so DNF games appear in match history.

---

## API Layer

### `POST /api/public/league/[id]/result`

Add an optional `dnf: boolean` field to the request body.

When `dnf: true`:
- `status` is set to `'dnf'` (not `'played'`)
- `winner` is forced to `null`
- `goal_difference` is forced to `null`
- `notes` flows through as normal

Validation: if `dnf: true` is supplied alongside a `winner` or `goalDifference`, the request is rejected with `422 Unprocessable Entity`.

No new API route is needed — this is a conditional branch in the existing endpoint.

### `record_result` Supabase RPC

Add a `p_dnf boolean DEFAULT false` parameter. When `true`, the RPC sets `status = 'dnf'`; when `false`, it sets `status = 'played'` as today. This requires a DB migration to drop and recreate the function with the updated signature.

### Player sync

The player upsert into `player_attributes` still runs on DNF. Players in a DNF lineup are real participants and should be recognised in the league roster even if this game doesn't count statistically.

---

## UI Components

### `WinnerBadge` (`components/WinnerBadge.tsx`)

Add a `dnf?: boolean` prop alongside the existing `cancelled?: boolean`. When `dnf: true`, render:

```
bg-zinc-800 text-zinc-300 border border-zinc-600   label: "DNF"
```

Priority: `cancelled` → `dnf` → `winner` lookup (same pattern as the existing cancelled guard).

### `MatchCard` — new `DnfCard` component

Lives in `components/MatchCard.tsx` alongside `PlayedCard` and `CancelledCard`.

**Collapsed state:**
- Week number + date
- DNF badge

**Expanded state (Radix `Collapsible`, same as `PlayedCard`):**
- Both team lineups via existing `TeamList` component
- Notes section (if `notes` is non-empty)
- No score display
- No share button

**Admin controls:** pencil icon for editing (same as `CancelledCard`), allowing status correction if recorded in error.

### `WeekList` routing

Add a `status === 'dnf'` branch rendering `DnfCard` alongside the existing `status === 'cancelled'` branch.

### Result recording UI

The winner selection step gains a fourth option labelled **"DNF"**.

When "DNF" is selected:
- Goal difference input is hidden (not just disabled — no point showing it)
- Notes field remains visible and available
- Submit button label stays "Record Result"

---

## What does not change

- `CancelledCard` and cancellation flow — unchanged
- All stat RPCs (`get_player_stats`, `get_player_stats_public`) — unchanged  
- Honours card and quarter standings — automatically correct via stat exclusion
- `WinnerBadge` existing variants — unchanged
- Any other component not listed above — unchanged

---

## Scope boundary

This spec covers recording and displaying a DNF result. It does not cover:
- Bulk editing or converting historical cancelled games to DNF
- Admin reporting on DNF frequency
- Push notifications or member alerts when a DNF is recorded
