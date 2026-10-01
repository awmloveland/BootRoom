# Results Year Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a row of year pills to the Results tab that filters the match list to one season, defaulting to the newest season and hidden when the league has only one.

**Architecture:** All weeks are already loaded on the client, so filtering is client-side. A `useResultsYear` hook owns the selected year and mirrors it to `?year=` via `history.replaceState`. `ResultsSection` (members/admins) and a new `PublicResultsSection` (public) use the hook, render `YearTabs`, hide the next match on past years, and pass `season` to `WeekList` / `PublicMatchList`, which filter what they render but keep the full `weeks` for share and edit context. The server page resolves `searchParams.year` so the first render is correct.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind, Jest 30 + ts-jest + @testing-library/react (jsdom via per-file docblock).

**Spec:** `docs/superpowers/specs/2026-10-01-results-year-tabs-design.md`

---

## File map

| File | Change |
|---|---|
| `lib/utils.ts` | Add `getSeasons`, `resolveSelectedYear`, `getLatestResultWeek`, `writeYearParam` |
| `lib/__tests__/utils.yearTabs.test.ts` | New: tests for the four helpers |
| `components/YearTabs.tsx` | New: `YearTabs` pill row + `useResultsYear` hook |
| `components/__tests__/YearTabs.test.tsx` | New |
| `components/WeekList.tsx` | Add `season` prop; fix most-recent match to compare season too |
| `components/PublicMatchList.tsx` | Add `season` prop; same most-recent fix |
| `components/__tests__/resultsYearFilter.test.tsx` | New: list filtering tests |
| `components/ResultsSection.tsx` | Year state, tabs, `showMatchEntry`, `initialYear` |
| `components/__tests__/ResultsSection.yearTabs.test.tsx` | New |
| `components/PublicResultsSection.tsx` | New: public branch client wrapper |
| `components/__tests__/PublicResultsSection.test.tsx` | New |
| `app/[slug]/(tabs)/results/page.tsx` | Read `searchParams.year`, use the two sections |

Run a single test file with: `npx jest <path>` (the `npm test` script adds `NODE_OPTIONS`, which these tests do not need).

---

### Task 1: Year helpers in `lib/utils.ts`

**Files:**
- Modify: `lib/utils.ts` (append after `getHeaderSeason`, around line 619)
- Test: `lib/__tests__/utils.yearTabs.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/utils.yearTabs.test.ts`:

```ts
/**
 * @jest-environment jsdom
 */
import { getSeasons, resolveSelectedYear, getLatestResultWeek, writeYearParam } from '@/lib/utils'
import type { Week } from '@/lib/types'

function makeWeek(overrides: Partial<Week>): Week {
  return {
    season: '2026',
    week: 1,
    date: '01 Jan 2026',
    status: 'played',
    teamA: [],
    teamB: [],
    winner: null,
    ...overrides,
  }
}

describe('getSeasons', () => {
  it('returns distinct seasons newest first', () => {
    const weeks = [
      makeWeek({ season: '2025' }),
      makeWeek({ season: '2026' }),
      makeWeek({ season: '2024' }),
      makeWeek({ season: '2026' }),
    ]
    expect(getSeasons(weeks)).toEqual(['2026', '2025', '2024'])
  })

  it('counts weeks of every status', () => {
    const weeks = [
      makeWeek({ season: '2027', status: 'scheduled' }),
      makeWeek({ season: '2026', status: 'cancelled' }),
      makeWeek({ season: '2025', status: 'unrecorded' }),
    ]
    expect(getSeasons(weeks)).toEqual(['2027', '2026', '2025'])
  })

  it('returns an empty list when there are no weeks', () => {
    expect(getSeasons([])).toEqual([])
  })
})

describe('resolveSelectedYear', () => {
  const seasons = ['2026', '2025', '2024']

  it('uses the param when it is one of the seasons', () => {
    expect(resolveSelectedYear(seasons, '2025')).toBe('2025')
  })

  it('falls back to the newest season for a year the league has no games in', () => {
    expect(resolveSelectedYear(seasons, '2019')).toBe('2026')
  })

  it('falls back to the newest season for a malformed param', () => {
    expect(resolveSelectedYear(seasons, 'abc')).toBe('2026')
  })

  it('falls back to the newest season when the param is missing', () => {
    expect(resolveSelectedYear(seasons, undefined)).toBe('2026')
    expect(resolveSelectedYear(seasons, null)).toBe('2026')
  })

  it('uses the current calendar year when the league has no seasons', () => {
    expect(resolveSelectedYear([], '2025')).toBe(String(new Date().getFullYear()))
  })
})

describe('getLatestResultWeek', () => {
  it('returns the latest played or DNF week by date', () => {
    const weeks = [
      makeWeek({ week: 3, date: '15 Jan 2026', status: 'dnf' }),
      makeWeek({ week: 2, date: '08 Jan 2026', status: 'played' }),
    ]
    expect(getLatestResultWeek(weeks)?.week).toBe(3)
  })

  it('ignores scheduled, cancelled and unrecorded weeks', () => {
    const weeks = [
      makeWeek({ week: 5, date: '29 Jan 2026', status: 'scheduled' }),
      makeWeek({ week: 4, date: '22 Jan 2026', status: 'cancelled' }),
      makeWeek({ week: 3, date: '15 Jan 2026', status: 'unrecorded' }),
      makeWeek({ week: 2, date: '08 Jan 2026', status: 'played' }),
    ]
    expect(getLatestResultWeek(weeks)?.week).toBe(2)
  })

  it('returns null when there is no result', () => {
    expect(getLatestResultWeek([makeWeek({ status: 'scheduled' })])).toBeNull()
  })
})

describe('writeYearParam', () => {
  it('sets ?year for a past year', () => {
    window.history.replaceState(null, '', '/craft-football/results')
    writeYearParam('2025', '2026')
    expect(window.location.pathname).toBe('/craft-football/results')
    expect(window.location.search).toBe('?year=2025')
  })

  it('removes ?year for the default year', () => {
    window.history.replaceState(null, '', '/craft-football/results?year=2025')
    writeYearParam('2026', '2026')
    expect(window.location.search).toBe('')
  })

  it('keeps other query params', () => {
    window.history.replaceState(null, '', '/craft-football/results?foo=1')
    writeYearParam('2025', '2026')
    const params = new URLSearchParams(window.location.search)
    expect(params.get('foo')).toBe('1')
    expect(params.get('year')).toBe('2025')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest lib/__tests__/utils.yearTabs.test.ts`
Expected: FAIL, TypeScript error that `getSeasons` (and the others) are not exported from `@/lib/utils`.

- [ ] **Step 3: Implement the helpers**

Append to `lib/utils.ts`, directly after the `getHeaderSeason` function:

```ts
/** Distinct seasons across all weeks (any status), newest first, e.g. ['2026', '2025']. */
export function getSeasons(weeks: Week[]): string[] {
  return Array.from(new Set(weeks.map((w) => w.season))).sort((a, b) => Number(b) - Number(a))
}

/**
 * Season the Results tab shows: the `?year` param when it is one of the
 * league's seasons, otherwise the newest season (or the current calendar year
 * when the league has no weeks yet).
 */
export function resolveSelectedYear(seasons: string[], param: string | null | undefined): string {
  if (param && seasons.includes(param)) return param
  return seasons[0] ?? String(new Date().getFullYear())
}

/** Latest played or DNF week by date: the result card that opens by default. */
export function getLatestResultWeek(weeks: Week[]): Week | null {
  return sortWeeks(weeks.filter((w) => w.status === 'played' || w.status === 'dnf'))[0] ?? null
}

/**
 * Mirrors the Results year into the URL without a navigation. The default
 * year keeps the URL clean. Client-only.
 */
export function writeYearParam(year: string, defaultYear: string): void {
  const url = new URL(window.location.href)
  if (year === defaultYear) url.searchParams.delete('year')
  else url.searchParams.set('year', year)
  window.history.replaceState(null, '', url)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest lib/__tests__/utils.yearTabs.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.yearTabs.test.ts
git commit -m "Add season helpers for the Results year tabs"
```

---

### Task 2: `YearTabs` component and `useResultsYear` hook

**Files:**
- Create: `components/YearTabs.tsx`
- Test: `components/__tests__/YearTabs.test.tsx`

The hook keeps `picked = null` while the viewer is on the default year, so if a refresh brings in a newer season (an admin schedules the first game of a new year), the default moves with it instead of stranding the viewer on last year with the Next Match card hidden.

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/YearTabs.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react'
import { YearTabs, useResultsYear } from '@/components/YearTabs'
import type { Week } from '@/lib/types'

function makeWeek(season: string, week: number): Week {
  return { id: `${season}-${week}`, season, week, date: `01 Jan ${season}`, status: 'played', teamA: [], teamB: [], winner: null }
}

describe('YearTabs', () => {
  it('renders nothing for a single season', () => {
    const { container } = render(<YearTabs years={['2026']} selected="2026" onSelect={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing for no seasons', () => {
    const { container } = render(<YearTabs years={[]} selected="2026" onSelect={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders one tab per season in the given order and marks the selected one', () => {
    render(<YearTabs years={['2026', '2025', '2024']} selected="2025" onSelect={() => {}} />)
    expect(screen.getByRole('tablist', { name: 'Season' })).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['2026', '2025', '2024'])
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
  })

  it('calls onSelect with the clicked year, but not for the selected one', () => {
    const onSelect = jest.fn()
    render(<YearTabs years={['2026', '2025']} selected="2026" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('tab', { name: '2026' }))
    expect(onSelect).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    expect(onSelect).toHaveBeenCalledWith('2025')
  })
})

describe('useResultsYear', () => {
  beforeEach(() => window.history.replaceState(null, '', '/craft-football/results'))

  const weeks = [makeWeek('2026', 2), makeWeek('2025', 40)]

  it('starts on the initial year and reports whether it is the default', () => {
    const { result } = renderHook(() => useResultsYear(weeks, '2025'))
    expect(result.current.seasons).toEqual(['2026', '2025'])
    expect(result.current.year).toBe('2025')
    expect(result.current.isDefaultYear).toBe(false)
  })

  it('selectYear switches year and writes the URL', () => {
    const { result } = renderHook(() => useResultsYear(weeks, '2026'))
    act(() => result.current.selectYear('2025'))
    expect(result.current.year).toBe('2025')
    expect(window.location.search).toBe('?year=2025')
    act(() => result.current.selectYear('2026'))
    expect(result.current.year).toBe('2026')
    expect(result.current.isDefaultYear).toBe(true)
    expect(window.location.search).toBe('')
  })

  it('follows a new default season when the viewer is on the default year', () => {
    const { result, rerender } = renderHook(({ w }) => useResultsYear(w, '2026'), { initialProps: { w: weeks } })
    rerender({ w: [{ ...makeWeek('2027', 1), status: 'scheduled' }, ...weeks] })
    expect(result.current.year).toBe('2027')
    expect(result.current.isDefaultYear).toBe(true)
  })

  it('stays on a picked past year when a new season appears', () => {
    const { result, rerender } = renderHook(({ w }) => useResultsYear(w, '2025'), { initialProps: { w: weeks } })
    rerender({ w: [makeWeek('2027', 1), ...weeks] })
    expect(result.current.year).toBe('2025')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/YearTabs.test.tsx`
Expected: FAIL, cannot find module `@/components/YearTabs`.

- [ ] **Step 3: Implement the component and hook**

Create `components/YearTabs.tsx`:

```tsx
'use client'

import { useCallback, useState } from 'react'
import { cn, getSeasons, writeYearParam } from '@/lib/utils'
import type { Week } from '@/lib/types'

interface YearTabsProps {
  years: string[] // newest first
  selected: string
  onSelect: (year: string) => void
}

/** Second tab row on Results: one pill per season. Hidden when the league has a single season. */
export function YearTabs({ years, selected, onSelect }: YearTabsProps) {
  if (years.length <= 1) return null

  return (
    <div
      role="tablist"
      aria-label="Season"
      className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {years.map((year) => {
        const active = year === selected
        return (
          <button
            key={year}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) onSelect(year)
            }}
            className={cn(
              'h-8 shrink-0 rounded-full border px-4 font-plex text-[10px] font-bold uppercase tracking-[.14em] transition-colors',
              active
                ? 'border-[#38bdf8]/50 bg-[#38bdf8]/12 text-[#7dd3fc]'
                : 'border-[#1b2c46] bg-[#0a1421] text-[#8ba4c4] hover:border-[#2c4a72] hover:text-[#f4f9ff]'
            )}
          >
            {year}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Selected Results year, mirrored to `?year=`. While the viewer is on the
 * default (newest) season, `picked` stays null so a newer season arriving on
 * refresh becomes the view rather than leaving them on last year.
 */
export function useResultsYear(weeks: Week[], initialYear: string) {
  const seasons = getSeasons(weeks)
  const defaultYear = seasons[0] ?? initialYear
  const [picked, setPicked] = useState<string | null>(initialYear === defaultYear ? null : initialYear)
  const year = picked && seasons.includes(picked) ? picked : defaultYear

  const selectYear = useCallback(
    (next: string) => {
      setPicked(next === defaultYear ? null : next)
      writeYearParam(next, defaultYear)
    },
    [defaultYear]
  )

  return { seasons, year, isDefaultYear: year === defaultYear, selectYear }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/YearTabs.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add components/YearTabs.tsx components/__tests__/YearTabs.test.tsx
git commit -m "Add YearTabs pill row and useResultsYear hook"
```

---

### Task 3: `season` filter on `WeekList` and `PublicMatchList`

**Files:**
- Modify: `components/WeekList.tsx`
- Modify: `components/PublicMatchList.tsx`
- Test: `components/__tests__/resultsYearFilter.test.tsx`

Both lists compare `week.week` to decide "most recent". Week numbers restart each year, so with several seasons in `weeks` a 2025 card can wrongly match the 2026 latest. Compare season too.

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/resultsYearFilter.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render } from '@testing-library/react'
import { WeekList } from '@/components/WeekList'
import { PublicMatchList } from '@/components/PublicMatchList'
import type { Week, WeekStatus } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/MatchCard', () => ({
  MatchCard: ({ week, isOpen, isMostRecent, weeks }: { week: Week; isOpen: boolean; isMostRecent?: boolean; weeks?: Week[] }) => (
    <div
      data-testid={`week-${week.season}-${week.week}`}
      data-open={String(isOpen)}
      data-most-recent={String(!!isMostRecent)}
      data-context-weeks={String(weeks?.length ?? 0)}
    />
  ),
}))

function makeWeek(season: string, week: number, date: string, status: WeekStatus = 'played'): Week {
  return { id: `${season}-${week}`, season, week, date, status, teamA: [], teamB: [], winner: 'teamA' }
}

// Newest first, as the lists receive them. Week 31 exists in both years.
const weeks: Week[] = [
  makeWeek('2026', 32, '08 Oct 2026', 'scheduled'),
  makeWeek('2026', 31, '01 Oct 2026'),
  makeWeek('2026', 30, '24 Sep 2026'),
  makeWeek('2025', 31, '02 Oct 2025'),
  makeWeek('2025', 30, '25 Sep 2025'),
]

function cards(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-testid^="week-"]'))
}
function ids(container: HTMLElement): string[] {
  return cards(container).map((el) => el.getAttribute('data-testid')!)
}
function attr(container: HTMLElement, id: string, name: string) {
  return container.querySelector(`[data-testid="${id}"]`)!.getAttribute(name)
}

describe.each([
  ['WeekList', (props: { weeks: Week[]; season?: string }) => <WeekList {...props} leagueName="L" leagueSlug="l" />],
  ['PublicMatchList', (props: { weeks: Week[]; season?: string }) => <PublicMatchList {...props} leagueName="L" leagueSlug="l" />],
])('%s with a season', (_name, renderList) => {
  it('renders only that season’s weeks', () => {
    const { container } = render(renderList({ weeks, season: '2025' }))
    expect(ids(container)).toEqual(['week-2025-31', 'week-2025-30'])
  })

  it('renders no year divider', () => {
    const { container } = render(renderList({ weeks, season: '2025' }))
    expect(container.textContent).not.toContain('2025')
  })

  it('opens the selected season’s latest result', () => {
    const { container } = render(renderList({ weeks, season: '2025' }))
    expect(attr(container, 'week-2025-31', 'data-open')).toBe('true')
    expect(attr(container, 'week-2025-30', 'data-open')).toBe('false')
  })

  it('keeps the most-recent (share) treatment on the league-wide latest result only', () => {
    const past = render(renderList({ weeks, season: '2025' }))
    expect(attr(past.container, 'week-2025-31', 'data-most-recent')).toBe('false')
    past.unmount()

    const current = render(renderList({ weeks, season: '2026' }))
    expect(attr(current.container, 'week-2026-31', 'data-most-recent')).toBe('true')
  })

  it('passes the full week history to each card', () => {
    const { container } = render(renderList({ weeks, season: '2025' }))
    expect(attr(container, 'week-2025-31', 'data-context-weeks')).toBe(String(weeks.length))
  })

  it('renders every week when no season is given', () => {
    const { container } = render(renderList({ weeks }))
    expect(cards(container)).toHaveLength(weeks.length)
  })

  it('does not mark a same-numbered week from another year as most recent', () => {
    const { container } = render(renderList({ weeks }))
    expect(attr(container, 'week-2026-31', 'data-most-recent')).toBe('true')
    expect(attr(container, 'week-2025-31', 'data-most-recent')).toBe('false')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/resultsYearFilter.test.tsx`
Expected: FAIL. TypeScript rejects the unknown `season` prop, or (if run loosely) the filter, open and most-recent assertions fail.

- [ ] **Step 3: Add `season` to `WeekList`**

In `components/WeekList.tsx`:

Change the utils import line to:

```ts
import { getLatestResultWeek, getMonthKey, formatMonthYear } from '@/lib/utils'
```

Add to `interface Props`, after `linkedPlayerName`:

```ts
  season?: string                           // only render this season's weeks (Results year tabs)
```

Add `season,` to the destructured props after `linkedPlayerName = null,`.

Replace these lines:

```ts
  const recentEligible = sortWeeks(weeks.filter((w) => w.status === 'played' || w.status === 'dnf'))
  const mostRecent = recentEligible[0] ?? null
  const [internalOpenWeek, setInternalOpenWeek] = useState<number | null>(mostRecent?.week ?? null)
```

with:

```ts
  // Cards render for one season when the year tabs are in play; cards still get
  // the full history for share text and edit modals.
  const visibleWeeks = season ? weeks.filter((w) => w.season === season) : weeks
  const mostRecent = getLatestResultWeek(weeks)
  const [internalOpenWeek, setInternalOpenWeek] = useState<number | null>(
    getLatestResultWeek(visibleWeeks)?.week ?? null
  )
```

Replace `if (weeks.length === 0) {` with `if (visibleWeeks.length === 0) {`.

In the JSX, replace the map header and neighbour checks:

```tsx
      {visibleWeeks.map((week, index) => {
        const yearChanged = index > 0 && week.season !== visibleWeeks[index - 1].season
        const monthChanged =
          index > 0 && getMonthKey(week.date) !== getMonthKey(visibleWeeks[index - 1].date)
```

Change the celebration check to use the rendered list:

```tsx
            {celebration && startsCelebratedQuarter(visibleWeeks, index, celebration.quarter) && (
```

Change the `isMostRecent` prop on `MatchCard` to:

```tsx
              isMostRecent={week.season === mostRecent?.season && week.week === mostRecent?.week}
```

Leave `weeks={weeks}` on `MatchCard` unchanged.

- [ ] **Step 4: Add `season` to `PublicMatchList`**

In `components/PublicMatchList.tsx`:

Change the utils import line to:

```ts
import { getLatestResultWeek, getMonthKey, formatMonthYear, getPlayedWeeks, sortWeeks } from '@/lib/utils'
```

Add to `PublicMatchListProps`:

```ts
  season?: string                           // only render this season's weeks (Results year tabs)
```

Change the signature to:

```tsx
export function PublicMatchList({ weeks, celebration = null, leagueName, leagueSlug, season }: PublicMatchListProps) {
```

Replace the body from `const playedWeeks = ...` down to and including the `weeks.length === 0` guard with:

```tsx
  // Cards render for one season when the year tabs are in play; cards still get
  // the full history for share text.
  const visibleWeeks = season ? weeks.filter((w) => w.season === season) : weeks
  const mostRecent = sortWeeks(getPlayedWeeks(visibleWeeks))[0] ?? null
  // Share follows the same rule as WeekList (latest played or DNF week league-wide),
  // but only played cards offer it to guests; the DNF card is unchanged for now.
  const mostRecentResult = getLatestResultWeek(weeks)

  const [openWeek, setOpenWeek] = useState<number | null>(mostRecent?.week ?? null)

  if (visibleWeeks.length === 0) {
    return <p className="text-[#8ba4c4] text-sm">No match data available yet.</p>
  }
```

In the JSX, replace `weeks[0]?.season` in the anchor div with `visibleWeeks[0]?.season`, and replace the map header and neighbour checks:

```tsx
      {visibleWeeks.map((week, index) => {
        const yearChanged =
          index > 0 && week.season !== visibleWeeks[index - 1].season
        const monthChanged =
          index > 0 &&
          getMonthKey(week.date) !== getMonthKey(visibleWeeks[index - 1].date)
```

Change the celebration check to `startsCelebratedQuarter(visibleWeeks, index, celebration.quarter)`.

Change the `isMostRecent` prop to:

```tsx
              isMostRecent={
                week.status === 'played' &&
                week.season === mostRecentResult?.season &&
                week.week === mostRecentResult?.week
              }
```

Leave `weeks={weeks}` on `MatchCard` unchanged.

- [ ] **Step 5: Run the new and existing list tests**

Run: `npx jest components/__tests__/resultsYearFilter.test.tsx components/__tests__/quarterCelebrationPlacement.test.tsx`
Expected: PASS, 14 new tests plus the 4 existing placement tests.

- [ ] **Step 6: Commit**

```bash
git add components/WeekList.tsx components/PublicMatchList.tsx components/__tests__/resultsYearFilter.test.tsx
git commit -m "Let the results lists render a single season"
```

---

### Task 4: Year tabs in `ResultsSection`

**Files:**
- Modify: `components/ResultsSection.tsx` (full rewrite below)
- Test: `components/__tests__/ResultsSection.yearTabs.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/ResultsSection.yearTabs.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { ResultsSection } from '@/components/ResultsSection'
import type { Week, WeekStatus } from '@/lib/types'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock('@/components/NextMatchCard', () => ({
  NextMatchCard: () => <div data-testid="next-match" />,
}))
jest.mock('@/components/MatchCard', () => ({
  MatchCard: ({ week, isOpen }: { week: Week; isOpen: boolean }) => (
    <div data-testid={`week-${week.season}-${week.week}`} data-open={String(isOpen)} />
  ),
}))

function makeWeek(season: string, week: number, date: string, status: WeekStatus = 'played'): Week {
  return { id: `${season}-${week}`, season, week, date, status, teamA: [], teamB: [], winner: 'teamA' }
}

const weeks: Week[] = [
  makeWeek('2026', 2, '08 Jan 2026'),
  makeWeek('2026', 1, '01 Jan 2026'),
  makeWeek('2025', 40, '02 Oct 2025'),
  makeWeek('2025', 39, '25 Sep 2025'),
]

function renderSection(props: Partial<React.ComponentProps<typeof ResultsSection>> = {}) {
  return render(
    <ResultsSection
      gameId="g1"
      leagueSlug="craft-football"
      weeks={weeks}
      goalkeepers={[]}
      initialScheduledWeek={null}
      canAutoPick={true}
      allPlayers={[]}
      showMatchHistory={true}
      initialYear="2026"
      {...props}
    />
  )
}

function ids(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid^="week-"]')).map((el) => el.getAttribute('data-testid')!)
}

beforeEach(() => window.history.replaceState(null, '', '/craft-football/results'))

describe('ResultsSection year tabs', () => {
  it('shows the tabs, the next match and the current year’s results by default', () => {
    const { container } = renderSection()
    expect(screen.getByRole('tab', { name: '2026' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('next-match')).toBeInTheDocument()
    expect(ids(container)).toEqual(['week-2026-2', 'week-2026-1'])
  })

  it('switching to a past year hides the next match, filters the list and opens that year’s latest result', () => {
    const { container } = renderSection()
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    expect(screen.queryByTestId('next-match')).not.toBeInTheDocument()
    expect(ids(container)).toEqual(['week-2025-40', 'week-2025-39'])
    expect(container.querySelector('[data-testid="week-2025-40"]')).toHaveAttribute('data-open', 'true')
    expect(window.location.search).toBe('?year=2025')
  })

  it('switching back to the current year restores the next match and clears the param', () => {
    renderSection()
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    fireEvent.click(screen.getByRole('tab', { name: '2026' }))
    expect(screen.getByTestId('next-match')).toBeInTheDocument()
    expect(window.location.search).toBe('')
  })

  it('starts on a past year when initialYear says so', () => {
    const { container } = renderSection({ initialYear: '2025' })
    expect(screen.queryByTestId('next-match')).not.toBeInTheDocument()
    expect(ids(container)).toEqual(['week-2025-40', 'week-2025-39'])
    expect(container.querySelector('[data-testid="week-2025-40"]')).toHaveAttribute('data-open', 'true')
  })

  it('hides the next match when match entry is off', () => {
    renderSection({ showMatchEntry: false })
    expect(screen.queryByTestId('next-match')).not.toBeInTheDocument()
  })

  it('renders no tabs for a single-season league', () => {
    renderSection({ weeks: weeks.filter((w) => w.season === '2026') })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('renders no tabs when match history is hidden', () => {
    renderSection({ showMatchHistory: false })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/ResultsSection.yearTabs.test.tsx`
Expected: FAIL, TypeScript error that `initialYear` is not a prop of `ResultsSection`.

- [ ] **Step 3: Rewrite `ResultsSection`**

Replace the contents of `components/ResultsSection.tsx` with:

```tsx
'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getLatestResultWeek } from '@/lib/utils'
import { NextMatchCard } from '@/components/NextMatchCard'
import { WeekList } from '@/components/WeekList'
import { YearTabs, useResultsYear } from '@/components/YearTabs'
import type { Player, ScheduledWeek, Week } from '@/lib/types'
import type { ResultsCelebration } from '@/lib/sidebar-stats'

interface Props {
  gameId: string
  leagueSlug: string
  weeks: Week[]
  goalkeepers: string[]
  initialScheduledWeek: ScheduledWeek | null
  canAutoPick: boolean
  allPlayers: Player[]
  showMatchHistory: boolean
  initialYear: string               // season to show first, resolved from ?year= on the server
  showMatchEntry?: boolean          // false for members who can see results but not enter them
  leagueDayIndex?: number
  isAdmin?: boolean
  leagueName?: string
  celebration?: ResultsCelebration | null
  linkedPlayerName?: string | null
}

/** Latest result in one season, the card that opens when that season is shown. */
function latestResultIn(weeks: Week[], season: string): number | null {
  return getLatestResultWeek(weeks.filter((w) => w.season === season))?.week ?? null
}

export function ResultsSection({
  gameId,
  leagueSlug,
  weeks,
  goalkeepers,
  initialScheduledWeek,
  canAutoPick,
  allPlayers,
  showMatchHistory,
  initialYear,
  showMatchEntry = true,
  leagueDayIndex,
  isAdmin = false,
  leagueName,
  celebration = null,
  linkedPlayerName = null,
}: Props) {
  const router = useRouter()
  const { seasons, year, isDefaultYear, selectYear } = useResultsYear(weeks, initialYear)

  const [openWeek, setOpenWeek] = useState<number | null>(() => latestResultIn(weeks, year))

  const handleYearSelect = useCallback(
    (next: string) => {
      selectYear(next)
      setOpenWeek(latestResultIn(weeks, next))
    },
    [selectYear, weeks]
  )

  const handleBuildStart = useCallback(() => {
    setOpenWeek(null)
  }, [])

  return (
    <div className="flex flex-col gap-3">
      {showMatchHistory && <YearTabs years={seasons} selected={year} onSelect={handleYearSelect} />}
      {showMatchEntry && isDefaultYear && (
        <NextMatchCard
          gameId={gameId}
          leagueSlug={leagueSlug}
          weeks={weeks}
          initialScheduledWeek={initialScheduledWeek}
          onResultSaved={() => router.refresh()}
          canEdit={true}
          canAutoPick={canAutoPick}
          allPlayers={allPlayers}
          onBuildStart={handleBuildStart}
          leagueDayIndex={leagueDayIndex}
          leagueName={leagueName}
        />
      )}
      {showMatchHistory && weeks.length > 0 && (
        <WeekList
          weeks={weeks}
          season={year}
          goalkeepers={goalkeepers}
          openWeek={openWeek}
          onOpenWeekChange={setOpenWeek}
          isAdmin={isAdmin}
          gameId={gameId}
          leagueSlug={leagueSlug}
          allPlayers={allPlayers}
          onResultSaved={() => router.refresh()}
          leagueName={leagueName}
          celebration={celebration}
          linkedPlayerName={linkedPlayerName}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/ResultsSection.yearTabs.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add components/ResultsSection.tsx components/__tests__/ResultsSection.yearTabs.test.tsx
git commit -m "Add year tabs to the member results section"
```

---

### Task 5: `PublicResultsSection`

**Files:**
- Create: `components/PublicResultsSection.tsx`
- Test: `components/__tests__/PublicResultsSection.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/PublicResultsSection.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { PublicResultsSection } from '@/components/PublicResultsSection'
import type { ScheduledWeek, Week } from '@/lib/types'

jest.mock('@/components/PublicMatchEntrySection', () => ({
  PublicMatchEntrySection: () => <div data-testid="next-match" />,
}))
jest.mock('@/components/MatchCard', () => ({
  MatchCard: ({ week, isOpen }: { week: Week; isOpen: boolean }) => (
    <div data-testid={`week-${week.season}-${week.week}`} data-open={String(isOpen)} />
  ),
}))

function makeWeek(season: string, week: number, date: string): Week {
  return { id: `${season}-${week}`, season, week, date, status: 'played', teamA: [], teamB: [], winner: 'teamA' }
}

const weeks: Week[] = [
  makeWeek('2026', 2, '08 Jan 2026'),
  makeWeek('2025', 40, '02 Oct 2025'),
  makeWeek('2025', 39, '25 Sep 2025'),
]

const nextWeek = { id: 'n', season: '2026', week: 3, date: '15 Jan 2026', status: 'scheduled' } as ScheduledWeek

function renderSection(props: Partial<React.ComponentProps<typeof PublicResultsSection>> = {}) {
  return render(
    <PublicResultsSection
      gameId="g1"
      leagueSlug="craft-football"
      leagueName="Craft Football"
      weeks={weeks}
      nextWeek={nextWeek}
      canEditMatchEntry={false}
      showMatchHistory={true}
      celebration={null}
      initialYear="2026"
      {...props}
    />
  )
}

function ids(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-testid^="week-"]')).map((el) => el.getAttribute('data-testid')!)
}

beforeEach(() => window.history.replaceState(null, '', '/craft-football/results'))

describe('PublicResultsSection', () => {
  it('shows the next match and current year by default', () => {
    const { container } = renderSection()
    expect(screen.getByTestId('next-match')).toBeInTheDocument()
    expect(ids(container)).toEqual(['week-2026-2'])
  })

  it('switching to a past year hides the next match and opens that year’s latest result', () => {
    const { container } = renderSection()
    fireEvent.click(screen.getByRole('tab', { name: '2025' }))
    expect(screen.queryByTestId('next-match')).not.toBeInTheDocument()
    expect(ids(container)).toEqual(['week-2025-40', 'week-2025-39'])
    expect(container.querySelector('[data-testid="week-2025-40"]')).toHaveAttribute('data-open', 'true')
    expect(window.location.search).toBe('?year=2025')
  })

  it('shows no next match when there is no upcoming week', () => {
    renderSection({ nextWeek: null })
    expect(screen.queryByTestId('next-match')).not.toBeInTheDocument()
  })

  it('shows neither tabs nor results when match history is hidden', () => {
    const { container } = renderSection({ showMatchHistory: false })
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(ids(container)).toEqual([])
    expect(screen.getByTestId('next-match')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest components/__tests__/PublicResultsSection.test.tsx`
Expected: FAIL, cannot find module `@/components/PublicResultsSection`.

- [ ] **Step 3: Implement the component**

Create `components/PublicResultsSection.tsx`:

```tsx
'use client'

import { PublicMatchEntrySection } from '@/components/PublicMatchEntrySection'
import { PublicMatchList } from '@/components/PublicMatchList'
import { YearTabs, useResultsYear } from '@/components/YearTabs'
import type { ResultsCelebration } from '@/lib/sidebar-stats'
import type { ScheduledWeek, Week } from '@/lib/types'

interface Props {
  gameId: string
  leagueSlug: string
  leagueName: string
  weeks: Week[]
  nextWeek: ScheduledWeek | null
  canEditMatchEntry: boolean
  showMatchHistory: boolean
  celebration: ResultsCelebration | null
  initialYear: string // season to show first, resolved from ?year= on the server
}

/** Public results: year tabs, the next match on the current year, then the selected year's results. */
export function PublicResultsSection({
  gameId,
  leagueSlug,
  leagueName,
  weeks,
  nextWeek,
  canEditMatchEntry,
  showMatchHistory,
  celebration,
  initialYear,
}: Props) {
  const { seasons, year, isDefaultYear, selectYear } = useResultsYear(weeks, initialYear)

  return (
    <>
      {showMatchHistory && <YearTabs years={seasons} selected={year} onSelect={selectYear} />}
      {nextWeek && isDefaultYear && (
        <PublicMatchEntrySection
          gameId={gameId}
          leagueSlug={leagueSlug}
          weeks={weeks}
          initialScheduledWeek={nextWeek}
          canEdit={canEditMatchEntry}
          leagueName={leagueName}
        />
      )}
      {showMatchHistory && (
        <section>
          {/* Keyed by year so the open card resets to that year's latest result. */}
          <PublicMatchList
            key={year}
            weeks={weeks}
            season={year}
            celebration={celebration}
            leagueName={leagueName}
            leagueSlug={leagueSlug}
          />
        </section>
      )}
    </>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest components/__tests__/PublicResultsSection.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add components/PublicResultsSection.tsx components/__tests__/PublicResultsSection.test.tsx
git commit -m "Add PublicResultsSection with year tabs"
```

---

### Task 6: Wire the results page

**Files:**
- Modify: `app/[slug]/(tabs)/results/page.tsx`

- [ ] **Step 1: Update imports**

Change the utils import to:

```ts
import { dayNameToIndex, getSeasons, isPastDeadline, parseWeekDate, resolveSelectedYear } from '@/lib/utils'
```

Remove these imports (no longer used in the page):

```ts
import { PublicMatchEntrySection } from '@/components/PublicMatchEntrySection'
import { PublicMatchList } from '@/components/PublicMatchList'
import { WeekList } from '@/components/WeekList'
```

Add:

```ts
import { PublicResultsSection } from '@/components/PublicResultsSection'
```

- [ ] **Step 2: Read `searchParams`**

Replace the `Props` interface and the first line of the component:

```ts
interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ year?: string | string[] }>
}

export default async function LeagueResultsPage({ params, searchParams }: Props) {
  const [{ slug }, { year: yearParam }] = await Promise.all([params, searchParams])
```

- [ ] **Step 3: Resolve the initial year**

Directly after the `const weeks: Week[] = ...` statement, add:

```ts
  // Year tabs: ?year= when it is one of the league's seasons, else the newest.
  const initialYear = resolveSelectedYear(
    getSeasons(weeks),
    typeof yearParam === 'string' ? yearParam : undefined
  )
```

- [ ] **Step 4: Replace the public branch body**

Replace the public tier's inner `<div className="flex flex-col gap-3">…</div>` with:

```tsx
        <div className="flex flex-col gap-3">
          <PublicResultsSection
            gameId={leagueId}
            leagueSlug={slug}
            leagueName={game.name}
            weeks={weeks}
            nextWeek={nextWeek}
            canEditMatchEntry={canSeeMatchEntry}
            showMatchHistory={canSeeMatchHistory}
            celebration={celebration}
            initialYear={initialYear}
          />
          {!isAuthenticated && (
            <p className="pt-2 font-plex text-[9px] uppercase tracking-[.14em] text-[#4f688a] text-center">
              Sign in for full access to your league.
            </p>
          )}
        </div>
```

- [ ] **Step 5: Replace the member/admin branch body**

Replace the member tier's inner `<div className="flex flex-col gap-3">…</div>` (the `canSeeMatchEntry ? <ResultsSection> : canSeeMatchHistory ? <WeekList> : …` ternary) with:

```tsx
      <div className="flex flex-col gap-3">
        {canSeeMatchEntry || canSeeMatchHistory ? (
          <ResultsSection
            gameId={leagueId}
            leagueSlug={game.slug}
            weeks={weeks}
            goalkeepers={goalkeepers}
            initialScheduledWeek={nextWeek}
            canAutoPick={true}
            allPlayers={players}
            showMatchHistory={canSeeMatchHistory}
            showMatchEntry={canSeeMatchEntry}
            initialYear={initialYear}
            leagueDayIndex={leagueDayIndex}
            isAdmin={isAdmin}
            leagueName={game.name}
            celebration={celebration}
            linkedPlayerName={claim.playerName}
          />
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm text-[#6f88a8]">Nothing to show here yet.</p>
          </div>
        )}
      </div>
```

Note: members who can see results but not enter them now also get the quarter champion card, which the old direct `WeekList` call omitted.

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/[slug]/(tabs)/results/page.tsx"
git commit -m "Show year tabs on the Results page"
```

---

### Task 7: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Manual check in the browser**

`.env.local` points at production Supabase. Browse **signed out** and do not save anything.

Run `npm run dev`, then open `http://localhost:3000/craft-football/results`:

- Year pills appear under the tab bar, newest first, current year selected, Next Match card visible above results.
- Clicking a past year: Next Match card disappears, only that year's cards show, its latest result is open, the URL becomes `?year=YYYY`, no year divider in the list.
- Refresh on `?year=YYYY`: the same year is still selected.
- Clicking the current year: the URL loses `?year`.
- `?year=1999` falls back to the current year.
- At a phone width (390px) the pill row fits or scrolls horizontally with no visible scrollbar.

Save a screenshot to `.context/year-tabs-results.png`.

- [ ] **Step 4: Commit any fixes**, then hand off with superpowers:finishing-a-development-branch.
