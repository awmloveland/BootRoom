# League Day & Schedule Sync — Design Spec

**Date:** 2026-03-24
**Status:** Draft (v2 — spec review fixes applied)

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

**Important:** The guard inside the updated function must use `leagueDayIndex !== undefined` (not a truthiness check), because `0` represents Sunday and is falsy — `if (leagueDayIndex)` would incorrectly fall through to inference for Sunday leagues.

---

### 3. `StatsSidebar` — add `leagueDayIndex` prop

`StatsSidebar.tsx` contains an inline sub-component `QuarterlyTableWidget` (line 82) which is the actual call site for `computeQuarterlyTable`:

```ts
function QuarterlyTableWidget({ weeks }: { weeks: Week[] }) {
  const { ... gamesLeft } = computeQuarterlyTable(weeks)  // line 83
```

`leagueDayIndex` must be threaded through both:

1. Add `leagueDayIndex?: number` to the `StatsSidebar` props interface and pass it to `QuarterlyTableWidget`:
```tsx
<QuarterlyTableWidget weeks={weeks} leagueDayIndex={leagueDayIndex} />
```

2. Add `leagueDayIndex?: number` to `QuarterlyTableWidget`'s props and forward it:
```ts
function QuarterlyTableWidget({ weeks, leagueDayIndex }: { weeks: Week[]; leagueDayIndex?: number }) {
  const { ... gamesLeft } = computeQuarterlyTable(weeks, new Date(), leagueDayIndex)
```

---

### 4. Results page wiring

`app/[leagueId]/results/page.tsx` already fetches `game.day` (line 184). Add:

```ts
const leagueDayIndex = dayNameToIndex(game.day ?? null) ?? undefined
```

**`NextMatchCard` is not rendered directly by the results page** — it is rendered by `ResultsSection` (`components/ResultsSection.tsx`). `leagueDayIndex` must be threaded through `ResultsSection` first:

```tsx
// In results/page.tsx:
<ResultsSection
  ...
  leagueDayIndex={leagueDayIndex}
/>

// In ResultsSection.tsx Props interface — add:
leagueDayIndex?: number

// In ResultsSection.tsx render — forward to NextMatchCard:
<NextMatchCard
  ...
  leagueDayIndex={leagueDayIndex}
/>
```

**`NextMatchCard` Props interface** — add `leagueDayIndex?: number` to the interface (lines 17–32), then update line 170:
```ts
const nextDate = useMemo(() => getNextMatchDate(weeks, leagueDayIndex), [weeks, leagueDayIndex])
```

**`StatsSidebar`** is rendered directly from the results page:
```tsx
<StatsSidebar
  ...
  leagueDayIndex={leagueDayIndex}
/>
```

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

**Date formatting in the modal:** The human-readable label (e.g. "Thu 26 Mar") uses `toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })` — matching the `formatDisplayDate` pattern used elsewhere. The `date` value sent in the PATCH body must be `"DD MMM YYYY"` format from `formatWeekDate` (already exported from `lib/utils.ts`).

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

This route does not currently exist and must be created as a new minimal admin-only route:

- **Auth:** `is_game_admin` RPC check (same as details PATCH)
- **Body:** `{ date: string }` — validated as `"DD MMM YYYY"` format
- **Action:** `UPDATE weeks SET date = $date WHERE id = $weekId AND game_id = $gameId AND status = 'scheduled'`

---

## Files changed

| File | Change |
|---|---|
| `lib/utils.ts` | Add `dayNameToIndex`; update `getNextMatchDate` signature |
| `components/NextMatchCard.tsx` | Add `leagueDayIndex?: number` to Props interface; pass to `getNextMatchDate` |
| `components/ResultsSection.tsx` | Add `leagueDayIndex?: number` to Props interface; forward to `NextMatchCard` |
| `components/StatsSidebar.tsx` | Add `leagueDayIndex?: number` to StatsSidebar and `QuarterlyTableWidget` props; forward to `computeQuarterlyTable` |
| `app/[leagueId]/results/page.tsx` | Derive `leagueDayIndex`; pass to `ResultsSection` and `StatsSidebar` |
| `app/[leagueId]/settings/page.tsx` | Track original day; check scheduled week on save; show modal |
| `app/api/league/[id]/weeks/scheduled/route.ts` | New GET route |
| `app/api/league/[id]/weeks/[weekId]/route.ts` | New or updated PATCH route (date field) |

---

## Out of scope

- Updating `kickoff_time` does not affect any scheduling computation — it is display-only in the info bar. No changes needed for time.
- The home page league card (`app/page.tsx`) uses a separate locally-defined `computeNextMatchDate` function and does not fetch `game.day` at all (it only selects `games(id, name)`). Wiring it to `games.day` is a known follow-on. Until that is done, the home page card will continue to show an inference-based next-match date even after this spec ships — this is a known inconsistency between the home page and the results page.
- Public tier (`PublicMatchEntrySection`) is not affected — it uses `initialScheduledWeek` directly.
