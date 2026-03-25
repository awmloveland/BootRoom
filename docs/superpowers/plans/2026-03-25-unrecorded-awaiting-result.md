# Unrecorded & Awaiting Result States — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a game week's 20:00 deadline passes with no result recorded, show the week in the results list as either "Unrecorded" (no lineup was built) or "Awaiting Result" (lineup was built but no result entered), and advance the NextMatchCard to the next week.

**Architecture:** A DB migration adds the `'unrecorded'` status value and a new `create_unrecorded_week` RPC. The results page server component detects missed game days and lazily creates unrecorded rows. Two new card variants (`UnrecordedCard`, `AwaitingResultCard`) are added to `MatchCard.tsx`. The `isPastDeadline` utility is extracted and shared. Props are threaded through `ResultsSection` → `WeekList` → `MatchCard` to support the admin-only Record Result button.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS v3, Supabase (PostgreSQL + RLS), Radix UI Collapsible, Jest + ts-jest

**Spec:** `docs/superpowers/specs/2026-03-25-unrecorded-awaiting-result-design.md`

---

## File Map

| Action | File | What changes |
|---|---|---|
| Create | `supabase/migrations/20260325000001_unrecorded_week.sql` | DB constraint update + `create_unrecorded_week` RPC |
| Modify | `lib/types.ts` | Add `id?`, `lineupMetadata?` to `Week`; add `'unrecorded'` + `'scheduled'` to `WeekStatus` |
| Modify | `lib/utils.ts` | Add `isPastDeadline`, `getMostRecentExpectedGameDate` |
| Create | `lib/__tests__/utils.deadline.test.ts` | Tests for both new utilities |
| Modify | `components/MatchCard.tsx` | Add `UnrecordedCard`, `AwaitingResultCard`; update dispatcher + props |
| Modify | `components/WeekList.tsx` | Thread new props through to `MatchCard` |
| Modify | `components/ResultsSection.tsx` | Thread `isAdmin`, `gameId`, `allPlayers`, `onResultSaved` |
| Modify | `components/NextMatchCard.tsx` | Import `isPastDeadline`; remove local deadline helpers; add deadline check on load; extend status query |
| Modify | `app/[leagueId]/results/page.tsx` | Fetch `id` + `lineup_metadata` + `'unrecorded'`/`'scheduled'` weeks; lazy row creation; public mode deadline fix; thread new props |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260325000001_unrecorded_week.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260325000001_unrecorded_week.sql
--
-- Adds 'unrecorded' status for game weeks that elapsed with no action.
-- The 'played' value must remain — record_result sets status = 'played'.
--
-- NOTE: save_lineup unconditionally upserts status = 'scheduled' on conflict,
-- so it would overwrite an unrecorded row if a lineup were built retroactively.
-- Admins retroactively adding a lineup to an unrecorded week is out of scope.

ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_status_check;
ALTER TABLE weeks ADD CONSTRAINT weeks_status_check
  CHECK (status IN ('scheduled', 'cancelled', 'unrecorded', 'played'));

-- ── create_unrecorded_week ────────────────────────────────────────────────────
-- Creates a placeholder row for a game week that passed with no lineup or cancel.
-- Called via service client from the server — no auth check needed here.
-- ON CONFLICT DO NOTHING makes it safe to call on every page load.
CREATE OR REPLACE FUNCTION create_unrecorded_week(
  p_game_id UUID,
  p_season  TEXT,
  p_week    INT,
  p_date    TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO weeks (game_id, season, week, date, status, team_a, team_b)
  VALUES (p_game_id, p_season, p_week, p_date, 'unrecorded', '[]', '[]')
  ON CONFLICT (game_id, season, week) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
```

- [ ] **Step 2: Apply migration in Supabase**

Open Supabase SQL Editor and run the migration file contents. Verify no error is returned.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260325000001_unrecorded_week.sql
git commit -m "feat: add unrecorded week DB status and create_unrecorded_week RPC"
```

---

## Task 2: New Utilities — `isPastDeadline` + `getMostRecentExpectedGameDate`

**Files:**
- Modify: `lib/utils.ts`
- Create: `lib/__tests__/utils.deadline.test.ts`

- [ ] **Step 1: Write failing tests**

Create `lib/__tests__/utils.deadline.test.ts`:

```ts
import { isPastDeadline, getMostRecentExpectedGameDate, formatWeekDate } from '@/lib/utils'
import type { Week } from '@/lib/types'

// ─── isPastDeadline ───────────────────────────────────────────────────────────

describe('isPastDeadline', () => {
  it('returns true for a date clearly in the past', () => {
    expect(isPastDeadline('01 Jan 2020')).toBe(true)
  })

  it('returns false for a date clearly in the future', () => {
    expect(isPastDeadline('01 Jan 2099')).toBe(false)
  })

  it('returns false for today before 20:00 (mocked)', () => {
    const today = new Date()
    today.setHours(10, 0, 0, 0) // 10am
    const spy = jest.spyOn(Date, 'now').mockReturnValue(today.getTime())
    const todayStr = formatWeekDate(new Date())
    expect(isPastDeadline(todayStr)).toBe(false)
    spy.mockRestore()
  })

  it('returns true for today after 20:00 (mocked)', () => {
    const today = new Date()
    today.setHours(21, 0, 0, 0) // 9pm
    const spy = jest.spyOn(Date, 'now').mockReturnValue(today.getTime())
    const todayStr = formatWeekDate(new Date())
    expect(isPastDeadline(todayStr)).toBe(true)
    spy.mockRestore()
  })
})

// ─── getMostRecentExpectedGameDate ────────────────────────────────────────────

function makeWeek(overrides: Partial<Week> & { date: string }): Week {
  return {
    week: 1,
    date: overrides.date,
    status: 'played',
    teamA: [],
    teamB: [],
    winner: null,
    ...overrides,
  }
}

describe('getMostRecentExpectedGameDate', () => {
  it('returns null when no leagueDayIndex and no played weeks', () => {
    expect(getMostRecentExpectedGameDate([], undefined)).toBeNull()
  })

  it('uses leagueDayIndex to find the most recent past occurrence', () => {
    // With explicit leagueDayIndex=4 (Thursday), result should be a Thursday in the past or today
    const result = getMostRecentExpectedGameDate([], 4)
    expect(result).not.toBeNull()
    const parts = result!.split(' ')
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const date = new Date(parseInt(parts[2]), MONTHS.indexOf(parts[1]), parseInt(parts[0]))
    expect(date.getDay()).toBe(4) // Thursday
    // Result is today or in the past (today is included when today is the game day)
    const todayMidnight = new Date(); todayMidnight.setHours(0,0,0,0)
    expect(date.getTime()).toBeLessThanOrEqual(todayMidnight.getTime())
  })

  it('returns the date in DD MMM YYYY format', () => {
    const result = getMostRecentExpectedGameDate([], 3) // Wednesday
    if (result) {
      expect(result).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}$/)
    }
  })

  it('infers day-of-week from most recent played week when no leagueDayIndex', () => {
    // Thursday played week
    const weeks = [makeWeek({ date: '19 Mar 2026', week: 1 })] // Thursday
    const result = getMostRecentExpectedGameDate(weeks, undefined)
    if (result) {
      const parts = result.split(' ')
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
      const date = new Date(parseInt(parts[2]), MONTHS.indexOf(parts[1]), parseInt(parts[0]))
      expect(date.getDay()).toBe(4) // Thursday
    }
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/doha
npm test -- lib/__tests__/utils.deadline.test.ts
```

Expected: FAIL — `isPastDeadline` and `getMostRecentExpectedGameDate` not found

- [ ] **Step 3: Implement the two utilities in `lib/utils.ts`**

Add after the existing `shouldShowMeta` function at the end of `lib/utils.ts`:

```ts
/**
 * Returns true if the game day 20:00 deadline has passed for the given date string.
 * Matches the local-time behavior of the existing NextMatchCard deadline logic.
 * Input format: 'DD MMM YYYY', e.g. '25 Mar 2026'
 */
export function isPastDeadline(dateStr: string): boolean {
  const [day, mon, yr] = dateStr.split(' ')
  const deadline = new Date(`${mon} ${day}, ${yr} 20:00:00`)
  return Date.now() > deadline.getTime()
}

/**
 * Returns the date string ('DD MMM YYYY') of the most recent expected game day
 * that has already passed, or null if no game day can be determined.
 *
 * Uses leagueDayIndex if provided (0=Sun…6=Sat), otherwise infers from the most
 * recent played week. Returns null if neither source is available.
 *
 * NOTE: Only returns the immediately preceding game date — does not backfill
 * multiple missed weeks. Multi-week gaps are resolved by successive page loads.
 */
export function getMostRecentExpectedGameDate(
  weeks: Week[],
  leagueDayIndex?: number
): string | null {
  const played = getPlayedWeeks(sortWeeks(weeks))
  const dow = leagueDayIndex !== undefined
    ? leagueDayIndex
    : played.length > 0
      ? parseWeekDate(played[0].date).getDay()
      : null

  if (dow === null) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  // Walk backwards from today to find the most recent occurrence of this day-of-week
  let daysBack = (today.getDay() - dow + 7) % 7
  // If today IS the game day, include today (deadline check in caller decides if it's past)
  const candidate = new Date(today)
  candidate.setDate(today.getDate() - daysBack)
  return formatWeekDate(candidate)
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- lib/__tests__/utils.deadline.test.ts
```

Expected: PASS (all tests green)

- [ ] **Step 5: Run full test suite — no regressions**

```bash
npm test
```

Expected: all existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.deadline.test.ts
git commit -m "feat: add isPastDeadline and getMostRecentExpectedGameDate utilities"
```

---

## Task 3: Update `lib/types.ts`

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Update `WeekStatus` and `Week`**

In `lib/types.ts`, replace:

```ts
export type WeekStatus = 'played' | 'cancelled';

export interface Week {
  week: number;
  date: string;        // 'DD MMM YYYY'
  status: WeekStatus;  // 'played' | 'cancelled'
  format?: string;     // e.g. '6-a-side' (absent for cancelled)
  teamA: string[];     // empty array for cancelled weeks
  teamB: string[];     // empty array for cancelled weeks
  winner: Winner;      // null for cancelled weeks
  notes?: string;      // result notes or cancellation reason
  // Non-negative integer. 0 = draw. Positive = win margin (UI enforces 1–20, DB has no constraint).
  // null = not recorded or cancelled. Display code must handle any positive integer gracefully.
  goal_difference?: number | null;
  team_a_rating?: number | null;  // ewptScore snapshot at game time; null for pre-migration games
  team_b_rating?: number | null;
}
```

with:

```ts
export type WeekStatus = 'played' | 'cancelled' | 'unrecorded' | 'scheduled';

export interface Week {
  id?: string;         // DB row id — present for rows fetched from DB; absent in legacy test fixtures
  week: number;
  date: string;        // 'DD MMM YYYY'
  status: WeekStatus;
  format?: string;     // e.g. '6-a-side' (absent for cancelled/unrecorded)
  teamA: string[];     // empty array for cancelled/unrecorded weeks
  teamB: string[];     // empty array for cancelled/unrecorded weeks
  winner: Winner;      // null for non-played weeks
  notes?: string;      // result notes or cancellation reason
  // Non-negative integer. 0 = draw. Positive = win margin (UI enforces 1–20, DB has no constraint).
  // null = not recorded or cancelled. Display code must handle any positive integer gracefully.
  goal_difference?: number | null;
  team_a_rating?: number | null;  // ewptScore snapshot at game time; null for pre-migration games
  team_b_rating?: number | null;
  lineupMetadata?: LineupMetadata | null; // populated for 'scheduled' (awaiting result) weeks
}
```

- [ ] **Step 2: Run tests — verify no type regressions**

```bash
npm test
```

Expected: all tests pass (existing `makePlayedWeek` helpers omit `id` and `lineupMetadata` which are now optional, so no breakage)

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: extend WeekStatus and Week type for unrecorded/awaiting states"
```

---

## Task 4: Update `NextMatchCard` — extract deadline helpers, fix load logic

**Files:**
- Modify: `components/NextMatchCard.tsx`

- [ ] **Step 1: Replace local deadline helpers with `isPastDeadline`**

In `components/NextMatchCard.tsx`:

1. Add `isPastDeadline` to the import from `@/lib/utils`:
   ```ts
   import { getNextMatchDate, getNextWeekNumber, deriveSeason, ewptScore, winProbability, winCopy, isPastDeadline } from '@/lib/utils'
   ```

2. Delete the two local helper functions (lines 38–47):
   ```ts
   // DELETE these:
   /** Parse 'DD MMM YYYY' and return deadline Date (game day at 20:00). */
   function getReactivateDeadline(dateStr: string): Date { ... }

   function canReactivate(dateStr: string): boolean {
     return Date.now() < getReactivateDeadline(dateStr).getTime()
   }
   ```

3. Replace every use of `canReactivate(...)` in the file with `!isPastDeadline(...)` (they are logical inverses). Search for `canReactivate` — it appears in the load callback and in the render section for the reactivate button deadline check.

- [ ] **Step 2: Extend query to include `'unrecorded'`**

In the `load()` function inside the `useEffect`, change:
```ts
.in('status', ['scheduled', 'cancelled'])
```
to:
```ts
.in('status', ['scheduled', 'cancelled', 'unrecorded'])
```

- [ ] **Step 3: Add deadline check for past-deadline rows in the load callback**

In the `load()` function, after the existing cancelled/reactivate check, add handling for past-deadline states. The full updated logic in the `if (data)` block should be:

```ts
if (data) {
  const week: ScheduledWeek = {
    id: data.id,
    week: data.week,
    date: data.date,
    format: data.format,
    teamA: data.team_a ?? [],
    teamB: data.team_b ?? [],
    status: data.status as 'scheduled' | 'cancelled',
    lineupMetadata: data.lineup_metadata
      ? {
          guests: ((data.lineup_metadata as any).guests ?? []).map((g: any) => ({
            type: 'guest' as const,
            name: g.name,
            associatedPlayer: g.associated_player,
            rating: g.rating,
          })),
          new_players: ((data.lineup_metadata as any).new_players ?? []).map((p: any) => ({
            type: 'new_player' as const,
            name: p.name,
            rating: p.rating,
          })),
        }
      : null,
  }

  // Unrecorded row — advance to next week
  if (week.status === 'unrecorded') {
    setCardState('idle')
    return
  }
  // Past-deadline scheduled row — lineup exists but game day has passed
  // The row stays in DB and appears in the results list as "Awaiting Result"
  if (week.status === 'scheduled' && isPastDeadline(week.date)) {
    setCardState('idle')
    return
  }
  // Cancelled past deadline — existing behaviour: treat as idle
  if (week.status === 'cancelled' && isPastDeadline(week.date)) {
    setCardState('idle')
    return
  }

  setScheduledWeek(week)
  setCardState(week.status === 'cancelled' ? 'cancelled' : 'lineup')
} else {
  setCardState('idle')
}
```

- [ ] **Step 4: Build — verify no TypeScript errors**

```bash
npm run build 2>&1 | head -50
```

Expected: no type errors in `NextMatchCard.tsx`

- [ ] **Step 5: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: use isPastDeadline in NextMatchCard, advance card past game day"
```

---

## Task 5: Update Results Page — fetch, row creation, public mode fix

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

- [ ] **Step 1: Add `isPastDeadline`, `getMostRecentExpectedGameDate`, `getNextWeekNumber`, `deriveSeason` to imports**

Update the utils import line:
```ts
import { sortWeeks, dayNameToIndex, isPastDeadline, getMostRecentExpectedGameDate, getNextWeekNumber, deriveSeason } from '@/lib/utils'
```

- [ ] **Step 2: Update the weeks query (step 5 in the page) to fetch all relevant statuses, plus `id` and `lineup_metadata`**

Replace the `rawWeeks` query:
```ts
// OLD:
const { data: rawWeeks } = await serviceSupabase
  .from('weeks')
  .select('week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating')
  .eq('game_id', leagueId)
  .in('status', ['played', 'cancelled'])
  .order('week', { ascending: false })

// NEW:
const { data: rawWeeks } = await serviceSupabase
  .from('weeks')
  .select('id, week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating, lineup_metadata')
  .eq('game_id', leagueId)
  .in('status', ['played', 'cancelled', 'unrecorded', 'scheduled'])
  .order('week', { ascending: false })
```

Update the `WeekRow` type and mapping to include the new fields:
```ts
type WeekRow = {
  id: string; week: number; date: string; status: string; format: string | null;
  team_a: string[] | null; team_b: string[] | null; winner: string | null; notes: string | null;
  goal_difference: number | null; team_a_rating: number | null; team_b_rating: number | null;
  lineup_metadata: Record<string, unknown> | null;
}

const weeks: Week[] = sortWeeks(
  (rawWeeks as WeekRow[] ?? []).map((row) => ({
    id: row.id,
    week: row.week,
    date: row.date,
    status: row.status as Week['status'],
    format: row.format ?? undefined,
    teamA: row.team_a ?? [],
    teamB: row.team_b ?? [],
    winner: row.winner as Week['winner'] ?? null,
    notes: row.notes ?? undefined,
    goal_difference: row.goal_difference ?? null,
    team_a_rating: row.team_a_rating ?? null,
    team_b_rating: row.team_b_rating ?? null,
    lineupMetadata: row.lineup_metadata
      ? {
          guests: ((row.lineup_metadata.guests as any[]) ?? []).map((g: any) => ({
            type: 'guest' as const,
            name: g.name,
            associatedPlayer: g.associated_player,
            rating: g.rating,
          })),
          new_players: ((row.lineup_metadata.new_players as any[]) ?? []).map((p: any) => ({
            type: 'new_player' as const,
            name: p.name,
            rating: p.rating,
          })),
        }
      : null,
  }))
)
```

- [ ] **Step 3: Add unrecorded row creation logic after the `weeks` array is built**

Insert after the `weeks` array is constructed (after step 5, before step 6):

```ts
// 5b. Lazily create an unrecorded row if the most recent expected game day passed
//     with no row. Only runs when the league has a determinable game day.
const recentDate = getMostRecentExpectedGameDate(weeks, leagueDayIndex)
if (recentDate && isPastDeadline(recentDate)) {
  // Check by date, not week number — getNextWeekNumber returns max+1 which may not
  // correspond to recentDate if played/cancelled rows already exist for that date.
  const existingRow = weeks.find((w) => w.date === recentDate)
  if (!existingRow) {
    const recentWeekNum = getNextWeekNumber(weeks) // max(week) + 1
    const season = deriveSeason(weeks) || String(new Date().getFullYear())
    await serviceSupabase.rpc('create_unrecorded_week', {
      p_game_id: leagueId,
      p_season: season,
      p_week: recentWeekNum,
      p_date: recentDate,
    })
    // Re-fetch weeks so the new unrecorded row appears in the list
    const { data: refreshedWeeks } = await serviceSupabase
      .from('weeks')
      .select('id, week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating, lineup_metadata')
      .eq('game_id', leagueId)
      .in('status', ['played', 'cancelled', 'unrecorded', 'scheduled'])
      .order('week', { ascending: false })
    // Re-map using the same mapping logic above — extract to a helper to avoid duplication
    // (see note below)
  }
}
```

**Note on duplication:** Extract the row-mapping logic into a local `mapWeekRow` function to avoid repeating it for the re-fetch. Define it just above the initial weeks fetch:

```ts
function mapWeekRow(row: WeekRow): Week {
  return {
    id: row.id,
    week: row.week,
    date: row.date,
    status: row.status as Week['status'],
    format: row.format ?? undefined,
    teamA: row.team_a ?? [],
    teamB: row.team_b ?? [],
    winner: row.winner as Week['winner'] ?? null,
    notes: row.notes ?? undefined,
    goal_difference: row.goal_difference ?? null,
    team_a_rating: row.team_a_rating ?? null,
    team_b_rating: row.team_b_rating ?? null,
    lineupMetadata: row.lineup_metadata
      ? {
          guests: ((row.lineup_metadata.guests as any[]) ?? []).map((g: any) => ({
            type: 'guest' as const,
            name: g.name,
            associatedPlayer: g.associated_player,
            rating: g.rating,
          })),
          new_players: ((row.lineup_metadata.new_players as any[]) ?? []).map((p: any) => ({
            type: 'new_player' as const,
            name: p.name,
            rating: p.rating,
          })),
        }
      : null,
  }
}
```

Then use `sortWeeks((rawWeeks as WeekRow[] ?? []).map(mapWeekRow))` in both places.

- [ ] **Step 4: Fix the `nextWeek` pre-load to apply the deadline check (public mode)**

In step 6 (fetching `nextWeek`), after building the `nextWeek` object, add:

```ts
// If the scheduled week's game day has passed, treat as absent —
// NextMatchCard will advance to the next week.
if (nextWeek && isPastDeadline(nextWeek.date)) {
  nextWeek = null
}
```

- [ ] **Step 5: Pass `isAdmin`, `gameId`, `allPlayers`, and `onResultSaved` props to `ResultsSection` and the fallback `WeekList`**

In the member/admin render, update the `<ResultsSection>` call:

```tsx
<ResultsSection
  gameId={leagueId}
  weeks={weeks}
  goalkeepers={goalkeepers}
  initialScheduledWeek={nextWeek}
  canAutoPick={canSeeTeamBuilder}
  allPlayers={players}
  showMatchHistory={canSeeMatchHistory}
  leagueDayIndex={leagueDayIndex}
  isAdmin={isAdmin}
/>
```

(`isAdmin` is already computed at line 62 as `const isAdmin = tier === 'admin'`)

Also update the fallback `<WeekList>` call site (the branch where `canSeeMatchEntry` is false but `canSeeMatchHistory` is true):

```tsx
// BEFORE:
) : canSeeMatchHistory ? (
  <WeekList weeks={weeks} goalkeepers={goalkeepers} />

// AFTER:
) : canSeeMatchHistory ? (
  <WeekList
    weeks={weeks}
    goalkeepers={goalkeepers}
    isAdmin={isAdmin}
    gameId={leagueId}
    allPlayers={players}
    onResultSaved={() => {}}
  />
```

- [ ] **Step 6: Build — verify no TypeScript errors**

```bash
npm run build 2>&1 | head -80
```

Expected: clean build

- [ ] **Step 7: Commit**

```bash
git add app/[leagueId]/results/page.tsx
git commit -m "feat: fetch unrecorded/scheduled weeks and lazily create unrecorded rows on results page"
```

---

## Task 6: New Card Variants — `UnrecordedCard` + `AwaitingResultCard`

**Files:**
- Modify: `components/MatchCard.tsx`

- [ ] **Step 1: Add imports and new props interface to `MatchCard.tsx`**

Add to the top of `MatchCard.tsx`:

```ts
import { isPastDeadline } from '@/lib/utils'
import { ResultModal } from '@/components/ResultModal'
import type { Player, ScheduledWeek } from '@/lib/types'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
```

Update the `MatchCardProps` interface:

```ts
interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
}
```

- [ ] **Step 2: Add `UnrecordedCard` component**

Add after `CancelledCard` in `MatchCard.tsx`:

```tsx
/** Unrecorded card — game day passed with no lineup built. Non-interactive. */
function UnrecordedCard({ week }: { week: Week }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-[#131c2e]">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="text-sm font-medium text-slate-500">Week {week.week}</p>
          <p className="text-xs text-slate-600">{week.date}</p>
        </div>
        <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap bg-[#131c2e] text-slate-600 border border-dashed border-slate-700">
          Unrecorded
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add `AwaitingResultCard` component**

Add after `UnrecordedCard`:

```tsx
interface AwaitingResultCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
}

/** Awaiting Result card — lineup was built but game day passed without a result. */
function AwaitingResultCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
}: AwaitingResultCardProps) {
  const [showResultModal, setShowResultModal] = useState(false)
  const router = useRouter()

  const scheduledWeek: ScheduledWeek = {
    id: week.id ?? '',
    week: week.week,
    date: week.date,
    format: week.format ?? null,
    teamA: week.teamA,
    teamB: week.teamB,
    status: 'scheduled',
    lineupMetadata: week.lineupMetadata ?? null,
  }

  return (
    <>
      <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
        <div
          className={cn(
            'rounded-lg border bg-slate-800 transition-colors duration-150',
            isOpen ? 'border-slate-600' : 'border-slate-700 hover:border-slate-500'
          )}
        >
          <Collapsible.Trigger asChild>
            <button
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer"
              aria-expanded={isOpen}
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">Week {week.week}</p>
                <p className="text-xs text-slate-400">
                  {week.date}
                  {week.format && <span className="ml-2 text-slate-400">· {week.format}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap bg-slate-800 text-slate-400 border border-slate-600">
                  Awaiting Result
                </span>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-slate-400 transition-transform duration-200 flex-shrink-0',
                    isOpen && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </div>
            </button>
          </Collapsible.Trigger>

          <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
            <div className="border-t border-slate-700">
              <div className="p-4">
                <div className="grid grid-cols-2 gap-4">
                  <TeamList label="Team A" players={week.teamA} team="A" />
                  <TeamList label="Team B" players={week.teamB} team="B" />
                </div>
                {isAdmin && (
                  <div className="border-t border-slate-700 mt-4 pt-4 flex justify-end">
                    <button
                      onClick={() => setShowResultModal(true)}
                      className="px-4 py-2 rounded-md bg-slate-100 text-slate-900 text-sm font-semibold hover:bg-white transition-colors"
                    >
                      Record Result
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {showResultModal && (
        <ResultModal
          scheduledWeek={scheduledWeek}
          lineupMetadata={week.lineupMetadata ?? null}
          allPlayers={allPlayers}
          gameId={gameId}
          publicMode={false}
          onSaved={() => {
            setShowResultModal(false)
            onResultSaved() // calls router.refresh() from ResultsSection — do not also call it here
          }}
          onClose={() => setShowResultModal(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4: Update the `MatchCard` dispatcher**

Replace the existing `export function MatchCard` with:

```ts
export function MatchCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin = false,
  gameId = '',
  allPlayers = [],
  onResultSaved = () => {},
}: MatchCardProps) {
  if (week.status === 'cancelled') return <CancelledCard week={week} />
  if (week.status === 'unrecorded') return <UnrecordedCard week={week} />
  if (week.status === 'scheduled' && isPastDeadline(week.date)) {
    return (
      <AwaitingResultCard
        week={week}
        isOpen={isOpen}
        onToggle={onToggle}
        isAdmin={isAdmin}
        gameId={gameId}
        allPlayers={allPlayers}
        onResultSaved={onResultSaved}
      />
    )
  }
  return <PlayedCard week={week} isOpen={isOpen} onToggle={onToggle} goalkeepers={goalkeepers} />
}
```

- [ ] **Step 5: Build — verify no TypeScript errors**

```bash
npm run build 2>&1 | head -80
```

Expected: clean build. Fix any type errors before proceeding.

- [ ] **Step 6: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "feat: add UnrecordedCard and AwaitingResultCard variants to MatchCard"
```

---

## Task 7: Thread Props — `WeekList` + `ResultsSection`

**Files:**
- Modify: `components/WeekList.tsx`
- Modify: `components/ResultsSection.tsx`

- [ ] **Step 1: Update `WeekList` to accept and forward new props**

Replace `WeekList.tsx` with:

```tsx
'use client'

import { Fragment, useState } from 'react'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { getPlayedWeeks, getMonthKey, formatMonthYear } from '@/lib/utils'
import type { Week, Player } from '@/lib/types'

interface Props {
  weeks: Week[]
  goalkeepers?: string[]
  openWeek?: number | null
  onOpenWeekChange?: (week: number | null) => void
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
}

export function WeekList({
  weeks,
  goalkeepers,
  openWeek: controlledOpenWeek,
  onOpenWeekChange,
  isAdmin = false,
  gameId = '',
  allPlayers = [],
  onResultSaved = () => {},
}: Props) {
  // Default-open anchored to played weeks only — unrecorded/awaiting rows must not affect this
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = playedWeeks.length > 0
    ? playedWeeks.reduce((a, b) => (a.week > b.week ? a : b))
    : null
  const [internalOpenWeek, setInternalOpenWeek] = useState<number | null>(mostRecent?.week ?? null)

  const isControlled = controlledOpenWeek !== undefined
  const openWeek = isControlled ? controlledOpenWeek : internalOpenWeek

  function handleToggle(weekNum: number) {
    const next = openWeek === weekNum ? null : weekNum
    if (isControlled) {
      onOpenWeekChange?.(next)
    } else {
      setInternalOpenWeek(next)
    }
  }

  if (weeks.length === 0) {
    return <p className="text-slate-400 text-sm">No results yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {weeks.map((week, index) => {
        const monthChanged =
          index > 0 &&
          getMonthKey(week.date) !== getMonthKey(weeks[index - 1].date)
        return (
          <Fragment key={week.week}>
            {monthChanged && <MonthDivider label={formatMonthYear(week.date)} />}
            <MatchCard
              week={week}
              isOpen={openWeek === week.week}
              onToggle={() => handleToggle(week.week)}
              goalkeepers={goalkeepers}
              isAdmin={isAdmin}
              gameId={gameId}
              allPlayers={allPlayers}
              onResultSaved={onResultSaved}
            />
          </Fragment>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Update `ResultsSection` to accept `isAdmin` and pass it through**

In `ResultsSection.tsx`, add `isAdmin` to the `Props` interface and pass it through to `WeekList`:

```tsx
interface Props {
  gameId: string
  weeks: Week[]
  goalkeepers: string[]
  initialScheduledWeek: ScheduledWeek | null
  canAutoPick: boolean
  allPlayers: Player[]
  showMatchHistory: boolean
  leagueDayIndex?: number
  isAdmin?: boolean          // new
}

export function ResultsSection({
  gameId,
  weeks,
  goalkeepers,
  initialScheduledWeek,
  canAutoPick,
  allPlayers,
  showMatchHistory,
  leagueDayIndex,
  isAdmin = false,
}: Props) {
  const router = useRouter()

  const [openWeek, setOpenWeek] = useState<number | null>(() => {
    // Anchored to played weeks only — unrecorded/awaiting rows must not be default-open
    const played = getPlayedWeeks(weeks)
    if (played.length === 0) return null
    return played.reduce((a, b) => (a.week > b.week ? a : b)).week
  })

  const handleBuildStart = useCallback(() => {
    setOpenWeek(null)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <NextMatchCard
        gameId={gameId}
        weeks={weeks}
        initialScheduledWeek={initialScheduledWeek}
        onResultSaved={() => router.refresh()}
        canEdit={true}
        canAutoPick={canAutoPick}
        allPlayers={allPlayers}
        onBuildStart={handleBuildStart}
        leagueDayIndex={leagueDayIndex}
      />
      {showMatchHistory && weeks.length > 0 && (
        <WeekList
          weeks={weeks}
          goalkeepers={goalkeepers}
          openWeek={openWeek}
          onOpenWeekChange={setOpenWeek}
          isAdmin={isAdmin}
          gameId={gameId}
          allPlayers={allPlayers}
          onResultSaved={() => router.refresh()}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Build — verify full clean build**

```bash
npm run build 2>&1 | head -80
```

Expected: clean build with no TypeScript errors

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add components/WeekList.tsx components/ResultsSection.tsx
git commit -m "feat: thread isAdmin, gameId, allPlayers props through WeekList and ResultsSection"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Full build check**

```bash
npm run build
```

Expected: exit 0, no errors

- [ ] **Step 2: Full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 3: Manual verification checklist**

Test the following scenarios in the browser (local dev server: `npm run dev`):

| Scenario | Expected behaviour |
|---|---|
| Results tab loads with no missed weeks | NextMatchCard shows upcoming week normally; no change to results list |
| Game day passes with no lineup (simulate by using a past date as `leagueDayIndex` day) | On next page load, unrecorded row created; muted dashed card appears at top of results list; NextMatchCard shows the next week |
| Game day passes with a lineup saved but no result | NextMatchCard advances to next week; "Awaiting Result" card appears at top of list (collapsed by default); clicking expands to show teams |
| Non-admin views "Awaiting Result" card | Teams visible, no "Record Result" button |
| Admin clicks "Record Result" on awaiting card | ResultModal opens; after saving, card transitions to normal played card |
| Cancel scenario: cancelled week past deadline | NextMatchCard shows idle (next week); "Cancelled" card in history |

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: unrecorded and awaiting result states for past game weeks"
```
