# Design: Team Ratings on Scheduled / Awaiting Result Cards

**Date:** 2026-03-30
**Status:** Approved

---

## Problem

Team ratings (`ewptScore`) are shown next to team labels on played match cards, but are missing from two pre-result surfaces:

- **`AwaitingResultCard`** — scheduled week that has passed its deadline, shown in match history
- **`NextMatchCard` lineup view** — the saved lineup for the upcoming match

The ratings exist as columns (`team_a_rating`, `team_b_rating`) on the `weeks` table and are already fetched for all statuses including `scheduled`. They are simply never written at lineup-save time.

---

## Decision

Store `team_a_rating` / `team_b_rating` as a snapshot **at lineup creation / edit time**, consistent with how they are stored at result-record time. This means the chip reflects the balance that was computed when teams were picked, not a live recomputation that could silently drift as player stats change during the season.

---

## Changes

### 1. DB migration — extend `save_lineup` RPC

Add two optional float parameters to the existing `save_lineup` RPC:

```sql
p_team_a_rating FLOAT DEFAULT NULL
p_team_b_rating FLOAT DEFAULT NULL
```

Write them to `weeks.team_a_rating` / `weeks.team_b_rating` in both the INSERT and the `ON CONFLICT DO UPDATE` clause.

### 2. Public lineup API route (`POST /api/public/league/[id]/lineup`)

Accept `teamARating: number | null` and `teamBRating: number | null` in the request body. Include them in the Supabase upsert.

### 3. `ScheduledWeek` type (`lib/types.ts`)

Add optional fields:

```ts
team_a_rating?: number | null
team_b_rating?: number | null
```

### 4. `NextMatchCard` component

**Save path (`handleSaveLineup`):**
Compute `ewptScore(localTeamA)` and `ewptScore(localTeamB)` (already imported and used in the component). Pass them in both the public API POST body and the `save_lineup` RPC params.

Update the `setScheduledWeek` call to include the computed ratings so the lineup view reflects them immediately without a page reload.

**Lineup view (lines 850–851):**
Pass `rating={scheduledWeek.team_a_rating ?? null}` and `rating={scheduledWeek.team_b_rating ?? null}` to the two `TeamList` calls.

### 5. `AwaitingResultCard` (in `MatchCard.tsx`)

Pass `rating={week.team_a_rating ?? null}` and `rating={week.team_b_rating ?? null}` to the two `TeamList` calls. No prop changes needed — the data is already on the `Week` object.

---

## Behaviour for old scheduled weeks

Scheduled weeks saved before this change have `null` for `team_a_rating` / `team_b_rating`. They will show no rating chip — same as old played weeks before the ratings migration. Chips appear for any week re-saved after this change is deployed.

---

## Out of scope

- Backfilling ratings for old scheduled weeks
- Updating the `edit_week` RPC / admin edit route (only handles played/cancelled/unrecorded — not scheduled weeks)
- Any change to page-level data fetching (already fetches these columns for all statuses)
