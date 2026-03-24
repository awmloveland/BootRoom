# League Day & Schedule Sync — Design Spec

**Date:** 2026-03-24
**Status:** Draft

---

## Problem

`games.day` ("Thursday") and `games.kickoff_time` ("6:30pm") are stored in the DB and editable in Settings, but nothing reads them for scheduling logic. Two places derive the league's recurring day-of-week by inferring from played week history instead:

- `getNextMatchDate` in `lib/utils.ts` — used by `NextMatchCard` to suggest the next match date when no lineup is built yet
- `computeQuarterlyTable` in `lib/sidebar-stats.ts` — used by `StatsSidebar` to compute `gamesLeft` in the current quarter

As a result, changing the league day in Settings has no effect on either the upcoming match date suggestion or the quarterly games remaining count. The previous `games-remaining-fix` spec even flagged this as explicit future work: *"When league config gains a `game_day` field, callers pass it as the `gameDay` argument."*

Additionally, if a scheduled week row already exists (a lineup already built), changing the league day leaves that row's date stale with no way for the admin to reconcile it.

---

## Goal

When an admin changes the league day in Settings:

1. The `NextMatchCard` next-match date suggestion uses the new day going forward.
2. The `StatsSidebar` `gamesLeft` count uses the new day going forward.
3. If a scheduled week already exists, a confirmation modal gives the admin the choice to move that match to the new day or keep it and apply the change from the next game onwards.

---

## Constraints

- No schema changes — `games.day` (text) already exists on the `games` table.
- `dayNameToIndex` must produce values matching `Date.getDay()` convention (0=Sun…6=Sat).
- Inference from played weeks remains as a fallback for leagues where `games.day` is null.
- The details PATCH stays focused — it only saves league detail fields.
- Week date mutation is a discrete second PATCH, not bundled into the details save.
- Admin-only: all write operations are gated by the existing `is_game_admin` check.

---

## Design

### 1. Utility: `dayNameToIndex`

Add to `lib/utils.ts`:

```ts
const DAY_NAME_TO_INDEX: Record<string, number> = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
}

export function dayNameToIndex(day: string | null): number | null {
  if (!day) return null
  return DAY_NAME_TO_INDEX[day] ?? null
}
```

---

### 2. `getNextMatchDate` — accept optional `leagueDayIndex`

Current signature in `lib/utils.ts`:
```ts
export function getNextMatchDate(weeks: Week[]): string
```

Updated signature:
```ts
export function getNextMatchDate(weeks: Week[], leagueDayIndex?: number): string
```

When `leagueDayIndex` is provided, use it as the day-of-week instead of deriving from `played[0].date`. Inference from played weeks remains when `leagueDayIndex` is `undefined`.

---

### 3. `StatsSidebar` — add `leagueDayIndex` prop

Current call site (`StatsSidebar.tsx` line 83):
```ts
const { ... gamesLeft } = computeQuarterlyTable(weeks)
```

Updated:
```ts
const { ... gamesLeft } = computeQuarterlyTable(weeks, new Date(), leagueDayIndex ?? undefined)
```

Add `leagueDayIndex?: number` to the `StatsSidebar` props interface.

---

### 4. Results page wiring

`app/[leagueId]/results/page.tsx` already fetches `game.day` (line 184). Add:

```ts
const leagueDayIndex = dayNameToIndex(game.day ?? null) ?? undefined
```

Pass to both consumer components:

```tsx
<NextMatchCard
  ...
  leagueDayIndex={leagueDayIndex}
/>

<StatsSidebar
  ...
  leagueDayIndex={leagueDayIndex}
/>
```

`NextMatchCard` passes it to `getNextMatchDate(weeks, leagueDayIndex)` at line 170.

---

### 5. Settings page — day-change confirmation modal

**Trigger:** Admin clicks "Save details" and the `day` field differs from the value loaded on mount.

**Step 1 — check for scheduled week:**
Before sending the PATCH, call:
```
GET /api/league/[id]/weeks/scheduled
```
Returns `{ week: ScheduledWeek } | { week: null }`.

- If `week` is `null` → proceed with `PATCH /api/league/[id]/details` immediately, no modal.
- If `week` is non-null → show modal.

**Modal copy:**

> *You've changed the match day from [OldDay] to [NewDay].*
>
> **Move this match** — reschedule [existing date, e.g. "Thu 26 Mar"] to [next occurrence of new day, e.g. "Wed 25 Mar"]
> **Keep this match** — leave [Thu 26 Mar] as-is, apply [NewDay] from next game

**"Move this match" flow:**
1. `PATCH /api/league/[id]/details` — saves new `day` (and all other changed fields)
2. `PATCH /api/league/[id]/weeks/[weekId]` — updates `date` to the next occurrence of the new day

**"Keep this match" flow:**
1. `PATCH /api/league/[id]/details` — saves new `day`
2. No further call.

**Next occurrence helper** (client-side, pure):

```ts
function nextOccurrenceAfterToday(dayIndex: number): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let daysUntil = (dayIndex - today.getDay() + 7) % 7
  if (daysUntil === 0) daysUntil = 7
  const next = new Date(today)
  next.setDate(today.getDate() + daysUntil)
  return formatWeekDate(next) // "DD MMM YYYY"
}
```

This value is shown in the modal label and sent as the `date` body in the week PATCH.

---

### 6. API: `GET /api/league/[id]/weeks/scheduled`

New lightweight route. Returns the first scheduled week for the league (or null).

- **Auth:** service role read (same pattern as other public data fetches)
- **Response:** `{ week: { id, week, date } | null }`
- **Query:** `SELECT id, week, date FROM weeks WHERE game_id = $id AND status = 'scheduled' ORDER BY week ASC LIMIT 1`

---

### 7. API: `PATCH /api/league/[id]/weeks/[weekId]`

Check whether this route already exists for week editing. If so, confirm it accepts a `date` field update on a scheduled week. If not, add a minimal admin-only route:

- **Auth:** `is_game_admin` RPC check (same as details PATCH)
- **Body:** `{ date: string }` — validated as `"DD MMM YYYY"` format
- **Action:** `UPDATE weeks SET date = $date WHERE id = $weekId AND game_id = $gameId AND status = 'scheduled'`

---

## Files changed

| File | Change |
|---|---|
| `lib/utils.ts` | Add `dayNameToIndex`; update `getNextMatchDate` signature |
| `components/NextMatchCard.tsx` | Add `leagueDayIndex` prop; pass to `getNextMatchDate` |
| `components/StatsSidebar.tsx` | Add `leagueDayIndex` prop; pass to `computeQuarterlyTable` |
| `app/[leagueId]/results/page.tsx` | Derive `leagueDayIndex`; pass to `NextMatchCard` and `StatsSidebar` |
| `app/[leagueId]/settings/page.tsx` | Track original day; check scheduled week on save; show modal |
| `app/api/league/[id]/weeks/scheduled/route.ts` | New GET route |
| `app/api/league/[id]/weeks/[weekId]/route.ts` | New or updated PATCH route (date field) |

---

## Out of scope

- Updating `kickoff_time` does not affect any scheduling computation — it is display-only in the info bar. No changes needed for time.
- The home page league card (`app/page.tsx`) uses a separate `computeNextMatchDate` function. It is not wired to `games.day` in this spec; that is a follow-on.
- Public tier (`PublicMatchEntrySection`) is not affected — it uses `initialScheduledWeek` directly.
