# Margin of Victory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured `goal_difference` integer field to match results, replacing free-text margin notes, and backfill historic data.

**Architecture:** Two new SQL migrations add the column and update the `record_result` RPC. TypeScript types and read/write paths are updated to thread the new field through. Two UI components — `ResultModal` and `MatchCard` — are updated to capture and display the value.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase (PostgreSQL + RLS), Tailwind CSS, Jest + ts-jest

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/20260324000001_add_goal_difference.sql` | **Create** — add column, backfill from notes |
| `supabase/migrations/20260324000002_record_result_with_margin.sql` | **Create** — replace `record_result` RPC |
| `lib/types.ts` | **Modify** — add `goal_difference` to `Week` interface |
| `lib/data.ts` | **Modify** — 1 select string + 2 map functions (Supabase path + access-key path) |
| `app/api/weeks/route.ts` | **Modify** — add `goal_difference` to select |
| `app/api/public/league/[id]/result/route.ts` | **Modify** — accept + validate + write `goalDifference` |
| `components/ResultModal.tsx` | **Modify** — stepper, margin row, updated save logic, confirm step |
| `components/MatchCard.tsx` | **Modify** — replace notes paragraph with conditional pills |
| `__tests__/margin-of-victory.test.ts` | **Create** — unit tests for display logic and API validation |

---

## Task 1: DB migration — add column and backfill

**Files:**
- Create: `supabase/migrations/20260324000001_add_goal_difference.sql`

- [ ] **Step 1.1: Write the migration file**

```sql
-- supabase/migrations/20260324000001_add_goal_difference.sql

-- Add goal_difference column to weeks.
-- DEFAULT NULL written explicitly for clarity; this is also the PostgreSQL default.
ALTER TABLE weeks
  ADD COLUMN IF NOT EXISTS goal_difference integer DEFAULT NULL;

-- Backfill from notes where the pattern "+N goals" appears at the START of the string.
-- The ^ anchor is intentional: notes with the pattern mid-sentence stay NULL.
-- Known historic format: "+3 Goals", "+1 goal" at start of notes field.
-- The WHERE filter and SET both run the regex intentionally:
--   WHERE guards the UPDATE; regexp_match extracts the value.
UPDATE weeks
SET goal_difference = (regexp_match(notes, '^\+(\d+)\s*goals?', 'i'))[1]::integer
WHERE status = 'played'
  AND notes IS NOT NULL
  AND notes ~* '^\+(\d+)\s*goals?';
-- notes IS NOT NULL guard is required: regex operators on NULL produce NULL (not false),
-- which could cause unexpected behaviour in some Postgres versions. Explicit is safer.
```

- [ ] **Step 1.2: Run the migration in Supabase SQL Editor**

Open the Supabase dashboard → SQL Editor → paste and run the file contents.

Expected output:
```
ALTER TABLE
UPDATE N  (N = number of matching historic rows, could be 0 if no historic data)
```

- [ ] **Step 1.3: Verify the column exists**

In SQL Editor, run:
```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'weeks' AND column_name = 'goal_difference';
```
Expected: one row — `goal_difference | integer | NULL | YES`

- [ ] **Step 1.4: Spot-check backfill**

```sql
SELECT week, notes, goal_difference
FROM weeks
WHERE goal_difference IS NOT NULL
ORDER BY week DESC
LIMIT 10;
```
Expected: rows where `notes` starts with `+N goals` should have matching integer in `goal_difference`.

- [ ] **Step 1.5: Commit**

```bash
git add supabase/migrations/20260324000001_add_goal_difference.sql
git commit -m "feat: add goal_difference column to weeks with historic backfill"
```

---

## Task 2: DB migration — update record_result RPC

**Files:**
- Create: `supabase/migrations/20260324000002_record_result_with_margin.sql`

- [ ] **Step 2.1: Write the migration file**

```sql
-- supabase/migrations/20260324000002_record_result_with_margin.sql
--
-- Replaces the record_result RPC to accept p_goal_difference.
-- The DEFAULT NULL is a backward-compat safety net for pre-feature callers only.
-- New code must always pass the value explicitly.
-- The RPC is passive — it writes whatever value it receives; no coercion.

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

- [ ] **Step 2.2: Run the migration in Supabase SQL Editor**

Paste and run. Expected output:
```
CREATE FUNCTION
```

- [ ] **Step 2.3: Verify the updated function signature**

```sql
SELECT pg_get_function_arguments('record_result'::regproc);
```
Expected: `p_week_id uuid, p_winner text, p_notes text DEFAULT NULL::text, p_goal_difference integer DEFAULT NULL::integer`

- [ ] **Step 2.4: Commit**

```bash
git add supabase/migrations/20260324000002_record_result_with_margin.sql
git commit -m "feat: add p_goal_difference param to record_result RPC"
```

---

## Task 3: TypeScript type

**Files:**
- Modify: `lib/types.ts`

The `Week` interface is the canonical type for match records (per `CLAUDE.md`). All consumers of `Week` will pick up the new field automatically once it's added here.

- [ ] **Step 3.1: Write a failing test for the type shape**

Add to `__tests__/margin-of-victory.test.ts` (create file):

```ts
// __tests__/margin-of-victory.test.ts
import type { Week } from '@/lib/types'

describe('Week type — goal_difference', () => {
  it('accepts goal_difference as a number', () => {
    const w: Week = {
      week: 1,
      date: '20 Mar 2026',
      status: 'played',
      teamA: [],
      teamB: [],
      winner: 'teamA',
      goal_difference: 3,
    }
    expect(w.goal_difference).toBe(3)
  })

  it('accepts goal_difference as null', () => {
    const w: Week = {
      week: 1,
      date: '20 Mar 2026',
      status: 'played',
      teamA: [],
      teamB: [],
      winner: 'teamA',
      goal_difference: null,
    }
    expect(w.goal_difference).toBeNull()
  })

  it('accepts goal_difference as undefined (optional)', () => {
    const w: Week = {
      week: 1,
      date: '20 Mar 2026',
      status: 'played',
      teamA: [],
      teamB: [],
      winner: 'teamA',
    }
    expect(w.goal_difference).toBeUndefined()
  })
})
```

- [ ] **Step 3.2: Run the test to verify it fails (type error)**

```bash
npm test -- --testPathPattern=margin-of-victory --no-coverage
```
Expected: compilation error — `goal_difference` does not exist on type `Week`

- [ ] **Step 3.3: Add `goal_difference` to the `Week` interface in `lib/types.ts`**

Locate the `Week` interface (line ~4). Add after `notes?`:

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
  // Non-negative integer. 0 = draw. Positive = win margin (UI enforces 1–20, DB has no constraint).
  // null = not recorded or cancelled. Display code must handle any positive integer gracefully.
  goal_difference?: number | null;
}
```

- [ ] **Step 3.4: Run the test to verify it passes**

```bash
npm test -- --testPathPattern=margin-of-victory --no-coverage
```
Expected: PASS (3 tests)

- [ ] **Step 3.5: Commit**

```bash
git add lib/types.ts __tests__/margin-of-victory.test.ts
git commit -m "feat: add goal_difference to Week type"
```

---

## Task 4: Read paths — data fetching

**Files:**
- Modify: `lib/data.ts`
- Modify: `app/api/weeks/route.ts`

`fetchWeeks` in `lib/data.ts` has two branches: one that calls Supabase directly and one (access-key mode) that calls `/api/weeks`. There are **three distinct edits** in `lib/data.ts`:
1. The Supabase path `.select()` string (add the column name)
2. The Supabase path `.map()` (add `goal_difference` to the returned object)
3. The access-key path `.map()` (same — this constructs the object manually from raw API rows)

- [ ] **Step 4.1: Add `shouldShowMeta` tests and mapper tests to `__tests__/margin-of-victory.test.ts`**

`shouldShowMeta` will be extracted to `lib/utils.ts` in Task 8 with this exact signature:
```ts
export function shouldShowMeta(
  goal_difference: number | null | undefined,
  notes: string | undefined
): boolean
```

Add these tests now, and add a mapper test that validates the `goal_difference` field survives the raw-row → `Week` transformation:

```ts
// Add to __tests__/margin-of-victory.test.ts

// ── shouldShowMeta ──────────────────────────────────────────────
// Tests the display condition: show the meta row when there's a
// non-null, non-zero margin OR non-empty notes.
// This function will live in lib/utils.ts (Task 8).
// Define it inline here so the tests run before that task.
function shouldShowMeta(goal_difference: number | null | undefined, notes: string | undefined): boolean {
  return (goal_difference != null && goal_difference !== 0) || !!(notes && notes.trim() !== '')
}

describe('shouldShowMeta', () => {
  it('returns true when goal_difference is a positive win margin', () => {
    expect(shouldShowMeta(3, undefined)).toBe(true)
  })

  it('returns false when goal_difference is 0 (draw) with no notes', () => {
    expect(shouldShowMeta(0, undefined)).toBe(false)
  })

  it('returns false when goal_difference is null with no notes', () => {
    expect(shouldShowMeta(null, undefined)).toBe(false)
  })

  it('returns true when goal_difference is null but notes are present', () => {
    expect(shouldShowMeta(null, 'Good game')).toBe(true)
  })

  it('returns false when notes are whitespace only', () => {
    expect(shouldShowMeta(null, '   ')).toBe(false)
  })

  it('returns true when draw (0) but notes are present', () => {
    expect(shouldShowMeta(0, 'Played in rain')).toBe(true)
  })
})

// ── mapWeekRow ──────────────────────────────────────────────────
// Tests that raw Supabase rows (snake_case keys) are correctly
// mapped to the Week type, including goal_difference.
// This mirrors the inline mapper in lib/data.ts fetchWeeks.
function mapWeekRow(row: Record<string, unknown>) {
  return {
    week: row.week,
    date: row.date,
    status: row.status,
    format: row.format ?? undefined,
    teamA: row.team_a ?? [],
    teamB: row.team_b ?? [],
    winner: row.winner ?? null,
    notes: row.notes ?? undefined,
    goal_difference: row.goal_difference ?? null,
  }
}

describe('mapWeekRow — goal_difference', () => {
  it('maps a positive goal_difference from raw row', () => {
    const row = { week: 1, date: '20 Mar 2026', status: 'played', format: '6v6',
      team_a: [], team_b: [], winner: 'teamA', notes: '+3 Goals', goal_difference: 3 }
    expect(mapWeekRow(row).goal_difference).toBe(3)
  })

  it('maps goal_difference of 0 (draw)', () => {
    const row = { week: 2, date: '27 Mar 2026', status: 'played', format: '6v6',
      team_a: [], team_b: [], winner: 'draw', notes: null, goal_difference: 0 }
    expect(mapWeekRow(row).goal_difference).toBe(0)
  })

  it('maps null goal_difference (not recorded)', () => {
    const row = { week: 3, date: '3 Apr 2026', status: 'played', format: '6v6',
      team_a: [], team_b: [], winner: 'teamB', notes: null, goal_difference: null }
    expect(mapWeekRow(row).goal_difference).toBeNull()
  })

  it('maps missing goal_difference as null (absent from old row)', () => {
    const row = { week: 4, date: '10 Apr 2026', status: 'played', format: '6v6',
      team_a: [], team_b: [], winner: 'teamA', notes: null }
    expect(mapWeekRow(row).goal_difference).toBeNull()
  })
})
```

- [ ] **Step 4.2: Run the new tests to verify they pass**

```bash
npm test -- --testPathPattern=margin-of-victory --no-coverage
```
Expected: all tests pass (both helpers are self-contained — no lib changes needed yet)

- [ ] **Step 4.3: Update `app/api/weeks/route.ts` — add `goal_difference` to select**

Open `app/api/weeks/route.ts`. Find the `.select(...)` call (line ~29) and add `goal_difference`:

```ts
const { data, error } = await supabase
  .from('weeks')
  .select('week, date, status, format, team_a, team_b, winner, notes, goal_difference')
  .eq('game_id', gameId)
  .in('status', ['played', 'cancelled'])
  .order('week', { ascending: false })
```

- [ ] **Step 4.4: Update `lib/data.ts` — edit 1 of 3: Supabase path `.select()` string**

Find the Supabase-direct branch of `fetchWeeks` (line ~37). Update the `.select()` string:

```ts
.select('week, date, status, format, team_a, team_b, winner, notes, goal_difference')
```

- [ ] **Step 4.5: Update `lib/data.ts` — edit 2 of 3: Supabase path `.map()` callback**

In the same Supabase branch (line ~42), add `goal_difference` to the returned object:

```ts
return (data ?? []).map((row) => ({
  week: row.week,
  date: row.date,
  status: row.status,
  format: row.format ?? undefined,
  teamA: row.team_a ?? [],
  teamB: row.team_b ?? [],
  winner: row.winner ?? null,
  notes: row.notes ?? undefined,
  goal_difference: row.goal_difference ?? null,
})) as Week[]
```

- [ ] **Step 4.6: Update `lib/data.ts` — edit 3 of 3: access-key path `.map()` callback**

Find the access-key branch of `fetchWeeks` (line ~23). Update its `.map()`:

```ts
return (data ?? []).map((row: Record<string, unknown>) => ({
  week: row.week,
  date: row.date,
  status: row.status,
  format: row.format ?? undefined,
  teamA: row.team_a ?? [],
  teamB: row.team_b ?? [],
  winner: row.winner ?? null,
  notes: row.notes ?? undefined,
  goal_difference: row.goal_difference ?? null,
})) as Week[]
```

- [ ] **Step 4.7: Run all tests to verify nothing broke**

```bash
npm test --no-coverage
```
Expected: all existing tests pass + margin-of-victory tests pass

- [ ] **Step 4.8: Commit**

```bash
git add lib/data.ts app/api/weeks/route.ts
git commit -m "feat: thread goal_difference through read paths"
```

---

## Task 5: Public result API — write path

**Files:**
- Modify: `app/api/public/league/[id]/result/route.ts`

This route accepts match results when the league's `match_entry` feature has `public_enabled = true`. It currently accepts `{ weekId, winner, notes? }`. We add `goalDifference`.

**Important:** This route writes directly to the `weeks` table via the service client using `.update({...})`. It does **not** call the `record_result` RPC. The `goal_difference` field must be added to the direct `.update({})` call, not wired through the RPC.

- [ ] **Step 5.1: Review the current route**

Read `app/api/public/league/[id]/result/route.ts`. The relevant section is the body destructure (line ~29) and the `.update()` call (line ~43).

- [ ] **Step 5.2: Update the route**

```ts
// Body destructure — use unknown for goalDifference so we can validate before trusting it:
const body = await request.json()
const { weekId, winner, notes, goalDifference } = body as {
  weekId: string
  winner: Winner
  notes?: string
  goalDifference: unknown
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

// In the .update({...}) call, add goal_difference:
const { error } = await service
  .from('weeks')
  .update({
    status: 'played',
    winner,
    notes: notes?.trim() || null,
    goal_difference: goalDiff,
  })
  .eq('id', weekId)
```

- [ ] **Step 5.3: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 5.4: Commit**

```bash
git add app/api/public/league/[id]/result/route.ts
git commit -m "feat: accept and write goalDifference in public result API"
```

---

## Task 6: ResultModal — stepper + winner step

**Files:**
- Modify: `components/ResultModal.tsx`

This is the largest change. We add a local `Stepper` component, a `goalDifference` state variable, a "Margin of Victory" row that appears when a winner (not draw) is selected, and update both save paths.

- [ ] **Step 6.1: Add `goalDifference` state and stepper component**

Open `components/ResultModal.tsx`. After the existing `const [notes, setNotes] = useState('')` (line ~64), add:

```ts
const [goalDifference, setGoalDifference] = useState<number>(1)
```

Add a local `Stepper` component above the `ResultModal` function definition (after the `StepIndicator` component):

```tsx
function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center border border-slate-700 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={value <= 1}
        className={cn(
          'w-8 h-8 flex items-center justify-center bg-slate-800 text-slate-400 hover:text-slate-100 text-lg leading-none select-none',
          value <= 1 && 'opacity-40 cursor-not-allowed'
        )}
      >
        −
      </button>
      <span className="w-9 h-8 flex items-center justify-center bg-slate-900 text-slate-100 font-bold text-sm border-x border-slate-700">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(20, value + 1))}
        disabled={value >= 20}
        className={cn(
          'w-8 h-8 flex items-center justify-center bg-slate-800 text-slate-400 hover:text-slate-100 text-lg leading-none select-none',
          value >= 20 && 'opacity-40 cursor-not-allowed'
        )}
      >
        +
      </button>
    </div>
  )
}
```

- [ ] **Step 6.2: Reset stepper when winner changes**

The stepper should initialise at `1` when a winner is first selected. Update the winner button `onClick` handlers in the winner step. Replace the three `onClick={() => setWinner(opt)}` calls with a handler that also resets `goalDifference`:

```tsx
onClick={() => {
  setWinner(opt)
  if (opt !== 'draw') setGoalDifference(1)
}}
```

- [ ] **Step 6.3: Add the "Margin of Victory" row to the winner step**

In the winner step's `<div className="p-5">`, between the winner buttons `<div>` and the `<textarea>`, insert:

```tsx
{winner && winner !== 'draw' && (
  <div className="flex items-center justify-between bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 mb-4">
    <div>
      <p className="text-xs font-semibold text-slate-100">Margin of Victory</p>
      <p className="text-[10px] text-slate-500 mt-px">
        Goals {winner === 'teamA' ? 'Team A' : 'Team B'} won by
      </p>
    </div>
    <Stepper value={goalDifference} onChange={setGoalDifference} />
  </div>
)}
```

- [ ] **Step 6.4: Update the disabled condition on ALL THREE confirm/next buttons**

There are **three** confirm/save buttons across the two step variants in the winner step. All three must enforce the margin guard:

1. **Next → button** (shown when `hasReviewStep` is `true`; current: `disabled={!winner}`):
```tsx
disabled={!winner || (winner !== 'draw' && (goalDifference < 1 || goalDifference > 20))}
```

2. **Confirm Result button — direct-save path** (shown when `hasReviewStep` is `false`; current: `disabled={saving || !winner}`). This is the most common path (no guests, no new players) and the most important to get right:
```tsx
disabled={saving || !winner || (winner !== 'draw' && (goalDifference < 1 || goalDifference > 20))}
```

3. **Save result button on the confirm step** (`step === 'confirm'`; current: `disabled={saving}`). This button fires after the guest/player review and calls `handleSave`. The margin is already captured in state by this point, so no additional disabled guard is needed here — state is set before the user can reach this step.

In summary: only buttons 1 and 2 need the guard. Button 3 is fine as-is.

- [ ] **Step 6.5: Update `handleSave` to pass `goal_difference` on both write paths**

In `handleSave`, the public path sends a `fetch` POST, and the auth path calls `supabase.rpc`.

**Public path** — update the `body`:
```ts
body: JSON.stringify({
  weekId: scheduledWeek.id,
  winner,
  notes: notes.trim() || null,
  goalDifference: winner === 'draw' ? 0 : goalDifference,
}),
```

**Auth path (RPC)** — update the rpc call:
```ts
const { error: resultErr } = await supabase.rpc('record_result', {
  p_week_id: scheduledWeek.id,
  p_winner: winner,
  p_notes: notes.trim() || null,
  p_goal_difference: winner === 'draw' ? 0 : goalDifference,
})
```

- [ ] **Step 6.6: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 6.7: Manual smoke test — winner step UI**

Run `npm run dev`. Open a league with a scheduled week. Open the result modal:
- Select Team A → "Margin of Victory" row should appear with stepper at 1
- Click `+` repeatedly → value increments to max 20, `+` button greys out
- Click `−` at 1 → button is greyed out, value stays at 1
- Select Draw → margin row disappears
- Select Team B → margin row reappears with stepper reset to 1
- With Draw selected, Confirm button should be enabled (no margin needed)
- With Team A selected and margin at valid value, Confirm button should be enabled

- [ ] **Step 6.8: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "feat: add margin of victory stepper to result modal"
```

---

## Task 7: ResultModal — confirm step summary

**Files:**
- Modify: `components/ResultModal.tsx`

The confirm step (shown only when `hasReviewStep` is `true`, i.e. guests or new players are present) displays a summary before the final save. Add a margin row for wins.

- [ ] **Step 7.1: Add margin row to the confirm step**

In the confirm step section (`{step === 'confirm' && ...}`), find the winner summary row. Add a margin summary row immediately after it, conditional on the winner being a win (not draw):

```tsx
{/* Winner row — already exists */}
<div className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
  <span className="text-slate-400">Winner</span>
  <span className={cn(
    'font-semibold',
    winner === 'teamA' ? 'text-blue-300' : winner === 'teamB' ? 'text-violet-300' : 'text-slate-300'
  )}>
    {winner === 'teamA' ? 'Team A' : winner === 'teamB' ? 'Team B' : 'Draw'}
  </span>
</div>

{/* NEW: margin row — only for wins */}
{winner && winner !== 'draw' && (
  <div className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
    <span className="text-slate-400">Margin</span>
    <span className="font-semibold text-slate-300">+{goalDifference} goals</span>
  </div>
)}
```

- [ ] **Step 7.2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 7.3: Manual smoke test — confirm step**

Run `npm run dev`. Open a league that has a scheduled week with a guest or new player in the lineup. Open the result modal:
- Select Team A, set margin to 4, proceed through the review step
- Confirm step should show: `Winner: Team A` and `Margin: +4 goals`
- Change back to Draw on the winner step; confirm step should show only `Winner: Draw` (no margin row)

- [ ] **Step 7.4: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "feat: show margin of victory in result modal confirm step"
```

---

## Task 8: MatchCard — meta pills

**Files:**
- Modify: `components/MatchCard.tsx`

Replace the current italic notes paragraph with conditional margin + notes pills, displayed side by side.

- [ ] **Step 8.1: Extract `shouldShowMeta` as a named export in `lib/utils.ts`**

The display condition is already tested in Task 4 with this exact signature (primitive parameters, not a `Week` object — keeps tests simple and avoids needing to construct full `Week` objects in tests):
```ts
function shouldShowMeta(goal_difference: number | null | undefined, notes: string | undefined): boolean
```

Add it to `lib/utils.ts` with that exact signature — do not change it to accept a `Week` object:

```ts
/** Returns true if the match card should render the meta row (margin and/or notes). */
export function shouldShowMeta(
  goal_difference: number | null | undefined,
  notes: string | undefined
): boolean {
  return (goal_difference != null && goal_difference !== 0) || !!(notes && notes.trim() !== '')
}
```

- [ ] **Step 8.2: Update the test to use the real import**

In `__tests__/margin-of-victory.test.ts`, replace the local inline `shouldShowMeta` function definition with the real import. The `mapWeekRow` helper stays inline (it's testing the mapping logic, not a shared function).

```ts
import { shouldShowMeta } from '@/lib/utils'

// Remove the local shouldShowMeta function definition — keep mapWeekRow
```

- [ ] **Step 8.3: Run the tests to verify they still pass**

```bash
npm test -- --testPathPattern=margin-of-victory --no-coverage
```
Expected: all tests pass

- [ ] **Step 8.4: Update `components/MatchCard.tsx`**

The `PlayedCard` component currently renders notes as:
```tsx
{week.notes && week.notes.trim() !== '' && (
  <p className="mt-3 text-sm text-slate-400 italic">
    Note: {week.notes}
  </p>
)}
```

Replace this entire block with the new meta row:

```tsx
{shouldShowMeta(week.goal_difference, week.notes) && (
  <div className="mt-3 flex flex-wrap gap-2">
    {week.goal_difference != null && week.goal_difference !== 0 && (
      <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1">
          Margin
        </span>
        +{week.goal_difference} goals
      </div>
    )}
    {week.notes && week.notes.trim() !== '' && (
      <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1">
          Notes
        </span>
        {week.notes}
      </div>
    )}
  </div>
)}
```

Also add the import at the top of `MatchCard.tsx`:

```ts
import { cn, shouldShowMeta } from '@/lib/utils'
```

Note: the divider `border-t border-slate-700` is inside the static `.p-4` container — it remains unconditional. The meta row itself is conditional, so the divider will show with empty space below if neither pill is visible. To fix this, move the divider inside the conditional:

Replace the existing `<div className="border-t border-slate-700">` wrapper in the expanded body:

```tsx
<Collapsible.Content ...>
  <div className="p-4">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <TeamList label="Team A" players={week.teamA} goalkeepers={goalkeepers} />
      <TeamList label="Team B" players={week.teamB} goalkeepers={goalkeepers} />
    </div>
    {shouldShowMeta(week.goal_difference, week.notes) && (
      <>
        <div className="border-t border-slate-700 mt-3 pt-3" />
        <div className="flex flex-wrap gap-2">
          {week.goal_difference != null && week.goal_difference !== 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1">
                Margin
              </span>
              +{week.goal_difference} goals
            </div>
          )}
          {week.notes && week.notes.trim() !== '' && (
            <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-400 italic">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide not-italic mr-1">
                Notes
              </span>
              {week.notes}
            </div>
          )}
        </div>
      </>
    )}
  </div>
</Collapsible.Content>
```

> **Note:** The `<div className="border-t border-slate-700 mt-3 pt-3" />` is a self-closing div used purely as a visual divider. This is a minor pattern deviation — if you prefer, use `<hr className="border-slate-700 mt-3" />` instead.

- [ ] **Step 8.5: TypeScript check + tests**

```bash
npx tsc --noEmit && npm test --no-coverage
```
Expected: no TS errors, all tests pass

- [ ] **Step 8.6: Manual smoke test — match card**

Run `npm run dev`. Open a league's match history page:
- A played week **with** `goal_difference` backfilled (check SQL in Task 1.4) → open the card → margin pill and notes pill should appear side by side
- A played week **without** `goal_difference` (null) but with notes → only notes pill appears; no divider gap issue
- A draw result → no margin pill (draw = 0); if it has notes, only notes pill appears
- A played week with neither margin nor notes → no meta row, no divider

- [ ] **Step 8.7: Commit**

```bash
git add components/MatchCard.tsx lib/utils.ts __tests__/margin-of-victory.test.ts
git commit -m "feat: replace notes paragraph with margin+notes pills in MatchCard"
```

---

## Task 9: Final integration check

- [ ] **Step 9.1: Run all tests**

```bash
npm test --no-coverage
```
Expected: all tests pass

- [ ] **Step 9.2: TypeScript check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 9.3: End-to-end manual test**

Run `npm run dev`. Test the full result entry flow:

**Win (authenticated path):**
1. Open a league with a scheduled week
2. Open the result modal → select Team A → set margin to 5 → add notes "Rainy night" → click Confirm
3. After save, open the match card → should show `MARGIN +5 goals` and `NOTES Rainy night` as pills

**Draw (authenticated path):**
1. Open a scheduled week → select Draw → Confirm
2. Match card expanded → no margin pill, no divider (if no notes)

**Win (public path, if `match_entry` is `public_enabled`):**
1. Visit the public league page `/results/[id]`
2. If a scheduled week exists and public match entry is enabled, record a win with margin
3. Verify the card shows the margin after save

**Historic backfill check:**
1. Find a week with `goal_difference` populated via backfill (from Task 1.4)
2. Open the card → margin pill should appear with the correct value

- [ ] **Step 9.4: Final commit**

```bash
git add -A
git commit -m "chore: final tidy for margin of victory feature"
```
