# New Player Confirmation Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the crash when confirming a new player during result entry, and thread mentality correctly through the entire new player flow so it's stored on the player's record.

**Architecture:** Four coordinated changes — type definition, `AddPlayerModal` (creates new players), `NextMatchCard` (serialises/deserialises lineup metadata to/from the DB), `ResultModal` (confirm step). One SQL migration updates `promote_roster` to persist mentality on conflict.

**Tech Stack:** TypeScript, React, Next.js 14 App Router, Supabase, Tailwind CSS

---

## File Map

| File | Change |
|---|---|
| `lib/types.ts` | Add `mentality: Mentality` to `NewPlayerEntry` |
| `components/AddPlayerModal.tsx` | Pass `mentality` in the `NewPlayerEntry` created on add |
| `components/NextMatchCard.tsx` | Read and write `mentality` in new_players serialisation |
| `components/ResultModal.tsx` | Fix `JSON.stringify` bug; swap goalkeeper toggle for mentality picker; pass mentality in entries |
| `supabase/migrations/20260330000003_fix_promote_roster_mentality.sql` | Update `promote_roster` ON CONFLICT clause to also set `mentality` |

---

## Task 1: Add `mentality` to `NewPlayerEntry` type

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Update the type**

Open `lib/types.ts`. The current `NewPlayerEntry` is:

```ts
export interface NewPlayerEntry {
  type: 'new_player'       // runtime discriminant — not persisted to DB
  name: string
  rating: number           // 1–3
  goalkeeper?: boolean     // whether this new player is a goalkeeper
}
```

Replace it with:

```ts
export interface NewPlayerEntry {
  type: 'new_player'       // runtime discriminant — not persisted to DB
  name: string
  rating: number           // 1–3
  mentality: Mentality     // balanced | attacking | defensive | goalkeeper
  goalkeeper?: boolean     // derived: mentality === 'goalkeeper'. Keep for DB backwards compat.
}
```

- [ ] **Step 2: Check type errors**

```bash
npx tsc --noEmit
```

Expected: errors in `AddPlayerModal.tsx`, `NextMatchCard.tsx`, and `ResultModal.tsx` — `mentality` missing from object literals. These are fixed in the following tasks.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add mentality field to NewPlayerEntry type"
```

---

## Task 2: Pass mentality in `AddPlayerModal`

**Files:**
- Modify: `components/AddPlayerModal.tsx`

- [ ] **Step 1: Update `handleAddNewPlayer`**

In `components/AddPlayerModal.tsx`, find `handleAddNewPlayer` (around line 59). The current `onAdd` call is:

```ts
onAdd({
  type: 'new_player',
  name: trimmed,
  rating: newRating,
  goalkeeper: newMentality === 'goalkeeper',
})
```

Replace with:

```ts
onAdd({
  type: 'new_player',
  name: trimmed,
  rating: newRating,
  mentality: newMentality,
  goalkeeper: newMentality === 'goalkeeper',
})
```

- [ ] **Step 2: Verify type check**

```bash
npx tsc --noEmit
```

Expected: `AddPlayerModal.tsx` no longer errors. Remaining errors are in `NextMatchCard.tsx` and `ResultModal.tsx`.

- [ ] **Step 3: Commit**

```bash
git add components/AddPlayerModal.tsx
git commit -m "feat: include mentality in NewPlayerEntry from AddPlayerModal"
```

---

## Task 3: Thread mentality through `NextMatchCard` serialisation

**Files:**
- Modify: `components/NextMatchCard.tsx`

Two places in `NextMatchCard` touch the new_players array: deserialisation from the DB response (line ~273), and serialisation into `lineupMetadataForDB` before saving (line ~328).

- [ ] **Step 1: Update deserialisation (reading from DB)**

Find the block at around line 273 that maps `data.lineup_metadata.new_players`:

```ts
new_players: ((data.lineup_metadata as any).new_players ?? []).map((p: any) => ({
  type: 'new_player' as const,
  name: p.name,
  rating: p.rating,
  goalkeeper: p.goalkeeper ?? false,
})),
```

Replace with (adds backwards-compat mentality fallback for rows saved before this fix):

```ts
new_players: ((data.lineup_metadata as any).new_players ?? []).map((p: any) => ({
  type: 'new_player' as const,
  name: p.name,
  rating: p.rating,
  mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
  goalkeeper: p.goalkeeper ?? false,
})),
```

Make sure `Mentality` is imported at the top of the file. The import line already includes other types from `@/lib/types` — add `Mentality` to it:

```ts
import type { Week, Player, ScheduledWeek, GuestEntry, NewPlayerEntry, LineupMetadata, Mentality } from '@/lib/types'
```

- [ ] **Step 2: Update serialisation (writing to DB)**

Find the `lineupMetadataForDB` block at around line 328:

```ts
new_players: newPlayerEntries.map((p) => ({
  name: p.name,
  rating: p.rating,
  goalkeeper: p.goalkeeper ?? false,
})),
```

Replace with:

```ts
new_players: newPlayerEntries.map((p) => ({
  name: p.name,
  rating: p.rating,
  mentality: p.mentality,
  goalkeeper: p.goalkeeper ?? false,
})),
```

- [ ] **Step 3: Verify type check**

```bash
npx tsc --noEmit
```

Expected: `NextMatchCard.tsx` no longer errors. Only `ResultModal.tsx` remains.

- [ ] **Step 4: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: serialise mentality in new_players lineup metadata"
```

---

## Task 4: Fix `ResultModal` — crash fix + mentality picker

**Files:**
- Modify: `components/ResultModal.tsx`

This task has four sub-changes: fix the `JSON.stringify` crash, update the review state type, replace the goalkeeper toggle with a mentality picker, and update the entries array.

- [ ] **Step 1: Fix the `JSON.stringify` crash**

Find the `promote_roster` RPC call at around line 222:

```ts
const { error: promoteErr } = await supabase.rpc('promote_roster', {
  p_game_id: gameId,
  p_entries: JSON.stringify(entries),
})
```

Replace with:

```ts
const { error: promoteErr } = await supabase.rpc('promote_roster', {
  p_game_id: gameId,
  p_entries: entries,
})
```

- [ ] **Step 2: Update `NewPlayerReviewState`**

Find the interface at around line 33:

```ts
interface NewPlayerReviewState {
  name: string
  rating: number
  goalkeeper: boolean
}
```

Replace with:

```ts
interface NewPlayerReviewState {
  name: string
  rating: number
  mentality: Mentality
}
```

Add `Mentality` to the import at the top of the file:

```ts
import type { Winner, ScheduledWeek, LineupMetadata, Player, Mentality } from '@/lib/types'
```

- [ ] **Step 3: Update state initialisation**

Find the `useState` for `newPlayerStates` at around line 111:

```ts
const [newPlayerStates, setNewPlayerStates] = useState<NewPlayerReviewState[]>(
  newPlayers.map((p) => ({ name: p.name, rating: p.rating, goalkeeper: p.goalkeeper ?? false }))
)
```

Replace with (includes backwards-compat fallback for stored lineups without mentality):

```ts
const [newPlayerStates, setNewPlayerStates] = useState<NewPlayerReviewState[]>(
  newPlayers.map((p) => ({
    name: p.name,
    rating: p.rating,
    mentality: p.mentality ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
  }))
)
```

- [ ] **Step 4: Replace the goalkeeper updater with a mentality updater**

Find `updateNewPlayerGoalkeeper` at around line 130:

```ts
function updateNewPlayerGoalkeeper(i: number, goalkeeper: boolean) {
  setNewPlayerStates((prev) => prev.map((p, idx) => idx === i ? { ...p, goalkeeper } : p))
}
```

Replace with:

```ts
function updateNewPlayerMentality(i: number, mentality: Mentality) {
  setNewPlayerStates((prev) => prev.map((p, idx) => idx === i ? { ...p, mentality } : p))
}
```

- [ ] **Step 5: Update the entries array in `handleSave`**

Find the entries array at around line 215:

```ts
const entries = [
  ...newPlayerStates.map((p) => ({ name: p.name, rating: p.rating, goalkeeper: p.goalkeeper })),
  ...guestStates
    .filter((g) => g.addToRoster && g.rosterName.trim())
    .map((g) => ({ name: g.rosterName.trim(), rating: g.rating, goalkeeper: g.goalkeeper })),
]
```

Replace with:

```ts
const entries = [
  ...newPlayerStates.map((p) => ({
    name: p.name,
    rating: p.rating,
    mentality: p.mentality,
    goalkeeper: p.mentality === 'goalkeeper',
  })),
  ...guestStates
    .filter((g) => g.addToRoster && g.rosterName.trim())
    .map((g) => ({ name: g.rosterName.trim(), rating: g.rating, goalkeeper: g.goalkeeper })),
]
```

Note: guests do not have a mentality field — they are temporary and not permanently added to the roster with a mentality. The existing goalkeeper boolean for guests is correct.

- [ ] **Step 6: Replace goalkeeper toggle with mentality picker in the review step**

In the review step JSX (around line 355), find the new player card's goalkeeper section:

```tsx
<div className="mt-3 pt-3 border-t border-slate-800">
  <div className="flex items-center justify-between gap-3">
    <div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Dedicated goalkeeper</p>
      <p className="text-[11px] text-slate-400 leading-relaxed mt-px">Plays in goal all game, every game.</p>
    </div>
    <Toggle enabled={p.goalkeeper} onChange={(v) => updateNewPlayerGoalkeeper(i, v)} />
  </div>
</div>
```

Replace with the same segmented picker used in `AddPlayerModal`:

```tsx
<div className="mt-3 pt-3 border-t border-slate-800">
  <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Mentality</p>
  <div className="flex bg-slate-800 border border-slate-700 rounded-md overflow-hidden text-[10px] font-semibold">
    {(
      [
        { value: 'goalkeeper', label: 'GK' },
        { value: 'defensive',  label: 'DEF' },
        { value: 'balanced',   label: 'BAL' },
        { value: 'attacking',  label: 'ATT' },
      ] as { value: Mentality; label: string }[]
    ).map(({ value, label }, idx) => (
      <button
        key={value}
        type="button"
        onClick={() => { if (value !== p.mentality) updateNewPlayerMentality(i, value) }}
        className={cn(
          'flex-1 py-1.5 transition-colors',
          idx < 3 && 'border-r',
          value === p.mentality
            ? 'bg-blue-950 text-blue-300 border-blue-800'
            : 'text-slate-500 border-slate-700 hover:text-slate-300'
        )}
      >
        {label}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 7: Verify type check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "fix: JSON.stringify crash and add mentality picker to new player review step"
```

---

## Task 5: Write and run the `promote_roster` migration

**Files:**
- Create: `supabase/migrations/20260330000003_fix_promote_roster_mentality.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260330000003_fix_promote_roster_mentality.sql`:

```sql
-- supabase/migrations/20260330000003_fix_promote_roster_mentality.sql
--
-- Updates promote_roster to also persist mentality when a new player is confirmed
-- during result entry. Previously mentality was hardcoded to 'balanced' on insert
-- and not updated at all on conflict.

CREATE OR REPLACE FUNCTION promote_roster(
  p_game_id UUID,
  p_entries JSONB  -- array of {name: text, rating: int, mentality: text, goalkeeper?: bool}
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_do_match_entry(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
  SELECT
    p_game_id,
    (e->>'name')::text,
    (e->>'rating')::int,
    COALESCE((e->>'mentality')::text, 'balanced'),
    COALESCE((e->>'goalkeeper')::boolean, false)
  FROM jsonb_array_elements(p_entries) AS e
  ON CONFLICT (game_id, name) DO UPDATE
    SET rating     = EXCLUDED.rating,
        goalkeeper = EXCLUDED.goalkeeper,
        mentality  = EXCLUDED.mentality;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_roster(UUID, JSONB) TO authenticated;
```

- [ ] **Step 2: Run the migration**

Open the Supabase SQL Editor for this project and run the contents of the migration file. Confirm it executes without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260330000003_fix_promote_roster_mentality.sql
git commit -m "feat: update promote_roster to persist mentality on conflict"
```

---

## Task 6: Manual end-to-end test

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Create a test lineup with a new player**

Log in as an admin. Go to the league's Next Match card. Open the Lineup Lab, add a new player (e.g. "Test Player") with mentality set to **ATT**. Save the lineup.

- [ ] **Step 3: Record the result**

Click "Record Result". On the winner step, pick any winner and advance. On the review step, confirm:
- "Test Player" shows the mentality segmented picker (GK/DEF/BAL/ATT)
- The picker defaults to **ATT** (carried from the lineup)
- Change it to **DEF** to verify the picker is interactive

Advance to the confirm step and click **Save result**. Confirm:
- No error appears
- The modal closes (result saved)

- [ ] **Step 4: Verify player attributes**

Go to Settings → Players. Find "Test Player". Confirm:
- Rating matches what was set
- Mentality shows **DEF** (the value you changed to in the review step)

- [ ] **Step 5: Test backwards compat (lineups saved before this fix)**

If there is an existing scheduled week whose lineup was saved before this fix (no `mentality` in stored JSON), open its result modal. Confirm the review step loads without crashing and defaults new player mentality to 'balanced' (or 'goalkeeper' if the goalkeeper flag was set).
