# Design: Auto-sync player_attributes on result recording

**Date:** 2026-03-30
**Status:** Approved

---

## Problem

Two data sources drive player lists in the app:

| Surface | Source |
|---|---|
| Players tab (`/[leagueId]/players`) | `get_player_stats_public` RPC — derives players from `weeks.team_a` / `weeks.team_b` match data, LEFT JOIN `player_attributes` |
| Settings → Players tab | `GET /api/league/[id]/players` — queries `player_attributes` directly |

A player can appear in match history without a row in `player_attributes` if they were never promoted via `promote_roster`. This happens when:
- A result is recorded in **public mode** (the public result API never calls `promote_roster`)
- A player is added directly to a lineup without going through the "Add new player" flow in `lineup_metadata`

The result: a new player (e.g. Rick) shows up in the players tab but is invisible in Settings → Players, so admins cannot set their Eye Test rating or mentality.

---

## Solution

Upsert every player name from `team_a` / `team_b` into `player_attributes` at the moment a result is recorded, using `ON CONFLICT DO NOTHING` so existing attributes are never overwritten.

Two entry points must be updated:

1. **`record_result` RPC** — member mode path
2. **`POST /api/public/league/[id]/result`** — public mode path

Plus a **one-time backfill** in the migration to fix players already in match history who are missing from `player_attributes`.

---

## 1. Migration: update `record_result` RPC

Add an upsert block inside the existing `record_result` function, after the `UPDATE weeks` statement. The function already has `v_game_id` and `p_week_id` in scope.

```sql
-- After UPDATE weeks ... WHERE id = p_week_id:

INSERT INTO player_attributes (game_id, name)
SELECT v_game_id, player_name
FROM (
  SELECT jsonb_array_elements_text(team_a) AS player_name FROM weeks WHERE id = p_week_id
  UNION
  SELECT jsonb_array_elements_text(team_b) AS player_name FROM weeks WHERE id = p_week_id
) players
ON CONFLICT (game_id, name) DO NOTHING;
```

`ON CONFLICT DO NOTHING` is the critical constraint — admins who have already set a player's Eye Test rating or mentality will never have those values clobbered.

The migration replaces `record_result` via `CREATE OR REPLACE FUNCTION` and re-issues the existing `GRANT EXECUTE` so permissions are unchanged.

---

## 2. App code: public result API

`POST /api/public/league/[id]/result` uses the service client to directly update `weeks`. After the successful `weeks.update()`, add a Supabase upsert to `player_attributes`:

```ts
// After the weeks.update() succeeds, fetch team_a/team_b from the week row
// and upsert all player names with ON CONFLICT DO NOTHING
const { data: weekData } = await service
  .from('weeks')
  .select('team_a, team_b')
  .eq('id', weekId)
  .single()

if (weekData) {
  const names = [
    ...((weekData.team_a as string[]) ?? []),
    ...((weekData.team_b as string[]) ?? []),
  ]
  if (names.length > 0) {
    await service
      .from('player_attributes')
      .upsert(
        names.map((name) => ({ game_id: id, name })),
        { onConflict: 'game_id,name', ignoreDuplicates: true }
      )
  }
}
```

`ignoreDuplicates: true` is the Supabase client equivalent of `ON CONFLICT DO NOTHING`.

Note: the `weeks` row is already known at this point (it was validated earlier in the route), but we need `team_a`/`team_b` which aren't in the original request body, so a single extra select is required.

---

## 3. Migration: backfill

The same migration includes a backfill to create `player_attributes` rows for any player already in match history who currently has no row:

```sql
INSERT INTO player_attributes (game_id, name)
SELECT DISTINCT w.game_id, player_name
FROM weeks w,
  LATERAL (
    SELECT jsonb_array_elements_text(w.team_a) AS player_name
    UNION
    SELECT jsonb_array_elements_text(w.team_b) AS player_name
  ) players
WHERE w.status = 'played'
ON CONFLICT (game_id, name) DO NOTHING;
```

This fixes Rick and any other players in the same situation immediately on deploy.

---

## Files changed

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDD_sync_player_attributes_on_result.sql` | New migration: updated `record_result` RPC + backfill |
| `app/api/public/league/[id]/result/route.ts` | Add player upsert after successful result write |

---

## What is not changed

- `player_attributes` RLS policies — unchanged
- `promote_roster` RPC — unchanged (still used for the new-player review flow in `ResultModal`)
- `GET /api/league/[id]/players` — unchanged (already queries `player_attributes` correctly; the fix ensures the data is there)
- `PlayerRosterPanel` — unchanged
- Default values for auto-created rows: `rating = 0`, `mentality = 'balanced'`, `goalkeeper = false` (the `player_attributes` column defaults)

---

## Edge cases

- **Empty team arrays** — `jsonb_array_elements_text` on an empty array returns zero rows; the upsert is a no-op. No error.
- **Duplicate names** — `UNION` (not `UNION ALL`) deduplicates before the upsert, so a player appearing in both teams (data error) inserts only once.
- **Result recording fails** — the upsert only runs after a successful result write. If `record_result` raises an exception, the transaction rolls back; nothing is written to `player_attributes`.
- **Public mode failure** — if `weeks.update()` returns an error, the route returns early before reaching the upsert block.
