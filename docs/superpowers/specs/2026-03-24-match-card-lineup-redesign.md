# Match Card Lineup Redesign

**Date:** 2026-03-24
**Status:** Approved

---

## Overview

Redesign the expanded match card to show colour-coded team lineups and frozen team strength scores, and tighten up the card header. The goal is visual consistency with the Lineup Lab and a clearer record of how balanced each game was at the time it was played.

---

## Decisions made

| Topic | Decision |
|---|---|
| Player row colours | Sky/violet — matching the Lineup Lab palette |
| Team ratings | Stored as a snapshot in the DB at result-recording time |
| Balance bar | Not included — score chips only |
| Winner badge labels | "Team A Won", "Team B Won", "Draw" |
| Header: Winner label text | Removed — badge alone is sufficient |
| Header: format text style | `text-slate-400` to match the date (was `text-slate-500`) |

---

## Visual design

### Card header (collapsed)

```
Week 24                                    [Team A Won] ˅
12 Mar 2026 · 6-a-side
```

- "Winner" label text (`<span>Winner</span>`) removed
- Format text (`· 6-a-side`) same colour as date: `text-slate-400`
- Badge labels updated: `teamA` → "Team A Won", `teamB` → "Team B Won", `draw` → "Draw"

### Expanded body — lineup columns

Each team column shows:
1. Coloured heading (`TEAM A` / `TEAM B`) + score chip aligned right
2. Player rows: coloured background + border matching team

**Team A** (sky palette — matches Lineup Lab):
- Heading: `text-sky-300`
- Score chip: `bg-sky-900/60 border border-sky-700 text-sky-300`
- Player rows: `bg-sky-950/40 border-sky-900/60 text-sky-100`

**Team B** (violet palette — matches Lineup Lab):
- Heading: `text-violet-300`
- Score chip: `bg-violet-900/60 border border-violet-700 text-violet-300`
- Player rows: `bg-violet-950/40 border-violet-900/60 text-violet-100`

Score chip format: `ewptScore` rounded to 3 decimal places, e.g. `4.210`. If rating is `null` (pre-migration historical games), the chip is not rendered.

---

## Data model changes

### 1. New columns on `weeks`

```sql
ALTER TABLE weeks
  ADD COLUMN team_a_rating NUMERIC(6,3),
  ADD COLUMN team_b_rating NUMERIC(6,3);
```

Both nullable — historical games before this feature will have `NULL`.

### 2. `Week` type (`lib/types.ts`)

Add two optional fields:

```ts
export interface Week {
  // ... existing fields ...
  team_a_rating?: number | null;
  team_b_rating?: number | null;
}
```

### 3. `record_result` RPC

Add two new optional parameters (with `DEFAULT NULL` for backward compatibility):

```sql
CREATE OR REPLACE FUNCTION record_result(
  p_week_id         UUID,
  p_winner          TEXT,
  p_notes           TEXT DEFAULT NULL,
  p_goal_difference INTEGER DEFAULT NULL,
  p_team_a_rating   NUMERIC DEFAULT NULL,
  p_team_b_rating   NUMERIC DEFAULT NULL
)
```

Update the `UPDATE weeks SET ...` to include `team_a_rating = p_team_a_rating, team_b_rating = p_team_b_rating`.

---

## Component changes

### `WinnerBadge`

Update `BADGE_LABELS` and `BADGE_CLASSES`:

```ts
const BADGE_LABELS: Record<NonNullable<Winner>, string> = {
  teamA: 'Team A Won',
  teamB: 'Team B Won',
  draw: 'Draw',
}

const BADGE_CLASSES: Record<NonNullable<Winner>, string> = {
  teamA: 'bg-sky-900/60 text-sky-300 border border-sky-700',
  teamB: 'bg-violet-900/60 text-violet-300 border border-violet-700',
  draw: 'bg-slate-700 text-slate-300 border border-slate-600',
}
```

### `MatchCard` — header

- Remove the `<span className="text-xs text-slate-500">Winner</span>` element
- Change the format span's class from `text-slate-500` to `text-slate-400`

### `TeamList` → `TeamColumn`

Replace the existing `TeamList` component (simple left-border name list) with an updated `TeamList` that accepts team identity and rating:

```ts
interface TeamListProps {
  label: string
  players: string[]
  team: 'A' | 'B'
  rating?: number | null
  goalkeepers?: string[]
}
```

Rendering:
- Header row: coloured label (`TEAM A` / `TEAM B`) + score chip (only if `rating != null`)
- Player rows: coloured background + border (`bg-sky-950/40 border-sky-900/60` for A, `bg-violet-950/40 border-violet-900/60` for B)
- Goalkeeper emoji retained: `{player}{goalkeepers?.includes(player) ? ' 🧤' : ''}`

### `MatchCard`

Pass `team="A"`, `team="B"`, and the rating fields down to `TeamList`:

```tsx
<TeamList label="Team A" players={week.teamA} team="A" rating={week.team_a_rating} goalkeepers={goalkeepers} />
<TeamList label="Team B" players={week.teamB} team="B" rating={week.team_b_rating} goalkeepers={goalkeepers} />
```

---

## Rating computation at result-recording time

### Where ratings are computed

In `ResultModal.handleSave()`, before calling the RPC or the public API route:

1. Resolve each name in `scheduledWeek.teamA` / `scheduledWeek.teamB` against `allPlayers`.
2. For guests and new players (present in `lineupMetadata` but not in `allPlayers`), construct a minimal synthetic `Player` object. Use ratings from **`guestStates` / `newPlayerStates` component state** — not from `lineupMetadata` directly — so that any admin adjustments made during the review step are captured. Required fields for `ewptScore`: `rating` (1–3), `played: 0`, `recentForm: ''`, `goalkeeper` (from the state), `mentality: 'balanced'`, all win/loss counters at 0.
3. Call `ewptScore(resolvedTeamA)` and `ewptScore(resolvedTeamB)`.
4. Pass the results as `p_team_a_rating` / `p_team_b_rating` to the RPC, or include as `teamARating` / `teamBRating` in the public API POST body.

### Public API route (`/api/public/league/[id]/result`)

Accept `teamARating` and `teamBRating` as optional numeric fields in the request body and include them in the `UPDATE weeks SET ...` call.

---

## Data fetching changes

### Results page (`app/[leagueId]/results/page.tsx`)

Add `team_a_rating, team_b_rating` to the weeks `SELECT` and map them onto the `Week` object:

```ts
team_a_rating: row.team_a_rating ?? null,
team_b_rating: row.team_b_rating ?? null,
```

---

## Migration

A single migration file:

```
supabase/migrations/20260324000003_week_team_ratings.sql
```

Contents:
- `ALTER TABLE weeks ADD COLUMN team_a_rating NUMERIC(6,3)`
- `ALTER TABLE weeks ADD COLUMN team_b_rating NUMERIC(6,3)`
- `CREATE OR REPLACE FUNCTION record_result(...)` — updated to accept and store the two new rating params

---

## Out of scope

- No changes to the `CancelledCard` — it has no lineups to colour
- No backfill of ratings for historical games — they show no chip (null)
- No changes to the public match list (`PublicMatchList`) — that component shows a simplified view and is not updated here
