# Unrecorded & Awaiting Result States

**Date:** 2026-03-25
**Status:** Approved for implementation

---

## Overview

When a game week's deadline passes (game day at 20:00) without a result being recorded, the system currently does nothing — the NextMatchCard silently advances and no record appears in the results list. This spec adds two new states to fill that gap.

---

## Two New States

### 1. Unrecorded
**Trigger:** Game day 20:00 passes with no `weeks` row for that week number (no lineup built, no cancel entered).
**DB status:** `'unrecorded'` (new value on `weeks.status`)
**Visual:** Muted dashed card in the results list. Background `#131c2e`, dashed `border-slate-700`, muted week/date text (`text-slate-500` / `text-slate-600`), "Unrecorded" badge with dashed border in muted slate. No teams, no chevron, non-interactive.

### 2. Awaiting Result
**Trigger:** Game day 20:00 passes with a `status = 'scheduled'` row for that week (lineup was built, no result entered).
**DB status:** No change — remains `'scheduled'`. Detected in the UI by checking the row's date against the 20:00 deadline.
**Visual:** Full card with week/date/format header, "Awaiting Result" badge (slate), expandable to show saved team lineups in two columns. Admin-only "Record Result" button at the bottom of the expanded body.

---

## Data Model Changes

### `weeks.status` constraint
Add `'unrecorded'` to the check constraint. The initial schema (`20250313000001_initial_schema.sql`) already includes `'played'` in the constraint, and `record_result` continues to set `status = 'played'` — so `'played'` must be retained:
```sql
ALTER TABLE weeks DROP CONSTRAINT IF EXISTS weeks_status_check;
ALTER TABLE weeks ADD CONSTRAINT weeks_status_check
  CHECK (status IN ('scheduled', 'cancelled', 'unrecorded', 'played'));
```

### New RPC: `create_unrecorded_week`
```sql
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

**Auth note:** This RPC must be called via the **service client** (`createServiceClient()`) on the server, not via a user-scoped Supabase client. The service client bypasses RLS/auth, so `can_do_match_entry` is intentionally NOT called inside this RPC — the server-side caller is responsible for ensuring the call is appropriate. The `ON CONFLICT DO NOTHING` makes it safe to call on every page load.

### TypeScript type updates (`lib/types.ts`)

```ts
// Week — the results-list type. Add 'unrecorded' and 'scheduled' to the union:
status: 'played' | 'cancelled' | 'unrecorded' | 'scheduled'
// 'scheduled' only appears in AwaitingResultCard context (past-deadline rows).
// The results page query needs updating to fetch these rows (see below).

// ScheduledWeek — NO change needed.
// ScheduledWeek is only used in NextMatchCard and ResultModal; it never holds an
// unrecorded row. Do not add 'unrecorded' to ScheduledWeek.status.
```

---

## New Utility: `isPastDeadline` (`lib/utils.ts`)

Extract the deadline logic from `NextMatchCard` into a shared utility:

```ts
/**
 * Returns true if the game day 20:00 deadline has passed for the given date string.
 * Uses local time consistent with the existing getReactivateDeadline behavior in NextMatchCard.
 * 'DD MMM YYYY' format, e.g. '25 Mar 2026'
 */
export function isPastDeadline(dateStr: string): boolean {
  const [day, mon, yr] = dateStr.split(' ')
  const deadline = new Date(`${mon} ${day}, ${yr} 20:00:00`)
  return Date.now() > deadline.getTime()
}
```

Remove the now-redundant `getReactivateDeadline` and `canReactivate` helpers from `NextMatchCard` and import `isPastDeadline` instead.

---

## New Utility: `getMostRecentExpectedGameDate` (`lib/utils.ts`)

`getNextMatchDate` is forward-looking and will return the *next upcoming* date once game day passes — it cannot be used to find the date of the game that just elapsed. A new utility is needed:

```ts
/**
 * Returns the date string of the most recent expected game day that has already passed,
 * or null if no game day has elapsed (e.g. the league hasn't started yet).
 * Uses the same day-of-week logic as getNextMatchDate.
 */
export function getMostRecentExpectedGameDate(
  weeks: Week[],
  leagueDayIndex?: number
): string | null
```

Logic:
- Determine the target day-of-week from `leagueDayIndex` (if provided) or from the most recent played week's date
- If neither is available, return `null`
- Walk backwards from today to find the most recent occurrence of that day-of-week
- If that date already has a row in `weeks`, we don't need to create a new row — the check in the caller handles that

---

## Row Creation Logic (Server, Results Page)

On every results page server load, after fetching `weeks`, run this check via the **service client**:

```ts
const recentDate = getMostRecentExpectedGameDate(weeks, leagueDayIndex)

if (recentDate && isPastDeadline(recentDate)) {
  const recentWeekNum = /* week number corresponding to recentDate — derived from weeks array */
  const existingRow = weeks.find(w => w.week === recentWeekNum)

  if (!existingRow) {
    const season = deriveSeason(weeks) || String(new Date().getFullYear())
    // fallback season: current year if no played weeks yet
    await serviceClient.rpc('create_unrecorded_week', {
      p_game_id: gameId,
      p_season: season,
      p_week: recentWeekNum,
      p_date: recentDate,
    })
    // Re-fetch weeks so the new row appears in the list
    weeks = await refetchWeeks(gameId)
  }
  // If existingRow already has any status → no action needed
}
```

**Week number for `recentDate`:** The week number is `getNextWeekNumber(weeks)` at the time of the check — but only computed *before* the new row would be added. Since `getNextWeekNumber` returns `max(weeks) + 1`, this correctly gives the next sequential number. Once the unrecorded row is written, subsequent loads find the existing row and skip creation. `getNextWeekNumber` naturally accounts for unrecorded rows (they increment the counter), which is the desired behavior — week numbers should never be reused.

**Season fallback:** `deriveSeason(weeks)` returns `''` if no played weeks exist. Fall back to `String(new Date().getFullYear())`.

---

## NextMatchCard Changes

### Query update
Add `'unrecorded'` to the status filter in the `load()` function so past unrecorded rows are considered:
```ts
.in('status', ['scheduled', 'cancelled', 'unrecorded'])
```

### Deadline check on load
After fetching the row, apply the deadline check:
```ts
if (week.status === 'unrecorded') {
  setCardState('idle')
  return
}
if (week.status === 'scheduled' && isPastDeadline(week.date)) {
  // Lineup exists but game day passed — advance to next week
  setCardState('idle')
  // Do NOT set scheduledWeek — the row stays in DB for the results list
  return
}
```

### Public mode (`initialScheduledWeek`)
The server pre-load for `initialScheduledWeek` (used in `publicMode`) currently only fetches `status = 'scheduled'` rows. Update this server-side fetch to also check `isPastDeadline` and treat past-deadline scheduled rows as absent (pass `null` for `initialScheduledWeek`). The `NextMatchCard` public-mode branch should also guard against `'unrecorded'` status if it ever appears in `initialScheduledWeek`.

---

## Results List Changes

### `MatchCard.tsx` — two new render variants + new props

```ts
interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin?: boolean          // new — gates Record Result button
  gameId?: string            // new — needed by ResultModal
  allPlayers?: Player[]      // new — needed by ResultModal
  onResultSaved?: () => void // new — triggers refresh after save
}

export function MatchCard({ week, isOpen, onToggle, goalkeepers, isAdmin, gameId, allPlayers, onResultSaved }: MatchCardProps) {
  if (week.status === 'cancelled') return <CancelledCard week={week} />
  if (week.status === 'unrecorded') return <UnrecordedCard week={week} />
  if (week.status === 'scheduled' && isPastDeadline(week.date)) {
    return (
      <AwaitingResultCard
        week={week}
        isOpen={isOpen}
        onToggle={onToggle}
        isAdmin={isAdmin ?? false}
        gameId={gameId ?? ''}
        allPlayers={allPlayers ?? []}
        onResultSaved={onResultSaved ?? (() => {})}
      />
    )
  }
  return <PlayedCard week={week} isOpen={isOpen} onToggle={onToggle} goalkeepers={goalkeepers} />
}
```

**`UnrecordedCard`:**
- `bg-[#131c2e] border border-dashed border-slate-700 rounded-lg`
- Header only: week/date stacked (`text-slate-500` / `text-slate-600`)
- Badge: "Unrecorded" — `text-slate-600 border border-dashed border-slate-700 bg-[#131c2e] rounded-full text-xs font-semibold px-2.5 py-0.5`
- No chevron, no body, non-interactive

**`AwaitingResultCard`:**
- `bg-slate-800 border border-slate-700 rounded-lg` (closed) / `border-slate-600` (open)
- Header: week/date/format stacked + "Awaiting Result" badge (`text-slate-400 border-slate-600 bg-slate-800`) + chevron
- Uses `@radix-ui/react-collapsible` (same pattern as `PlayedCard`)
- Expanded body: two-column team lineup using existing `TeamList` component
- Footer (admin only): "Record Result" button → opens `ResultModal`
- Non-admin: card and lineups visible, no button

**`AwaitingResultCard` + `ResultModal` integration:**
`ResultModal` expects a `ScheduledWeek`. An awaiting-result `Week` row must be adapted:
```ts
const scheduledWeek: ScheduledWeek = {
  id: week.id,
  week: week.week,
  date: week.date,
  format: week.format ?? null,
  teamA: week.teamA,
  teamB: week.teamB,
  status: 'scheduled',
  lineupMetadata: week.lineupMetadata ?? null,
}
```
`onResultSaved` calls `router.refresh()` (via `useRouter` inside `AwaitingResultCard`) to trigger a server re-fetch after the result is recorded.

### `save_lineup` footgun
The existing `save_lineup` RPC unconditionally sets `status = 'scheduled'` on conflict, which would overwrite an `unrecorded` row if someone tried to build a lineup for an already-unrecorded week. The spec marks this as out of scope (admins cannot retroactively add a lineup to an unrecorded week via the normal flow), but the migration for `create_unrecorded_week` should add a comment noting this behavior for future awareness.

### Prop threading: `WeekList` → `MatchCard`
Thread new props down from `ResultsSection` → `WeekList` → `MatchCard`:
- `isAdmin: boolean`
- `gameId: string`
- `allPlayers: Player[]`
- `onResultSaved: () => void` (calls `router.refresh()` in `ResultsSection`)

### `ResultsSection` data filter
Currently only "played" weeks are passed to `WeekList` (filtered by `winner != null`). Update to also include `status = 'unrecorded'` and past-deadline `status = 'scheduled'` rows:
```ts
// Pass all weeks that should appear in the history list
// WeekList / MatchCard handles rendering per status
```

The results page Supabase query must also be updated to fetch `status IN ('scheduled', 'cancelled', 'unrecorded')` rows in addition to played weeks (those with `winner != null`).

### Default-open week stays anchored to played weeks
`ResultsSection` computes the initial `openWeek` using `getPlayedWeeks(weeks)`. This must remain filtering by `winner != null` (played weeks only) — unrecorded and awaiting-result rows must not affect which card opens by default.

---

## Sort order
Unrecorded and awaiting-result cards sort by week number descending, consistent with existing `sortWeeks` behavior. They will naturally appear at the top of the list (most recent weeks) until played weeks overtake them. This is the intended position.

---

## Out of Scope
- Admins retroactively adding a lineup to an `unrecorded` week
- Push notifications or in-app alerts when a deadline passes
- Public-mode `AwaitingResultCard` result entry (Record Result is admin-only; public visitors see lineups read-only)
- Timezone correction for the 20:00 deadline (preserves existing behavior in `NextMatchCard`)
- **Multi-week gap backfill:** The row creation logic only creates one unrecorded row per page load (the immediately preceding missed week). If a league misses multiple consecutive weeks, unrecorded rows appear one per page load, not all at once. This is an acceptable limitation for the current scope.

## Implementation Notes
- `WeekList`'s internal `getPlayedWeeks` call (used to compute the default-open week) must remain filtering by `winner != null` only — unrecorded and awaiting-result rows must never become the default-open card.
- `ResultsSection`'s initial `openWeek` state also stays anchored to played weeks via `getPlayedWeeks` — no change needed there.
