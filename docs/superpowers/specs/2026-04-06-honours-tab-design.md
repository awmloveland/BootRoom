# Honours Tab — Design Spec

**Date:** 2026-04-06
**Branch:** awmloveland/seasonal-honours-tab

---

## Overview

Add a new "Honours" tab to each league page showing a historical record of quarterly standings champions, grouped by year. Visible to members and admins only — unauthenticated visitors see a login prompt. No feature flag.

---

## Data Layer

### `computeAllCompletedQuarters(weeks: Week[])` — added to `lib/sidebar-stats.ts`

Groups all weeks by `(q, year)` quarter bucket, then filters to only completed quarters.

**Completeness rule:** A quarter is complete when every week belonging to it has status `played` or `cancelled`. A single `unrecorded` or `scheduled` week keeps the quarter hidden — it stays hidden until someone goes back and records the result.

**Additional filters:**
- Skip quarters with zero `played` weeks (all-cancelled quarters have no standings to rank).

**For each completed quarter:**
- Runs `aggregateWeeks` (existing private helper) on `played` weeks only — full table, all players, sorted by points desc, then wins desc, then name asc.
- Champion = `entries[0].name`.

**Return shape:**
```ts
interface CompletedQuarter {
  quarterLabel: string      // e.g. "Q1 25"
  year: number
  q: number
  champion: string          // top-ranked player name
  entries: QuarterlyEntry[] // full table, all players who appeared
}

// Grouped for year headings:
interface HonoursYear {
  year: number
  quarters: CompletedQuarter[]  // sorted newest-first within year
}

// Final return: HonoursYear[], sorted newest year first
```

---

## Route

**`app/[leagueId]/honours/page.tsx`** — server component.

Follows the same pattern as `lineup-lab/page.tsx`:
- Fetches `getWeeks`, `getGame`, `getAuthAndRole`, `getFeatures`, `getPlayerStats`, `getPendingBadgeCount` in parallel (most are layout cache hits).
- Resolves `tier` via `resolveVisibilityTier`.
- **Public tier or unauthenticated:** renders `HonoursLoginPrompt` inside the standard layout shell (header + sidebar still visible).
- **Member / admin:** calls `computeAllCompletedQuarters(weeks)`, passes result to `HonoursSection`.
- Passes `currentTab="honours"` to `LeaguePageHeader`.

---

## Components

### `components/HonoursLoginPrompt.tsx`
New client component, modelled on `LineupLabLoginPrompt`. Prompts unauthenticated or public-tier visitors to sign in. Uses the existing `AuthDialog` trigger pattern.

### `components/HonoursSection.tsx`
New client component. Receives `HonoursYear[]`.

**Empty state:** if array is empty, show `"No completed quarters yet."` in muted text.

**Year headings:** same visual style as `MonthDivider` — muted uppercase label, used as section separators between year groups.

**Quarter cards:** one Radix `Collapsible` per quarter. Default open: the first card (most recent quarter). All others collapsed.

Card structure:
- **Header (always visible, clickable to toggle):**
  - Quarter label (`Q1 25`) — `text-xs font-semibold uppercase tracking-widest text-slate-500`
  - Champion name — `text-sm font-bold text-amber-300 uppercase`
  - Trophy emoji `🏆`
  - Chevron (rotates on open, same pattern as `MatchCard`)
- **Body (collapsible):**
  - Full standings table: columns P W D L Pts — same sizing and style as the `QuarterlyTableWidget` in `StatsSidebar`, but showing all players (not capped at 5). Rank-1 row gets the sky-400 highlight treatment.
  - Amber champion banner below the table — identical markup to the "Previous Quarter Champion" box in `StatsSidebar` (amber bg, amber border, trophy emoji, quarter label + name).

### `components/LeaguePageHeader.tsx`
- Add `'honours'` to the `currentTab` union type.
- Add Honours tab link (`/${leagueId}/honours`) with `Trophy` icon from `lucide-react`.
- Tab order: Results · Players · Honours · Lineup Lab

---

## Access Control

| Tier | Behaviour |
|---|---|
| Admin | Full access |
| Member | Full access |
| Public (signed in, not a member) | Login prompt (same as lineup-lab — prompt to sign in / join) |
| Unauthenticated | Login prompt |

No feature flag. No `FeatureKey` addition required.

---

## What is NOT in scope

- Per-player quarter history or drill-downs
- Goal difference tiebreaker (matches existing sidebar — points → wins → name)
- Any public-tier access to Honours content
