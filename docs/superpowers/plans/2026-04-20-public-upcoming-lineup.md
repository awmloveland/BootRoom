# Public Upcoming Lineup Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always show a scheduled game lineup to public visitors as a read-only card, without requiring the `match_entry` feature flag to be public-enabled.

**Architecture:** Two small wiring changes — remove the `canSeeMatchEntry` guard around `nextWeek` derivation in the results page, and add a `canEdit` prop to `PublicMatchEntrySection` so the public tier can render the card read-only when `match_entry` is not public-enabled. No new logic; no DB changes; no migrations.

**Tech Stack:** Next.js 14 App Router (server component), TypeScript, React

---

### Task 1: Add `canEdit` prop to `PublicMatchEntrySection`

**Files:**
- Modify: `components/PublicMatchEntrySection.tsx`

No unit test to write — this is a single-prop passthrough with no logic. The behaviour of `NextMatchCard` with `canEdit={false}` already exists and is not being changed.

- [ ] **Step 1: Open `components/PublicMatchEntrySection.tsx` and update the Props interface and component**

Replace the entire file with:

```tsx
'use client'

import { NextMatchCard } from '@/components/NextMatchCard'
import type { Week, ScheduledWeek } from '@/lib/types'

interface Props {
  gameId: string
  leagueSlug: string
  weeks: Week[]
  initialScheduledWeek: ScheduledWeek | null
  leagueName?: string
  canEdit?: boolean
}

export function PublicMatchEntrySection({ gameId, leagueSlug, weeks, initialScheduledWeek, leagueName, canEdit = true }: Props) {
  return (
    <NextMatchCard
      gameId={gameId}
      leagueSlug={leagueSlug}
      weeks={weeks}
      publicMode={true}
      initialScheduledWeek={initialScheduledWeek}
      canEdit={canEdit}
      onResultSaved={() => window.location.reload()}
      leagueName={leagueName}
    />
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/PublicMatchEntrySection.tsx
git commit -m "feat: add canEdit prop to PublicMatchEntrySection"
```

---

### Task 2: Show scheduled lineup unconditionally to public visitors

**Files:**
- Modify: `app/[slug]/results/page.tsx`

Two changes in this file:
1. Remove the `if (canSeeMatchEntry)` guard around `nextWeek` derivation (lines 123–143) so `nextWeek` is always computed.
2. Update the public tier JSX to render the card when `nextWeek` is non-null, with `canEdit` set from `canSeeMatchEntry`.

- [ ] **Step 1: Remove the `canSeeMatchEntry` guard from `nextWeek` derivation**

Find this block (around line 121–143):

```ts
  // Derive nextWeek from already-fetched weeks — getWeeks includes 'scheduled'
  // rows so no extra DB query is needed.
  let nextWeek: ScheduledWeek | null = null
  if (canSeeMatchEntry) {
    const first = weeks
      .filter((w) => w.status === 'scheduled')
      .sort((a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime())[0]
    if (first && !isPastDeadline(first.date)) {
      nextWeek = {
        id: first.id!,
        season: first.season,
        week: first.week,
        date: first.date,
        format: first.format ?? null,
        teamA: first.teamA,
        teamB: first.teamB,
        status: 'scheduled',
        lineupMetadata: first.lineupMetadata ?? null,
        team_a_rating: first.team_a_rating ?? null,
        team_b_rating: first.team_b_rating ?? null,
      }
    }
  }
```

Replace with:

```ts
  // Derive nextWeek unconditionally — used for both the editable match entry section
  // (gated by canSeeMatchEntry) and the always-public read-only lineup display.
  let nextWeek: ScheduledWeek | null = null
  const first = weeks
    .filter((w) => w.status === 'scheduled')
    .sort((a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime())[0]
  if (first && !isPastDeadline(first.date)) {
    nextWeek = {
      id: first.id!,
      season: first.season,
      week: first.week,
      date: first.date,
      format: first.format ?? null,
      teamA: first.teamA,
      teamB: first.teamB,
      status: 'scheduled',
      lineupMetadata: first.lineupMetadata ?? null,
      team_a_rating: first.team_a_rating ?? null,
      team_b_rating: first.team_b_rating ?? null,
    }
  }
```

- [ ] **Step 2: Update the public tier JSX to always render the card when a scheduled week exists**

Find this block inside the `if (tier === 'public')` return (around line 191–199):

```tsx
            {canSeeMatchEntry && (
              <PublicMatchEntrySection
                gameId={leagueId}
                leagueSlug={slug}
                weeks={weeks}
                initialScheduledWeek={nextWeek}
                leagueName={game.name}
              />
            )}
```

Replace with:

```tsx
            {nextWeek && (
              <PublicMatchEntrySection
                gameId={leagueId}
                leagueSlug={slug}
                weeks={weeks}
                initialScheduledWeek={nextWeek}
                canEdit={canSeeMatchEntry}
                leagueName={game.name}
              />
            )}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/[slug]/results/page.tsx
git commit -m "feat: always show scheduled lineup to public visitors"
```

---

### Task 3: Manual verification

No automated tests cover server component rendering with specific feature flag states. Verify these two scenarios manually by running the dev server.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify read-only public view**

With a league that has a scheduled week and `match_entry` public-disabled:
1. Open the league's results page in an incognito window (unauthenticated = public tier).
2. Expected: the upcoming lineup card renders showing Team A and Team B.
3. Expected: no "Edit Lineups", "Result", or "Cancel Game" buttons are visible in the footer.
4. Expected: the card header shows the "Upcoming" badge (or "Awaiting Result" if the game date has passed).

- [ ] **Step 3: Verify editable public view is unchanged**

With a league that has `match_entry` public-enabled and a scheduled week:
1. Open the league's results page in an incognito window.
2. Expected: lineup card renders with "Edit Lineups", "Result", and "Cancel Game" buttons — identical to before this change.

- [ ] **Step 4: Verify no scheduled week = no card**

With a league that has no scheduled week:
1. Open the league's results page in an incognito window.
2. Expected: no upcoming lineup card renders (same as before).

- [ ] **Step 5: Verify member/admin paths are unchanged**

Sign in as a member and as an admin on a league with a scheduled week. Confirm the match entry section behaves exactly as it did before (feature-flag-controlled for members; always editable for admins).
