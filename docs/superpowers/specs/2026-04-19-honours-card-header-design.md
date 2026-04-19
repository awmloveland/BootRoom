# Honours Card Header Redesign

**Date:** 2026-04-19
**Branch:** awmloveland/honours-card-header-redesign

---

## Overview

Redesign the honours page card headers to show all four quarters per season (completed, in-progress, and upcoming) with seasonal names, date ranges, week ranges, and status indicators. Currently the page only shows completed quarters with a minimal text header.

---

## Data Layer

### New types (`lib/sidebar-stats.ts`)

```ts
export type QuarterStatus = 'completed' | 'in_progress' | 'upcoming'

export interface QuarterSummary {
  q: number                                        // 1–4
  year: number
  quarterLabel: string                             // e.g. "Q3 26"
  seasonName: string                               // fixed mapping (see below)
  status: QuarterStatus
  weekRange: { from: number; to: number } | null  // null when no games exist yet
  dateRange: { from: string; to: string }          // formatted "DD MMM YYYY"
  // Populated only for completed quarters:
  champion?: string
  entries?: QuarterlyEntry[]
  awards?: QuarterAward[]
}

export interface HonoursYear {
  year: number
  completedCount: number   // number of completed quarters (drives "X of 4 complete")
  quarters: QuarterSummary[]
}
```

### Seasonal name mapping (fixed, calendar-based)

| Quarter | Months       | Season name |
|---------|-------------|-------------|
| Q1      | Jan–Mar     | Winter      |
| Q2      | Apr–Jun     | Spring      |
| Q3      | Jul–Sep     | Summer      |
| Q4      | Oct–Dec     | Autumn      |

### New function: `computeAllQuarters(weeks, now)`

Replaces `computeAllCompletedQuarters`. Returns `HonoursYear[]`.

**Status determination per quarter:**
- `upcoming` — current date is before the start of the calendar quarter
- `in_progress` — current date falls within the calendar quarter AND at least one week is unrecorded or scheduled
- `completed` — calendar quarter end date has passed AND all weeks in the quarter are played or cancelled AND at least one played week exists

**Date ranges:**
- Quarters with game data: `min(date)` to `max(date)` of all weeks in the quarter
- Upcoming quarters with no games: use `inferGameDay` to find the first and last occurrence of the league game day within the calendar quarter bounds. Fall back to the calendar quarter start/end dates if no game day can be inferred.

**Week ranges:**
- `min(week)` to `max(week)` from all weeks in the quarter
- `null` if no weeks exist yet

**Scope:**
- Current year: all 4 quarters always included, in Q1→Q4 order (newest status first in render)
- Prior years: completed quarters only (same filter as current `computeAllCompletedQuarters`)

**Year grouping:**
- `completedCount` = number of quarters with `status === 'completed'` in that year
- Years sorted newest first; quarters within each year sorted newest first (Q4→Q1)

---

## Component Changes

### `HonoursSection` (`components/HonoursSection.tsx`)

- Replace `CompletedQuarter` / `HonoursYear` imports with `QuarterSummary` / `HonoursYear`
- Completed quarters: collapsible (existing expand behaviour preserved)
- In-progress quarters: non-expandable, no Collapsible wrapper
- Upcoming quarters: non-expandable, no Collapsible wrapper

#### Year header

```
2026 Season                              2 of 4 complete
```

- Year label: `text-xl font-bold text-slate-100`
- Completion count: `text-xs font-semibold uppercase tracking-wide text-slate-500`
- No dividing lines

#### Card header — three states

**Left: Q avatar circle (44×44px)**

| State       | Style |
|-------------|-------|
| Completed   | `bg-slate-800 border-2 border-slate-700 text-slate-400` |
| In-progress | `bg-blue-900 border-2 border-blue-700 text-blue-300` |
| Upcoming    | `border-2 border-dashed border-slate-600 text-slate-600 bg-transparent` |

**Middle: title + subtitle**

- Title: `"Winter quarter"` — `text-sm font-semibold text-slate-100` (completed/in-progress), `text-slate-500` (upcoming)
- Subtitle: `"Weeks 11–15 · 04 Feb – 04 Mar 2026"` — `text-xs text-slate-500` (completed/in-progress), `text-slate-600` (upcoming)
- When `weekRange` is null (upcoming, no scheduled games): subtitle shows just `"Apr – Jun 2026"` (calendar quarter months + year)

**Right: status pill**

| State       | Style |
|-------------|-------|
| Completed   | `border border-slate-600 bg-slate-700/50 text-slate-300 rounded-full px-3 py-1 text-xs font-semibold` + chevron |
| In-progress | `border border-blue-700 bg-blue-900/50 text-blue-300 rounded-full` + blue dot + no chevron |
| Upcoming    | `border border-dashed border-slate-600 text-slate-600 rounded-full` + no chevron |

**Upcoming card:** entire card `opacity-60`, non-interactive (no hover, no cursor-pointer)

#### In-progress body note (Option C — blue accent bar)

Below the header, separated by a dashed blue top border (`border-t border-dashed border-blue-900`):

```
▌  Quarter in progress — final standings will appear here once all games are recorded
```

- Left blue accent bar: `w-[3px] h-7 rounded bg-blue-700 opacity-50`
- Text: `text-xs text-slate-500`

---

## Call Site

`app/[slug]/honours/page.tsx`:
- Import `computeAllQuarters` instead of `computeAllCompletedQuarters`
- Pass result directly to `<HonoursSection>`

---

## What Does Not Change

- Expanded card body (standings table, awards row, see more/less) — no changes
- Accordion behaviour (one card open at a time via `openKey` state)
- Feature flag gating and auth checks
- `QuarterlyEntry`, `QuarterAward`, `buildQuarterAwards`, `aggregateWeeks` — all unchanged
