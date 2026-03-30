# Team Ratings on Scheduled / Awaiting Result Cards — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store `team_a_rating` / `team_b_rating` at lineup-save time so both the NextMatchCard lineup view and the AwaitingResultCard show ewptScore chips next to team labels.

**Architecture:** The `team_a_rating`/`team_b_rating` columns already exist on `weeks` and are fetched for all statuses. The gap is that the `save_lineup` RPC and the public lineup API route never write them. We extend both to accept and persist ratings, compute the scores at save time in `NextMatchCard` (which already has `allPlayers`), and expose them via `ScheduledWeek` so the lineup view can render the chips. `AwaitingResultCard` already receives the `Week` object which carries the columns — it just needs to pass them to `TeamList`.

**Tech Stack:** Next.js 15 App Router · TypeScript · Supabase PostgreSQL · Tailwind CSS · `ewptScore()` from `lib/utils.ts`

---

## Files

| Action | Path | What changes |
|--------|------|-------------|
| Create | `supabase/migrations/20260330000001_save_lineup_ratings.sql` | Extends `save_lineup` RPC with optional rating params |
| Modify | `lib/types.ts` | Adds `team_a_rating?`/`team_b_rating?` to `ScheduledWeek` |
| Modify | `app/api/public/league/[id]/lineup/route.ts` | Accepts + stores ratings in POST body upsert |
| Modify | `components/NextMatchCard.tsx` | Computes + sends ratings at save; reads + renders in lineup view |
| Modify | `components/MatchCard.tsx` | Passes `week.team_a_rating`/`team_b_rating` to `TeamList` in `AwaitingResultCard` |

---

## Task 1: Extend `save_lineup` RPC to accept and store ratings

The `save_lineup` Postgres function currently accepts team arrays but not ratings. Add optional `NUMERIC(6,3)` params (matching the column type set in `20260324000003_week_team_ratings.sql`) to both the INSERT and the ON CONFLICT UPDATE.

**Files:**
- Create: `supabase/migrations/20260330000001_save_lineup_ratings.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260330000001_save_lineup_ratings.sql
--
-- Extends save_lineup to accept and store team rating snapshots.
-- Ratings are computed client-side (ewptScore) at lineup-save time.

CREATE OR REPLACE FUNCTION save_lineup(
  p_game_id          UUID,
  p_season           TEXT,
  p_week             INT,
  p_date             TEXT,
  p_format           TEXT,
  p_team_a           TEXT[],
  p_team_b           TEXT[],
  p_lineup_metadata  JSONB         DEFAULT NULL,
  p_team_a_rating    NUMERIC(6,3)  DEFAULT NULL,
  p_team_b_rating    NUMERIC(6,3)  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_id UUID;
BEGIN
  IF NOT can_do_match_entry(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO weeks (
    game_id, season, week, date, status, format,
    team_a, team_b, winner, notes, lineup_metadata,
    team_a_rating, team_b_rating
  )
  VALUES (
    p_game_id, p_season, p_week, p_date, 'scheduled', p_format,
    to_jsonb(p_team_a), to_jsonb(p_team_b), NULL, NULL, p_lineup_metadata,
    p_team_a_rating, p_team_b_rating
  )
  ON CONFLICT (game_id, season, week)
  DO UPDATE SET
    date             = EXCLUDED.date,
    format           = EXCLUDED.format,
    team_a           = EXCLUDED.team_a,
    team_b           = EXCLUDED.team_b,
    status           = 'scheduled',
    lineup_metadata  = EXCLUDED.lineup_metadata,
    team_a_rating    = EXCLUDED.team_a_rating,
    team_b_rating    = EXCLUDED.team_b_rating
  RETURNING id INTO v_week_id;

  RETURN v_week_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_lineup(
  UUID, TEXT, INT, TEXT, TEXT, TEXT[], TEXT[], JSONB, NUMERIC(6,3), NUMERIC(6,3)
) TO authenticated;
```

- [ ] **Step 2: Run the migration in Supabase**

Open the Supabase SQL Editor for your project and run the contents of the migration file. Verify the function is updated by running:

```sql
SELECT routine_name, specific_name
FROM information_schema.routines
WHERE routine_name = 'save_lineup';
```

Expected: one row returned.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260330000001_save_lineup_ratings.sql
git commit -m "feat: extend save_lineup RPC to persist team rating snapshots"
```

---

## Task 2: Add ratings to `ScheduledWeek` type and the public lineup API route

`ScheduledWeek` is what `NextMatchCard` uses to store and read back the saved lineup. Adding the rating fields here lets the lineup view read them without re-fetching. The public API route also needs to write them to the DB.

**Files:**
- Modify: `lib/types.ts`
- Modify: `app/api/public/league/[id]/lineup/route.ts`

- [ ] **Step 1: Add rating fields to `ScheduledWeek` in `lib/types.ts`**

Find the `ScheduledWeek` interface (around line 103) and add two optional fields:

```ts
export interface ScheduledWeek {
  id: string;
  week: number;
  date: string;
  format: string | null;
  teamA: string[];
  teamB: string[];
  status: 'scheduled' | 'cancelled';
  lineupMetadata?: LineupMetadata | null;
  team_a_rating?: number | null;
  team_b_rating?: number | null;
}
```

- [ ] **Step 2: Update the public lineup POST route to accept and store ratings**

Open `app/api/public/league/[id]/lineup/route.ts`. Replace the entire `POST` handler with:

```ts
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const service = createServiceClient()

  if (!(await verifyPublicMatchEntry(service, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { season, week, date, format, teamA, teamB, teamARating, teamBRating } = body as {
    season: string
    week: number
    date: string
    format: string | null
    teamA: string[]
    teamB: string[]
    teamARating?: number | null
    teamBRating?: number | null
  }

  const { data, error } = await service
    .from('weeks')
    .upsert(
      {
        game_id: id,
        season,
        week,
        date,
        status: 'scheduled',
        format: format ?? null,
        team_a: teamA,
        team_b: teamB,
        winner: null,
        notes: null,
        team_a_rating: teamARating ?? null,
        team_b_rating: teamBRating ?? null,
      },
      { onConflict: 'game_id,season,week' }
    )
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts app/api/public/league/[id]/lineup/route.ts
git commit -m "feat: add team ratings to ScheduledWeek type and lineup API route"
```

---

## Task 3: Compute and persist ratings in `NextMatchCard` at save time, and render them in the lineup view

`handleSaveLineup` already has `localTeamA`/`localTeamB` as `Player[]` and the component already imports `ewptScore`. We compute the scores before saving and thread them through both save paths (public API and direct Supabase RPC). We also update `setScheduledWeek` so the in-memory state reflects the new ratings immediately, and pass them to the lineup view `TeamList` calls.

**Files:**
- Modify: `components/NextMatchCard.tsx`

- [ ] **Step 1: Compute ratings at the top of `handleSaveLineup` and include them in both save paths**

Find `handleSaveLineup` (around line 303). The function currently computes `teamA`/`teamB` as string arrays from `localTeamA`/`localTeamB`. Add score computation right after:

```ts
async function handleSaveLineup() {
  if (!autoPickResult || autoPickResult.suggestions.length === 0) {
    setError('No suggestion available')
    return
  }
  const teamA = localTeamA.map((p) => p.name)
  const teamB = localTeamB.map((p) => p.name)
  const teamARating = ewptScore(localTeamA)   // ← add
  const teamBRating = ewptScore(localTeamB)   // ← add
  // When editing an existing scheduled week, use its week number and date
  const saveWeek = scheduledWeek?.week ?? nextWeekNum
```

Then in the `publicMode` branch (around line 333), add the ratings to the POST body:

```ts
const res = await fetch(`/api/public/league/${gameId}/lineup`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    season, week: saveWeek, date: saveDate, format: format || null,
    teamA, teamB, teamARating, teamBRating,
  }),
})
```

In the non-public branch (Supabase RPC, around line 343), add the rating params:

```ts
const { data, error: err } = await supabase.rpc('save_lineup', {
  p_game_id: gameId,
  p_season: season,
  p_week: saveWeek,
  p_date: saveDate,
  p_format: format || null,
  p_team_a: teamA,
  p_team_b: teamB,
  p_lineup_metadata: JSON.stringify(lineupMetadataForDB),
  p_team_a_rating: teamARating,
  p_team_b_rating: teamBRating,
})
```

- [ ] **Step 2: Persist ratings in `setScheduledWeek` after save**

Find the `setScheduledWeek` call after both save branches (line 356). Update it to include the computed ratings:

```ts
setScheduledWeek({
  id: weekId,
  week: saveWeek,
  date: saveDate,
  format,
  teamA,
  teamB,
  status: 'scheduled',
  lineupMetadata,
  team_a_rating: teamARating,
  team_b_rating: teamBRating,
})
```

- [ ] **Step 3: Pass ratings to `TeamList` in the lineup view**

Find the lineup body section (around line 847–854):

```tsx
{/* ── LINEUP body ── */}
{cardState === 'lineup' && scheduledWeek && (
  <div className="px-4 py-3">
    <div className="grid grid-cols-2 gap-4">
      <TeamList
        label="Team A"
        team="A"
        players={scheduledWeek.teamA}
        goalkeepers={goalkeepers}
        rating={scheduledWeek.team_a_rating ?? null}
      />
      <TeamList
        label="Team B"
        team="B"
        players={scheduledWeek.teamB}
        goalkeepers={goalkeepers}
        rating={scheduledWeek.team_b_rating ?? null}
      />
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: compute and persist ewptScore at lineup save; render in lineup view"
```

---

## Task 4: Render ratings in `AwaitingResultCard`

`week.team_a_rating` and `week.team_b_rating` are already fetched from the DB for all week statuses (see `lib/fetchers.ts` line 152). They'll be `null` for lineups saved before this change. `TeamList` already accepts a `rating?: number | null` prop and renders the chip only when the value is non-null — so old weeks silently show no chip.

**Files:**
- Modify: `components/MatchCard.tsx`

- [ ] **Step 1: Pass ratings to `TeamList` inside `AwaitingResultCard`**

Find the two `TeamList` calls inside `AwaitingResultCard` (around lines 234–235 in the `Collapsible.Content` body):

```tsx
<div className="grid grid-cols-2 gap-4">
  <TeamList
    label="Team A"
    players={week.teamA}
    team="A"
    rating={week.team_a_rating ?? null}
  />
  <TeamList
    label="Team B"
    players={week.teamB}
    team="B"
    rating={week.team_b_rating ?? null}
  />
</div>
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass (the test suite covers pure utils; no component test changes required).

- [ ] **Step 4: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "feat: show team rating chips in AwaitingResultCard"
```

---

## Task 5: Verify end-to-end in the browser

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test the NextMatchCard lineup view**

Navigate to a league where you have admin access. If no lineup exists, create one using the team builder. After confirming the lineup:
- The lineup view should show the score chips next to "Team A" and "Team B" labels (e.g. `7.241` / `7.198`)
- Chips use blue styling for Team A, violet for Team B — same as on played cards

- [ ] **Step 3: Test the AwaitingResultCard**

Wait for (or manually set) a scheduled week date to be in the past (past 20:00 on game day). The match history card should show in "Awaiting Result" state with rating chips next to the team labels. Note: existing scheduled weeks saved before this change will show no chip — that is expected.

- [ ] **Step 4: Smoke-test played cards are unchanged**

Scroll to any played week in match history. Rating chips should still appear as before.

- [ ] **Step 5: Final commit (if any cleanup needed) and push**

```bash
git push origin awmloveland/upcoming-match-scores
```
