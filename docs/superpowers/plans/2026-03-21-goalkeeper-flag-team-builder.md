# Goalkeeper Flag & Team Builder Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated goalkeeper toggle to the guest/new-player add flow and the result-review step, fix three UI bugs (back-button arrow, modal title case, collapse match cards on build start), and persist the goalkeeper flag through to the league roster via the `promote_roster` RPC.

**Architecture:** The goalkeeper flag is threaded from `GuestEntry`/`NewPlayerEntry` types → `AddPlayerModal` UI → `NextMatchCard`'s `resolvePlayersForAutoPick` (so auto-pick treats them as GKs immediately) → `ResultModal` review step → `promote_roster` SQL RPC (so the flag is saved permanently when the result is recorded). Match-card collapsing is solved by lifting `openWeek` state out of `WeekList` into a new `ResultsSection` client component that co-renders `NextMatchCard` and `WeekList` and resets `openWeek` to `null` on `onBuildStart`.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind CSS v3, Supabase (PostgreSQL + RLS), Radix UI Dialog, `lucide-react`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `lib/types.ts` | Modify | Add `goalkeeper?: boolean` to `GuestEntry` and `NewPlayerEntry` |
| `components/AddPlayerModal.tsx` | Modify | Goalkeeper toggle UI; fix back-button arrows; fix title case |
| `components/NextMatchCard.tsx` | Modify | Pass `goalkeeper` from guest/new-player entries in `resolvePlayersForAutoPick` |
| `components/ResultModal.tsx` | Modify | Goalkeeper toggle in review step; fix back-button arrows |
| `components/WeekList.tsx` | Modify | Accept optional controlled `openWeek` + `onOpenWeekChange` props |
| `components/ResultsSection.tsx` | Create | Client wrapper: co-renders `NextMatchCard` + `WeekList`, manages shared `openWeek` |
| `app/[leagueId]/results/page.tsx` | Modify | Replace `ResultsRefresher` + `WeekList` imports with `ResultsSection` |
| `supabase/migrations/20260321000002_goalkeeper_on_promote_roster.sql` | Create | Update `promote_roster` RPC to read and persist `goalkeeper` from JSON entries |

---

## Task 1: Extend types for goalkeeper flag

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add `goalkeeper` field to `GuestEntry` and `NewPlayerEntry`**

In `lib/types.ts`, add an optional `goalkeeper` field to both interfaces:

```ts
export interface GuestEntry {
  type: 'guest'
  name: string
  associatedPlayer: string
  rating: number
  goalkeeper?: boolean   // ← add this
}

export interface NewPlayerEntry {
  type: 'new_player'
  name: string
  rating: number
  goalkeeper?: boolean   // ← add this
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/denver
npx tsc --noEmit
```

Expected: no new errors (existing code treats `goalkeeper` as optional, so no call sites break).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add optional goalkeeper field to GuestEntry and NewPlayerEntry types"
```

---

## Task 2: Update AddPlayerModal — goalkeeper toggle, title case, back button

**Files:**
- Modify: `components/AddPlayerModal.tsx`

The modal has three steps: `choose`, `guest`, `new_player`.

- [ ] **Step 1: Fix modal header title case and back-button text**

In the header (`Dialog.Title`):
- `'Add guest'` → `'Add Guest'`
- `'Add new player'` → `'Add New Player'`

In both back buttons (`← Back` → `Back`):
- Remove the `← ` prefix from both buttons in the `guest` and `new_player` steps.

- [ ] **Step 2: Add goalkeeper state variables**

After the existing state declarations, add:
```tsx
// Goalkeeper toggles (one per sub-flow)
const [guestIsGoalkeeper, setGuestIsGoalkeeper] = useState(false)
const [newPlayerIsGoalkeeper, setNewPlayerIsGoalkeeper] = useState(false)
```

- [ ] **Step 3: Add goalkeeper toggle component (reusable inline JSX block)**

Below the Eye Test slider in **both** the `guest` and `new_player` steps, add this UI block:

```tsx
<div className="pt-1">
  <label className="flex items-center gap-2.5 cursor-pointer">
    <div
      onClick={() => setGuestIsGoalkeeper((prev) => !prev)}  // swap for setNewPlayerIsGoalkeeper in new_player step
      className={cn(
        'w-8 rounded-full relative transition-colors cursor-pointer flex-shrink-0',
        guestIsGoalkeeper ? 'bg-blue-600' : 'bg-slate-600'  // swap var in new_player step
      )}
      style={{ height: '18px' }}
    >
      <div className={cn(
        'absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-all',
        guestIsGoalkeeper ? 'left-[18px]' : 'left-0.5'  // swap var in new_player step
      )} />
    </div>
    <span className="text-xs text-slate-300">
      <span className="font-semibold">Dedicated goalkeeper</span>
    </span>
  </label>
  <p className="text-[11px] text-slate-500 mt-1 ml-[42px] leading-relaxed">
    Plays in goal every game. Goalkeepers are always split across teams during auto-pick.
  </p>
</div>
```

Apply the same pattern in `new_player` step, using `newPlayerIsGoalkeeper` / `setNewPlayerIsGoalkeeper`.

- [ ] **Step 4: Include `goalkeeper` in `onAdd` calls**

In `handleAddGuest`:
```ts
onAdd({
  type: 'guest',
  name,
  associatedPlayer,
  rating: guestRating,
  goalkeeper: guestIsGoalkeeper,
})
```

In `handleAddNewPlayer`:
```ts
onAdd({
  type: 'new_player',
  name: trimmed,
  rating: newRating,
  goalkeeper: newPlayerIsGoalkeeper,
})
```

- [ ] **Step 5: Reset goalkeeper state when navigating back to `choose`**

When setting `setStep('choose')` from either sub-flow, reset the relevant goalkeeper flag:
- From `guest` step: `setGuestIsGoalkeeper(false)`
- From `new_player` step: `setNewPlayerIsGoalkeeper(false)`

This prevents stale state if the user picks a different type.

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/AddPlayerModal.tsx
git commit -m "feat: add goalkeeper toggle to AddPlayerModal; fix title case and back button"
```

---

## Task 3: Thread goalkeeper flag through resolvePlayersForAutoPick

**Files:**
- Modify: `components/NextMatchCard.tsx` (lines ~89–128, the `resolvePlayersForAutoPick` function)

Auto-pick already splits players with `goalkeeper: true` across teams (see `lib/autoPick.ts` line 35). The `resolvePlayersForAutoPick` function currently hard-codes `goalkeeper: false` for guests and new players. This task fixes that.

- [ ] **Step 1: Pass `goalkeeper` from `GuestEntry` and `NewPlayerEntry`**

In `resolvePlayersForAutoPick`, for the guest branch (around line ~94):
```ts
const guest = guestLookup.get(name.toLowerCase())
if (guest) {
  return {
    name,
    played: 0, won: 0, drew: 0, lost: 0,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: false, points: 0,
    goalkeeper: guest.goalkeeper ?? false,   // ← was: false
    mentality: 'balanced' as const,
    rating: guest.rating,
    recentForm: '',
  }
}
```

For the new player branch (around line ~108):
```ts
const newPlayer = newPlayerLookup.get(name.toLowerCase())
if (newPlayer) {
  return {
    name,
    played: 0, won: 0, drew: 0, lost: 0,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: false, points: 0,
    goalkeeper: newPlayer.goalkeeper ?? false,   // ← was: false
    mentality: 'balanced' as const,
    rating: newPlayer.rating,
    recentForm: '',
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: pass goalkeeper flag from guest/new-player entries into auto-pick"
```

---

## Task 4: Add goalkeeper toggle to ResultModal review step

**Files:**
- Modify: `components/ResultModal.tsx`

The review step shows a card per new player and per guest. This task adds:
- A goalkeeper toggle to every new player review card
- A goalkeeper toggle to every guest review card (visible regardless of `addToRoster` — the information is useful even for one-off guests, since it affects how we might record them)
- Fixes the `← Back` arrows on both back buttons in the `review` and `confirm` steps

- [ ] **Step 1: Add `goalkeeper` field to `GuestReviewState` and `NewPlayerReviewState`**

```ts
interface GuestReviewState {
  name: string
  rating: number
  goalkeeper: boolean    // ← add
  addToRoster: boolean
  rosterName: string
  nameError: string | null
}

interface NewPlayerReviewState {
  name: string
  rating: number
  goalkeeper: boolean    // ← add
}
```

- [ ] **Step 2: Initialise `goalkeeper` in state from lineup metadata**

In `useState` initialisers:
```ts
const [guestStates, setGuestStates] = useState<GuestReviewState[]>(
  guests.map((g) => ({
    name: g.name,
    rating: g.rating,
    goalkeeper: g.goalkeeper ?? false,   // ← add
    addToRoster: false,
    rosterName: '',
    nameError: null,
  }))
)
const [newPlayerStates, setNewPlayerStates] = useState<NewPlayerReviewState[]>(
  newPlayers.map((p) => ({ name: p.name, rating: p.rating, goalkeeper: p.goalkeeper ?? false }))  // ← add goalkeeper
)
```

- [ ] **Step 3: Add update helpers for goalkeeper**

After the existing `updateNewPlayerRating` helper:
```ts
function updateGuestGoalkeeper(i: number, goalkeeper: boolean) {
  setGuestStates((prev) => prev.map((g, idx) => idx === i ? { ...g, goalkeeper } : g))
}
function updateNewPlayerGoalkeeper(i: number, goalkeeper: boolean) {
  setNewPlayerStates((prev) => prev.map((p, idx) => idx === i ? { ...p, goalkeeper } : p))
}
```

- [ ] **Step 4: Add goalkeeper toggle UI to new player review cards**

Inside the new player card (after the Eye Test slider, before closing `</div>`):
```tsx
<div className="mt-3 pt-3 border-t border-slate-800">
  <label className="flex items-center gap-2.5 cursor-pointer">
    <div
      onClick={() => updateNewPlayerGoalkeeper(i, !p.goalkeeper)}
      className={cn(
        'w-8 rounded-full relative transition-colors cursor-pointer flex-shrink-0',
        p.goalkeeper ? 'bg-blue-600' : 'bg-slate-600'
      )}
      style={{ height: '18px' }}
    >
      <div className={cn(
        'absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-all',
        p.goalkeeper ? 'left-[18px]' : 'left-0.5'
      )} />
    </div>
    <span className="text-xs text-slate-300">
      <span className="font-semibold">Dedicated goalkeeper</span>
    </span>
  </label>
  <p className="text-[11px] text-slate-500 mt-1 ml-[42px] leading-relaxed">
    Plays in goal every game. Goalkeepers are always split across teams during auto-pick.
  </p>
</div>
```

- [ ] **Step 5: Add goalkeeper toggle UI to guest review cards**

Place it inside the existing `border-t border-slate-800` section, **before** the "Add to roster" toggle:
```tsx
{/* Goalkeeper toggle */}
<div className="mb-3">
  <label className="flex items-center gap-2.5 cursor-pointer">
    <div
      onClick={() => updateGuestGoalkeeper(i, !g.goalkeeper)}
      className={cn(
        'w-8 rounded-full relative transition-colors cursor-pointer flex-shrink-0',
        g.goalkeeper ? 'bg-blue-600' : 'bg-slate-600'
      )}
      style={{ height: '18px' }}
    >
      <div className={cn(
        'absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-all',
        g.goalkeeper ? 'left-[18px]' : 'left-0.5'
      )} />
    </div>
    <span className="text-xs text-slate-300">
      <span className="font-semibold">Dedicated goalkeeper</span>
    </span>
  </label>
  <p className="text-[11px] text-slate-500 mt-1 ml-[42px] leading-relaxed">
    Plays in goal every game. Goalkeepers are always split across teams during auto-pick.
  </p>
</div>
```

- [ ] **Step 6: Pass `goalkeeper` into `promote_roster` entries**

In `handleSave`, update the entries array:
```ts
const entries = [
  ...newPlayerStates.map((p) => ({ name: p.name, rating: p.rating, goalkeeper: p.goalkeeper })),
  ...guestStates
    .filter((g) => g.addToRoster && g.rosterName.trim())
    .map((g) => ({ name: g.rosterName.trim(), rating: g.rating, goalkeeper: g.goalkeeper })),
]
```

- [ ] **Step 7: Fix back-button arrows in `review` and `confirm` steps**

Change both back buttons from `← Back` to `Back` (remove the `← ` prefix).

- [ ] **Step 8: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

- [ ] **Step 9: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "feat: add goalkeeper toggle to result review step; fix back button arrows"
```

---

## Task 5: Update promote_roster SQL RPC to persist goalkeeper flag

**Files:**
- Create: `supabase/migrations/20260321000002_goalkeeper_on_promote_roster.sql`

The current `promote_roster` RPC hard-codes `goalkeeper = false`. This migration replaces it to read the flag from the JSON entries.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260321000002_goalkeeper_on_promote_roster.sql
-- Update promote_roster to read and persist the goalkeeper flag from JSON entries.
-- Entries now accept: {name: text, rating: int, goalkeeper: bool (optional, default false)}

CREATE OR REPLACE FUNCTION promote_roster(
  p_game_id UUID,
  p_entries JSONB  -- array of {name: text, rating: int, goalkeeper?: bool}
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
    'balanced',
    COALESCE((e->>'goalkeeper')::boolean, false)
  FROM jsonb_array_elements(p_entries) AS e
  ON CONFLICT (game_id, name) DO UPDATE
    SET rating     = EXCLUDED.rating,
        goalkeeper = EXCLUDED.goalkeeper;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_roster(UUID, JSONB) TO authenticated;
```

Note: The `ON CONFLICT` clause now also updates `goalkeeper` (previously it did not update it). This is correct — if a player played as a guest previously without the flag set, then the next time they're promoted the value gets corrected.

- [ ] **Step 2: Run migration in Supabase SQL Editor**

Copy the contents of `supabase/migrations/20260321000002_goalkeeper_on_promote_roster.sql` and run it in the Supabase SQL Editor for the target project. Verify it executes without errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260321000002_goalkeeper_on_promote_roster.sql
git commit -m "feat: update promote_roster RPC to persist goalkeeper flag from JSON entries"
```

---

## Task 6: Make WeekList accept controlled openWeek props

**Files:**
- Modify: `components/WeekList.tsx`

`WeekList` currently self-manages `openWeek`. We need it to also work in a controlled mode (parent provides `openWeek` + `onOpenWeekChange`) so `ResultsSection` can reset it when the build mode starts.

- [ ] **Step 1: Add optional controlled props and use them**

```tsx
interface Props {
  weeks: Week[]
  goalkeepers?: string[]
  openWeek?: number | null           // ← add: controlled value (if provided, overrides internal)
  onOpenWeekChange?: (week: number | null) => void  // ← add: controlled setter
}

export function WeekList({ weeks, goalkeepers, openWeek: controlledOpenWeek, onOpenWeekChange }: Props) {
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = playedWeeks.length > 0
    ? playedWeeks.reduce((a, b) => (a.week > b.week ? a : b))
    : null
  const [internalOpenWeek, setInternalOpenWeek] = useState<number | null>(mostRecent?.week ?? null)

  // When controlled props are provided, use them; otherwise fall back to internal state
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
            />
          </Fragment>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/WeekList.tsx
git commit -m "feat: make WeekList accept optional controlled openWeek props"
```

---

## Task 7: Create ResultsSection — shared-state wrapper for NextMatchCard + WeekList

**Files:**
- Create: `components/ResultsSection.tsx`

This client component owns `openWeek` state, passes it down to `WeekList` in controlled mode, and resets it to `null` when `onBuildStart` fires from `NextMatchCard`.

- [ ] **Step 1: Create the component**

```tsx
// components/ResultsSection.tsx
'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { NextMatchCard } from '@/components/NextMatchCard'
import { WeekList } from '@/components/WeekList'
import type { Player, ScheduledWeek, Week } from '@/lib/types'

interface Props {
  gameId: string
  weeks: Week[]
  goalkeepers: string[]
  initialScheduledWeek: ScheduledWeek | null
  canAutoPick: boolean
  allPlayers: Player[]
  showMatchHistory: boolean
}

export function ResultsSection({
  gameId,
  weeks,
  goalkeepers,
  initialScheduledWeek,
  canAutoPick,
  allPlayers,
  showMatchHistory,
}: Props) {
  const router = useRouter()
  const [openWeek, setOpenWeek] = useState<number | null>(null)

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
      />
      {showMatchHistory && weeks.length > 0 && (
        <WeekList
          weeks={weeks}
          goalkeepers={goalkeepers}
          openWeek={openWeek}
          onOpenWeekChange={setOpenWeek}
        />
      )}
    </div>
  )
}
```

Note: `openWeek` starts as `null` (nothing expanded). The most-recently-played week auto-expansion that `WeekList` previously did on mount is intentionally removed in controlled mode — collapsing-on-build is the feature request, and auto-expansion on page load remains for uncontrolled use (when not inside `ResultsSection`). If auto-expansion is desired here too, initialise `openWeek` from the most recent week instead of `null`.

Actually — to preserve the existing UX of the most recent week being open by default, initialise `openWeek` to the most recently played week number:

```tsx
import { getPlayedWeeks } from '@/lib/utils'

// In component body, before useState:
const mostRecentWeekNum = (() => {
  const played = getPlayedWeeks(weeks)
  if (played.length === 0) return null
  return played.reduce((a, b) => (a.week > b.week ? a : b)).week
})()

const [openWeek, setOpenWeek] = useState<number | null>(mostRecentWeekNum)
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/ResultsSection.tsx
git commit -m "feat: add ResultsSection — collapses match cards when team builder opens"
```

---

## Task 8: Wire ResultsSection into the results page

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

Replace the separate `ResultsRefresher` + `WeekList` imports and usage with `ResultsSection`.

- [ ] **Step 1: Update imports**

Remove:
```ts
import { WeekList } from '@/components/WeekList'
import { ResultsRefresher } from '@/components/ResultsRefresher'
```

Add:
```ts
import { ResultsSection } from '@/components/ResultsSection'
```

- [ ] **Step 2: Replace render in the member/admin section**

Find the block:
```tsx
<div className="flex flex-col gap-3">
  {canSeeMatchEntry && (
    <ResultsRefresher
      gameId={leagueId}
      weeks={weeks}
      initialScheduledWeek={nextWeek}
      canEdit={true}
      canAutoPick={canSeeTeamBuilder}
      allPlayers={players}
    />
  )}

  {canSeeMatchHistory && (
    <WeekList weeks={weeks} goalkeepers={goalkeepers} />
  )}

  {!canSeeMatchHistory && !canSeeMatchEntry && (
    <div className="py-16 text-center">
      <p className="text-sm text-slate-500">Nothing to show here yet.</p>
    </div>
  )}
</div>
```

Replace with:
```tsx
<div className="flex flex-col gap-3">
  {canSeeMatchEntry ? (
    <ResultsSection
      gameId={leagueId}
      weeks={weeks}
      goalkeepers={goalkeepers}
      initialScheduledWeek={nextWeek}
      canAutoPick={canSeeTeamBuilder}
      allPlayers={players}
      showMatchHistory={canSeeMatchHistory}
    />
  ) : canSeeMatchHistory ? (
    <WeekList weeks={weeks} goalkeepers={goalkeepers} />
  ) : (
    <div className="py-16 text-center">
      <p className="text-sm text-slate-500">Nothing to show here yet.</p>
    </div>
  )}
</div>
```

Note: `WeekList` is still used directly here for the `canSeeMatchHistory && !canSeeMatchEntry` case, so keep that import. Remove only the `ResultsRefresher` import.

Final imports in this file:
```ts
import { ResultsSection } from '@/components/ResultsSection'
import { WeekList } from '@/components/WeekList'
// Remove: import { ResultsRefresher } from '@/components/ResultsRefresher'
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/\[leagueId\]/results/page.tsx
git commit -m "feat: wire ResultsSection into results page, replacing ResultsRefresher"
```

---

## Manual Test Checklist

After all tasks are complete:

- [ ] Open the team builder (Build Teams). Verify previously-expanded match cards collapse.
- [ ] Click "+ Add guest or new player". Verify the modal title is "Add Player" (step choose). Click "Guest" — title should be "Add Guest". Click "New player" — title should be "Add New Player".
- [ ] In the guest step, verify the back button says "Back" with no arrow. Same for new player step.
- [ ] In the guest step, verify the "Dedicated goalkeeper" toggle appears below the Eye Test, defaults to off, and shows the description text.
- [ ] Add a guest as goalkeeper. Confirm the guest pill appears in the player list. Click "Build Lineup" — the guest should be treated as a GK by auto-pick (split across teams when 2+ GKs present).
- [ ] Record a result with a new player who was marked as goalkeeper. In the review step, verify the goalkeeper toggle is pre-populated to `on` and the description appears.
- [ ] Complete result recording. Verify in player attributes (Supabase table or admin player settings) that the new player has `goalkeeper = true`.
