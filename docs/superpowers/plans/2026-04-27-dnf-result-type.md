# DNF Result Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Did Not Finish" (DNF) result type that records a game week with its lineups visible in match history, but excludes it from all competitive stats, honours, and league standings.

**Architecture:** A new `'dnf'` value is added to the `WeekStatus` union. All stats RPCs already filter `WHERE status = 'played'` so DNF is automatically excluded from competitive metrics — no stat query changes required. A new `DnfCard` component handles the UI. The result-recording flow gains a fourth "DNF" outcome alongside Team A / Draw / Team B. A single DB migration covers the constraint change and both affected RPCs.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS v3, Supabase (PostgreSQL + RPCs), Jest (unit tests), Radix UI Collapsible

---

## File Map

| File | Action | What changes |
|---|---|---|
| `supabase/migrations/20260427000001_dnf_status.sql` | **Create** | CHECK constraint + `record_result` RPC + `edit_week` RPC |
| `lib/types.ts` | **Modify** | Add `'dnf'` to `WeekStatus` |
| `lib/utils.ts` | **Modify** | `getSeasonPlayedWeekCount` includes DNF weeks |
| `lib/data.ts` | **Modify** | `fetchWeeks` status filter includes `'dnf'` |
| `app/api/weeks/route.ts` | **Modify** | Access-key mode status filter includes `'dnf'` |
| `lib/__tests__/utils.season.test.ts` | **Modify** | Add tests for `getSeasonPlayedWeekCount` with DNF |
| `components/WinnerBadge.tsx` | **Modify** | Add `dnf?: boolean` prop + zinc badge styling |
| `components/MatchCard.tsx` | **Modify** | Add `DnfCard` component + route in `MatchCard` |
| `app/api/public/league/[id]/result/route.ts` | **Modify** | Add `dnf` body field, handle DNF path |
| `app/api/league/[id]/weeks/[weekId]/edit/route.ts` | **Modify** | Add `'dnf'` to `VALID_STATUSES` |
| `components/ResultModal.tsx` | **Modify** | DNF button + `isDnf` state + save flow |
| `components/EditWeekModal.tsx` | **Modify** | DNF status option + lineup editor for DNF |
| `components/NextMatchCard.tsx` | **Modify** | Handle `result.dnf` in `onSaved` callback |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260427000001_dnf_status.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260427000001_dnf_status.sql
--
-- Adds 'dnf' (Did Not Finish) to the weeks.status check constraint.
-- Updates record_result RPC: p_dnf=true sets status='dnf', preserves lineups,
-- clears winner and goal_difference.
-- Updates edit_week RPC: handles 'dnf' status — preserves lineups, clears result fields.

-- 1. Update CHECK constraint
ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_status_check;
ALTER TABLE weeks ADD CONSTRAINT weeks_status_check
  CHECK (status IN ('played', 'cancelled', 'scheduled', 'unrecorded', 'dnf'));

-- 2. Replace record_result RPC
CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT         DEFAULT NULL,
  p_goal_difference INTEGER      DEFAULT NULL,
  p_team_a_rating   NUMERIC(6,3) DEFAULT NULL,
  p_team_b_rating   NUMERIC(6,3) DEFAULT NULL,
  p_dnf             BOOLEAN      DEFAULT FALSE
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

  IF p_dnf THEN
    UPDATE weeks
    SET status          = 'dnf',
        winner          = NULL,
        notes           = p_notes,
        goal_difference = NULL,
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  ELSE
    UPDATE weeks
    SET status           = 'played',
        winner           = p_winner,
        notes            = p_notes,
        goal_difference  = p_goal_difference,
        team_a_rating    = p_team_a_rating,
        team_b_rating    = p_team_b_rating
    WHERE id = p_week_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_result(UUID, TEXT, TEXT, INTEGER, NUMERIC(6,3), NUMERIC(6,3), BOOLEAN) TO authenticated;

-- 3. Replace edit_week RPC
CREATE OR REPLACE FUNCTION edit_week(
  p_week_id         UUID,
  p_date            TEXT,
  p_status          TEXT,
  p_winner          TEXT    DEFAULT NULL,
  p_notes           TEXT    DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL,
  p_team_a          JSONB   DEFAULT NULL,
  p_team_b          JSONB   DEFAULT NULL
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

  IF NOT is_game_admin(v_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF p_status NOT IN ('played', 'cancelled', 'unrecorded', 'dnf') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be played, cancelled, unrecorded, or dnf', p_status;
  END IF;

  IF p_status = 'played' THEN
    UPDATE weeks
    SET date            = p_date,
        status          = 'played',
        winner          = p_winner,
        notes           = p_notes,
        goal_difference = p_goal_difference,
        team_a          = COALESCE(p_team_a, '[]'::jsonb),
        team_b          = COALESCE(p_team_b, '[]'::jsonb),
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  ELSIF p_status = 'dnf' THEN
    -- Preserve lineups (use incoming value or keep existing), clear result fields
    UPDATE weeks
    SET date            = p_date,
        status          = 'dnf',
        winner          = NULL,
        notes           = p_notes,
        goal_difference = NULL,
        team_a          = COALESCE(p_team_a, team_a),
        team_b          = COALESCE(p_team_b, team_b),
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  ELSE
    UPDATE weeks
    SET date            = p_date,
        status          = p_status,
        winner          = NULL,
        notes           = p_notes,
        goal_difference = NULL,
        team_a          = '[]'::jsonb,
        team_b          = '[]'::jsonb,
        team_a_rating   = NULL,
        team_b_rating   = NULL
    WHERE id = p_week_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_week(UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, JSONB) TO authenticated;
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Navigate to the Supabase dashboard → SQL Editor and run the full file contents above. Verify no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260427000001_dnf_status.sql
git commit -m "feat: add dnf status to weeks table and update RPCs"
```

---

## Task 2: Types + Data Layer (TDD)

**Files:**
- Modify: `lib/__tests__/utils.season.test.ts` (add tests first)
- Modify: `lib/types.ts:2`
- Modify: `lib/utils.ts:448`
- Modify: `lib/data.ts:40`
- Modify: `app/api/weeks/route.ts:31`

- [ ] **Step 1: Add failing tests for `getSeasonPlayedWeekCount` with DNF**

In `lib/__tests__/utils.season.test.ts`, add this import at the top:

```ts
import { deriveSeason, getNextWeekNumber, computeYearStats, sortWeeks, getSeasonPlayedWeekCount } from '@/lib/utils'
```

Then add this describe block at the end of the file (after all existing describes):

```ts
describe('getSeasonPlayedWeekCount', () => {
  const currentYear = String(new Date().getFullYear())
  const prevYear = String(new Date().getFullYear() - 1)

  it('returns max week number from current year played weeks', () => {
    const weeks = [
      makeWeek({ season: currentYear, week: 3, status: 'played' }),
      makeWeek({ season: currentYear, week: 5, status: 'played' }),
    ]
    expect(getSeasonPlayedWeekCount(weeks)).toBe(5)
  })

  it('includes cancelled weeks in the count', () => {
    const weeks = [
      makeWeek({ season: currentYear, week: 3, status: 'played' }),
      makeWeek({ season: currentYear, week: 4, status: 'cancelled' }),
    ]
    expect(getSeasonPlayedWeekCount(weeks)).toBe(4)
  })

  it('includes dnf weeks in the count', () => {
    const weeks = [
      makeWeek({ season: currentYear, week: 3, status: 'played' }),
      makeWeek({ season: currentYear, week: 4, status: 'dnf' }),
    ]
    expect(getSeasonPlayedWeekCount(weeks)).toBe(4)
  })

  it('excludes unrecorded and scheduled weeks from the count', () => {
    const weeks = [
      makeWeek({ season: currentYear, week: 3, status: 'played' }),
      makeWeek({ season: currentYear, week: 5, status: 'unrecorded' }),
      makeWeek({ season: currentYear, week: 6, status: 'scheduled' }),
    ]
    expect(getSeasonPlayedWeekCount(weeks)).toBe(3)
  })

  it('falls back to previous year when current year has no relevant weeks', () => {
    const weeks = [
      makeWeek({ season: prevYear, week: 40, status: 'played' }),
    ]
    expect(getSeasonPlayedWeekCount(weeks)).toBe(40)
  })

  it('returns 0 when no relevant weeks exist at all', () => {
    expect(getSeasonPlayedWeekCount([])).toBe(0)
  })
})
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
npm test -- lib/__tests__/utils.season.test.ts
```

Expected: the `getSeasonPlayedWeekCount` tests fail because `'dnf'` is not yet a valid `WeekStatus`.

- [ ] **Step 3: Update `lib/types.ts` line 2**

```ts
// Before:
export type WeekStatus = 'played' | 'cancelled' | 'unrecorded' | 'scheduled';

// After:
export type WeekStatus = 'played' | 'cancelled' | 'unrecorded' | 'scheduled' | 'dnf';
```

- [ ] **Step 4: Update `lib/utils.ts` — `getSeasonPlayedWeekCount` at line 448**

```ts
// Before:
const relevant = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled')

// After:
const relevant = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled' || w.status === 'dnf')
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npm test -- lib/__tests__/utils.season.test.ts
```

Expected: all tests pass including the new `getSeasonPlayedWeekCount` suite.

- [ ] **Step 6: Update `lib/data.ts` line 40**

```ts
// Before:
.in('status', ['played', 'cancelled'])

// After:
.in('status', ['played', 'cancelled', 'dnf'])
```

Also update the inline mapping comment on line 11 of the Week field `teamA`:
```ts
teamA: string[];     // empty array for cancelled/unrecorded weeks
```
Change to:
```ts
teamA: string[];     // empty array for cancelled/unrecorded weeks; populated for dnf
```

Wait — that comment is in `lib/types.ts` not `lib/data.ts`. Update `lib/types.ts` lines 11-12:

```ts
// Before:
  teamA: string[];     // empty array for cancelled/unrecorded weeks
  teamB: string[];     // empty array for cancelled/unrecorded weeks

// After:
  teamA: string[];     // empty array for cancelled/unrecorded/scheduled weeks; populated for dnf
  teamB: string[];     // empty array for cancelled/unrecorded/scheduled weeks; populated for dnf
```

- [ ] **Step 7: Update `app/api/weeks/route.ts` line 31**

```ts
// Before:
.in('status', ['played', 'cancelled'])

// After:
.in('status', ['played', 'cancelled', 'dnf'])
```

- [ ] **Step 8: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. If there are exhaustiveness errors around `WeekStatus` switches elsewhere, fix them by adding `'dnf'` cases.

- [ ] **Step 9: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 10: Commit**

```bash
git add lib/types.ts lib/utils.ts lib/data.ts app/api/weeks/route.ts lib/__tests__/utils.season.test.ts
git commit -m "feat: add dnf to WeekStatus, include in season progress counter and data fetches"
```

---

## Task 3: WinnerBadge — DNF styling

**Files:**
- Modify: `components/WinnerBadge.tsx`

- [ ] **Step 1: Add `dnf` prop and badge to `WinnerBadge`**

Replace the full file content with:

```tsx
import { Winner } from '@/lib/types'
import { cn } from '@/lib/utils'

interface WinnerBadgeProps {
  winner: Winner
  cancelled?: boolean
  dnf?: boolean
}

const BADGE_CLASSES: Record<NonNullable<Winner>, string> = {
  teamA: 'bg-sky-900/60 text-sky-300 border border-sky-700',
  teamB: 'bg-violet-900/60 text-violet-300 border border-violet-700',
  draw: 'bg-slate-700 text-slate-300 border border-slate-600',
}

const BADGE_LABELS: Record<NonNullable<Winner>, string> = {
  teamA: 'Team A Won',
  teamB: 'Team B Won',
  draw: 'Match Drawn',
}

export function WinnerBadge({ winner, cancelled = false, dnf = false }: WinnerBadgeProps) {
  const base = 'text-xs font-semibold rounded-full px-2.5 py-0.5 whitespace-nowrap'

  if (cancelled) {
    return (
      <span className={cn(base, 'bg-red-950 text-red-400 border border-red-900')}>
        Cancelled
      </span>
    )
  }

  if (dnf) {
    return (
      <span className={cn(base, 'bg-zinc-800 text-zinc-300 border border-zinc-600')}>
        DNF
      </span>
    )
  }

  if (!winner) return null

  return (
    <span className={cn(base, BADGE_CLASSES[winner])}>
      {BADGE_LABELS[winner]}
    </span>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/WinnerBadge.tsx
git commit -m "feat: add DNF badge variant to WinnerBadge"
```

---

## Task 4: DnfCard Component

**Files:**
- Modify: `components/MatchCard.tsx`

- [ ] **Step 1: Add `DnfCardProps` interface and `DnfCard` component**

In `components/MatchCard.tsx`, add the interface and component after the `PlayedCardProps` interface (after line 172) and before the `AwaitingResultCard` function:

```tsx
interface DnfCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  isAdmin: boolean
  gameId: string
  allPlayers: Player[]
  onResultSaved: () => void
}

function DnfCard({
  week,
  isOpen,
  onToggle,
  isAdmin,
  gameId,
  allPlayers,
  onResultSaved,
}: DnfCardProps) {
  const [showEditModal, setShowEditModal] = useState(false)

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
              aria-controls={`week-${week.week}-dnf-content`}
            >
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-100">Week {week.week}</p>
                <p className="text-xs text-slate-400">
                  {week.date}
                  {week.format && (
                    <span className="ml-2 text-slate-400">· {week.format}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <WinnerBadge winner={null} dnf />
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

          <Collapsible.Content
            id={`week-${week.week}-dnf-content`}
            className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"
          >
            <div className="border-t border-slate-700">
              <div className="p-4">
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
                {week.notes?.trim() && (
                  <>
                    <div className="border-t border-slate-700 mt-3" />
                    <div className="mt-3">
                      <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-2 text-xs text-slate-400 italic">
                        {week.notes.trim()}
                      </div>
                    </div>
                  </>
                )}
                {isAdmin && (
                  <div className="border-t border-slate-700 mt-4 pt-4 flex justify-end">
                    <EditResultButton onClick={() => setShowEditModal(true)} />
                  </div>
                )}
              </div>
            </div>
          </Collapsible.Content>
        </div>
      </Collapsible.Root>

      {showEditModal && (
        <EditWeekModal
          week={week}
          gameId={gameId}
          allPlayers={allPlayers}
          onSaved={() => { setShowEditModal(false); onResultSaved() }}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: Route `status === 'dnf'` in the `MatchCard` export**

In the `MatchCard` function body (around line 481), add a DNF branch before the final `PlayedCard` return. The full routing block should read:

```tsx
if (week.status === 'cancelled') {
  return (
    <CancelledCard
      week={week}
      isAdmin={isAdmin}
      gameId={gameId}
      allPlayers={allPlayers}
      onResultSaved={onResultSaved}
    />
  )
}
if (week.status === 'unrecorded') {
  return (
    <UnrecordedCard
      week={week}
      isAdmin={isAdmin}
      gameId={gameId}
      allPlayers={allPlayers}
      onResultSaved={onResultSaved}
    />
  )
}
if (week.status === 'dnf') {
  return (
    <DnfCard
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
if (week.status === 'scheduled' && !isPastDeadline(week.date)) return null
if (week.status === 'scheduled' && isPastDeadline(week.date)) {
  return (
    <AwaitingResultCard
      week={week}
      isOpen={isOpen}
      onToggle={onToggle}
      isAdmin={isAdmin}
      gameId={gameId}
      leagueSlug={leagueSlug}
      allPlayers={allPlayers}
      onResultSaved={onResultSaved}
    />
  )
}
return (
  <PlayedCard
    week={week}
    isOpen={isOpen}
    onToggle={onToggle}
    goalkeepers={goalkeepers}
    isAdmin={isAdmin}
    gameId={gameId}
    allPlayers={allPlayers}
    onResultSaved={onResultSaved}
    leagueName={leagueName}
    leagueSlug={leagueSlug}
    weeks={weeks}
  />
)
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "feat: add DnfCard component and route dnf status in MatchCard"
```

---

## Task 5: Result Recording API — DNF Support

**Files:**
- Modify: `app/api/public/league/[id]/result/route.ts`

- [ ] **Step 1: Update the route to handle DNF**

Replace the full file content:

```ts
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { Winner } from '@/lib/types'

type Params = { params: Promise<{ id: string }> }

/**
 * POST — record a match result for a scheduled week.
 * Body: { weekId, winner, notes?, goalDifference, teamARating?, teamBRating?, dnf? }
 * When dnf=true: winner and goalDifference are ignored; status is set to 'dnf'.
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
  const { weekId, winner, notes, goalDifference, teamARating, teamBRating, dnf } = body as {
    weekId: string
    winner: Winner
    notes?: string
    goalDifference: unknown
    teamARating: unknown
    teamBRating: unknown
    dnf?: boolean
  }

  if (dnf && (winner !== undefined && winner !== null)) {
    return NextResponse.json({ error: 'DNF games cannot have a winner' }, { status: 422 })
  }

  function safeRating(val: unknown): number | null {
    if (typeof val === 'number' && isFinite(val)) return val
    return null
  }

  // For non-DNF results, goalDifference must be a whole number.
  if (!dnf && !Number.isInteger(goalDifference)) {
    return NextResponse.json({ error: 'goalDifference must be an integer' }, { status: 400 })
  }

  const goalDiff = dnf ? null : (goalDifference as number)

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
    .update(
      dnf
        ? {
            status: 'dnf',
            winner: null,
            notes: notes?.trim() || null,
            goal_difference: null,
            team_a_rating: null,
            team_b_rating: null,
          }
        : {
            status: 'played',
            winner,
            notes: notes?.trim() || null,
            goal_difference: goalDiff,
            team_a_rating: safeRating(teamARating),
            team_b_rating: safeRating(teamBRating),
          }
    )
    .eq('id', weekId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync all players from this match into player_attributes.
  // Runs for both played and dnf — participants are real league members either way.
  // ignoreDuplicates: true preserves existing eye test ratings and mentalities.
  function toStringArray(val: unknown): string[] {
    return Array.isArray(val) ? val.filter((v): v is string => typeof v === 'string') : []
  }
  const names = [...toStringArray(weekRow.team_a), ...toStringArray(weekRow.team_b)]
  if (names.length > 0) {
    const { error: syncError } = await service
      .from('player_attributes')
      .upsert(
        names.map((name) => ({ game_id: id, name })),
        { onConflict: 'game_id,name', ignoreDuplicates: true }
      )
    if (syncError) console.error('[result] player_attributes sync failed:', syncError.message)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/public/league/[id]/result/route.ts
git commit -m "feat: add dnf support to public result recording API"
```

---

## Task 6: Edit Week API — DNF Support

**Files:**
- Modify: `app/api/league/[id]/weeks/[weekId]/edit/route.ts`

- [ ] **Step 1: Add `'dnf'` to `VALID_STATUSES` and update error message**

In `app/api/league/[id]/weeks/[weekId]/edit/route.ts`:

Change line 4:
```ts
// Before:
const VALID_STATUSES = ['played', 'cancelled', 'unrecorded'] as const

// After:
const VALID_STATUSES = ['played', 'cancelled', 'unrecorded', 'dnf'] as const
```

Change lines 38-41:
```ts
// Before:
  return NextResponse.json(
    { error: 'status must be played, cancelled, or unrecorded' },
    { status: 400 }
  )

// After:
  return NextResponse.json(
    { error: 'status must be played, cancelled, unrecorded, or dnf' },
    { status: 400 }
  )
```

No other changes needed. The `edit_week` RPC (updated in Task 1) handles the `'dnf'` case — it accepts `p_team_a`/`p_team_b` and preserves them via `COALESCE`. The API already passes these through unconditionally.

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/weeks/[weekId]/edit/route.ts
git commit -m "feat: add dnf to valid statuses in edit week API"
```

---

## Task 7: ResultModal — DNF Option and Save Flow

**Files:**
- Modify: `components/ResultModal.tsx`

- [ ] **Step 1: Export a `ResultSavedPayload` type and add `isDnf` state**

At the top of the file, after the imports, add:

```ts
export type ResultSavedPayload =
  | { dnf: false; winner: NonNullable<Winner>; goalDifference: number; shareText: string; highlightsText: string }
  | { dnf: true }
```

Update the `Props` interface `onSaved` field (line 21):
```ts
// Before:
  onSaved: (result: { winner: NonNullable<Winner>; goalDifference: number; shareText: string; highlightsText: string }) => void

// After:
  onSaved: (result: ResultSavedPayload) => void
```

Add `isDnf` to the state declarations (after `const [error, setError] = useState...` around line 102):
```ts
const [isDnf, setIsDnf] = useState(false)
```

- [ ] **Step 2: Update `handleSave` to support DNF**

Replace the `handleSave` function (lines 161–286) with:

```tsx
async function handleSave() {
  if (!winner && !isDnf) return
  setSaving(true)
  setError(null)

  try {
    if (isDnf) {
      if (publicMode) {
        const res = await fetch(`/api/public/league/${gameId}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            weekId: scheduledWeek.id,
            dnf: true,
            notes: notes.trim() || null,
          }),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? 'Failed to save result')
        }
      } else {
        const supabase = createClient()

        const { error: resultErr } = await supabase.rpc('record_result', {
          p_week_id: scheduledWeek.id,
          p_dnf: true,
          p_winner: null,
          p_notes: notes.trim() || null,
          p_goal_difference: null,
          p_team_a_rating: null,
          p_team_b_rating: null,
        })
        if (resultErr) throw resultErr

        // Still promote new players / guests even when DNF — they are real participants.
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
        if (entries.length > 0) {
          const { error: promoteErr } = await supabase.rpc('promote_roster', {
            p_game_id: gameId,
            p_entries: entries,
          })
          if (promoteErr) throw promoteErr
        }
      }

      onSaved({ dnf: true })
      return
    }

    // ── Normal (non-DNF) result path ──────────────────────────────────────────

    if (!winner) return

    const guestMap = new Map(guestStates.map((g) => [g.name, g]))
    const newPlayerMap = new Map(newPlayerStates.map((p) => [p.name, p]))

    function resolveTeam(names: string[]): Player[] {
      return names.map((name) => {
        const known = allPlayers.find((p) => p.name === name)
        if (known) return known
        const src = guestMap.get(name) ?? newPlayerMap.get(name)
        const isGk = src
          ? ('mentality' in src ? src.mentality === 'goalkeeper' : Boolean(src.goalkeeper))
          : false
        return {
          playerId: `review|${name}`,
          name,
          played: 0, won: 0, drew: 0, lost: 0,
          timesTeamA: 0, timesTeamB: 0,
          winRate: 0, qualified: false, points: 0,
          recentForm: '',
          mentality: isGk ? 'goalkeeper' : 'balanced',
          rating: src?.rating ?? 2,
        }
      })
    }

    const teamAScore = parseFloat(ewptScore(resolveTeam(scheduledWeek.teamA)).toFixed(3))
    const teamBScore = parseFloat(ewptScore(resolveTeam(scheduledWeek.teamB)).toFixed(3))

    const syntheticWeek: Week = {
      week: scheduledWeek.week,
      season: scheduledWeek.season,
      date: scheduledWeek.date,
      status: 'played',
      format: scheduledWeek.format ?? undefined,
      teamA: scheduledWeek.teamA,
      teamB: scheduledWeek.teamB,
      winner,
      goal_difference: winner === 'draw' ? 0 : goalDifference,
      team_a_rating: teamAScore,
      team_b_rating: teamBScore,
    }
    const weeksWithResult = [...weeks, syntheticWeek]

    const { shareText, highlightsText } = buildResultShareText({
      leagueName,
      leagueSlug,
      week: scheduledWeek.week,
      date: scheduledWeek.date,
      format: scheduledWeek.format ?? '',
      teamA: scheduledWeek.teamA,
      teamB: scheduledWeek.teamB,
      winner,
      goalDifference: winner === 'draw' ? 0 : goalDifference,
      teamARating: teamAScore,
      teamBRating: teamBScore,
      players: allPlayers,
      weeks: weeksWithResult,
    })

    if (publicMode) {
      const res = await fetch(`/api/public/league/${gameId}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekId: scheduledWeek.id,
          winner,
          notes: notes.trim() || null,
          goalDifference: winner === 'draw' ? 0 : goalDifference,
          teamARating: teamAScore,
          teamBRating: teamBScore,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to save result')
      }
    } else {
      const supabase = createClient()

      const { error: resultErr } = await supabase.rpc('record_result', {
        p_week_id: scheduledWeek.id,
        p_winner: winner,
        p_notes: notes.trim() || null,
        p_goal_difference: winner === 'draw' ? 0 : goalDifference,
        p_team_a_rating: teamAScore,
        p_team_b_rating: teamBScore,
      })
      if (resultErr) throw resultErr

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
      if (entries.length > 0) {
        const { error: promoteErr } = await supabase.rpc('promote_roster', {
          p_game_id: gameId,
          p_entries: entries,
        })
        if (promoteErr) throw promoteErr
      }
    }

    onSaved({ dnf: false, winner, goalDifference, shareText, highlightsText })
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Failed to save result')
  } finally {
    setSaving(false)
  }
}
```

- [ ] **Step 3: Update the winner step UI to add the DNF button**

Replace the buttons block in the winner step (currently `{(['teamA', 'draw', 'teamB'] as const).map(...)}` around lines 313–337). The full winner step section becomes:

```tsx
<p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Who won?</p>
<div className="flex gap-2 mb-4">
  {(['teamA', 'draw', 'teamB'] as const).map((opt) => (
    <button
      key={opt}
      type="button"
      onClick={() => {
        setWinner(opt)
        setIsDnf(false)
        if (opt !== 'draw') setGoalDifference(1)
      }}
      className={cn(
        'flex-1 py-2 rounded border text-sm font-medium transition-colors',
        opt === 'teamA' && (winner === 'teamA' && !isDnf
          ? 'bg-blue-900 border-blue-700 text-blue-300'
          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-blue-700 hover:text-blue-300'),
        opt === 'draw' && (winner === 'draw' && !isDnf
          ? 'bg-slate-700 border-slate-600 text-slate-300'
          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'),
        opt === 'teamB' && (winner === 'teamB' && !isDnf
          ? 'bg-violet-900 border-violet-700 text-violet-300'
          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-violet-700 hover:text-violet-300'),
      )}
    >
      {opt === 'teamA' ? 'Team A' : opt === 'draw' ? 'Draw' : 'Team B'}
    </button>
  ))}
  <button
    type="button"
    onClick={() => { setWinner(null); setIsDnf(true) }}
    className={cn(
      'flex-1 py-2 rounded border text-sm font-medium transition-colors',
      isDnf
        ? 'bg-zinc-800 border-zinc-600 text-zinc-300'
        : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-zinc-600 hover:text-zinc-300',
    )}
  >
    DNF
  </button>
</div>
```

- [ ] **Step 4: Update the confirm step to handle DNF**

In the confirm step (around lines 508–563), update the Winner row to handle DNF:

```tsx
<div className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
  <span className="text-slate-400">Result</span>
  <span className={cn(
    'font-semibold',
    isDnf ? 'text-zinc-300'
      : winner === 'teamA' ? 'text-blue-300'
      : winner === 'teamB' ? 'text-violet-300'
      : 'text-slate-300'
  )}>
    {isDnf ? 'DNF' : winner === 'teamA' ? 'Team A' : winner === 'teamB' ? 'Team B' : 'Draw'}
  </span>
</div>
```

(Replace the existing Winner row that only handles teamA/teamB/Draw.)

- [ ] **Step 5: Update button disabled conditions in the winner step**

There are two "proceed" buttons in the winner step. Update both to allow DNF:

For the `hasReviewStep` path (Next → button):
```tsx
// Before:
disabled={!winner || (winner !== 'draw' && (goalDifference < 1 || goalDifference > 20))}

// After:
disabled={(!winner && !isDnf) || (winner && winner !== 'draw' && (goalDifference < 1 || goalDifference > 20))}
```

For the no-review-step path (Confirm Result button):
```tsx
// Before:
disabled={saving || !winner || (winner !== 'draw' && (goalDifference < 1 || goalDifference > 20))}

// After:
disabled={saving || (!winner && !isDnf) || (winner && winner !== 'draw' && (goalDifference < 1 || goalDifference > 20))}
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. If NextMatchCard reports a type error on `onSaved`, that is fixed in Task 9.

- [ ] **Step 7: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "feat: add DNF option to ResultModal winner step and save flow"
```

---

## Task 8: EditWeekModal — DNF Status

**Files:**
- Modify: `components/EditWeekModal.tsx`

- [ ] **Step 1: Add `'dnf'` to `EditStatus` type (line 18)**

```ts
// Before:
type EditStatus = 'played' | 'cancelled' | 'unrecorded'

// After:
type EditStatus = 'played' | 'cancelled' | 'unrecorded' | 'dnf'
```

- [ ] **Step 2: Add `'dnf'` option to the status dropdown (around line 332)**

```tsx
<select
  name="status"
  value={status}
  onChange={(e) => setStatus(e.target.value as EditStatus)}
  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
>
  <option value="played">Played</option>
  <option value="cancelled">Cancelled</option>
  <option value="unrecorded">Unrecorded</option>
  <option value="dnf">DNF</option>
</select>
```

- [ ] **Step 3: Update `handleSave` to include lineups when status is `'dnf'`**

In the `handleSave` function, after the `if (status === 'played')` block (around line 260–265), add:

```ts
if (status === 'dnf') {
  body.teamA = teamA
  body.teamB = teamB
}
```

- [ ] **Step 4: Add lineup editor to the DNF section of the rendered body**

After the `{status === 'played' && (...)}` block (after line 420), add:

```tsx
{/* DNF fields — lineups editable, no result or margin */}
{status === 'dnf' && (
  <div>
    <label className="block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
      Lineups
    </label>
    <LineupEditor
      teamA={teamA}
      teamB={teamB}
      allPlayers={allPlayers}
      onChangeTeamA={setTeamA}
      onChangeTeamB={setTeamB}
    />
  </div>
)}
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/EditWeekModal.tsx
git commit -m "feat: add DNF status to EditWeekModal with lineup editor"
```

---

## Task 9: NextMatchCard — Handle DNF Result

**Files:**
- Modify: `components/NextMatchCard.tsx`

- [ ] **Step 1: Import `ResultSavedPayload` type**

Add to the imports at the top of `components/NextMatchCard.tsx`:

```ts
import { ResultModal } from '@/components/ResultModal'
import type { ResultSavedPayload } from '@/components/ResultModal'
```

(The `ResultModal` import is already there at line 14; add the type import on the same or adjacent line.)

- [ ] **Step 2: Update `savedResult` state type**

Change the `savedResult` state declaration (lines 174–179):

```ts
// Before:
const [savedResult, setSavedResult] = useState<{
  winner: NonNullable<Winner>
  goalDifference: number
  shareText: string
  highlightsText: string
} | null>(null)

// After:
const [savedResult, setSavedResult] = useState<Extract<ResultSavedPayload, { dnf: false }> | null>(null)
```

- [ ] **Step 3: Update the `onSaved` callback on the `ResultModal` (around lines 1099–1104)**

```tsx
// Before:
onSaved={(result) => {
  setShowResultModal(false)
  setGuestEntries([])
  setNewPlayerEntries([])
  setSavedResult(result)
}}

// After:
onSaved={(result) => {
  setShowResultModal(false)
  setGuestEntries([])
  setNewPlayerEntries([])
  if (result.dnf) {
    setScheduledWeek(null)
    setCardState('idle')
    onResultSaved()
  } else {
    setSavedResult(result)
  }
}}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: handle dnf result payload in NextMatchCard onSaved"
```

---

## Final Verification

- [ ] **Check TypeScript one last time across the whole project**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Manual smoke test checklist**

1. Open a league with a scheduled week (awaiting result)
2. Click "Record Result" — confirm four options appear: Team A / Draw / Team B / DNF
3. Select DNF — confirm margin of victory hides, notes field is available, Confirm Result button becomes enabled
4. Record the result — confirm the card now shows as expandable with a DNF badge
5. Expand the DNF card — confirm lineups are visible and notes appear (if entered)
6. Check player stats page — confirm the DNF game does not affect any player's W/L/D/win rate/recent form
7. Check honours card — confirm DNF game has no effect on standings
8. Check the season progress counter in the header — confirm it counts the DNF week
9. Open EditWeekModal on the DNF card — confirm DNF appears in the status dropdown, lineups are editable
10. Change a DNF back to played via the edit modal — confirm it re-appears as a normal played card with no result pre-filled (winner is null, admin must re-enter)
