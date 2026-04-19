# Honours Card Header Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text honours card header with a full quarter-status UI showing seasonal names, date/week ranges, status pills, and in-progress/upcoming states alongside completed ones.

**Architecture:** Extend `lib/sidebar-stats.ts` with a new `computeAllQuarters` function and supporting types that supersede `computeAllCompletedQuarters`. Update `HonoursSection.tsx` to render all three quarter states (completed/in-progress/upcoming). Update the page call site and remove dead code.

**Tech Stack:** TypeScript, React (Next.js 14 App Router), Radix UI Collapsible, Tailwind CSS, Jest

---

## File Map

| File | Change |
|---|---|
| `lib/sidebar-stats.ts` | Add `QuarterStatus`, `QuarterSummary` types; add `formatDate`, `firstWeekdayOnOrAfter`, `lastWeekdayOnOrBefore` helpers; add `computeAllQuarters`; remove `CompletedQuarter`, `computeAllCompletedQuarters` |
| `__tests__/sidebar-stats.test.ts` | Replace `computeAllCompletedQuarters` describe blocks with `computeAllQuarters` tests |
| `components/HonoursSection.tsx` | Full rewrite of `QuarterCard` and `HonoursSection` to use `QuarterSummary` and render all 3 states |
| `app/[slug]/honours/page.tsx` | Swap import and call site |

---

## Task 1: Write failing tests for `computeAllQuarters`

**Files:**
- Modify: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1.1: Replace the import line in the test file**

Open `__tests__/sidebar-stats.test.ts`. Find line 1:
```ts
import { computeInForm, computeQuarterlyTable, computeTeamAB, computeAllCompletedQuarters } from '@/lib/sidebar-stats'
```
Replace with:
```ts
import { computeInForm, computeQuarterlyTable, computeTeamAB, computeAllQuarters } from '@/lib/sidebar-stats'
```

- [ ] **Step 1.2: Delete the old `computeAllCompletedQuarters` describe blocks**

In `__tests__/sidebar-stats.test.ts`, delete both describe blocks:
- `describe('computeAllCompletedQuarters', ...)` (starts at the line `// ─── computeAllCompletedQuarters`)
- `describe('computeAllCompletedQuarters — awards', ...)`

Delete from the `// ─── computeAllCompletedQuarters` comment down to the end of the file.

- [ ] **Step 1.3: Add the new `computeAllQuarters` describe block**

Append to the end of `__tests__/sidebar-stats.test.ts`:

```ts
// ─── computeAllQuarters ───────────────────────────────────────────────────────

describe('computeAllQuarters', () => {
  // ── Status determination ───────────────────────────────────────────────────

  it('marks a quarter as upcoming when now is before its start date', () => {
    // Q3 = Jul–Sep. now = 01 Jun 2025 → before Q3 start.
    const now = new Date(2025, 5, 1) // 01 Jun 2025 (Q2)
    const result = computeAllQuarters([], now)
    const year2025 = result.find(y => y.year === 2025)!
    const q3 = year2025.quarters.find(q => q.q === 3)!
    expect(q3.status).toBe('upcoming')
  })

  it('marks the current calendar quarter as in_progress', () => {
    // now = 15 Feb 2026 → inside Q1 (Jan–Mar 2026)
    const now = new Date(2026, 1, 15)
    const result = computeAllQuarters([], now)
    const year2026 = result.find(y => y.year === 2026)!
    const q1 = year2026.quarters.find(q => q.q === 1)!
    expect(q1.status).toBe('in_progress')
  })

  it('marks a past quarter as completed when all weeks are settled and at least one played', () => {
    const weeks = [
      makeWeek({ week: 1, date: '10 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '17 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
      makeWeek({ week: 3, date: '24 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
    ]
    // now = 01 Jun 2025 → Q1 2025 (Jan–Mar) is fully past
    const now = new Date(2025, 5, 1)
    const result = computeAllQuarters(weeks, now)
    const year2025 = result.find(y => y.year === 2025)!
    const q1 = year2025.quarters.find(q => q.q === 1)!
    expect(q1.status).toBe('completed')
  })

  it('excludes a past quarter with unrecorded weeks', () => {
    const weeks = [
      makeWeek({ week: 1, date: '10 Jan 2025', status: 'played', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '17 Jan 2025', status: 'unrecorded', teamA: [], teamB: [], winner: null }),
    ]
    const now = new Date(2025, 5, 1)
    const result = computeAllQuarters(weeks, now)
    const year2025 = result.find(y => y.year === 2025)
    // Q1 has an unrecorded week so it must not appear
    const q1 = year2025?.quarters.find(q => q.q === 1)
    expect(q1).toBeUndefined()
  })

  it('excludes a past quarter with no played weeks (all cancelled)', () => {
    const weeks = [
      makeWeek({ week: 1, date: '10 Jan 2025', status: 'cancelled', teamA: [], teamB: [], winner: null }),
    ]
    const now = new Date(2025, 5, 1)
    const result = computeAllQuarters(weeks, now)
    const year2025 = result.find(y => y.year === 2025)
    const q1 = year2025?.quarters.find(q => q.q === 1)
    expect(q1).toBeUndefined()
  })

  // ── Seasonal names ─────────────────────────────────────────────────────────

  it('assigns correct seasonal names: Q1=Winter Q2=Spring Q3=Summer Q4=Autumn', () => {
    // now = 15 Feb 2026 → inside Q1 2026; Q2/Q3/Q4 are upcoming
    const now = new Date(2026, 1, 15)
    const result = computeAllQuarters([], now)
    const year2026 = result.find(y => y.year === 2026)!
    const names = Object.fromEntries(year2026.quarters.map(q => [q.q, q.seasonName]))
    expect(names[1]).toBe('Winter')
    expect(names[2]).toBe('Spring')
    expect(names[3]).toBe('Summer')
    expect(names[4]).toBe('Autumn')
  })

  // ── Date ranges ────────────────────────────────────────────────────────────

  it('uses actual week dates for date range when game data exists', () => {
    const weeks = [
      makeWeek({ week: 1, date: '10 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '17 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
      makeWeek({ week: 3, date: '24 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
    ]
    const now = new Date(2025, 5, 1) // Q1 2025 completed
    const result = computeAllQuarters(weeks, now)
    const q1 = result.find(y => y.year === 2025)!.quarters.find(q => q.q === 1)!
    expect(q1.dateRange.from).toBe('10 Jan 2025')
    expect(q1.dateRange.to).toBe('24 Jan 2025')
  })

  it('falls back to calendar quarter bounds for upcoming quarters with no game data and no inferrable game day', () => {
    // now = 15 Feb 2026 (Q1). Q3 = Jul–Sep 2026. No weeks → no game day.
    const now = new Date(2026, 1, 15)
    const result = computeAllQuarters([], now)
    const q3 = result.find(y => y.year === 2026)!.quarters.find(q => q.q === 3)!
    expect(q3.status).toBe('upcoming')
    expect(q3.dateRange.from).toBe('01 Jul 2026')
    expect(q3.dateRange.to).toBe('30 Sep 2026')
  })

  it('uses game-day occurrences for upcoming date range when game day can be inferred', () => {
    // Played weeks on Wednesdays in Q1 2026 (Jan–Mar).
    // now = 15 May 2026 → Q1 completed, Q3 upcoming (Jul–Sep).
    // Game day = Wednesday (3). First Wed in Jul 2026 = 1 Jul 2026. Last Wed in Sep 2026 = 30 Sep 2026.
    // First Wednesday on/after 1 Jul 2026: 1 Jul 2026 IS a Wednesday.
    // Last Wednesday on/before 30 Sep 2026: 30 Sep 2026 is a Wednesday.
    const weeks = [
      makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Wed
      makeWeek({ week: 2, date: '14 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }), // Wed
    ]
    const now = new Date(2026, 4, 15) // 15 May 2026
    const result = computeAllQuarters(weeks, now)
    const q3 = result.find(y => y.year === 2026)!.quarters.find(q => q.q === 3)!
    expect(q3.status).toBe('upcoming')
    // First Wednesday in Q3 2026 (Jul 1 – Sep 30): 1 Jul 2026
    expect(q3.dateRange.from).toBe('01 Jul 2026')
    // Last Wednesday in Q3 2026: 30 Sep 2026
    expect(q3.dateRange.to).toBe('30 Sep 2026')
  })

  // ── Week ranges ────────────────────────────────────────────────────────────

  it('computes weekRange from min/max week numbers of weeks in the quarter', () => {
    const weeks = [
      makeWeek({ week: 3, date: '17 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 5, date: '31 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
      makeWeek({ week: 4, date: '24 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
    ]
    const now = new Date(2025, 5, 1)
    const result = computeAllQuarters(weeks, now)
    const q1 = result.find(y => y.year === 2025)!.quarters.find(q => q.q === 1)!
    expect(q1.weekRange).toEqual({ from: 3, to: 5 })
  })

  it('sets weekRange to null for upcoming quarters with no game data', () => {
    const now = new Date(2026, 1, 15) // Q1 in-progress, no weeks
    const result = computeAllQuarters([], now)
    const q3 = result.find(y => y.year === 2026)!.quarters.find(q => q.q === 3)!
    expect(q3.weekRange).toBeNull()
  })

  // ── completedCount ─────────────────────────────────────────────────────────

  it('sets completedCount correctly for a year with 2 completed and 2 non-completed quarters', () => {
    // Q1 + Q2 2025 completed (weeks in Jan–Jun 2025). now = 15 Aug 2025 (Q3 in progress).
    const weeks = [
      makeWeek({ week: 1, date: '10 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 5, date: '28 Mar 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
      makeWeek({ week: 6, date: '18 Apr 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 10, date: '20 Jun 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
    ]
    const now = new Date(2025, 7, 15) // 15 Aug 2025
    const result = computeAllQuarters(weeks, now)
    const year2025 = result.find(y => y.year === 2025)!
    expect(year2025.completedCount).toBe(2)
  })

  // ── Current year shows all 4 quarters; prior years only completed ──────────

  it('returns all 4 quarters for the current year', () => {
    const now = new Date(2026, 1, 15) // Q1 2026 in progress
    const result = computeAllQuarters([], now)
    const year2026 = result.find(y => y.year === 2026)!
    expect(year2026.quarters).toHaveLength(4)
  })

  it('does not include upcoming quarters for prior years', () => {
    // One week in Q1 2025. now = 15 Feb 2026 → 2025 is a prior year.
    // Q2/Q3/Q4 2025 have no data and are past, so not completed → should not appear.
    const weeks = [
      makeWeek({ week: 1, date: '10 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const now = new Date(2026, 1, 15)
    const result = computeAllQuarters(weeks, now)
    const year2025 = result.find(y => y.year === 2025)!
    // Only Q1 2025 is completed. Q2/Q3/Q4 have no data → excluded.
    expect(year2025.quarters).toHaveLength(1)
    expect(year2025.quarters[0].q).toBe(1)
  })

  // ── Quarters sorted newest first within year ───────────────────────────────

  it('sorts quarters newest first (Q4→Q1) within a year', () => {
    const now = new Date(2026, 1, 15) // Q1 2026 in progress
    const result = computeAllQuarters([], now)
    const year2026 = result.find(y => y.year === 2026)!
    const qNums = year2026.quarters.map(q => q.q)
    expect(qNums).toEqual([4, 3, 2, 1])
  })

  // ── Completed quarter populates champion + entries ─────────────────────────

  it('populates champion and entries for a completed quarter', () => {
    const weeks = [
      makeWeek({ week: 1, date: '10 Jan 2025', teamA: ['Alice', 'Carol'], teamB: ['Bob', 'Dave'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '17 Jan 2025', teamA: ['Alice', 'Carol'], teamB: ['Bob', 'Dave'], winner: 'teamA' }),
    ]
    const now = new Date(2025, 5, 1)
    const result = computeAllQuarters(weeks, now)
    const q1 = result.find(y => y.year === 2025)!.quarters.find(q => q.q === 1)!
    expect(q1.champion).toBe('Alice')
    expect(q1.entries).toBeDefined()
    expect(q1.entries!.length).toBeGreaterThan(0)
  })

  it('does not populate champion or entries for an in_progress quarter', () => {
    const now = new Date(2026, 1, 15) // Q1 2026 in progress
    const result = computeAllQuarters([], now)
    const q1 = result.find(y => y.year === 2026)!.quarters.find(q => q.q === 1)!
    expect(q1.status).toBe('in_progress')
    expect(q1.champion).toBeUndefined()
    expect(q1.entries).toBeUndefined()
  })
})
```

- [ ] **Step 1.4: Run the tests to confirm they fail**

```bash
npm test -- --testPathPattern="sidebar-stats" 2>&1 | tail -20
```

Expected: failures referencing `computeAllQuarters is not a function` (or similar import error).

---

## Task 2: Implement `computeAllQuarters` in `lib/sidebar-stats.ts`

**Files:**
- Modify: `lib/sidebar-stats.ts`

- [ ] **Step 2.1: Add `QuarterStatus` type and `QuarterSummary` interface**

In `lib/sidebar-stats.ts`, after the existing `export interface HonoursYear` block (around line 122), add:

```ts
export type QuarterStatus = 'completed' | 'in_progress' | 'upcoming'

export interface QuarterSummary {
  q: number
  year: number
  quarterLabel: string                             // e.g. "Q3 26"
  seasonName: string                               // "Winter" | "Spring" | "Summer" | "Autumn"
  status: QuarterStatus
  weekRange: { from: number; to: number } | null  // null when no game data exists yet
  dateRange: { from: string; to: string }          // "DD MMM YYYY" formatted strings
  champion?: string
  entries?: QuarterlyEntry[]
  awards?: QuarterAward[]
}
```

Then **replace** the `HonoursYear` interface with:

```ts
export interface HonoursYear {
  year: number
  completedCount: number
  quarters: QuarterSummary[]
}
```

- [ ] **Step 2.2: Add private helper functions**

Immediately after the `quarterOf` function (around line 124), add these three helpers:

```ts
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  return `${dd} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

function firstWeekdayOnOrAfter(weekday: number, from: Date): Date {
  const d = new Date(from)
  d.setHours(0, 0, 0, 0)
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1)
  return d
}

function lastWeekdayOnOrBefore(weekday: number, before: Date): Date {
  const d = new Date(before)
  d.setHours(0, 0, 0, 0)
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1)
  return d
}
```

- [ ] **Step 2.3: Add the `SEASON_NAMES` constant and `computeAllQuarters` function**

After the closing brace of `computeAllCompletedQuarters`, add:

```ts
const SEASON_NAMES: Record<number, string> = { 1: 'Winter', 2: 'Spring', 3: 'Summer', 4: 'Autumn' }

export function computeAllQuarters(weeks: Week[], now: Date = new Date()): HonoursYear[] {
  const { q: currentQ, year: currentYear } = quarterOf(now)
  const gameDay = inferGameDay(weeks)

  // Collect all years that have any week data, always include the current year
  const yearsWithData = new Set<number>([currentYear])
  for (const w of weeks) {
    yearsWithData.add(quarterOf(parseWeekDate(w.date)).year)
  }

  const result: HonoursYear[] = []

  for (const year of Array.from(yearsWithData).sort((a, b) => b - a)) {
    const isCurrentYear = year === currentYear
    const summaries: QuarterSummary[] = []

    // Iterate Q4→Q1 so quarters are newest-first within the year
    for (let q = 4; q >= 1; q--) {
      // Calendar bounds for this quarter
      const qStart = new Date(year, (q - 1) * 3, 1)     // e.g. Q1 → Jan 1
      const qEnd   = new Date(year, q * 3, 0)             // e.g. Q1 → Mar 31

      // Determine status purely from calendar position
      let status: QuarterStatus
      if (now < qStart) {
        status = 'upcoming'
      } else if (now <= qEnd) {
        status = 'in_progress'
      } else {
        status = 'completed'
      }

      // For prior years, only show quarters that actually completed with data
      if (!isCurrentYear && status !== 'completed') continue

      // Get all weeks in this quarter
      const qWeeks = weeks.filter(w => weekInQuarter(w, q, year))

      // Completed quarters must have all weeks settled and at least one played
      if (status === 'completed') {
        const hasIncomplete = qWeeks.some(w => w.status === 'unrecorded' || w.status === 'scheduled')
        if (hasIncomplete) continue
        if (!qWeeks.some(w => w.status === 'played')) continue
      }

      // Date range
      let dateRange: { from: string; to: string }
      if (qWeeks.length > 0) {
        const dates = qWeeks.map(w => parseWeekDate(w.date).getTime())
        dateRange = {
          from: formatDate(new Date(Math.min(...dates))),
          to:   formatDate(new Date(Math.max(...dates))),
        }
      } else if (gameDay !== null) {
        const first = firstWeekdayOnOrAfter(gameDay, qStart)
        const last  = lastWeekdayOnOrBefore(gameDay, qEnd)
        dateRange = {
          from: first <= qEnd   ? formatDate(first) : formatDate(qStart),
          to:   last  >= qStart ? formatDate(last)  : formatDate(qEnd),
        }
      } else {
        dateRange = { from: formatDate(qStart), to: formatDate(qEnd) }
      }

      // Week range
      let weekRange: { from: number; to: number } | null = null
      if (qWeeks.length > 0) {
        const weekNums = qWeeks.map(w => w.week)
        weekRange = { from: Math.min(...weekNums), to: Math.max(...weekNums) }
      }

      // Standings (completed only)
      let champion: string | undefined
      let entries: QuarterlyEntry[] | undefined
      let awards: QuarterAward[] | undefined
      if (status === 'completed') {
        const playedWeeks = qWeeks.filter(w => w.status === 'played')
        entries  = aggregateWeeks(playedWeeks)
        champion = entries[0]?.name
        awards   = buildQuarterAwards(entries, playedWeeks)
      }

      const yy = String(year).slice(-2)
      summaries.push({
        q,
        year,
        quarterLabel: `Q${q} ${yy}`,
        seasonName: SEASON_NAMES[q],
        status,
        weekRange,
        dateRange,
        champion,
        entries,
        awards,
      })
    }

    if (summaries.length === 0) continue

    result.push({
      year,
      completedCount: summaries.filter(s => s.status === 'completed').length,
      quarters: summaries,
    })
  }

  return result
}
```

- [ ] **Step 2.4: Run tests to confirm they pass**

```bash
npm test -- --testPathPattern="sidebar-stats" 2>&1 | tail -20
```

Expected: all tests in the `computeAllQuarters` describe block PASS. Existing `computeInForm`, `computeQuarterlyTable`, `computeTeamAB` tests still pass.

- [ ] **Step 2.5: Delete `computeAllCompletedQuarters` and the `CompletedQuarter` interface**

In `lib/sidebar-stats.ts`:
- Delete the `export interface CompletedQuarter { ... }` block
- Delete the entire `export function computeAllCompletedQuarters(...)` function block (from its JSDoc comment to the closing `}`)

- [ ] **Step 2.6: Run full test suite to confirm nothing is broken**

```bash
npm test 2>&1 | tail -10
```

Expected: all tests pass. If TypeScript errors appear from removing `CompletedQuarter`, they will be fixed in Task 3.

- [ ] **Step 2.7: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "feat: replace computeAllCompletedQuarters with computeAllQuarters returning all quarter states"
```

---

## Task 3: Rewrite `HonoursSection.tsx`

**Files:**
- Modify: `components/HonoursSection.tsx`

The component must render:
- **Year header:** large white season label ("2026 Season") + "X of 4 complete" on the right, no dividing lines
- **Completed quarter:** collapsible card with dark Q avatar, "Completed" pill, chevron — body shows standings/awards unchanged
- **In-progress quarter:** non-collapsible card with blue Q avatar, "● In progress" pill — body shows blue-bar note
- **Upcoming quarter:** non-interactive card with dashed Q avatar, "Upcoming" dashed pill — no body, `opacity-60`

- [ ] **Step 3.1: Replace `HonoursSection.tsx` entirely**

Replace the full contents of `components/HonoursSection.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuarterSummary, HonoursYear } from '@/lib/sidebar-stats'

interface HonoursSectionProps {
  data: HonoursYear[]
}

const PAGE_SIZE = 10

// ── Subtitle text ─────────────────────────────────────────────────────────────

function quarterSubtitle(quarter: QuarterSummary): string {
  const { weekRange, dateRange } = quarter
  if (!weekRange) {
    // Upcoming with no game data — show "Apr – Jun 2026" from the dateRange strings
    const [, fromMonth] = dateRange.from.split(' ')
    const [, toMonth, year] = dateRange.to.split(' ')
    return fromMonth === toMonth
      ? `${fromMonth} ${year}`
      : `${fromMonth} – ${toMonth} ${year}`
  }
  const weekLabel = weekRange.from === weekRange.to
    ? `Week ${weekRange.from}`
    : `Weeks ${weekRange.from}–${weekRange.to}`
  return `${weekLabel} · ${dateRange.from} – ${dateRange.to}`
}

// ── Q avatar ──────────────────────────────────────────────────────────────────

function QAvatar({ q, status }: { q: number; status: QuarterSummary['status'] }) {
  return (
    <div className={cn(
      'w-11 h-11 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0',
      status === 'completed' && 'bg-slate-800 border-2 border-slate-700 text-slate-400',
      status === 'in_progress' && 'bg-blue-900 border-2 border-blue-700 text-blue-300',
      status === 'upcoming' && 'border-2 border-dashed border-slate-600 text-slate-600',
    )}>
      Q{q}
    </div>
  )
}

// ── Status pill ───────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: QuarterSummary['status'] }) {
  if (status === 'completed') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 bg-slate-700/50 text-slate-300 border border-slate-600 shrink-0">
        Completed
      </span>
    )
  }
  if (status === 'in_progress') {
    return (
      <span className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 bg-blue-900/50 text-blue-300 border border-blue-700 shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
        In progress
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1 text-slate-600 border border-dashed border-slate-600 shrink-0">
      Upcoming
    </span>
  )
}

// ── Quarter card body (completed only) ────────────────────────────────────────

function CompletedCardBody({ quarter }: { quarter: QuarterSummary }) {
  const [showAll, setShowAll] = useState(false)
  const entries = quarter.entries ?? []
  const visibleEntries = showAll ? entries : entries.slice(0, PAGE_SIZE)
  const hiddenCount = entries.length - PAGE_SIZE

  return (
    <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
      {quarter.awards && quarter.awards.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-t border-slate-700 px-3 py-2.5 scrollbar-hide">
          {quarter.awards.map(award => (
            <div
              key={award.key}
              className="flex-shrink-0 flex flex-col gap-0.5 bg-slate-700/50 border border-slate-600 rounded-lg px-2.5 py-2 min-w-[108px]"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{award.icon}</span>
                <span className="text-[10px] font-bold tracking-wide uppercase text-indigo-400">
                  {award.nickname}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-100">{award.player}</span>
              <span className="text-[10px] text-slate-500">{award.stat}</span>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-slate-700 px-4 py-3">
        <div className="flex items-center gap-1 pb-2 mb-1 border-b border-slate-700/40">
          <span className="flex-1 text-[10px] font-semibold uppercase text-slate-500">Player</span>
          <span className="w-[22px] text-center text-[10px] font-semibold uppercase text-slate-700">P</span>
          <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">W</span>
          <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">D</span>
          <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">L</span>
          <span className="w-[28px] text-right text-[10px] font-semibold uppercase text-slate-500">Pts</span>
        </div>
        <div className="flex flex-col gap-[2px]">
          {visibleEntries.map((e, i) => (
            <div
              key={e.name}
              className={cn(
                'flex items-center gap-1 py-[3px]',
                i === 0 ? '-mx-4 px-4 bg-sky-400/[0.06]' : '-mx-1 px-1'
              )}
            >
              <span className={cn(
                'text-[11px] w-[14px] text-left shrink-0',
                i === 0 ? 'font-bold text-sky-400' : 'text-slate-600'
              )}>
                {i + 1}
              </span>
              <span className={cn(
                'text-[13px] flex-1 truncate',
                i === 0 ? 'font-semibold text-slate-100' : 'text-slate-400'
              )}>
                {e.name}
              </span>
              <span className="text-xs text-slate-400 w-[22px] text-center shrink-0">{e.played}</span>
              <span className="text-xs text-slate-400 w-[18px] text-center shrink-0">{e.won}</span>
              <span className="text-xs text-slate-400 w-[18px] text-center shrink-0">{e.drew}</span>
              <span className="text-xs text-slate-400 w-[18px] text-center shrink-0">{e.lost}</span>
              <span className={cn(
                'text-sm font-bold w-[28px] text-right shrink-0',
                i === 0 ? 'text-sky-300' : 'text-slate-200'
              )}>
                {e.points}
              </span>
            </div>
          ))}
        </div>
        {hiddenCount > 0 && (
          <div className="mt-3 flex justify-center">
            <button
              onClick={(e) => { e.stopPropagation(); setShowAll(v => !v) }}
              className="text-xs font-medium text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600 rounded px-3 py-1 transition-colors"
            >
              {showAll ? 'See Less' : `See All (${entries.length})`}
            </button>
          </div>
        )}
      </div>
    </Collapsible.Content>
  )
}

// ── Quarter card ──────────────────────────────────────────────────────────────

function QuarterCard({
  quarter,
  isOpen,
  onToggle,
}: {
  quarter: QuarterSummary
  isOpen: boolean
  onToggle: () => void
}) {
  const { status, q, seasonName, champion } = quarter
  const subtitle = quarterSubtitle(quarter)

  const headerContent = (
    <div className={cn(
      'w-full flex items-center gap-3 px-4 py-3 text-left',
      status === 'completed' && 'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer',
    )}>
      <QAvatar q={q} status={status} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-sm font-semibold leading-snug',
          status === 'upcoming' ? 'text-slate-500' : 'text-slate-100'
        )}>
          {seasonName} quarter
        </p>
        <p className={cn(
          'text-xs mt-0.5',
          status === 'upcoming' ? 'text-slate-600' : 'text-slate-500'
        )}>
          {subtitle}
        </p>
      </div>
      {status === 'completed' && champion && (
        <span className="flex items-center gap-1.5 text-xs font-semibold rounded px-2 py-0.5 bg-amber-400/10 text-amber-300 border border-amber-400/20 shrink-0">
          <Trophy className="h-3 w-3" />
          {champion}
        </span>
      )}
      <StatusPill status={status} />
      {status === 'completed' && (
        <ChevronDown className={cn(
          'h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200',
          isOpen && 'rotate-180'
        )} />
      )}
    </div>
  )

  if (status === 'upcoming') {
    return (
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-800 opacity-60">
        {headerContent}
      </div>
    )
  }

  if (status === 'in_progress') {
    return (
      <div className="rounded-lg border border-blue-900 bg-slate-800">
        {headerContent}
        <div className="border-t border-dashed border-blue-900 px-4 py-2.5 flex items-center gap-3">
          <div className="w-[3px] h-7 rounded bg-blue-700 opacity-50 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Quarter in progress — final standings will appear here once all games are recorded
          </p>
        </div>
      </div>
    )
  }

  // Completed — collapsible
  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
      <div className={cn(
        'rounded-lg border bg-slate-800 transition-colors duration-150',
        isOpen ? 'border-slate-600' : 'border-slate-700 hover:border-slate-500'
      )}>
        <Collapsible.Trigger asChild>
          <button className={cn(
            'w-full flex items-center gap-3 px-4 py-3 text-left',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer'
          )}>
            <QAvatar q={q} status={status} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-100 leading-snug">
                {seasonName} quarter
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
            </div>
            {champion && (
              <span className="flex items-center gap-1.5 text-xs font-semibold rounded px-2 py-0.5 bg-amber-400/10 text-amber-300 border border-amber-400/20 shrink-0">
                <Trophy className="h-3 w-3" />
                {champion}
              </span>
            )}
            <StatusPill status={status} />
            <ChevronDown className={cn(
              'h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200',
              isOpen && 'rotate-180'
            )} />
          </button>
        </Collapsible.Trigger>
        <CompletedCardBody quarter={quarter} />
      </div>
    </Collapsible.Root>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

export function HonoursSection({ data }: HonoursSectionProps) {
  const firstCompletedKey = (() => {
    for (const yearGroup of data) {
      for (const q of yearGroup.quarters) {
        if (q.status === 'completed') return `${q.year}-${q.q}`
      }
    }
    return null
  })()

  const [openKey, setOpenKey] = useState<string | null>(firstCompletedKey)

  if (data.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">No quarters to display yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {data.map((yearGroup) => (
        <div key={yearGroup.year} className="first:mt-0 mt-6">
          {/* Year header */}
          <div className="flex items-baseline justify-between px-1 mb-3">
            <span className="text-xl font-bold text-slate-100">
              {yearGroup.year} Season
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {yearGroup.completedCount} of 4 complete
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {yearGroup.quarters.map((quarter) => {
              const key = `${quarter.year}-${quarter.q}`
              return (
                <QuarterCard
                  key={key}
                  quarter={quarter}
                  isOpen={openKey === key}
                  onToggle={() => setOpenKey(openKey === key ? null : key)}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3.2: Run TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If there are type errors relating to `QuarterSummary` properties, fix them before continuing.

- [ ] **Step 3.3: Commit**

```bash
git add components/HonoursSection.tsx
git commit -m "feat: redesign honours card header with seasonal names, status pills, and all quarter states"
```

---

## Task 4: Update the page call site and clean up

**Files:**
- Modify: `app/[slug]/honours/page.tsx`

- [ ] **Step 4.1: Update the import and call site in `honours/page.tsx`**

Open `app/[slug]/honours/page.tsx`. Find:

```ts
import { computeAllCompletedQuarters } from '@/lib/sidebar-stats'
```

Replace with:

```ts
import { computeAllQuarters } from '@/lib/sidebar-stats'
```

Then find the call site (around line 95):

```tsx
<HonoursSection data={computeAllCompletedQuarters(weeks, new Date())} />
```

Replace with:

```tsx
<HonoursSection data={computeAllQuarters(weeks, new Date())} />
```

- [ ] **Step 4.2: Run TypeScript check to confirm no remaining references to old API**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4.3: Check for any remaining references to `computeAllCompletedQuarters` or `CompletedQuarter`**

```bash
grep -r "computeAllCompletedQuarters\|CompletedQuarter" --include="*.ts" --include="*.tsx" .
```

Expected: no output (zero matches outside `node_modules`).

- [ ] **Step 4.4: Run the full test suite one final time**

```bash
npm test 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add app/\[slug\]/honours/page.tsx
git commit -m "feat: wire honours page to computeAllQuarters"
```

---

## Self-Review Checklist

- **Spec coverage:**
  - ✅ `QuarterStatus`, `QuarterSummary`, updated `HonoursYear` → Task 2
  - ✅ Seasonal name mapping Q1=Winter / Q2=Spring / Q3=Summer / Q4=Autumn → Task 2 (`SEASON_NAMES`)
  - ✅ `computeAllQuarters` replaces `computeAllCompletedQuarters` → Task 2
  - ✅ Status: upcoming / in_progress / completed by calendar position → Task 2
  - ✅ Date range from actual week dates; fallback to game day; fallback to calendar bounds → Task 2
  - ✅ Week range from min/max `week` field; null when no data → Task 2
  - ✅ Current year: all 4 quarters. Prior years: completed only → Task 2
  - ✅ `completedCount` on `HonoursYear` → Task 2
  - ✅ Year header: large white "2026 Season" + "X of 4 complete" → Task 3
  - ✅ Q avatar circle (3 states) → Task 3 (`QAvatar`)
  - ✅ Status pills (3 states) → Task 3 (`StatusPill`)
  - ✅ Completed card: collapsible with champion + standings unchanged → Task 3
  - ✅ In-progress card: non-expandable, blue accent bar note → Task 3
  - ✅ Upcoming card: non-interactive, `opacity-60`, dashed border → Task 3
  - ✅ Subtitle: "Weeks N–M · DD MMM YYYY – DD MMM YYYY" or "Mon – Mon YYYY" → Task 3 (`quarterSubtitle`)
  - ✅ Page call site updated → Task 4
  - ✅ Dead code removed → Tasks 2 + 4

- **No placeholders:** all steps contain complete code.

- **Type consistency:** `QuarterSummary` defined in Task 2.1 matches all usages in Tasks 2.3 and 3.1. `HonoursYear.quarters: QuarterSummary[]` consistent throughout.
