# Match Card Lineup Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the match card to show colour-coded team lineups with frozen strength scores, update the winner badge to match the Lineup Lab palette, and tighten up the card header.

**Architecture:** DB migration adds two nullable rating columns to `weeks`; `record_result` RPC is extended to accept them; `ResultModal` computes ewpt scores at save time and passes them through; the display layer threads ratings down to an updated `TeamList` which renders coloured rows + score chips.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind CSS v3, Supabase (PostgreSQL + RLS), Jest (unit tests).

---

## File map

| File | Change |
|---|---|
| `supabase/migrations/20260324000003_week_team_ratings.sql` | **Create** — ALTER TABLE + updated record_result RPC |
| `lib/types.ts` | **Modify** — add `team_a_rating?` and `team_b_rating?` to `Week` |
| `components/WinnerBadge.tsx` | **Modify** — sky palette for Team A, "Won" suffix on labels |
| `components/MatchCard.tsx` | **Modify** — remove Winner label text, fix format colour, pass team/rating to TeamList |
| `components/TeamList.tsx` | **Modify** — add `team` + `rating` props, replace left-border list with coloured rows + score chip |
| `app/[leagueId]/results/page.tsx` | **Modify** — add team_a_rating/team_b_rating to SELECT and Week mapping |
| `components/ResultModal.tsx` | **Modify** — compute ewpt scores in handleSave, pass to RPC and public API |
| `app/api/public/league/[id]/result/route.ts` | **Modify** — accept + store teamARating/teamBRating in body |
| `__tests__/match-card-ratings.test.ts` | **Create** — unit tests for Week type fields + row mapping |

---

## Task 1: DB migration — add rating columns + update RPC

**Files:**
- Create: `supabase/migrations/20260324000003_week_team_ratings.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260324000003_week_team_ratings.sql
--
-- Adds team_a_rating and team_b_rating snapshot columns to weeks.
-- Both nullable — historical games have no ratings.
-- Updates record_result RPC to accept and store the new params.

ALTER TABLE weeks
  ADD COLUMN IF NOT EXISTS team_a_rating NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS team_b_rating NUMERIC(6,3);

CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT    DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL,
  p_team_a_rating   NUMERIC DEFAULT NULL,
  p_team_b_rating   NUMERIC DEFAULT NULL
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
END;
$$;
```

- [ ] **Step 2: Run migration in Supabase SQL Editor**

Copy the file contents and run in your Supabase project's SQL Editor. Verify:
- `weeks` table has `team_a_rating` and `team_b_rating` columns (nullable numeric)
- `record_result` function now accepts 6 parameters

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260324000003_week_team_ratings.sql
git commit -m "feat: add team rating columns and update record_result RPC"
```

---

## Task 2: Update `Week` type + write unit tests

**Files:**
- Modify: `lib/types.ts`
- Create: `__tests__/match-card-ratings.test.ts`

- [ ] **Step 1: Write failing tests first**

Create `__tests__/match-card-ratings.test.ts`:

```ts
// __tests__/match-card-ratings.test.ts
import type { Week } from '@/lib/types'

// ── Week type — team ratings ─────────────────────────────────────

describe('Week type — team_a_rating / team_b_rating', () => {
  it('accepts numeric ratings', () => {
    const w: Week = {
      week: 1, date: '24 Mar 2026', status: 'played',
      teamA: [], teamB: [], winner: 'teamA',
      team_a_rating: 4.210,
      team_b_rating: 3.890,
    }
    expect(w.team_a_rating).toBe(4.210)
    expect(w.team_b_rating).toBe(3.890)
  })

  it('accepts null ratings (historical games)', () => {
    const w: Week = {
      week: 2, date: '17 Mar 2026', status: 'played',
      teamA: [], teamB: [], winner: 'draw',
      team_a_rating: null,
      team_b_rating: null,
    }
    expect(w.team_a_rating).toBeNull()
    expect(w.team_b_rating).toBeNull()
  })

  it('accepts undefined ratings (field omitted)', () => {
    const w: Week = {
      week: 3, date: '10 Mar 2026', status: 'played',
      teamA: [], teamB: [], winner: 'teamB',
    }
    expect(w.team_a_rating).toBeUndefined()
    expect(w.team_b_rating).toBeUndefined()
  })
})

// ── mapWeekRow — team ratings ────────────────────────────────────
// Mirrors the inline mapper in app/[leagueId]/results/page.tsx

function mapWeekRow(row: Record<string, unknown>) {
  return {
    week: row.week as number,
    date: row.date as string,
    status: row.status as Week['status'],
    format: (row.format as string | null) ?? undefined,
    teamA: (row.team_a as string[]) ?? [],
    teamB: (row.team_b as string[]) ?? [],
    winner: (row.winner as Week['winner']) ?? null,
    notes: (row.notes as string | null) ?? undefined,
    goal_difference: (row.goal_difference as number | null) ?? null,
    team_a_rating: (row.team_a_rating as number | null) ?? null,
    team_b_rating: (row.team_b_rating as number | null) ?? null,
  }
}

describe('mapWeekRow — team ratings', () => {
  it('maps numeric ratings from raw row', () => {
    const row = {
      week: 1, date: '24 Mar 2026', status: 'played', format: '6-a-side',
      team_a: ['Alice', 'Bob'], team_b: ['Carol', 'Dan'],
      winner: 'teamA', notes: null, goal_difference: 2,
      team_a_rating: 4.210, team_b_rating: 3.890,
    }
    const mapped = mapWeekRow(row)
    expect(mapped.team_a_rating).toBe(4.210)
    expect(mapped.team_b_rating).toBe(3.890)
  })

  it('maps null ratings (historical row without ratings)', () => {
    const row = {
      week: 2, date: '17 Mar 2026', status: 'played', format: '6-a-side',
      team_a: [], team_b: [], winner: 'draw', notes: null,
      goal_difference: 0, team_a_rating: null, team_b_rating: null,
    }
    const mapped = mapWeekRow(row)
    expect(mapped.team_a_rating).toBeNull()
    expect(mapped.team_b_rating).toBeNull()
  })

  it('maps absent rating columns as null', () => {
    const row = {
      week: 3, date: '10 Mar 2026', status: 'played', format: '5-a-side',
      team_a: [], team_b: [], winner: 'teamB', notes: null, goal_difference: 1,
      // team_a_rating and team_b_rating absent (pre-migration row)
    }
    const mapped = mapWeekRow(row)
    expect(mapped.team_a_rating).toBeNull()
    expect(mapped.team_b_rating).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — expect TypeScript errors (field not on Week yet)**

```bash
npm test -- __tests__/match-card-ratings.test.ts
```

Expected: TypeScript compilation error — `team_a_rating` does not exist on `Week`.

- [ ] **Step 3: Add fields to `Week` in `lib/types.ts`**

In `lib/types.ts`, add after `goal_difference`:

```ts
  team_a_rating?: number | null;  // ewptScore snapshot at game time; null for pre-migration games
  team_b_rating?: number | null;
```

- [ ] **Step 4: Run tests — expect passing**

```bash
npm test -- __tests__/match-card-ratings.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts __tests__/match-card-ratings.test.ts
git commit -m "feat: add team_a_rating/team_b_rating fields to Week type"
```

---

## Task 3: Update `WinnerBadge` — sky palette + "Won" labels

**Files:**
- Modify: `components/WinnerBadge.tsx`

The current `BADGE_CLASSES` uses `bg-blue-900 border-blue-700 text-blue-300` for Team A. This task switches it to sky, and adds "Won" to the label.

- [ ] **Step 1: Update `BADGE_CLASSES` and `BADGE_LABELS`**

In `components/WinnerBadge.tsx`, replace the two lookup objects:

```ts
const BADGE_CLASSES: Record<NonNullable<Winner>, string> = {
  teamA: 'bg-sky-900/60 text-sky-300 border border-sky-700',
  teamB: 'bg-violet-900/60 text-violet-300 border border-violet-700',
  draw: 'bg-slate-700 text-slate-300 border border-slate-600',
}

const BADGE_LABELS: Record<NonNullable<Winner>, string> = {
  teamA: 'Team A Won',
  teamB: 'Team B Won',
  draw: 'Draw',
}
```

- [ ] **Step 2: Run full test suite — ensure no regressions**

```bash
npm test
```

Expected: all existing tests pass (WinnerBadge has no unit tests — visual change only).

- [ ] **Step 3: Commit**

```bash
git add components/WinnerBadge.tsx
git commit -m "feat: winner badge uses sky palette and Won suffix"
```

---

## Task 4: Update `MatchCard` header — remove Winner label, fix format colour

**Files:**
- Modify: `components/MatchCard.tsx`

Two small changes to the `PlayedCard` header:
1. Remove the `<span className="text-xs text-slate-500">Winner</span>` element
2. Change the format span from `text-slate-500` to `text-slate-400`

- [ ] **Step 1: Remove Winner label text and fix format colour**

In `components/MatchCard.tsx`, in the `PlayedCard` header section, find the `<div className="text-left">` block and update:

```tsx
<div className="text-left">
  <p className="text-sm font-semibold text-slate-100">Week {week.week}</p>
  <p className="text-xs text-slate-400">
    {week.date}
    {week.format && (
      <span className="ml-2 text-slate-400">· {week.format}</span>
    )}
  </p>
</div>
```

And in the `<div className="flex items-center gap-2">` on the right, remove the Winner label span so it reads:

```tsx
<div className="flex items-center gap-2">
  <WinnerBadge winner={week.winner} />
  <ChevronDown ... />
</div>
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "feat: remove Winner label from card header, fix format text colour"
```

---

## Task 5: Update `TeamList` — coloured rows + score chip

**Files:**
- Modify: `components/TeamList.tsx`

Replace the simple left-border name list with colour-coded rows matching the Lineup Lab, and add a team label + score chip header row.

- [ ] **Step 1: Rewrite `TeamList`**

Replace the entire contents of `components/TeamList.tsx`:

```tsx
import { cn } from '@/lib/utils'

interface TeamListProps {
  label: string
  players: string[]
  team: 'A' | 'B'
  rating?: number | null
  goalkeepers?: string[]
}

export function TeamList({ label, players, team, rating, goalkeepers }: TeamListProps) {
  const isA = team === 'A'

  return (
    <div>
      {/* Team heading + score chip */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-100">{label}</p>
        {rating != null && (
          <span className={cn(
            'px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums border',
            isA
              ? 'bg-sky-900/60 border-sky-700 text-sky-300'
              : 'bg-violet-900/60 border-violet-700 text-violet-300'
          )}>
            {rating.toFixed(3)}
          </span>
        )}
      </div>

      {/* Player rows */}
      <ul className="space-y-1">
        {players.map((player) => (
          <li
            key={player}
            className={cn(
              'text-xs font-medium px-2.5 py-1.5 rounded border',
              isA
                ? 'bg-sky-950/40 border-sky-900/60 text-sky-100'
                : 'bg-violet-950/40 border-violet-900/60 text-violet-100'
            )}
          >
            {player}{goalkeepers?.includes(player) ? ' 🧤' : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/TeamList.tsx
git commit -m "feat: TeamList coloured rows + score chip (sky/violet palette)"
```

---

## Task 6: Wire `team` and `rating` props through `MatchCard`

**Files:**
- Modify: `components/MatchCard.tsx`

`MatchCard` receives the full `Week` object which now carries `team_a_rating` / `team_b_rating`. Pass them down to `TeamList`.

- [ ] **Step 1: Update `TeamList` calls in `PlayedCard`**

In `components/MatchCard.tsx`, in the expanded body grid, update the two `TeamList` usages:

```tsx
<TeamList
  label="Team A"
  players={week.teamA}
  team="A"
  rating={week.team_a_rating}
  goalkeepers={goalkeepers}
/>
<TeamList
  label="Team B"
  players={week.teamB}
  team="B"
  rating={week.team_b_rating}
  goalkeepers={goalkeepers}
/>
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "feat: pass team identity and rating to TeamList"
```

---

## Task 7: Thread rating fields through results page data fetching

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

The weeks `SELECT` and row mapper need to include the two new columns.

- [ ] **Step 1: Add columns to SELECT and type, update mapper**

In `app/[leagueId]/results/page.tsx`:

1. Add `team_a_rating` and `team_b_rating` to the `WeekRow` type:

```ts
type WeekRow = {
  week: number; date: string; status: string; format: string | null;
  team_a: string[] | null; team_b: string[] | null; winner: string | null;
  notes: string | null; goal_difference: number | null;
  team_a_rating: number | null; team_b_rating: number | null;
}
```

2. Add the columns to the `.select(...)` call:

```ts
.select('week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating')
```

3. Add to the inline `.map()` on `rawWeeks` (which is then passed into `sortWeeks`):

```ts
team_a_rating: row.team_a_rating ?? null,
team_b_rating: row.team_b_rating ?? null,
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass (data fetching changes are not unit tested — verified at runtime).

- [ ] **Step 3: Commit**

```bash
git add app/[leagueId]/results/page.tsx
git commit -m "feat: fetch team rating columns in results page"
```

---

## Task 8: Compute and store team ratings in `ResultModal`

**Files:**
- Modify: `components/ResultModal.tsx`

When a result is saved, compute ewpt scores for each team from the current player data and pass them to the RPC (or public API route).

- [ ] **Step 1: Add `ewptScore` to the import from `@/lib/utils`**

In `components/ResultModal.tsx` line 4, update the import:

```ts
import { cn, ewptScore } from '@/lib/utils'
```

- [ ] **Step 2: Add the rating computation block inside `handleSave`**

Insert the following block immediately after `setError(null)` and before `try {` in `handleSave`. The rest of `handleSave` is unchanged — keep the existing `publicMode` branch, the `supabase.rpc('record_result', {...})` call, and the `promote_roster` block exactly as they are.

```ts
// Compute frozen team strength scores to store alongside the result.
const guestMap = new Map(guestStates.map((g) => [g.name, g]))
const newPlayerMap = new Map(newPlayerStates.map((p) => [p.name, p]))

function resolveTeam(names: string[]): Player[] {
  return names.map((name) => {
    const known = allPlayers.find((p) => p.name === name)
    if (known) return known
    const src = guestMap.get(name) ?? newPlayerMap.get(name)
    return {
      name,
      played: 0, won: 0, drew: 0, lost: 0,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0, qualified: false, points: 0,
      recentForm: '',
      mentality: 'balanced' as const,
      rating: src?.rating ?? 2,
      goalkeeper: src?.goalkeeper ?? false,
    }
  })
}

const teamAScore = parseFloat(ewptScore(resolveTeam(scheduledWeek.teamA)).toFixed(3))
const teamBScore = parseFloat(ewptScore(resolveTeam(scheduledWeek.teamB)).toFixed(3))
```

- [ ] **Step 3: Pass ratings into the `publicMode` fetch body**

In the existing `publicMode` `fetch` call's `body`, add the two new fields:

```ts
body: JSON.stringify({
  weekId: scheduledWeek.id,
  winner,
  notes: notes.trim() || null,
  goalDifference: winner === 'draw' ? 0 : goalDifference,
  teamARating: teamAScore,
  teamBRating: teamBScore,
}),
```

- [ ] **Step 4: Pass ratings into the existing `record_result` RPC call**

In the existing `supabase.rpc('record_result', {...})` call, add the two new params. The `promote_roster` call that follows it is **not changed**:

```ts
const { error: resultErr } = await supabase.rpc('record_result', {
  p_week_id: scheduledWeek.id,
  p_winner: winner,
  p_notes: notes.trim() || null,
  p_goal_difference: winner === 'draw' ? 0 : goalDifference,
  p_team_a_rating: teamAScore,
  p_team_b_rating: teamBScore,
})
if (resultErr) throw resultErr

// ← promote_roster block continues unchanged here
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "feat: compute and store team ewpt ratings on result save"
```

---

## Task 9: Accept team ratings in public API route

**Files:**
- Modify: `app/api/public/league/[id]/result/route.ts`

The public API route does a direct `UPDATE weeks SET ...` — it needs to include the rating fields.

- [ ] **Step 1: Update the route to accept and store ratings**

In `app/api/public/league/[id]/result/route.ts`:

1. Add `teamARating` and `teamBRating` to the body destructure:

```ts
const { weekId, winner, notes, goalDifference, teamARating, teamBRating } = body as {
  weekId: string
  winner: Winner
  notes?: string
  goalDifference: unknown
  teamARating?: unknown
  teamBRating?: unknown
}
```

2. Add a safe numeric parse helper and use it in the UPDATE:

```ts
function safeRating(val: unknown): number | null {
  if (typeof val === 'number' && isFinite(val)) return val
  return null
}
```

3. Add to the `.update({...})` call:

```ts
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
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/public/league/[id]/result/route.ts
git commit -m "feat: store team ratings via public result API route"
```

---

## Task 10: Smoke test end-to-end

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Check the match history page**

Navigate to a league's results page. Verify:
- Existing match cards show "Team A Won" / "Team B Won" / "Draw" badge (sky/violet palette)
- No "Winner" label text preceding the badge
- Date and format text are the same colour in the header
- Expanded cards show coloured player rows (sky for A, violet for B) and team labels (`Team A` / `Team B` in white)
- Historical games (pre-migration) show no score chip — rows and heading still appear

- [ ] **Step 3: Record a new result**

Open a scheduled week and record a result. Verify:
- After saving, the new match card shows score chips above each column
- Chip values match what you'd expect from the team compositions

- [ ] **Step 4: Run full test suite one final time**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Final commit if any loose ends**

```bash
git add -p
git commit -m "chore: smoke test fixes" # only if needed
```
