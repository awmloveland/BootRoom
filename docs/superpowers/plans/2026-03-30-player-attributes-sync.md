# Player Attributes Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every player who appears in a match result is automatically present in `player_attributes`, so the Settings → Players tab always shows the full roster.

**Architecture:** Two entry points record results — the `record_result` RPC (member mode) and the public result API route (public mode). Both are updated to upsert player names into `player_attributes` with `ON CONFLICT DO NOTHING`, so existing Eye Test ratings and mentalities are never overwritten. A one-time backfill in the same migration fixes players already in history (e.g. Rick).

**Tech Stack:** PostgreSQL / Supabase SQL migrations, Next.js 14 API route (TypeScript)

---

## Files

| File | Change |
|---|---|
| `supabase/migrations/20260330000002_sync_player_attributes_on_result.sql` | Create — updated `record_result` RPC + backfill |
| `app/api/public/league/[id]/result/route.ts` | Modify — add player upsert after successful result write |

---

### Task 1: Migration — update `record_result` RPC and backfill

**Files:**
- Create: `supabase/migrations/20260330000002_sync_player_attributes_on_result.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260330000002_sync_player_attributes_on_result.sql` with the following content:

```sql
-- supabase/migrations/20260330000002_sync_player_attributes_on_result.sql
--
-- Ensures every player who appears in a match result has a row in
-- player_attributes so they are visible in Settings → Players.
--
-- 1. Replaces record_result RPC to upsert player names after writing the result.
-- 2. Backfills any players already in match history who are missing a row.

CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT         DEFAULT NULL,
  p_goal_difference INTEGER      DEFAULT NULL,
  p_team_a_rating   NUMERIC(6,3) DEFAULT NULL,
  p_team_b_rating   NUMERIC(6,3) DEFAULT NULL
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
  SET status           = 'played',
      winner           = p_winner,
      notes            = p_notes,
      goal_difference  = p_goal_difference,
      team_a_rating    = p_team_a_rating,
      team_b_rating    = p_team_b_rating
  WHERE id = p_week_id;

  -- Upsert all players from this match into player_attributes.
  -- ON CONFLICT DO NOTHING preserves existing eye test ratings and mentalities.
  INSERT INTO player_attributes (game_id, name)
  SELECT v_game_id, player_name
  FROM (
    SELECT jsonb_array_elements_text(team_a) AS player_name FROM weeks WHERE id = p_week_id
    UNION
    SELECT jsonb_array_elements_text(team_b) AS player_name FROM weeks WHERE id = p_week_id
  ) players
  ON CONFLICT (game_id, name) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_result(UUID, TEXT, TEXT, INTEGER, NUMERIC(6,3), NUMERIC(6,3)) TO authenticated;

-- Backfill: create player_attributes rows for players already in match history
-- who have no row. Safe to run multiple times — ON CONFLICT DO NOTHING is idempotent.
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

- [ ] **Step 2: Run the migration in Supabase**

Open the Supabase SQL Editor for the project, paste the full contents of the migration file, and run it.

Expected: no errors. You can verify with:
```sql
-- Should return a row for Rick (or whatever new player triggered this bug)
SELECT * FROM player_attributes ORDER BY game_id, name;
```

- [ ] **Step 3: Verify Rick now has a row**

In the Supabase SQL Editor:
```sql
SELECT * FROM player_attributes WHERE name = 'Rick';
```
Expected: one row with `rating = 0`, `mentality = 'balanced'`, `goalkeeper = false`.

- [ ] **Step 4: Commit the migration**

```bash
git add supabase/migrations/20260330000002_sync_player_attributes_on_result.sql
git commit -m "feat: sync player_attributes on result recording, backfill existing players"
```

---

### Task 2: Public result API — upsert players after result write

**Files:**
- Modify: `app/api/public/league/[id]/result/route.ts`

- [ ] **Step 1: Update the route**

Replace the contents of `app/api/public/league/[id]/result/route.ts` with:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { Winner } from '@/lib/types'

type Params = { params: Promise<{ id: string }> }

/**
 * POST — record a match result for a scheduled week.
 * Body: { weekId, winner, notes? }
 * Returns: { ok: true }
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const service = createServiceClient()

  // Verify match_entry is public-enabled
  const { data: feat } = await service
    .from('league_features')
    .select('public_enabled')
    .eq('game_id', id)
    .eq('feature', 'match_entry')
    .maybeSingle()

  if (!feat?.public_enabled) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { weekId, winner, notes, goalDifference, teamARating, teamBRating } = body as {
    weekId: string
    winner: Winner
    notes?: string
    goalDifference: unknown
    teamARating: unknown
    teamBRating: unknown
  }

  function safeRating(val: unknown): number | null {
    if (typeof val === 'number' && isFinite(val)) return val
    return null
  }

  // Validate goalDifference — must be present and a whole number.
  // Both wins (1–20) and draws (0) must always include this field.
  // Number.isInteger(null) and Number.isInteger(undefined) both return false,
  // so absent or null values are rejected here too.
  if (!Number.isInteger(goalDifference)) {
    return NextResponse.json({ error: 'goalDifference must be an integer' }, { status: 400 })
  }

  // Safe to cast — we've validated it is an integer
  const goalDiff = goalDifference as number

  // Verify the week belongs to this game and fetch team rosters for player sync
  const { data: weekRow } = await service
    .from('weeks')
    .select('game_id, team_a, team_b')
    .eq('id', weekId)
    .single()

  if (weekRow?.game_id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await service
    .from('weeks')
    .update({
      status: 'played',
      winner,
      notes: notes?.trim() || null,
      goal_difference: goalDiff,
      team_a_rating: safeRating(teamARating),
      team_b_rating: safeRating(teamBRating),
    })
    .eq('id', weekId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync all players from this match into player_attributes.
  // ignoreDuplicates: true preserves existing eye test ratings and mentalities.
  const names = [
    ...((weekRow.team_a as string[]) ?? []),
    ...((weekRow.team_b as string[]) ?? []),
  ]
  if (names.length > 0) {
    await service
      .from('player_attributes')
      .upsert(
        names.map((name) => ({ game_id: id, name })),
        { onConflict: 'game_id,name', ignoreDuplicates: true }
      )
  }

  return NextResponse.json({ ok: true })
}
```

Note: the `select('game_id, team_a, team_b')` change on the existing week verification query is the only structural difference — we fetch `team_a`/`team_b` at the same time we verify ownership, so no extra round-trip is needed.

- [ ] **Step 2: Verify the build compiles**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/caracas
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/public/league/[id]/result/route.ts
git commit -m "feat: sync player_attributes on public result recording"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Open Settings → Players in the browser**

Navigate to the league settings page and click the Players tab. Confirm Rick (and any other recently-added players) now appears in the list with default values (Eye Test = 0 dots, Mentality = BAL).

- [ ] **Step 2: Record a new result in public mode with a brand-new player name**

Using the match entry flow in public mode, submit a result for a lineup that includes a player name not currently in `player_attributes`. After saving, navigate to Settings → Players and confirm the new player appears.

- [ ] **Step 3: Confirm existing attributes are preserved**

Find a player in Settings → Players who already has a non-default Eye Test rating or mentality. Record another result that includes that player. Refresh Settings → Players and confirm the rating and mentality are unchanged.
