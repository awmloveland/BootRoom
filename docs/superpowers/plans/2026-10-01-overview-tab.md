# Overview Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Overview tab, visible below `lg`, that is the league landing page on small screens and stacks next game, your stats, last result plus league table, most in form and head to head.

**Architecture:** A new server route `app/[slug]/(tabs)/overview` reuses the request-cached fetchers the tabs layout already calls. Stats cards are pure presentational components fed by small new helpers in `lib/sidebar-stats.ts`; table rows, progress line and champion box are extracted from `StatsSidebar` so both views share them. The next game card is a `variant="overview"` of the existing `NextMatchCard`, which keeps the state machine, handlers and modals and delegates the idle and lineup looks to two new presentational components. The league root picks the landing tab by user agent, with a client guard on `/overview` for large screens.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4 utilities, Supabase JS, lucide-react, Jest with ts-jest and Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-01-overview-tab-design.md`

**Visual source of truth:** `.context/overview-design/design_handoff_overview_tab/README.md` (gitignored, already unzipped in this workspace). Every size, colour and string in the code below was taken from it.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `lib/utils.ts` | Modify | `ordinalSuffix`, `leagueLandingPath`, `formatFixtureDate`, `getNextMatchSeed`, `getOverviewViewerCard` |
| `lib/__tests__/utils.overview.test.ts` | Create | Tests for the helpers above |
| `lib/sidebar-stats.ts` | Modify | Extra fields on `computeQuarterlyTable`; `getQuarterStanding`; `getLastResult` |
| `lib/__tests__/sidebar-stats.overview.test.ts` | Create | Tests for the above |
| `lib/fetchers.ts` | Modify | `ensureUnrecordedWeek` |
| `lib/__tests__/fetchers.test.ts` | Modify | Tests for `ensureUnrecordedWeek` |
| `app/[slug]/(tabs)/results/page.tsx` | Modify | Use `ensureUnrecordedWeek` |
| `components/QuarterTable.tsx` | Create | Shared table column labels, rows, progress line, champion box |
| `components/StatsSidebar.tsx` | Modify | Use the shared pieces; export `InFormWidget`, `TeamABWidget` and shell helpers; `size` and Overview extras |
| `__tests__/stats-sidebar.test.tsx` | Create | Characterisation tests for the sidebar, tests for the new extras |
| `components/overview/OverviewTableCard.tsx` | Create | Card 3: last result strip, league table, champion |
| `components/overview/OverviewYourStats.tsx` | Create | Card 2: your stats |
| `components/overview/OverviewPromptCards.tsx` | Create | Card 2: sign-in and link profile prompts |
| `components/overview/NextGameCard.tsx` | Create | `NextGameIdle`, `NextGameLineup` (presentational) |
| `components/overview/OverviewNextGame.tsx` | Create | Client wrapper that wires `NextMatchCard` for the Overview page |
| `components/overview/OverviewDesktopRedirect.tsx` | Create | Sends large screens from `/overview` to `/results` |
| `components/NextMatchCard.tsx` | Modify | `variant`, `overview` props, server seed |
| `__tests__/overview-*.test.tsx` | Create | Component tests for the files above |
| `components/LeagueTabNav.tsx` | Modify | Overview tab, first, `lg:hidden` |
| `components/MobileStatsFAB.tsx` | Modify | Hidden on the `overview` segment |
| `__tests__/league-tab-skeleton.test.tsx` | Modify | Expect the Overview link |
| `app/[slug]/(tabs)/overview/page.tsx`, `loading.tsx` | Create | The route |
| `app/[slug]/page.tsx` | Modify | Landing rule |
| `app/page.tsx`, `app/app/league/[id]/page.tsx`, `app/results/[id]/page.tsx`, `app/invite/page.tsx`, `components/ui/navbar.tsx` | Modify | Enter leagues through the league root |

## Notes for the implementer

- This repo is on **Next.js 16** and **Tailwind v4**, not 14 and v3 as `CLAUDE.md` says. `proxy.ts` is the middleware. Do not create `middleware.ts`.
- **No feature flag** for this feature. That is a decision recorded in the spec; do not add a `FeatureKey` or a migration.
- All styling is Tailwind utilities with arbitrary hex values. Conditional classes go through `cn()`. Write every class as a full literal string so Tailwind's scanner sees it.
- Labels are written in normal case in JSX and uppercased with the `uppercase` class. Tests match the normal-case text.
- British English. No em dashes in UI copy.
- Run one test file with: `NODE_OPTIONS=--experimental-vm-modules npx jest <path>`
- **Baseline before this work:** `npm test` has 3 failing tests in 2 suites (`lib/__tests__/utils.winCopy.test.ts`, `lib/__tests__/email.notifications.test.ts`). `npm run lint` reports 9 errors and 6 warnings. `npx tsc --noEmit` is clean. Do not fix the pre-existing failures; do not add new ones.
- ts-jest runs with `isolatedModules`, so tests are not type-checked. `npx tsc --noEmit` does not cover test files either. Keep fixtures typed anyway.
- Commit messages in this repo are plain imperative sentences (see `git log`). End each with the trailer shown in the commit steps.
- Never use bare `git stash` in this worktree.

---

### Task 1: Pure helpers in `lib/utils.ts`

**Files:**
- Modify: `lib/utils.ts`
- Test: `lib/__tests__/utils.overview.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/utils.overview.test.ts`:

```ts
import {
  ordinalSuffix,
  leagueLandingPath,
  formatFixtureDate,
  getNextMatchSeed,
  getOverviewViewerCard,
} from '@/lib/utils'
import type { Week } from '@/lib/types'

describe('ordinalSuffix', () => {
  it.each([
    [1, 'st'], [2, 'nd'], [3, 'rd'], [4, 'th'],
    [11, 'th'], [12, 'th'], [13, 'th'],
    [21, 'st'], [22, 'nd'], [23, 'rd'], [101, 'st'], [111, 'th'],
  ])('%i → %s', (n, suffix) => {
    expect(ordinalSuffix(n)).toBe(suffix)
  })
})

describe('leagueLandingPath', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  const ANDROID_PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
  const ANDROID_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  // iPadOS Safari sends a desktop user agent by default.
  const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'

  it('sends phones to Overview', () => {
    expect(leagueLandingPath('the-boot-room', IPHONE)).toBe('/the-boot-room/overview')
    expect(leagueLandingPath('the-boot-room', ANDROID_PHONE)).toBe('/the-boot-room/overview')
  })

  it('sends Android tablets to Overview', () => {
    expect(leagueLandingPath('the-boot-room', ANDROID_TABLET)).toBe('/the-boot-room/overview')
  })

  it('sends desktops and iPads to Results', () => {
    expect(leagueLandingPath('the-boot-room', DESKTOP)).toBe('/the-boot-room/results')
    expect(leagueLandingPath('the-boot-room', IPAD)).toBe('/the-boot-room/results')
  })

  it('falls back to Results with no user agent', () => {
    expect(leagueLandingPath('the-boot-room', null)).toBe('/the-boot-room/results')
    expect(leagueLandingPath('the-boot-room', '')).toBe('/the-boot-room/results')
  })
})

describe('formatFixtureDate', () => {
  it('formats a week date as weekday, day and month', () => {
    expect(formatFixtureDate('09 Apr 2026')).toBe('Thu 09 Apr')
  })

  it('pads a single-digit day', () => {
    expect(formatFixtureDate('2 Apr 2026')).toBe('Thu 02 Apr')
  })
})

describe('getNextMatchSeed', () => {
  function week(overrides: Partial<Week> & { week: number; date: string; status: Week['status'] }): Week {
    return { id: `id-${overrides.week}`, season: '2026', teamA: [], teamB: [], winner: null, ...overrides }
  }

  // Monday 6 Apr 2026, midday. Thursday 9 Apr is upcoming; Thursday 2 Apr is past its 20:00 deadline.
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date(2026, 3, 6, 12)) })
  afterEach(() => { jest.useRealTimers() })

  it('returns an upcoming scheduled week as a ScheduledWeek', () => {
    const weeks = [
      week({ week: 14, date: '02 Apr 2026', status: 'played', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      week({ week: 15, date: '09 Apr 2026', status: 'scheduled', format: '5-a-side', teamA: ['Alice'], teamB: ['Bob'], team_a_rating: 1.5, team_b_rating: 1.4 }),
    ]
    expect(getNextMatchSeed(weeks)).toEqual({
      id: 'id-15',
      season: '2026',
      week: 15,
      date: '09 Apr 2026',
      format: '5-a-side',
      teamA: ['Alice'],
      teamB: ['Bob'],
      status: 'scheduled',
      lineupMetadata: null,
      team_a_rating: 1.5,
      team_b_rating: 1.4,
    })
  })

  it('returns an upcoming cancelled week', () => {
    const seed = getNextMatchSeed([week({ week: 15, date: '09 Apr 2026', status: 'cancelled' })])
    expect(seed).toMatchObject({ id: 'id-15', status: 'cancelled', format: null })
  })

  it('returns null when the latest row is unrecorded', () => {
    expect(getNextMatchSeed([week({ week: 14, date: '02 Apr 2026', status: 'unrecorded' })])).toBeNull()
  })

  it('returns null when the scheduled week is past its deadline', () => {
    expect(getNextMatchSeed([week({ week: 14, date: '02 Apr 2026', status: 'scheduled', teamA: ['Alice'], teamB: ['Bob'] })])).toBeNull()
  })

  it('uses the latest-dated row, not an older unrecorded one', () => {
    const weeks = [
      week({ week: 14, date: '02 Apr 2026', status: 'unrecorded' }),
      week({ week: 15, date: '09 Apr 2026', status: 'scheduled', teamA: ['Alice'], teamB: ['Bob'] }),
    ]
    expect(getNextMatchSeed(weeks)?.week).toBe(15)
  })

  it('returns null when there is nothing scheduled, cancelled or unrecorded', () => {
    expect(getNextMatchSeed([week({ week: 14, date: '02 Apr 2026', status: 'played', winner: 'draw' })])).toBeNull()
    expect(getNextMatchSeed([])).toBeNull()
  })
})

describe('getOverviewViewerCard', () => {
  const base = { isAuthenticated: true, tier: 'member' as const, claimStatus: 'none' as const, hasLinkedPlayer: false }

  it('asks a signed-out visitor to sign in', () => {
    expect(getOverviewViewerCard({ ...base, isAuthenticated: false, tier: 'public' })).toBe('sign-in')
  })

  it('shows nothing to a signed-in non-member', () => {
    expect(getOverviewViewerCard({ ...base, tier: 'public' })).toBeNull()
  })

  it('asks a member with no claim to link a profile', () => {
    expect(getOverviewViewerCard(base)).toBe('link-profile')
  })

  it('shows stats to a member or admin with a linked player', () => {
    expect(getOverviewViewerCard({ ...base, claimStatus: 'approved', hasLinkedPlayer: true })).toBe('your-stats')
    expect(getOverviewViewerCard({ ...base, tier: 'admin', claimStatus: 'approved', hasLinkedPlayer: true })).toBe('your-stats')
  })

  it('shows nothing while a claim is pending or after it is rejected', () => {
    expect(getOverviewViewerCard({ ...base, claimStatus: 'pending' })).toBeNull()
    expect(getOverviewViewerCard({ ...base, claimStatus: 'rejected' })).toBeNull()
  })

  it('shows nothing to an admin with no claim', () => {
    expect(getOverviewViewerCard({ ...base, tier: 'admin' })).toBeNull()
  })

  it('shows nothing when the claim is approved but the player is not in the stats list', () => {
    expect(getOverviewViewerCard({ ...base, claimStatus: 'approved', hasLinkedPlayer: false })).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest lib/__tests__/utils.overview.test.ts`
Expected: FAIL. Every test errors with `... is not a function` because the helpers do not exist yet.

- [ ] **Step 3: Implement the helpers**

In `lib/utils.ts`, change the type import on line 3 and add one below it:

```ts
import { LeagueDetails, Player, PlayerClaimStatus, ScheduledWeek, Strength, Week, Winner, YearStats } from './types'
import type { VisibilityTier } from './roles'
```

Replace the existing private `ordinal` function (near line 646) with:

```ts
/** 'st' | 'nd' | 'rd' | 'th' for a positive integer. */
export function ordinalSuffix(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return 'th'
  switch (n % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

function ordinal(n: number): string {
  return `${n}${ordinalSuffix(n)}`
}
```

Add directly after `isPastDeadline`. `DAY_SHORT` already exists in this file (used by the share text builders); reuse it, do not redeclare it:

```ts
/** 'DD MMM YYYY' → 'Thu 09 Apr', for fixture lines. */
export function formatFixtureDate(date: string): string {
  const [day, month] = date.split(' ')
  return `${DAY_SHORT[parseWeekDate(date).getDay()]} ${day.padStart(2, '0')} ${month}`
}

/**
 * The week the next match card should start from, derived on the server so the
 * Overview tab can render the card in its first paint.
 *
 * Takes the latest-dated row that is scheduled, cancelled or unrecorded:
 *   - unrecorded, or past the 20:00 deadline → null (the card is idle)
 *   - otherwise → that row as a ScheduledWeek
 */
export function getNextMatchSeed(weeks: Week[]): ScheduledWeek | null {
  const latest = sortWeeks(
    weeks.filter((w) => w.status === 'scheduled' || w.status === 'cancelled' || w.status === 'unrecorded')
  )[0]
  if (!latest || !latest.id) return null
  if (latest.status === 'unrecorded') return null
  if (isPastDeadline(latest.date)) return null
  return {
    id: latest.id,
    season: latest.season,
    week: latest.week,
    date: latest.date,
    format: latest.format ?? null,
    teamA: latest.teamA,
    teamB: latest.teamB,
    status: latest.status === 'cancelled' ? 'cancelled' : 'scheduled',
    lineupMetadata: latest.lineupMetadata ?? null,
    team_a_rating: latest.team_a_rating ?? null,
    team_b_rating: latest.team_b_rating ?? null,
  }
}

/**
 * Where a visitor lands when they open a league. Phones and Android tablets get
 * the Overview tab (hidden at lg and above); everything else gets Results.
 * iPadOS Safari sends a desktop user agent, so iPads land on Results.
 */
export function leagueLandingPath(slug: string, userAgent: string | null | undefined): string {
  const smallScreen = /Mobi|Android/i.test(userAgent ?? '')
  return `/${slug}/${smallScreen ? 'overview' : 'results'}`
}

export type OverviewViewerCard = 'sign-in' | 'link-profile' | 'your-stats' | null

/** Which card sits second on the Overview tab for this viewer. */
export function getOverviewViewerCard(viewer: {
  isAuthenticated: boolean
  tier: VisibilityTier
  claimStatus: PlayerClaimStatus | 'none'
  /** Claim approved and the player exists in the stats list. */
  hasLinkedPlayer: boolean
}): OverviewViewerCard {
  if (!viewer.isAuthenticated) return 'sign-in'
  if (viewer.tier === 'public') return null
  if (viewer.hasLinkedPlayer) return 'your-stats'
  if (viewer.tier === 'member' && viewer.claimStatus === 'none') return 'link-profile'
  return null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest lib/__tests__/utils.overview.test.ts`
Expected: PASS, all tests.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.overview.test.ts
git commit -m "Add Overview tab helpers for landing, next match seed and viewer card" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Standings and last result in `lib/sidebar-stats.ts`

**Files:**
- Modify: `lib/sidebar-stats.ts`
- Test: `lib/__tests__/sidebar-stats.overview.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/sidebar-stats.overview.test.ts`:

```ts
import { computeQuarterlyTable, getQuarterStanding, getLastResult, type QuarterlyEntry } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'

function played(week: number, date: string, teamA: string[], teamB: string[], winner: Week['winner'] = 'teamA'): Week {
  return { id: `id-${week}`, season: date.slice(-4), week, date, status: 'played', teamA, teamB, winner }
}

function entry(name: string, points: number, won: number): QuarterlyEntry {
  return { name, played: 5, won, drew: 0, lost: 0, points }
}

describe('computeQuarterlyTable: Overview fields', () => {
  const MID_Q2 = new Date(2026, 4, 15) // 15 May 2026

  it('keeps the top 10 in entries and the full table in allEntries', () => {
    const teamA = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']
    const teamB = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']
    const result = computeQuarterlyTable([played(18, '07 May 2026', teamA, teamB)], MID_Q2, 4)
    expect(result.entries).toHaveLength(10)
    expect(result.allEntries).toHaveLength(12)
    expect(result.allEntries.slice(0, 10)).toEqual(result.entries)
  })

  it('reports the displayed quarter as numbers', () => {
    const result = computeQuarterlyTable([played(18, '07 May 2026', ['Alice'], ['Bob'])], MID_Q2, 4)
    expect(result.displayQ).toBe(2)
    expect(result.displayYear).toBe(2026)
  })

  it('reports the held-over quarter when the current one has no games', () => {
    const result = computeQuarterlyTable([played(18, '07 May 2026', ['Alice'], ['Bob'])], new Date(2026, 6, 2), 4)
    expect(result.isHoldover).toBe(true)
    expect(result.displayQ).toBe(2)
    expect(result.displayYear).toBe(2026)
  })

  it('holds over across a year boundary', () => {
    const result = computeQuarterlyTable([played(50, '10 Dec 2026', ['Alice'], ['Bob'])], new Date(2027, 0, 5), 4)
    expect(result.displayQ).toBe(4)
    expect(result.displayYear).toBe(2026)
  })

  it('reports the previous champion with points and quarter', () => {
    const weeks = [
      played(6, '12 Feb 2026', ['Alice', 'Bob'], ['Charlie', 'Dave']),
      played(18, '07 May 2026', ['Alice', 'Bob'], ['Charlie', 'Dave'], 'teamB'),
    ]
    const result = computeQuarterlyTable(weeks, MID_Q2, 4)
    expect(result.lastChampion).toBe('Alice')
    expect(result.lastChampionPoints).toBe(3)
    expect(result.lastQ).toBe(1)
    expect(result.lastYear).toBe(2026)
  })

  it('reports no previous champion when the previous quarter has no games', () => {
    const result = computeQuarterlyTable([played(18, '07 May 2026', ['Alice'], ['Bob'])], MID_Q2, 4)
    expect(result.lastChampion).toBeNull()
    expect(result.lastChampionPoints).toBeNull()
    expect(result.lastQ).toBeNull()
    expect(result.lastYear).toBeNull()
  })
})

describe('getQuarterStanding', () => {
  it('ranks a clear leader first, not joint', () => {
    const table = [entry('Alice', 9, 3), entry('Bob', 6, 2)]
    expect(getQuarterStanding(table, 'Alice')).toEqual({ rank: 1, position: 1, jointTop: false, entry: table[0] })
    expect(getQuarterStanding(table, 'Bob')).toEqual({ rank: 2, position: 2, jointTop: false, entry: table[1] })
  })

  it('gives players level on points and wins a shared first place', () => {
    const table = [entry('Alice', 3, 1), entry('Bob', 3, 1), entry('Charlie', 0, 0)]
    expect(getQuarterStanding(table, 'Alice')).toMatchObject({ rank: 1, position: 1, jointTop: true })
    expect(getQuarterStanding(table, 'Bob')).toMatchObject({ rank: 2, position: 1, jointTop: true })
    expect(getQuarterStanding(table, 'Charlie')).toMatchObject({ rank: 3, position: 3, jointTop: false })
  })

  it('shares a position below first without calling it joint top', () => {
    const table = [entry('Alice', 9, 3), entry('Bob', 6, 2), entry('Charlie', 6, 2)]
    expect(getQuarterStanding(table, 'Charlie')).toMatchObject({ rank: 3, position: 2, jointTop: false })
  })

  it('separates players level on points by wins', () => {
    const table = [entry('Alice', 9, 3), entry('Bob', 9, 2)]
    expect(getQuarterStanding(table, 'Alice')).toMatchObject({ position: 1, jointTop: false })
    expect(getQuarterStanding(table, 'Bob')).toMatchObject({ position: 2, jointTop: false })
  })

  it('finds a player ranked below the top 10', () => {
    const table = Array.from({ length: 12 }, (_, i) => entry(`P${i + 1}`, 36 - i * 3, 12 - i))
    expect(getQuarterStanding(table, 'P12')).toMatchObject({ rank: 12, position: 12, jointTop: false })
  })

  it('returns null when the player has no row or no name is given', () => {
    const table = [entry('Alice', 9, 3)]
    expect(getQuarterStanding(table, 'Zed')).toBeNull()
    expect(getQuarterStanding(table, null)).toBeNull()
    expect(getQuarterStanding(table, undefined)).toBeNull()
  })
})

describe('getLastResult', () => {
  it('returns the most recent played week', () => {
    const weeks = [
      played(14, '02 Apr 2026', ['Alice'], ['Bob']),
      played(13, '26 Mar 2026', ['Alice'], ['Bob'], 'teamB'),
    ]
    expect(getLastResult(weeks)?.week).toBe(14)
  })

  it('counts a DNF as a result', () => {
    const weeks: Week[] = [
      played(14, '02 Apr 2026', ['Alice'], ['Bob']),
      { id: 'id-15', season: '2026', week: 15, date: '09 Apr 2026', status: 'dnf', teamA: ['Alice'], teamB: ['Bob'], winner: null },
    ]
    expect(getLastResult(weeks)?.week).toBe(15)
  })

  it('ignores cancelled, scheduled and unrecorded weeks', () => {
    const weeks: Week[] = [
      played(14, '02 Apr 2026', ['Alice'], ['Bob']),
      { id: 'id-15', season: '2026', week: 15, date: '09 Apr 2026', status: 'cancelled', teamA: [], teamB: [], winner: null },
      { id: 'id-16', season: '2026', week: 16, date: '16 Apr 2026', status: 'scheduled', teamA: ['Alice'], teamB: ['Bob'], winner: null },
    ]
    expect(getLastResult(weeks)?.week).toBe(14)
  })

  it('returns null with no results', () => {
    expect(getLastResult([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest lib/__tests__/sidebar-stats.overview.test.ts`
Expected: FAIL. `getQuarterStanding is not a function`, `getLastResult is not a function`, and `allEntries` / `displayQ` are `undefined`.

- [ ] **Step 3: Implement**

In `lib/sidebar-stats.ts`, replace the `QuarterlyTableResult` interface with:

```ts
export interface QuarterlyTableResult {
  quarterLabel: string
  /** Quarter and four-digit year actually shown (the previous quarter during holdover). */
  displayQ: number
  displayYear: number
  /** Top 10 of the displayed quarter. */
  entries: QuarterlyEntry[]
  /** The full sorted table of the displayed quarter. */
  allEntries: QuarterlyEntry[]
  lastChampion: string | null
  lastChampionPoints: number | null
  lastQuarterLabel: string | null
  /** Calendar previous quarter, or null when it has no played games. */
  lastQ: number | null
  lastYear: number | null
  gamesLeft: number
  gamesTotal: number
  isHoldover: boolean
}
```

In `computeQuarterlyTable`, replace this line:

```ts
  const entries = aggregateWeeks(displayWeeks).slice(0, 10)
```

with:

```ts
  const allEntries = aggregateWeeks(displayWeeks)
  const entries = allEntries.slice(0, 10)
```

and replace the end of the function, from `const lastChampion = ...` through the `return`, with:

```ts
  const hasPrev = prevEntries.length > 0
  const lastChampion = hasPrev ? prevEntries[0].name : null
  const lastChampionPoints = hasPrev ? prevEntries[0].points : null
  const lastQuarterLabel = hasPrev ? `Q${prevQ} ${prevYY}` : null

  return {
    quarterLabel,
    displayQ,
    displayYear,
    entries,
    allEntries,
    lastChampion,
    lastChampionPoints,
    lastQuarterLabel,
    lastQ: hasPrev ? prevQ : null,
    lastYear: hasPrev ? prevYear : null,
    gamesLeft,
    gamesTotal,
    isHoldover,
  }
}
```

Add directly below `computeQuarterlyTable`:

```ts
// ─── getQuarterStanding ───────────────────────────────────────────────────────

export interface QuarterStanding {
  /** 1-based place in the sorted table: what the rank column shows. */
  rank: number
  /** Players level on points and wins share a position: what "1st" on the Your stats card shows. */
  position: number
  /** First place, shared with at least one other player. */
  jointTop: boolean
  entry: QuarterlyEntry
}

/**
 * Where a player sits in a quarterly table. `allEntries` must be the full sorted
 * table from computeQuarterlyTable, not the top-10 slice.
 */
export function getQuarterStanding(
  allEntries: QuarterlyEntry[],
  name: string | null | undefined,
): QuarterStanding | null {
  if (!name) return null
  const index = allEntries.findIndex(e => e.name === name)
  if (index === -1) return null
  const entry = allEntries[index]
  const ahead = allEntries.filter(
    e => e.points > entry.points || (e.points === entry.points && e.won > entry.won)
  ).length
  const level = allEntries.filter(e => e.points === entry.points && e.won === entry.won).length
  const position = ahead + 1
  return { rank: index + 1, position, jointTop: position === 1 && level > 1, entry }
}

// ─── getLastResult ────────────────────────────────────────────────────────────

/** The most recent week with a result (played or did not finish), or null. */
export function getLastResult(weeks: Week[]): Week | null {
  const resulted = weeks.filter(w => w.status === 'played' || w.status === 'dnf')
  if (resulted.length === 0) return null
  return resulted.reduce((a, b) => (parseWeekDate(a.date) >= parseWeekDate(b.date) ? a : b))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest lib/__tests__/sidebar-stats.overview.test.ts __tests__/sidebar-stats.test.ts lib/__tests__/sidebar-stats.quarters.test.ts lib/__tests__/sidebar-stats.celebration.test.ts`
Expected: PASS, all four suites (the three existing suites prove nothing regressed).

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar-stats.ts lib/__tests__/sidebar-stats.overview.test.ts
git commit -m "Add quarter standing and last result helpers for the Overview tab" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Share the unrecorded-week step

**Files:**
- Modify: `lib/fetchers.ts`
- Modify: `app/[slug]/(tabs)/results/page.tsx`
- Test: `lib/__tests__/fetchers.test.ts`

- [ ] **Step 1: Write the failing tests**

In `lib/__tests__/fetchers.test.ts`, add `ensureUnrecordedWeek` to the import from `@/lib/fetchers`:

```ts
import { getUser, getAuthAndRole, getPendingBadgeCount, getMyJoinRequestStatus, getMyClaimInfo, ensureUnrecordedWeek } from '@/lib/fetchers'
import type { Week } from '@/lib/types'
```

Append at the end of the file:

```ts
describe('ensureUnrecordedWeek', () => {
  // Thursday league (day index 4).
  const playedWeek: Week = {
    id: 'w14', season: '2026', week: 14, date: '02 Apr 2026', status: 'played',
    teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA',
  }

  afterEach(() => { jest.useRealTimers() })

  it('creates and appends an unrecorded row when the last game day has no row', async () => {
    // Friday 10 Apr 2026: Thursday 9 Apr is past its 20:00 deadline.
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 12))
    const rpc = jest.fn().mockResolvedValue({ data: 'new-id', error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })

    const result = await ensureUnrecordedWeek(LEAGUE, [playedWeek], 4)

    expect(rpc).toHaveBeenCalledWith('create_unrecorded_week', {
      p_game_id: LEAGUE,
      p_season: '2026',
      p_week: 15,
      p_date: '09 Apr 2026',
    })
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({
      id: 'new-id', season: '2026', week: 15, date: '09 Apr 2026', status: 'unrecorded',
      teamA: [], teamB: [], winner: null,
    })
  })

  it('does nothing when a row already exists for that date', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 12))
    const rpc = jest.fn()
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
    const weeks: Week[] = [
      playedWeek,
      { id: 'w15', season: '2026', week: 15, date: '09 Apr 2026', status: 'cancelled', teamA: [], teamB: [], winner: null },
    ]

    await expect(ensureUnrecordedWeek(LEAGUE, weeks, 4)).resolves.toBe(weeks)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('does nothing before the game day deadline', async () => {
    // Thursday 9 Apr 2026 at midday: the deadline is 20:00 that evening.
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, 12))
    const rpc = jest.fn()
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
    const weeks = [playedWeek]

    await expect(ensureUnrecordedWeek(LEAGUE, weeks, 4)).resolves.toBe(weeks)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('returns the list unchanged when the RPC reports the row already exists', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 12))
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null })
    ;(createServiceClient as jest.Mock).mockReturnValue({ rpc })
    const weeks = [playedWeek]

    await expect(ensureUnrecordedWeek(LEAGUE, weeks, 4)).resolves.toBe(weeks)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest lib/__tests__/fetchers.test.ts`
Expected: FAIL. The four new tests error with `ensureUnrecordedWeek is not a function`; the existing tests pass.

- [ ] **Step 3: Implement `ensureUnrecordedWeek`**

In `lib/fetchers.ts`, replace the `sortWeeks` import on line 5 with:

```ts
import { sortWeeks, deriveSeason, getMostRecentExpectedGameDate, getNextWeekNumber, isPastDeadline } from '@/lib/utils'
```

Append at the end of the file:

```ts
// ── Unrecorded week ───────────────────────────────────────────────────────────

/**
 * Lazily create an 'unrecorded' row when the most recent expected game day has
 * passed its deadline with no row for it. Returns the weeks list with the new
 * row appended; the row is built locally from the id the RPC returns, so there
 * is no second fetch. Returns the same list when nothing was created.
 *
 * Not cached: it writes. Callers skip it for the public tier.
 */
export async function ensureUnrecordedWeek(
  leagueId: string,
  weeks: Week[],
  leagueDayIndex?: number,
): Promise<Week[]> {
  const recentDate = getMostRecentExpectedGameDate(weeks, leagueDayIndex)
  if (!recentDate || !isPastDeadline(recentDate)) return weeks
  if (weeks.some((w) => w.date === recentDate)) return weeks

  const season = deriveSeason(weeks) || String(new Date().getFullYear())
  const week = getNextWeekNumber(weeks)
  const service = createServiceClient()
  const { data: newId } = await service.rpc('create_unrecorded_week', {
    p_game_id: leagueId,
    p_season: season,
    p_week: week,
    p_date: recentDate,
  })
  // The RPC returns the new row's UUID, or null on ON CONFLICT DO NOTHING.
  if (!newId) return weeks

  return sortWeeks([
    ...weeks,
    { id: newId as string, season, week, date: recentDate, status: 'unrecorded', teamA: [], teamB: [], winner: null },
  ])
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest lib/__tests__/fetchers.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Use it on the Results page**

In `app/[slug]/(tabs)/results/page.tsx`:

Delete the import on line 5:

```ts
import { createServiceClient } from '@/lib/supabase/service'
```

Replace the two import lines for utils and fetchers with:

```ts
import { dayNameToIndex, isPastDeadline, parseWeekDate } from '@/lib/utils'
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyClaimInfo, ensureUnrecordedWeek } from '@/lib/fetchers'
```

Replace the whole block that starts with the comment `// Lazily create an unrecorded row if the most recent expected game day passed` and ends with the closing brace of `if (recentDate && isPastDeadline(recentDate) && tier !== 'public') { ... }` (from `let weeks: Week[] = rawWeeks` to the brace before `// Derive nextWeek unconditionally`) with:

```ts
  // Lazily create an unrecorded row if the most recent expected game day passed
  // with no row. Shared with the Overview tab.
  const weeks: Week[] = tier !== 'public'
    ? await ensureUnrecordedWeek(leagueId, rawWeeks, leagueDayIndex)
    : rawWeeks
```

Nothing else in the file changes. `isPastDeadline` and `parseWeekDate` are still used by the `nextWeek` derivation below.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npx eslint "app/[slug]/(tabs)/results/page.tsx" lib/fetchers.ts`
Expected: no errors (in particular, no unused imports).

- [ ] **Step 7: Commit**

```bash
git add lib/fetchers.ts lib/__tests__/fetchers.test.ts "app/[slug]/(tabs)/results/page.tsx"
git commit -m "Extract unrecorded week creation into a shared fetcher" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Shared table pieces and sidebar exports

The sidebar's rendered output must not change. Step 1 pins it down with characterisation tests that pass before and after the refactor.

**Files:**
- Create: `components/QuarterTable.tsx`
- Modify: `components/StatsSidebar.tsx`
- Test: `__tests__/stats-sidebar.test.tsx`

- [ ] **Step 1: Write characterisation tests for the current sidebar**

Create `__tests__/stats-sidebar.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { StatsSidebar } from '@/components/StatsSidebar'
import type { Player, Week } from '@/lib/types'

function makePlayer(name: string, overrides: Partial<Player> = {}): Player {
  return {
    playerId: `roster|${name}`,
    name,
    played: 10, won: 5, drew: 2, lost: 3,
    timesTeamA: 6, timesTeamB: 4,
    winRate: 50, qualified: true, points: 17,
    mentality: 'balanced', strength: 'average',
    recentForm: 'WWDLW',
    ...overrides,
  }
}

const PLAYERS = ['Alice', 'Bob', 'Charlie', 'Dave'].map((n) => makePlayer(n))

// Q1 2026: Team A (Alice, Bob) won. Q2 2026: Team B (Charlie, Dave) won.
const WEEKS: Week[] = [
  { id: 'q1', season: '2026', week: 6, date: '12 Feb 2026', status: 'played', teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'], winner: 'teamA' },
  { id: 'q2', season: '2026', week: 18, date: '07 May 2026', status: 'played', teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'], winner: 'teamB' },
]

// Friday 15 May 2026: mid Q2.
beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date(2026, 4, 15, 12)) })
afterEach(() => { jest.useRealTimers() })

describe('StatsSidebar', () => {
  it('shows the current quarter table and highlights first place only', () => {
    const { container } = render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    expect(screen.getByText('Q2 26')).toBeInTheDocument()
    const highlighted = container.querySelectorAll('[class*="bg-[#38bdf8]/7"]')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]).toHaveTextContent('Charlie')
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })

  it('shows quarter progress', () => {
    render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    expect(screen.getByText(/^1 of \d+ played$/)).toBeInTheDocument()
    expect(screen.getByText(/^\d+ games left$/)).toBeInTheDocument()
  })

  it('shows the previous quarter champion without points', () => {
    render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    const box = screen.getByText('Q1 26 Champion').parentElement
    expect(box).toHaveTextContent('Alice')
    expect(box).not.toHaveTextContent('pts')
  })

  it('shows most in form and head to head without the Overview extras', () => {
    const { container } = render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    expect(screen.getByText('Most In Form')).toBeInTheDocument()
    expect(screen.getByText("The Gaffer's Pick")).toBeInTheDocument()
    expect(screen.queryByText('Last 5 games')).not.toBeInTheDocument()
    expect(screen.getByText('Head to Head')).toBeInTheDocument()
    expect(container).not.toHaveTextContent('You have played')
  })

  it('shows Your Stats only for a linked player', () => {
    const { rerender } = render(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} />)
    expect(screen.queryByText('Your Stats')).not.toBeInTheDocument()
    rerender(<StatsSidebar players={PLAYERS} weeks={WEEKS} leagueDayIndex={4} linkedPlayerName="Alice" />)
    expect(screen.getByText('Your Stats')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run them against the current code**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/stats-sidebar.test.tsx`
Expected: PASS, 5 tests. These describe today's behaviour. If one fails, fix the test, not the component.

- [ ] **Step 3: Add failing tests for the new exports**

Append to `__tests__/stats-sidebar.test.tsx`, and extend the imports at the top:

```tsx
import { StatsSidebar, InFormWidget, TeamABWidget } from '@/components/StatsSidebar'
import { QuarterTableRows, ChampionBox } from '@/components/QuarterTable'
```

```tsx
describe('InFormWidget', () => {
  it('shows the Last 5 games tag when asked', () => {
    render(<InFormWidget players={PLAYERS} weeks={WEEKS} size="page" showWindowTag />)
    expect(screen.getByText('Last 5 games')).toBeInTheDocument()
  })
})

describe('TeamABWidget', () => {
  it('adds the linked player team counts', () => {
    const { container } = render(<TeamABWidget weeks={WEEKS} size="page" linkedPlayer={makePlayer('Alice')} />)
    expect(container).toHaveTextContent('You have played 6 for A · 4 for B')
  })

  it('omits the line with no linked player', () => {
    const { container } = render(<TeamABWidget weeks={WEEKS} size="page" linkedPlayer={null} />)
    expect(container).not.toHaveTextContent('You have played')
  })
})

describe('QuarterTableRows', () => {
  const rows = [
    { rank: 1, entry: { name: 'Alice', played: 3, won: 3, drew: 0, lost: 0, points: 9 } },
    { rank: 2, entry: { name: 'Bob', played: 3, won: 2, drew: 0, lost: 1, points: 6 } },
  ]

  it('tags the highlighted row with You at page size', () => {
    const { container } = render(<QuarterTableRows rows={rows} highlightName="Bob" size="page" />)
    const highlighted = container.querySelectorAll('[class*="bg-[#38bdf8]/10"]')
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]).toHaveTextContent('Bob')
    expect(highlighted[0]).toHaveTextContent('You')
  })

  it('highlights nobody when no name is given', () => {
    const { container } = render(<QuarterTableRows rows={rows} highlightName={null} size="page" />)
    expect(container.querySelectorAll('[class*="bg-[#38bdf8]/10"]')).toHaveLength(0)
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })
})

describe('ChampionBox', () => {
  it('shows points when given', () => {
    render(<ChampionBox label="Q1 2026 Champion" name="Sam" points={28} />)
    expect(screen.getByText('Q1 2026 Champion')).toBeInTheDocument()
    expect(screen.getByText('28 pts')).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run to verify the new tests fail**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/stats-sidebar.test.tsx`
Expected: FAIL. The suite cannot resolve `@/components/QuarterTable`.

- [ ] **Step 5: Create `components/QuarterTable.tsx`**

```tsx
import { Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { QuarterlyEntry } from '@/lib/sidebar-stats'

/** 'sidebar' is the 288px stats sidebar; 'page' is the Overview tab content column. */
export type WidgetSize = 'sidebar' | 'page'

const NUM_CLASS = 'font-plex text-[10.5px] text-[#4f688a] text-center shrink-0'

/** The P / W / D / L / Pts labels. Render inside a flex header row that sets the font. */
export function QuarterTableColumnLabels() {
  return (
    <>
      <span className="w-[22px] text-center">P</span>
      <span className="w-[18px] text-center">W</span>
      <span className="w-[18px] text-center">D</span>
      <span className="w-[18px] text-center">L</span>
      <span className="w-[26px] text-right text-[#6f88a8]">Pts</span>
    </>
  )
}

export interface QuarterTableRow {
  entry: QuarterlyEntry
  rank: number
}

interface QuarterTableRowsProps {
  rows: QuarterTableRow[]
  /** Name of the row to highlight, or null for none. */
  highlightName: string | null
  /** 'page' adds the YOU tag to the highlighted row. */
  size?: WidgetSize
}

export function QuarterTableRows({ rows, highlightName, size = 'sidebar' }: QuarterTableRowsProps) {
  const page = size === 'page'
  return (
    <div className="flex flex-col gap-0.5">
      {rows.map(({ entry: e, rank }) => {
        const on = e.name === highlightName
        return (
          <div
            key={e.name}
            className={cn(
              'flex items-center gap-1 px-1 -mx-1 rounded',
              page ? 'py-1' : 'py-[3px]',
              on && (page ? 'bg-[#38bdf8]/10' : 'bg-[#38bdf8]/7')
            )}
          >
            <span className={cn(
              'font-plex text-[10px] font-bold w-3.5 text-left shrink-0',
              on ? 'text-[#38bdf8]' : 'text-[#4f688a]'
            )}>
              {rank}
            </span>
            <span className={cn(
              'font-inter-body text-[12.5px] flex-1 truncate',
              on ? 'font-bold text-[#f4f9ff]' : 'font-medium text-[#8ba4c4]'
            )}>
              {e.name}
            </span>
            {on && page && (
              <span className="font-plex text-[7.5px] font-bold uppercase tracking-[.14em] px-[5px] py-0.5 mr-1 rounded-[3px] bg-[#38bdf8] text-[#05101d] shrink-0">
                You
              </span>
            )}
            <span className={cn(NUM_CLASS, 'w-[22px]')}>{e.played}</span>
            <span className={cn(NUM_CLASS, 'w-[18px]')}>{e.won}</span>
            <span className={cn(NUM_CLASS, 'w-[18px]')}>{e.drew}</span>
            <span className={cn(NUM_CLASS, 'w-[18px]')}>{e.lost}</span>
            <span className={cn(
              'font-plex text-xs font-bold w-[26px] text-right shrink-0',
              on ? 'text-[#38bdf8]' : 'text-[#dff1ff]'
            )}>
              {e.points}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** "1 of 13 played" on the left; games left, or Final once the quarter is complete. */
export function QuarterProgress({ gamesLeft, gamesTotal }: { gamesLeft: number; gamesTotal: number }) {
  return (
    <div className="flex items-center justify-between gap-2 mt-2.5 pt-[9px] border-t border-[#17263c] font-plex text-[8.5px] uppercase tracking-[.14em] text-[#6f88a8]">
      <span>{gamesTotal - gamesLeft} of {gamesTotal} played</span>
      <span className="font-bold text-[#8ba4c4]">
        {gamesLeft > 0 ? `${gamesLeft} ${gamesLeft === 1 ? 'game' : 'games'} left` : 'Final'}
      </span>
    </div>
  )
}

/** Lime box naming the previous quarter's champion. */
export function ChampionBox({ label, name, points }: { label: string; name: string; points?: number | null }) {
  return (
    <div className="flex items-center justify-between gap-2.5 bg-[#bef264]/7 border border-[#bef264]/30 rounded-lg px-3 py-[9px]">
      <div>
        <p className="font-plex text-[8.5px] font-bold uppercase tracking-[.18em] text-[#bef264]">
          {label}
        </p>
        <p className="mt-1 text-sm font-bold tracking-[-.01em] text-[#f4f9ff]">
          {name}
          {points != null && (
            <span className="ml-1.5 font-plex text-[9.5px] font-normal uppercase tracking-[.12em] text-[#8ba4c4]">
              {`${points} pts`}
            </span>
          )}
        </p>
      </div>
      <Trophy className="size-[18px] shrink-0 text-[#bef264]" strokeWidth={1.8} aria-hidden />
    </div>
  )
}
```

- [ ] **Step 6: Refactor `components/StatsSidebar.tsx`**

Replace the imports at the top of the file (lines 1 to 5) with:

```tsx
import { cn } from '@/lib/utils'
import { computeInForm, computeQuarterlyTable, computeTeamAB } from '@/lib/sidebar-stats'
import { FormDots } from '@/components/FormDots'
import {
  ChampionBox,
  QuarterProgress,
  QuarterTableColumnLabels,
  QuarterTableRows,
  type WidgetSize,
} from '@/components/QuarterTable'
import type { Player, Week } from '@/lib/types'
```

Replace the two constants, `AllTimeChip`, `WidgetShell` and `EmptyState` (everything from `const WIDGET_CLASS` down to the `// ─── Widget 0: Your Stats` comment) with:

```tsx
export const WIDGET_CLASS = 'rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden shadow-[0_18px_44px_rgba(0,0,0,.42)]'
export const WIDGET_TITLE_CLASS = 'font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]'

export function AllTimeChip() {
  return (
    <span className="font-plex text-[8px] font-bold uppercase tracking-[.12em] text-[#7dd3fc] bg-[#38bdf8]/8 border border-[#38bdf8]/35 rounded-[3px] px-1.5 py-[3px]">
      All Time
    </span>
  )
}

function WidgetShell({
  title,
  headerRight,
  size = 'sidebar',
  children,
}: {
  title: string
  headerRight?: React.ReactNode
  size?: WidgetSize
  children: React.ReactNode
}) {
  const page = size === 'page'
  return (
    <div className={WIDGET_CLASS}>
      <div className={cn(
        'py-2.5 border-b border-[#17263c] bg-[#0c1728] flex items-center justify-between',
        page ? 'px-4' : 'px-3.5'
      )}>
        <span className={WIDGET_TITLE_CLASS}>{title}</span>
        {headerRight}
      </div>
      <div className={page ? 'px-4 py-3.5' : 'p-3.5'}>{children}</div>
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return <p className="font-inter-body text-xs text-[#6f88a8] text-center py-4">{message}</p>
}
```

`YourStatsWidget` is unchanged.

In `InFormWidget`, change only the signature and the opening `WidgetShell` tag. Replace:

```tsx
function InFormWidget({ players, weeks }: { players: Player[]; weeks: Week[] }) {
  const entries = computeInForm(players, weeks)
  return (
    <WidgetShell title="Most In Form">
```

with:

```tsx
export function InFormWidget({
  players,
  weeks,
  size = 'sidebar',
  showWindowTag = false,
}: {
  players: Player[]
  weeks: Week[]
  size?: WidgetSize
  /** Overview tab: label the form window in the header. */
  showWindowTag?: boolean
}) {
  const entries = computeInForm(players, weeks)
  return (
    <WidgetShell
      title="Most In Form"
      size={size}
      headerRight={showWindowTag ? (
        <span className="font-plex text-[8px] font-bold uppercase tracking-[.12em] text-[#4f688a]">
          Last 5 games
        </span>
      ) : undefined}
    >
```

The body of `InFormWidget` is unchanged.

Replace the whole `QuarterlyTableWidget` function with:

```tsx
function QuarterlyTableWidget({ weeks, leagueDayIndex }: { weeks: Week[]; leagueDayIndex?: number }) {
  const { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft, gamesTotal, isHoldover } = computeQuarterlyTable(weeks, new Date(), leagueDayIndex)
  // Footer line replaces the old header pills: games left, or Final once the quarter is complete
  const showProgress = entries.length > 0 && (gamesLeft > 0 || isHoldover)

  return (
    <div className={WIDGET_CLASS}>
      {/* Header with inline column labels */}
      <div className="px-3.5 py-2.5 border-b border-[#17263c] bg-[#0c1728] flex items-center gap-1.5 font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#4f688a]">
        <span className={cn(WIDGET_TITLE_CLASS, 'flex-1 min-w-0 truncate')}>
          {quarterLabel}
        </span>
        <QuarterTableColumnLabels />
      </div>

      <div className="px-3.5 py-3">
        {entries.length === 0 ? (
          <EmptyState message={isHoldover ? 'No data yet' : 'Quarter just started'} />
        ) : (
          <QuarterTableRows
            rows={entries.map((entry, i) => ({ entry, rank: i + 1 }))}
            highlightName={entries[0].name}
          />
        )}

        {/* Quarter progress */}
        {showProgress && <QuarterProgress gamesLeft={gamesLeft} gamesTotal={gamesTotal} />}

        {/* Previous quarter champion */}
        {lastChampion && lastQuarterLabel && (
          <>
            <div className="h-px bg-[#17263c] mt-2.5 mb-3" />
            <ChampionBox label={`${lastQuarterLabel} Champion`} name={lastChampion} />
          </>
        )}
      </div>
    </div>
  )
}
```

Replace the whole `TeamABWidget` function with:

```tsx
export function TeamABWidget({
  weeks,
  size = 'sidebar',
  linkedPlayer = null,
}: {
  weeks: Week[]
  size?: WidgetSize
  /** Overview tab: adds how often the viewer has played for each team. */
  linkedPlayer?: Player | null
}) {
  const { teamAWins, draws, teamBWins, total } = computeTeamAB(weeks)

  return (
    <WidgetShell title="Head to Head" size={size} headerRight={<AllTimeChip />}>
      {total === 0 ? (
        <EmptyState message="No results yet" />
      ) : (
        <>
          {/* Scoreline */}
          <div className="flex items-baseline mb-2 font-plex">
            <span className="flex-1 text-[9px] font-bold uppercase tracking-[.16em] text-[#7dd3fc]">Team A</span>
            <span className="text-lg font-bold text-[#7dd3fc]">{teamAWins}</span>
            <span className="mx-2.5 text-[11px] text-[#4f688a]">{draws}D</span>
            <span className="text-lg font-bold text-[#c4b5fd]">{teamBWins}</span>
            <span className="flex-1 text-right text-[9px] font-bold uppercase tracking-[.16em] text-[#c4b5fd]">Team B</span>
          </div>

          {/* Split bar */}
          <div className="flex gap-0.5 rounded-[3px] overflow-hidden h-2.5">
            {teamAWins > 0 && (
              <div className="bg-[#38bdf8]" style={{ flex: teamAWins }} />
            )}
            {draws > 0 && (
              <div className="bg-[#1b2c46]" style={{ flex: draws }} />
            )}
            {teamBWins > 0 && (
              <div className="bg-[#a78bfa]" style={{ flex: teamBWins }} />
            )}
          </div>

          {linkedPlayer && (
            <p className="mt-2.5 font-plex text-[8.5px] uppercase tracking-[.14em] text-[#6f88a8]">
              You have played{' '}
              <span className="font-bold text-[#7dd3fc]">{linkedPlayer.timesTeamA}</span>
              {' '}for A ·{' '}
              <span className="font-bold text-[#c4b5fd]">{linkedPlayer.timesTeamB}</span>
              {' '}for B
            </p>
          )}
        </>
      )}
    </WidgetShell>
  )
}
```

The exported `StatsSidebar` function at the bottom is unchanged.

- [ ] **Step 7: Run the tests to verify they all pass**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/stats-sidebar.test.tsx`
Expected: PASS, 11 tests. The 5 characterisation tests still passing is the proof that the sidebar is unchanged.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add components/QuarterTable.tsx components/StatsSidebar.tsx __tests__/stats-sidebar.test.tsx
git commit -m "Extract quarter table pieces from the stats sidebar for reuse" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Last result and league table card

**Files:**
- Create: `components/overview/OverviewTableCard.tsx`
- Test: `__tests__/overview-table-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/overview-table-card.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, within } from '@testing-library/react'
import { OverviewTableCard } from '@/components/overview/OverviewTableCard'
import type { QuarterlyEntry, QuarterlyTableResult, QuarterStanding } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'

function entry(name: string, points: number, won: number): QuarterlyEntry {
  return { name, played: 3, won, drew: 0, lost: 3 - won, points }
}

const THREE = [entry('Alice', 9, 3), entry('Bob', 6, 2), entry('Charlie', 3, 1)]

function makeTable(overrides: Partial<QuarterlyTableResult> = {}): QuarterlyTableResult {
  return {
    quarterLabel: 'Q2 26',
    displayQ: 2,
    displayYear: 2026,
    entries: THREE,
    allEntries: THREE,
    lastChampion: 'Sam',
    lastChampionPoints: 28,
    lastQuarterLabel: 'Q1 26',
    lastQ: 1,
    lastYear: 2026,
    gamesLeft: 12,
    gamesTotal: 13,
    isHoldover: false,
    ...overrides,
  }
}

function result(overrides: Partial<Week> = {}): Week {
  return {
    id: 'w15', season: '2026', week: 15, date: '01 Apr 2026', status: 'played', format: '5-a-side',
    teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA', goal_difference: 2,
    ...overrides,
  }
}

const HIGHLIGHT = '[class*="bg-[#38bdf8]/10"]'

describe('OverviewTableCard: table', () => {
  it('titles the table with the quarter and four-digit year', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={null} />)
    expect(screen.getByText('League table · Q2 2026')).toBeInTheDocument()
  })

  it('highlights the viewer, not first place', () => {
    const standing: QuarterStanding = { rank: 2, position: 2, jointTop: false, entry: THREE[1] }
    const { container } = render(<OverviewTableCard table={makeTable()} standing={standing} lastResult={null} />)
    const highlighted = container.querySelectorAll(HIGHLIGHT)
    expect(highlighted).toHaveLength(1)
    expect(highlighted[0]).toHaveTextContent('Bob')
    expect(highlighted[0]).toHaveTextContent('You')
  })

  it('highlights nobody without a standing', () => {
    const { container } = render(<OverviewTableCard table={makeTable()} standing={null} lastResult={null} />)
    expect(container.querySelectorAll(HIGHLIGHT)).toHaveLength(0)
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })

  it('appends the viewer row with its true rank when they are below the top 10', () => {
    const all = Array.from({ length: 12 }, (_, i) => entry(`P${i + 1}`, 0, 0))
    const table = makeTable({ entries: all.slice(0, 10), allEntries: all })
    const standing: QuarterStanding = { rank: 12, position: 12, jointTop: false, entry: all[11] }
    const { container } = render(<OverviewTableCard table={table} standing={standing} lastResult={null} />)
    const highlighted = container.querySelectorAll(HIGHLIGHT)
    expect(highlighted).toHaveLength(1)
    expect(within(highlighted[0] as HTMLElement).getByText('P12')).toBeInTheDocument()
    expect(within(highlighted[0] as HTMLElement).getByText('12')).toBeInTheDocument()
    expect(screen.getByText('P10')).toBeInTheDocument()
    expect(screen.queryByText('P11')).not.toBeInTheDocument()
  })

  it('shows progress and the previous champion with points', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={null} />)
    expect(screen.getByText('1 of 13 played')).toBeInTheDocument()
    expect(screen.getByText('12 games left')).toBeInTheDocument()
    expect(screen.getByText('Q1 2026 Champion')).toBeInTheDocument()
    expect(screen.getByText('Sam')).toBeInTheDocument()
    expect(screen.getByText('28 pts')).toBeInTheDocument()
  })

  it('hides the champion box when there is no previous quarter', () => {
    const table = makeTable({ lastChampion: null, lastChampionPoints: null, lastQuarterLabel: null, lastQ: null, lastYear: null })
    render(<OverviewTableCard table={table} standing={null} lastResult={null} />)
    expect(screen.queryByText(/Champion$/)).not.toBeInTheDocument()
  })

  it('shows the empty state for a quarter with no games', () => {
    render(<OverviewTableCard table={makeTable({ entries: [], allEntries: [], gamesLeft: 13 })} standing={null} lastResult={null} />)
    expect(screen.getByText('Quarter just started')).toBeInTheDocument()
    expect(screen.queryByText(/played$/)).not.toBeInTheDocument()
  })
})

describe('OverviewTableCard: last result strip', () => {
  it('is hidden with no result', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={null} />)
    expect(screen.queryByText(/^Last result/)).not.toBeInTheDocument()
  })

  it('shows a Team A win with the margin', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result()} />)
    expect(screen.getByText('Last result · Week 15')).toBeInTheDocument()
    expect(screen.getByText('Team A won')).toBeInTheDocument()
    expect(screen.getByText('01 Apr 2026 · 5-a-side')).toBeInTheDocument()
    expect(screen.getByText('+2')).toBeInTheDocument()
    expect(screen.getByText('Goals')).toBeInTheDocument()
  })

  it('shows a Team B win', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ winner: 'teamB' })} />)
    expect(screen.getByText('Team B won')).toBeInTheDocument()
  })

  it('says Goal for a one-goal margin', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ goal_difference: 1 })} />)
    expect(screen.getByText('+1')).toBeInTheDocument()
    expect(screen.getByText('Goal')).toBeInTheDocument()
  })

  it('hides the margin for a draw', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ winner: 'draw', goal_difference: 0 })} />)
    expect(screen.getByText('Drawn')).toBeInTheDocument()
    expect(screen.queryByText(/^Goals?$/)).not.toBeInTheDocument()
  })

  it('hides the margin when none was recorded', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ goal_difference: null })} />)
    expect(screen.getByText('Team A won')).toBeInTheDocument()
    expect(screen.queryByText(/^Goals?$/)).not.toBeInTheDocument()
  })

  it('shows a DNF without a margin', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ status: 'dnf', winner: null, goal_difference: null })} />)
    expect(screen.getByText('Did not finish')).toBeInTheDocument()
    expect(screen.queryByText(/^Goals?$/)).not.toBeInTheDocument()
  })

  it('omits the format when the week has none', () => {
    render(<OverviewTableCard table={makeTable()} standing={null} lastResult={result({ format: undefined })} />)
    expect(screen.getByText('01 Apr 2026')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/overview-table-card.test.tsx`
Expected: FAIL. Cannot find module `@/components/overview/OverviewTableCard`.

- [ ] **Step 3: Implement**

Create `components/overview/OverviewTableCard.tsx`:

```tsx
import { cn } from '@/lib/utils'
import type { QuarterlyTableResult, QuarterStanding } from '@/lib/sidebar-stats'
import type { Week } from '@/lib/types'
import { EmptyState, WIDGET_CLASS, WIDGET_TITLE_CLASS } from '@/components/StatsSidebar'
import {
  ChampionBox,
  QuarterProgress,
  QuarterTableColumnLabels,
  QuarterTableRows,
  type QuarterTableRow,
} from '@/components/QuarterTable'

interface OverviewTableCardProps {
  table: QuarterlyTableResult
  /** The linked viewer's place in the table, or null for guests and unlinked viewers. */
  standing: QuarterStanding | null
  /** Most recent result, or null to leave the strip out (no results, or the tier cannot see match history). */
  lastResult: Week | null
}

type ResultKind = 'teamA' | 'teamB' | 'draw' | 'dnf'

const RESULT_STYLE: Record<ResultKind, { label: string; text: string; wash: string | null }> = {
  teamA: {
    label: 'Team A won',
    text: 'text-[#7dd3fc]',
    wash: 'bg-[linear-gradient(90deg,rgba(56,189,248,.12),transparent_55%)]',
  },
  teamB: {
    label: 'Team B won',
    text: 'text-[#c4b5fd]',
    wash: 'bg-[linear-gradient(90deg,rgba(167,139,250,.12),transparent_55%)]',
  },
  draw: { label: 'Drawn', text: 'text-[#8ba4c4]', wash: null },
  dnf: { label: 'Did not finish', text: 'text-[#8ba4c4]', wash: null },
}

function resultKind(week: Week): ResultKind | null {
  if (week.status === 'dnf') return 'dnf'
  return week.winner
}

function LastResultStrip({ week }: { week: Week }) {
  const kind = resultKind(week)
  if (!kind) return null
  const style = RESULT_STYLE[kind]
  const decided = kind === 'teamA' || kind === 'teamB'
  const margin = decided && week.goal_difference ? week.goal_difference : null

  return (
    <div className="relative border-b border-[#17263c] bg-[#0c1728]">
      {style.wash && <div aria-hidden className={cn('pointer-events-none absolute inset-0', style.wash)} />}
      <div className="relative flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className={WIDGET_TITLE_CLASS}>Last result · Week {week.week}</p>
          <p className={cn('mt-1.5 text-lg font-bold leading-none tracking-[-.025em]', style.text)}>
            {style.label}
          </p>
          <p className="mt-1.5 font-plex text-[9.5px] uppercase tracking-[.14em] text-[#8ba4c4]">
            {week.date}{week.format ? ` · ${week.format}` : ''}
          </p>
        </div>
        {margin !== null && (
          <div className="shrink-0 text-right">
            <p className="font-plex text-[28px] font-bold leading-none tracking-[-.04em] text-[#f4f9ff]">
              +{margin}
            </p>
            <p className="mt-1 font-plex text-[8px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">
              {margin === 1 ? 'Goal' : 'Goals'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Overview card 3: last result strip, quarterly league table, previous champion. */
export function OverviewTableCard({ table, standing, lastResult }: OverviewTableCardProps) {
  const rows: QuarterTableRow[] = table.entries.map((entry, i) => ({ entry, rank: i + 1 }))
  // A viewer ranked below the cut still gets their row, with its true rank.
  if (standing && standing.rank > table.entries.length) {
    rows.push({ entry: standing.entry, rank: standing.rank })
  }
  const showProgress = table.entries.length > 0 && (table.gamesLeft > 0 || table.isHoldover)

  return (
    <div className={WIDGET_CLASS}>
      {lastResult && <LastResultStrip week={lastResult} />}

      <div className="flex items-center gap-1.5 border-b border-[#17263c] px-4 py-2 font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#4f688a]">
        <span className={cn(WIDGET_TITLE_CLASS, 'flex-1 min-w-0 truncate')}>
          League table · Q{table.displayQ} {table.displayYear}
        </span>
        <QuarterTableColumnLabels />
      </div>

      <div className="px-4 py-3">
        {rows.length === 0 ? (
          <EmptyState message={table.isHoldover ? 'No data yet' : 'Quarter just started'} />
        ) : (
          <QuarterTableRows rows={rows} highlightName={standing ? standing.entry.name : null} size="page" />
        )}

        {showProgress && <QuarterProgress gamesLeft={table.gamesLeft} gamesTotal={table.gamesTotal} />}

        {table.lastChampion && table.lastQ !== null && table.lastYear !== null && (
          <>
            <div className="h-px bg-[#17263c] mt-2.5 mb-3" />
            <ChampionBox
              label={`Q${table.lastQ} ${table.lastYear} Champion`}
              name={table.lastChampion}
              points={table.lastChampionPoints}
            />
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/overview-table-card.test.tsx`
Expected: PASS, 15 tests.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/overview/OverviewTableCard.tsx __tests__/overview-table-card.test.tsx
git commit -m "Add Overview last result and league table card" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Your stats card and the two prompt cards

**Files:**
- Create: `components/overview/OverviewYourStats.tsx`
- Create: `components/overview/OverviewPromptCards.tsx`
- Test: `__tests__/overview-viewer-cards.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/overview-viewer-cards.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { OverviewYourStats } from '@/components/overview/OverviewYourStats'
import { OverviewSignInCard, OverviewLinkProfileCard } from '@/components/overview/OverviewPromptCards'
import type { QuarterStanding } from '@/lib/sidebar-stats'
import type { Player } from '@/lib/types'

// AuthDialog pulls in the Supabase client; a stub that exposes its props is enough here.
jest.mock('@/components/AuthDialog', () => ({
  AuthDialog: ({ open, redirect, signinOnly }: { open?: boolean; redirect?: string; signinOnly?: boolean }) => (
    <div data-testid="auth-dialog" data-open={String(open)} data-redirect={redirect} data-signin-only={String(signinOnly)} />
  ),
}))

const JAMIE: Player = {
  playerId: 'roster|Jamie Ellis',
  name: 'Jamie Ellis',
  played: 42, won: 28, drew: 4, lost: 10,
  timesTeamA: 24, timesTeamB: 18,
  winRate: 66.7, qualified: true, points: 88,
  mentality: 'goalkeeper', strength: 'average',
  recentForm: 'WWDLW',
}

const TOP: QuarterStanding = {
  rank: 3, position: 1, jointTop: true,
  entry: { name: 'Jamie Ellis', played: 1, won: 1, drew: 0, lost: 0, points: 3 },
}

describe('OverviewYourStats', () => {
  it('shows the name, record and tiles', () => {
    render(<OverviewYourStats player={JAMIE} standing={TOP} quarterLabel="Q2 2026" />)
    expect(screen.getByText('Your stats')).toBeInTheDocument()
    expect(screen.getByText('All Time')).toBeInTheDocument()
    expect(screen.getByText('Jamie Ellis')).toBeInTheDocument()
    expect(screen.getByText('GK · 28W · 4D · 10L')).toBeInTheDocument()
    expect(screen.getByText('67')).toBeInTheDocument()
    expect(screen.getByText('Win rate')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Played')).toBeInTheDocument()
    expect(screen.getByText('2.1')).toBeInTheDocument()
    expect(screen.getByText('Pts / game')).toBeInTheDocument()
    expect(screen.getByText('Recent form')).toBeInTheDocument()
  })

  it('leaves the GK prefix off for outfield players', () => {
    render(<OverviewYourStats player={{ ...JAMIE, mentality: 'balanced' }} standing={TOP} quarterLabel="Q2 2026" />)
    expect(screen.getByText('28W · 4D · 10L')).toBeInTheDocument()
  })

  it('shows the quarter position with its ordinal and the joint top note', () => {
    render(<OverviewYourStats player={JAMIE} standing={TOP} quarterLabel="Q2 2026" />)
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('st')).toBeInTheDocument()
    expect(screen.getByText('Q2 2026 · Joint top')).toBeInTheDocument()
  })

  it('leaves the joint top note off when the position is not shared', () => {
    render(<OverviewYourStats player={JAMIE} standing={{ ...TOP, position: 3, jointTop: false }} quarterLabel="Q2 2026" />)
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('rd')).toBeInTheDocument()
    expect(screen.getByText('Q2 2026')).toBeInTheDocument()
  })

  it('omits the position block when the player has no games this quarter', () => {
    render(<OverviewYourStats player={JAMIE} standing={null} quarterLabel="Q2 2026" />)
    expect(screen.queryByText(/Q2 2026/)).not.toBeInTheDocument()
  })

  it('shows 0.0 points per game for a player with no games', () => {
    render(<OverviewYourStats player={{ ...JAMIE, played: 0, won: 0, drew: 0, lost: 0, points: 0, winRate: 0, recentForm: '-----' }} standing={null} quarterLabel="Q2 2026" />)
    expect(screen.getByText('0.0')).toBeInTheDocument()
  })
})

describe('OverviewSignInCard', () => {
  it('opens the sign-in dialog and returns to Overview afterwards', () => {
    render(<OverviewSignInCard leagueSlug="the-boot-room" />)
    expect(screen.getByText('Sign in to see your stats')).toBeInTheDocument()
    expect(screen.getByText('Win rate, form and where you sit in the table.')).toBeInTheDocument()
    const dialog = screen.getByTestId('auth-dialog')
    expect(dialog).toHaveAttribute('data-open', 'false')
    expect(dialog).toHaveAttribute('data-redirect', '/the-boot-room/overview')
    expect(dialog).toHaveAttribute('data-signin-only', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByTestId('auth-dialog')).toHaveAttribute('data-open', 'true')
  })
})

describe('OverviewLinkProfileCard', () => {
  it('links to the account page where profiles are claimed', () => {
    render(<OverviewLinkProfileCard />)
    expect(screen.getByText('Have you played in this league before?')).toBeInTheDocument()
    expect(screen.getByText('Link your account to your player profile to see your stats and match history.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Link profile' })).toHaveAttribute('href', '/settings')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/overview-viewer-cards.test.tsx`
Expected: FAIL. Cannot find module `@/components/overview/OverviewYourStats`.

- [ ] **Step 3: Implement `OverviewYourStats`**

Create `components/overview/OverviewYourStats.tsx`:

```tsx
import { ordinalSuffix } from '@/lib/utils'
import type { QuarterStanding } from '@/lib/sidebar-stats'
import type { Player } from '@/lib/types'
import { FormDots } from '@/components/FormDots'
import { AllTimeChip } from '@/components/StatsSidebar'

interface OverviewYourStatsProps {
  player: Player
  /** The player's place in the displayed quarter, or null when they have no games in it. */
  standing: QuarterStanding | null
  /** e.g. 'Q2 2026' */
  quarterLabel: string
}

function StatTile({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="rounded-lg border border-[#1b2c46] bg-[#060b14]/60 px-3 py-2.5">
      <p className="font-plex text-xl font-bold leading-none tracking-[-.03em] text-[#f4f9ff]">
        {value}
        {unit && <span className="text-[11px]">{unit}</span>}
      </p>
      <p className="mt-1.5 font-plex text-[8px] font-bold uppercase tracking-[.16em] text-[#6f88a8]">{label}</p>
    </div>
  )
}

/** Overview card 2 for a viewer with a linked player. */
export function OverviewYourStats({ player, standing, quarterLabel }: OverviewYourStatsProps) {
  const record = `${player.mentality === 'goalkeeper' ? 'GK · ' : ''}${player.won}W · ${player.drew}D · ${player.lost}L`
  const pointsPerGame = player.played > 0 ? player.points / player.played : 0

  return (
    <div className="relative overflow-hidden rounded-xl border border-[#1b2c46] bg-[#101d31] shadow-[0_18px_44px_rgba(0,0,0,.42)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(56,189,248,.16),transparent_45%),radial-gradient(circle_at_90%_100%,rgba(190,242,100,.1),transparent_40%)]"
      />
      <div className="relative">
        <div className="flex items-center justify-between border-b border-[#1b2c46] px-4 py-2.5">
          <span className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#8ba4c4]">Your stats</span>
          <AllTimeChip />
        </div>

        <div className="px-4 pt-4 pb-3.5">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-xl font-bold leading-none tracking-[-.025em] text-[#f4f9ff]">{player.name}</p>
              <p className="mt-[5px] font-plex text-[9.5px] uppercase tracking-[.12em] text-[#8ba4c4]">{record}</p>
            </div>
            {standing && (
              <div className="shrink-0 text-right">
                <p className="font-plex text-[32px] font-bold leading-none tracking-[-.04em] text-[#38bdf8]">
                  {standing.position}
                  <span className="text-sm tracking-normal">{ordinalSuffix(standing.position)}</span>
                </p>
                <p className="mt-[5px] font-plex text-[9.5px] uppercase tracking-[.12em] text-[#8ba4c4]">
                  {quarterLabel}{standing.jointTop ? ' · Joint top' : ''}
                </p>
              </div>
            )}
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-2">
            <StatTile value={String(Math.round(player.winRate))} unit="%" label="Win rate" />
            <StatTile value={String(player.played)} label="Played" />
            <StatTile value={pointsPerGame.toFixed(1)} label="Pts / game" />
          </div>

          <div className="mt-3.5 flex items-center justify-between">
            <span className="font-plex text-[8.5px] font-bold uppercase tracking-[.16em] text-[#6f88a8]">Recent form</span>
            <FormDots form={player.recentForm} className="gap-1.5 text-xs" />
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement the prompt cards**

Create `components/overview/OverviewPromptCards.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AuthDialog } from '@/components/AuthDialog'

/** Overview card 2 for a signed-out visitor. */
export function OverviewSignInCard({ leagueSlug }: { leagueSlug: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex items-center justify-between gap-3.5 rounded-xl border border-[#1b2c46] bg-[#0a1421] px-4 py-[18px] shadow-[0_18px_44px_rgba(0,0,0,.42)]">
      <div className="min-w-0">
        <p className="text-base font-bold tracking-[-.02em] text-[#f4f9ff]">Sign in to see your stats</p>
        <p className="mt-1.5 font-inter-body text-xs text-[#8ba4c4]">Win rate, form and where you sit in the table.</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-[34px] shrink-0 rounded border border-[#223a5c] px-3.5 text-xs font-bold whitespace-nowrap text-[#cfe0f4] transition-colors hover:border-[#38bdf8] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8]"
      >
        Log in
      </button>
      <AuthDialog open={open} onOpenChange={setOpen} redirect={`/${leagueSlug}/overview`} signinOnly />
    </div>
  )
}

/** Overview card 2 for a member who has not claimed a player yet. */
export function OverviewLinkProfileCard() {
  return (
    <div className="flex items-center justify-between gap-3.5 rounded-xl border border-[#38bdf8]/35 bg-[#38bdf8]/6 p-4 shadow-[0_18px_44px_rgba(0,0,0,.42)]">
      <div className="min-w-0">
        <p className="text-[15px] font-bold tracking-[-.02em] text-[#f4f9ff]">Have you played in this league before?</p>
        <p className="mt-1.5 font-inter-body text-xs text-[#8ba4c4]">
          Link your account to your player profile to see your stats and match history.
        </p>
      </div>
      <Link
        href="/settings"
        className="inline-flex h-[34px] shrink-0 items-center rounded bg-[#38bdf8] px-3.5 text-xs font-bold whitespace-nowrap text-[#05101d] transition-colors hover:bg-[#7dd3fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8]"
      >
        Link profile
      </Link>
    </div>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/overview-viewer-cards.test.tsx`
Expected: PASS, 8 tests. (88 points over 42 games is 2.095, shown as `2.1`.)

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add components/overview/OverviewYourStats.tsx components/overview/OverviewPromptCards.tsx __tests__/overview-viewer-cards.test.tsx
git commit -m "Add Overview your stats card and sign-in and link profile prompts" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Next game presentational components

These render the inside of the card only. The outer card element, with its border and shadow, belongs to `NextMatchCard` (Task 8).

**Files:**
- Create: `components/overview/NextGameCard.tsx`
- Test: `__tests__/overview-next-game-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/overview-next-game-card.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { NextGameIdle, NextGameLineup } from '@/components/overview/NextGameCard'

const LINEUP = {
  week: 16,
  date: '09 Apr 2026',
  format: '5-a-side',
  teamA: ['Alice', 'Bob'],
  teamB: ['Charlie', 'Dave'],
  location: 'Mabley Green',
  kickoffTime: '8pm',
  canEdit: false,
  onEditLineups: jest.fn(),
  onResultGame: jest.fn(),
}

describe('NextGameLineup', () => {
  it('shows the header, both teams and the fixture footer', () => {
    render(<NextGameLineup {...LINEUP} />)
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(screen.getByText('Week 16')).toBeInTheDocument()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Team A')).toBeInTheDocument()
    expect(screen.getByText('Team B')).toBeInTheDocument()
    for (const name of ['Alice', 'Bob', 'Charlie', 'Dave']) {
      expect(screen.getByText(name)).toBeInTheDocument()
    }
    expect(screen.getByText('Mabley Green · 5-a-side')).toBeInTheDocument()
    expect(screen.getByText('Thu 09 Apr · 8pm')).toBeInTheDocument()
  })

  it('marks the viewer and their team when they are on Team A', () => {
    render(<NextGameLineup {...LINEUP} linkedPlayerName="Alice" />)
    const tag = screen.getByText('Your team')
    expect(tag).toHaveClass('bg-[#38bdf8]')
    expect(tag.parentElement).toHaveTextContent('Team A')
    expect(screen.getByText('You').parentElement).toHaveTextContent('Alice')
  })

  it('uses the violet tag when the viewer is on Team B', () => {
    render(<NextGameLineup {...LINEUP} linkedPlayerName="Dave" />)
    const tag = screen.getByText('Your team')
    expect(tag).toHaveClass('bg-[#a78bfa]')
    expect(tag.parentElement).toHaveTextContent('Team B')
    expect(screen.getByText('You').parentElement).toHaveTextContent('Dave')
  })

  it('shows no markers for guests or a viewer who is not playing', () => {
    const { rerender } = render(<NextGameLineup {...LINEUP} />)
    expect(screen.queryByText('Your team')).not.toBeInTheDocument()
    expect(screen.queryByText('You')).not.toBeInTheDocument()
    rerender(<NextGameLineup {...LINEUP} linkedPlayerName="Zed" />)
    expect(screen.queryByText('Your team')).not.toBeInTheDocument()
    expect(screen.queryByText('You')).not.toBeInTheDocument()
  })

  it('leaves missing footer parts out', () => {
    render(<NextGameLineup {...LINEUP} location={null} format={null} kickoffTime={null} />)
    expect(screen.getByText('Thu 09 Apr')).toBeInTheDocument()
    expect(screen.queryByText(/Mabley Green/)).not.toBeInTheDocument()
    expect(screen.queryByText(/5-a-side/)).not.toBeInTheDocument()
  })

  it('shows the action buttons only to those who can edit', () => {
    const onEditLineups = jest.fn()
    const onResultGame = jest.fn()
    const { rerender } = render(<NextGameLineup {...LINEUP} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    rerender(<NextGameLineup {...LINEUP} canEdit onEditLineups={onEditLineups} onResultGame={onResultGame} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lineups' }))
    fireEvent.click(screen.getByRole('button', { name: 'Result Game' }))
    expect(onEditLineups).toHaveBeenCalledTimes(1)
    expect(onResultGame).toHaveBeenCalledTimes(1)
  })

  it('swaps the badge once the deadline has passed', () => {
    render(<NextGameLineup {...LINEUP} awaitingResult />)
    expect(screen.getByText('Awaiting Result')).toBeInTheDocument()
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()
  })
})

describe('NextGameIdle', () => {
  it('tells non-editors when to expect teams and offers no buttons', () => {
    render(<NextGameIdle week={16} canEdit={false} onBuildTeams={jest.fn()} onCancelGame={jest.fn()} />)
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(screen.getByText('Week 16')).toBeInTheDocument()
    expect(screen.getByText('No lineup')).toBeInTheDocument()
    expect(screen.getByText('Lineups not set yet')).toBeInTheDocument()
    expect(screen.getByText('Teams are usually posted the day before.')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('gives editors Build Teams and Cancel Game', () => {
    const onBuildTeams = jest.fn()
    const onCancelGame = jest.fn()
    render(<NextGameIdle week={16} canEdit onBuildTeams={onBuildTeams} onCancelGame={onCancelGame} />)
    expect(screen.getByText('Pick who is playing and we will balance the teams.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Game' }))
    expect(onBuildTeams).toHaveBeenCalledTimes(1)
    expect(onCancelGame).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/overview-next-game-card.test.tsx`
Expected: FAIL. Cannot find module `@/components/overview/NextGameCard`.

- [ ] **Step 3: Implement**

Create `components/overview/NextGameCard.tsx`:

```tsx
import { Calendar, MapPin } from 'lucide-react'
import { cn, formatFixtureDate } from '@/lib/utils'

const BADGE_BASE = 'rounded border px-2.5 py-[5px] font-plex text-[9px] font-bold uppercase tracking-[.18em] whitespace-nowrap'
const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#38bdf8]'

function NextGameHeader({ week, badge }: { week: number; badge: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[#1b2c46] bg-[#0c1728] px-4 py-3">
      <div>
        <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">Next game</p>
        <p className="mt-[5px] text-[15px] font-bold leading-none tracking-[-.02em] text-[#f4f9ff]">Week {week}</p>
      </div>
      {badge}
    </div>
  )
}

// ─── Lineups set ──────────────────────────────────────────────────────────────

function TeamColumn({
  team,
  players,
  linkedPlayerName,
}: {
  team: 'A' | 'B'
  players: string[]
  linkedPlayerName: string | null
}) {
  const isA = team === 'A'
  const viewerOnTeam = linkedPlayerName !== null && players.includes(linkedPlayerName)

  return (
    <div className="min-w-0">
      <div className="flex h-[26px] items-center justify-between gap-2 border-b border-[#1b2c46] pb-2">
        <span className={cn('text-xs font-bold uppercase tracking-[.04em]', isA ? 'text-[#7dd3fc]' : 'text-[#c4b5fd]')}>
          {isA ? 'Team A' : 'Team B'}
        </span>
        {viewerOnTeam && (
          <span className={cn(
            'rounded-[3px] px-[5px] py-0.5 font-plex text-[7.5px] font-bold uppercase tracking-[.14em] text-[#05101d]',
            isA ? 'bg-[#38bdf8]' : 'bg-[#a78bfa]'
          )}>
            Your team
          </span>
        )}
      </div>
      <ul className="mt-2 flex flex-col gap-[5px]">
        {players.map((name) => {
          const you = name === linkedPlayerName
          return (
            <li
              key={name}
              className={cn(
                'flex items-center justify-between gap-2 rounded border-l-2 px-2.5 py-[7px] font-inter-body text-xs',
                you ? 'font-bold' : 'font-semibold',
                isA
                  ? 'border-[#38bdf8] bg-[rgba(8,47,73,.55)] text-[#dff1ff]'
                  : 'border-[#a78bfa] bg-[rgba(46,16,101,.45)] text-[#efeaff]'
              )}
            >
              <span className="truncate">{name}</span>
              {you && (
                <span className={cn(
                  'shrink-0 font-plex text-[7.5px] font-bold uppercase tracking-[.14em]',
                  isA ? 'text-[#7dd3fc]' : 'text-[#c4b5fd]'
                )}>
                  You
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface NextGameLineupProps {
  week: number
  /** 'DD MMM YYYY' */
  date: string
  format: string | null
  teamA: string[]
  teamB: string[]
  /** The viewer's linked player, for the YOUR TEAM and YOU markers. */
  linkedPlayerName?: string | null
  location?: string | null
  kickoffTime?: string | null
  /** True once the 20:00 deadline has passed with no result. */
  awaitingResult?: boolean
  canEdit: boolean
  onEditLineups: () => void
  onResultGame: () => void
}

/** Overview next game card, lineups set. Renders inside NextMatchCard's card element. */
export function NextGameLineup({
  week,
  date,
  format,
  teamA,
  teamB,
  linkedPlayerName = null,
  location = null,
  kickoffTime = null,
  awaitingResult = false,
  canEdit,
  onEditLineups,
  onResultGame,
}: NextGameLineupProps) {
  const venue = [location, format].filter(Boolean).join(' · ')
  const when = [formatFixtureDate(date), kickoffTime].filter(Boolean).join(' · ')

  return (
    <>
      <NextGameHeader
        week={week}
        badge={awaitingResult ? (
          <span className={cn(BADGE_BASE, 'border-[#223a5c] text-[#8ba4c4]')}>Awaiting Result</span>
        ) : (
          <span className={cn(BADGE_BASE, 'inline-flex items-center gap-[7px] border-[#38bdf8]/40 bg-[#38bdf8]/12 text-[#7dd3fc]')}>
            <span className="size-1.5 rounded-full bg-[#38bdf8] animate-cf-pulse motion-reduce:animate-none" />
            Upcoming
          </span>
        )}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3.5 px-4 py-3.5">
        <TeamColumn team="A" players={teamA} linkedPlayerName={linkedPlayerName} />
        <TeamColumn team="B" players={teamB} linkedPlayerName={linkedPlayerName} />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#1b2c46] bg-[#0c1728] px-4 py-2.5 font-plex text-[9px] uppercase tracking-[.12em] text-[#8ba4c4]">
        {venue ? (
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <MapPin className="size-[11px] shrink-0" aria-hidden />
            <span className="truncate">{venue}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <Calendar className="size-[11px] shrink-0" aria-hidden />
          <span>{when}</span>
        </span>
      </div>

      {canEdit && (
        <div className="flex gap-2 border-t border-[#1b2c46] bg-[#38bdf8]/6 px-4 py-3">
          <button
            type="button"
            onClick={onEditLineups}
            className={cn(
              'h-10 flex-1 rounded border border-[#38bdf8] text-[13px] font-bold text-[#7dd3fc] transition-colors hover:bg-[#38bdf8]/12 hover:text-white',
              FOCUS_RING
            )}
          >
            Edit Lineups
          </button>
          <button
            type="button"
            onClick={onResultGame}
            className={cn(
              'h-10 flex-[1.4] rounded bg-[#38bdf8] text-[13px] font-bold text-[#05101d] shadow-[0_8px_22px_rgba(56,189,248,.25)] transition-colors hover:bg-[#7dd3fc]',
              FOCUS_RING
            )}
          >
            Result Game
          </button>
        </div>
      )}
    </>
  )
}

// ─── Not built ────────────────────────────────────────────────────────────────

// Ghost rows fade downwards: dashed outline / solid left edge alphas .45/.6, .35/.45, .2/.3.
const GHOST_A = [
  'border-[#38bdf8]/45 border-l-[#38bdf8]/60',
  'border-[#38bdf8]/35 border-l-[#38bdf8]/45',
  'border-[#38bdf8]/20 border-l-[#38bdf8]/30',
]
const GHOST_B = [
  'border-[#a78bfa]/45 border-l-[#a78bfa]/60',
  'border-[#a78bfa]/35 border-l-[#a78bfa]/45',
  'border-[#a78bfa]/20 border-l-[#a78bfa]/30',
]

function GhostColumn({ rows }: { rows: string[] }) {
  return (
    <div className="flex flex-col gap-[5px]">
      {rows.map((colour) => (
        <span
          key={colour}
          className={cn('h-[22px] rounded border border-dashed border-l-2 [border-left-style:solid]', colour)}
        />
      ))}
    </div>
  )
}

interface NextGameIdleProps {
  week: number
  canEdit: boolean
  onBuildTeams: () => void
  onCancelGame: () => void
}

/** Overview next game card, lineups not built. Renders inside NextMatchCard's card element. */
export function NextGameIdle({ week, canEdit, onBuildTeams, onCancelGame }: NextGameIdleProps) {
  return (
    <>
      <NextGameHeader
        week={week}
        badge={<span className={cn(BADGE_BASE, 'border-dashed border-[#223a5c] text-[#4f688a]')}>No lineup</span>}
      />

      <div className="flex flex-col items-center gap-3 px-4 py-[22px] text-center">
        <div aria-hidden className="grid w-full max-w-[300px] grid-cols-2 gap-3.5 opacity-70">
          <GhostColumn rows={GHOST_A} />
          <GhostColumn rows={GHOST_B} />
        </div>

        <div>
          <p className="text-sm font-bold text-[#f4f9ff]">Lineups not set yet</p>
          <p className="mt-[5px] font-inter-body text-xs text-[#8ba4c4]">
            {canEdit
              ? 'Pick who is playing and we will balance the teams.'
              : 'Teams are usually posted the day before.'}
          </p>
        </div>

        {canEdit && (
          <div className="mt-0.5 flex w-full gap-2">
            <button
              type="button"
              onClick={onCancelGame}
              className={cn(
                'h-[34px] flex-1 rounded border border-[#e2686f]/40 text-xs font-bold text-[#e2686f] transition-colors hover:bg-[#e2686f]/10',
                FOCUS_RING
              )}
            >
              Cancel Game
            </button>
            <button
              type="button"
              onClick={onBuildTeams}
              className={cn(
                'h-[34px] flex-[2] rounded bg-[#38bdf8] text-xs font-bold text-[#05101d] transition-colors hover:bg-[#7dd3fc]',
                FOCUS_RING
              )}
            >
              Build Teams
            </button>
          </div>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/overview-next-game-card.test.tsx`
Expected: PASS, 9 tests.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/overview/NextGameCard.tsx __tests__/overview-next-game-card.test.tsx
git commit -m "Add Overview next game lineup and idle views" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: `NextMatchCard` Overview variant and its wrapper

`NextMatchCard` keeps its state machine, handlers and modals. With `variant="overview"` it (a) takes its first state from `initialScheduledWeek` instead of fetching, and (b) renders the idle and lineup states with the Task 7 components. Building and cancelled are untouched. With the default variant nothing changes.

**Files:**
- Modify: `components/NextMatchCard.tsx`
- Create: `components/overview/OverviewNextGame.tsx`
- Test: `__tests__/next-match-card-overview.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/next-match-card-overview.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { createClient } from '@/lib/supabase/client'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { ScheduledWeek } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))

const SCHEDULED: ScheduledWeek = {
  id: 'w16', season: '2026', week: 16, date: '09 Apr 2026', format: '5-a-side',
  teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'], status: 'scheduled',
}

const BASE = {
  gameId: 'game-1',
  leagueSlug: 'the-boot-room',
  weeks: [],
  onResultSaved: jest.fn(),
  variant: 'overview' as const,
  overview: { linkedPlayerName: 'Alice', location: 'Mabley Green', kickoffTime: '8pm' },
}

// Monday 6 Apr 2026, midday: Thursday 9 Apr is upcoming.
beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers().setSystemTime(new Date(2026, 3, 6, 12))
})
afterEach(() => { jest.useRealTimers() })

describe('NextMatchCard, overview variant', () => {
  it('renders the seeded lineup on first paint without a client fetch', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(screen.getByText('Week 16')).toBeInTheDocument()
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.getByText('Your team')).toBeInTheDocument()
    expect(screen.getByText('Mabley Green · 5-a-side')).toBeInTheDocument()
    expect(screen.getByText('Thu 09 Apr · 8pm')).toBeInTheDocument()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('leaves out ratings and the share button', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={{ ...SCHEDULED, team_a_rating: 1.234, team_b_rating: 1.111 }} canEdit />)
    expect(screen.queryByText('1.234')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
  })

  it('is read-only for viewers who cannot edit', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('opens the team builder from Edit Lineups', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lineups' }))
    expect(screen.getByText('Select attending players')).toBeInTheDocument()
  })

  it('renders the idle view with no seed and opens the builder from Build Teams', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={null} canEdit />)
    expect(screen.getByText('No lineup')).toBeInTheDocument()
    expect(screen.getByText('Lineups not set yet')).toBeInTheDocument()
    expect(createClient).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
    expect(screen.getByText('Select attending players')).toBeInTheDocument()
  })

  it('opens the cancel confirmation from the idle view', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={null} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Game' }))
    expect(screen.getByText(/^Cancel Week \d+\?$/)).toBeInTheDocument()
  })

  it('shows a seeded cancelled week with the existing cancelled row', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={{ ...SCHEDULED, status: 'cancelled', teamA: [], teamB: [] }} canEdit />)
    expect(screen.getByText('Cancelled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/next-match-card-overview.test.tsx`
Expected: FAIL. The card renders nothing (it starts in `loading` and calls the mocked `createClient`, which returns `undefined`), so `Next game` is not found.

- [ ] **Step 3: Add the props and the server seed to `NextMatchCard`**

In `components/NextMatchCard.tsx`:

Add an import after the `FormDots` import:

```tsx
import { NextGameIdle, NextGameLineup } from '@/components/overview/NextGameCard'
```

Add to the `Props` interface, after `leagueName?: string`:

```tsx
  /**
   * 'overview' renders the idle and lineup states in the Overview tab design and
   * takes its first state from `initialScheduledWeek` instead of fetching, so the
   * card is in the page's first paint. Building and cancelled are the same in both.
   */
  variant?: 'results' | 'overview'
  /** Extra context shown by the Overview variant. */
  overview?: {
    linkedPlayerName?: string | null
    location?: string | null
    kickoffTime?: string | null
  }
```

Add to the destructured parameters, after `leagueName = '',`:

```tsx
  variant = 'results',
  overview,
```

Replace these two lines:

```tsx
  const [cardState, setCardState] = useState<CardState>('loading')
  const [scheduledWeek, setScheduledWeek] = useState<ScheduledWeek | null>(null)
```

with:

```tsx
  const isOverview = variant === 'overview'
  const [cardState, setCardState] = useState<CardState>(() => {
    if (!isOverview) return 'loading'
    if (!initialScheduledWeek) return 'idle'
    return initialScheduledWeek.status === 'cancelled' ? 'cancelled' : 'lineup'
  })
  const [scheduledWeek, setScheduledWeek] = useState<ScheduledWeek | null>(
    isOverview ? initialScheduledWeek ?? null : null
  )
```

In the load effect (the `useEffect` that contains `async function load()`; `if (publicMode) {` also appears in several handlers, which must not change), replace its first line:

```tsx
    if (publicMode) {
```

with:

```tsx
    // Public mode and the Overview variant take the week from the server.
    if (publicMode || isOverview) {
```

and replace the effect's dependency array:

```tsx
  }, [gameId, publicMode, initialScheduledWeek])
```

with:

```tsx
  }, [gameId, publicMode, isOverview, initialScheduledWeek])
```

- [ ] **Step 4: Render the Overview views**

Still in `components/NextMatchCard.tsx`, in the returned JSX.

Replace the opening of the idle block:

```tsx
        {/* ── IDLE ── */}
        {cardState === 'idle' && (
          canEdit ? (
```

with:

```tsx
        {/* ── IDLE (Overview tab) ── */}
        {isOverview && cardState === 'idle' && (
          <NextGameIdle
            week={nextWeekNum}
            canEdit={canEdit}
            onBuildTeams={() => { onBuildStart?.(); setCardState('building') }}
            onCancelGame={() => { setError(null); setShowCancelModal(true) }}
          />
        )}

        {/* ── IDLE ── */}
        {!isOverview && cardState === 'idle' && (
          canEdit ? (
```

Directly above the `{/* ── LINEUP header ── */}` comment, add:

```tsx
        {/* ── LINEUP (Overview tab) ── */}
        {isOverview && cardState === 'lineup' && scheduledWeek && (
          <NextGameLineup
            week={displayWeek}
            date={displayDate}
            format={scheduledWeek.format}
            teamA={scheduledWeek.teamA}
            teamB={scheduledWeek.teamB}
            linkedPlayerName={overview?.linkedPlayerName ?? null}
            location={overview?.location ?? null}
            kickoffTime={overview?.kickoffTime ?? null}
            awaitingResult={isPastDeadline(scheduledWeek.date)}
            canEdit={canEdit && scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0}
            onEditLineups={handleEditLineup}
            onResultGame={() => { setError(null); setShowResultModal(true) }}
          />
        )}

```

Then keep the three existing Results lineup blocks out of the Overview variant. There are exactly three places where a block opens with `{cardState === 'lineup' && scheduledWeek &&`: the `LINEUP header`, the `LINEUP body` and the `LINEUP footer` (the footer's condition continues with `scheduledWeek.teamA.length > 0 && ...`). In each of the three, change the start of the condition from:

```tsx
        {cardState === 'lineup' && scheduledWeek &&
```

to:

```tsx
        {!isOverview && cardState === 'lineup' && scheduledWeek &&
```

Do not touch the `BUILDING` or `CANCELLED` blocks, the cancel dialog, `AddPlayerModal` or `ResultModal`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/next-match-card-overview.test.tsx`
Expected: PASS, 7 tests.

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npx eslint components/NextMatchCard.tsx`
Expected: no output. The file is lint-clean before this task and must stay that way.

- [ ] **Step 6: Create the page wrapper**

Create `components/overview/OverviewNextGame.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { Player, ScheduledWeek, Week } from '@/lib/types'

interface OverviewNextGameProps {
  gameId: string
  leagueSlug: string
  leagueName: string
  weeks: Week[]
  allPlayers: Player[]
  /** From getNextMatchSeed on the server, so the card is in the first paint. */
  initialScheduledWeek: ScheduledWeek | null
  /** The viewer's tier is allowed to build teams and record results (match_entry). */
  canEdit: boolean
  /** Public tier: writes go through the public API routes. */
  publicMode: boolean
  leagueDayIndex?: number
  linkedPlayerName: string | null
  location: string | null
  kickoffTime: string | null
}

/**
 * Thin client wrapper that renders NextMatchCard in its Overview variant.
 * Takes serialisable props from the server page and supplies the refresh callback.
 */
export function OverviewNextGame({
  gameId,
  leagueSlug,
  leagueName,
  weeks,
  allPlayers,
  initialScheduledWeek,
  canEdit,
  publicMode,
  leagueDayIndex,
  linkedPlayerName,
  location,
  kickoffTime,
}: OverviewNextGameProps) {
  const router = useRouter()

  return (
    <NextMatchCard
      variant="overview"
      overview={{ linkedPlayerName, location, kickoffTime }}
      gameId={gameId}
      leagueSlug={leagueSlug}
      leagueName={leagueName}
      weeks={weeks}
      allPlayers={allPlayers}
      initialScheduledWeek={initialScheduledWeek}
      canEdit={canEdit}
      publicMode={publicMode}
      canAutoPick={true}
      leagueDayIndex={leagueDayIndex}
      onResultSaved={() => (publicMode ? window.location.reload() : router.refresh())}
    />
  )
}
```

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add components/NextMatchCard.tsx components/overview/OverviewNextGame.tsx __tests__/next-match-card-overview.test.tsx
git commit -m "Add an Overview variant of the next match card seeded from the server" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Tab bar and Stats button

**Files:**
- Modify: `components/LeagueTabNav.tsx`
- Modify: `components/MobileStatsFAB.tsx`
- Modify: `__tests__/league-tab-skeleton.test.tsx`
- Test: `__tests__/league-tab-nav.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/league-tab-nav.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { useSelectedLayoutSegment } from 'next/navigation'
import { LeagueTabNav } from '@/components/LeagueTabNav'
import { MobileStatsFAB } from '@/components/MobileStatsFAB'

jest.mock('next/navigation', () => ({
  useSelectedLayoutSegment: jest.fn(),
}))

const segment = useSelectedLayoutSegment as jest.Mock

// jsdom has no layout engine; ScrollTabIntoView calls this on the active tab.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn()
})

describe('LeagueTabNav', () => {
  it('lists Overview first, hidden on large screens', () => {
    segment.mockReturnValue('results')
    render(<LeagueTabNav leagueSlug="the-boot-room" />)
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual(['Overview', 'Results', 'Players', 'Honours', 'Lineup Lab'])
    expect(links[0]).toHaveAttribute('href', '/the-boot-room/overview')
    expect(links[0]).toHaveClass('lg:hidden')
    expect(links[1]).not.toHaveClass('lg:hidden')
  })

  it('marks Overview as current on the overview segment', () => {
    segment.mockReturnValue('overview')
    render(<LeagueTabNav leagueSlug="the-boot-room" />)
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('MobileStatsFAB', () => {
  it('shows the Stats button on other tabs', () => {
    segment.mockReturnValue('results')
    render(<MobileStatsFAB><p>stats</p></MobileStatsFAB>)
    expect(screen.getByRole('button', { name: 'View live stats' })).toBeInTheDocument()
  })

  it('renders nothing on the Overview tab', () => {
    segment.mockReturnValue('overview')
    const { container } = render(<MobileStatsFAB><p>stats</p></MobileStatsFAB>)
    expect(container).toBeEmptyDOMElement()
  })
})
```

In `__tests__/league-tab-skeleton.test.tsx`, add the Overview row to the list in the `renders the real tab links for the league` test:

```tsx
    for (const [label, path] of [
      ['Overview', 'overview'],
      ['Results', 'results'],
      ['Players', 'players'],
      ['Honours', 'honours'],
      ['Lineup Lab', 'lineup-lab'],
    ]) {
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/league-tab-nav.test.tsx __tests__/league-tab-skeleton.test.tsx`
Expected: FAIL. No Overview link exists, and the FAB still renders on the `overview` segment.

- [ ] **Step 3: Add the Overview tab**

In `components/LeagueTabNav.tsx`, replace the lucide import and the `TABS` constant with:

```tsx
import { LayoutGrid, ClipboardList, Users, Trophy, FlaskConical, type LucideIcon } from 'lucide-react'
```

```tsx
// Overview stands in for the stats sidebar, so it only exists below lg.
const TABS: { key: string; label: string; icon: LucideIcon; className?: string }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutGrid, className: 'lg:hidden' },
  { key: 'results', label: 'Results', icon: ClipboardList },
  { key: 'players', label: 'Players', icon: Users },
  { key: 'honours', label: 'Honours', icon: Trophy },
  { key: 'lineup-lab', label: 'Lineup Lab', icon: FlaskConical },
]
```

Replace the `TABS.map(...)` block with:

```tsx
      {TABS.map(({ key, label, icon: Icon, className }) => (
        <Link
          key={key}
          href={`/${leagueSlug}/${key}`}
          aria-current={currentTab === key ? 'page' : undefined}
          className={cn(
            '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 pb-[11px] font-plex text-[10.5px] font-bold uppercase tracking-[.14em] whitespace-nowrap transition-colors',
            currentTab === key
              ? 'border-[#38bdf8] text-[#f4f9ff]'
              : 'border-transparent text-[#8ba4c4] hover:text-[#f4f9ff]',
            className
          )}
        >
          <ScrollTabIntoView active={currentTab === key} />
          <Icon className="size-[13px]" />
          {label}
        </Link>
      ))}
```

- [ ] **Step 4: Hide the Stats button on Overview**

In `components/MobileStatsFAB.tsx`, add the import below the React import:

```tsx
import { useSelectedLayoutSegment } from 'next/navigation'
```

Add as the first line inside the component body, above `const [open, setOpen] = useState(false)`:

```tsx
  const segment = useSelectedLayoutSegment()
```

Add directly above the component's `return (`, after the last `useEffect` (hooks must all run before this early return):

```tsx
  // The Overview tab is the stats, so the button has nothing to add there.
  if (segment === 'overview') return null

```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/league-tab-nav.test.tsx __tests__/league-tab-skeleton.test.tsx`
Expected: PASS, both suites.

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add components/LeagueTabNav.tsx components/MobileStatsFAB.tsx __tests__/league-tab-nav.test.tsx __tests__/league-tab-skeleton.test.tsx
git commit -m "Add the Overview tab to the league tab bar and hide the Stats button on it" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: The Overview route

**Files:**
- Create: `components/overview/OverviewDesktopRedirect.tsx`
- Create: `app/[slug]/(tabs)/overview/page.tsx`
- Create: `app/[slug]/(tabs)/overview/loading.tsx`
- Test: `__tests__/overview-desktop-redirect.test.tsx`

- [ ] **Step 1: Write the failing test for the large-screen guard**

Create `__tests__/overview-desktop-redirect.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, act } from '@testing-library/react'
import { OverviewDesktopRedirect } from '@/components/overview/OverviewDesktopRedirect'

const replace = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}))

/** Installs a matchMedia stub and returns a function that flips it and fires `change`. */
function mockMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>()
  const mq = {
    matches: initial,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }
  window.matchMedia = jest.fn().mockReturnValue(mq)
  return {
    set(matches: boolean) {
      mq.matches = matches
      listeners.forEach((fn) => fn())
    },
    listeners,
  }
}

beforeEach(() => replace.mockClear())

describe('OverviewDesktopRedirect', () => {
  it('sends a large screen to Results', () => {
    mockMatchMedia(true)
    render(<OverviewDesktopRedirect leagueSlug="the-boot-room" />)
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1024px)')
    expect(replace).toHaveBeenCalledWith('/the-boot-room/results')
  })

  it('leaves a small screen alone', () => {
    mockMatchMedia(false)
    render(<OverviewDesktopRedirect leagueSlug="the-boot-room" />)
    expect(replace).not.toHaveBeenCalled()
  })

  it('redirects when the screen grows past the breakpoint, and stops listening on unmount', () => {
    const media = mockMatchMedia(false)
    const { unmount } = render(<OverviewDesktopRedirect leagueSlug="the-boot-room" />)
    act(() => media.set(true))
    expect(replace).toHaveBeenCalledWith('/the-boot-room/results')
    unmount()
    expect(media.listeners.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/overview-desktop-redirect.test.tsx`
Expected: FAIL. Cannot find module `@/components/overview/OverviewDesktopRedirect`.

- [ ] **Step 3: Implement the guard**

Create `components/overview/OverviewDesktopRedirect.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * The Overview tab only exists below lg. If a large screen ends up on
 * /overview (shared link, or a tablet rotated to landscape), send it to Results.
 */
export function OverviewDesktopRedirect({ leagueSlug }: { leagueSlug: string }) {
  const router = useRouter()

  useEffect(() => {
    const largeScreen = window.matchMedia('(min-width: 1024px)')
    const redirectIfLarge = () => {
      if (largeScreen.matches) router.replace(`/${leagueSlug}/results`)
    }
    redirectIfLarge()
    largeScreen.addEventListener('change', redirectIfLarge)
    return () => largeScreen.removeEventListener('change', redirectIfLarge)
  }, [router, leagueSlug])

  return null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `NODE_OPTIONS=--experimental-vm-modules npx jest __tests__/overview-desktop-redirect.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 5: Create the loading state**

Create `app/[slug]/(tabs)/overview/loading.tsx`:

```tsx
import { LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'

export default function Loading() {
  return <LeagueTabSkeleton />
}
```

- [ ] **Step 6: Create the page**

Create `app/[slug]/(tabs)/overview/page.tsx`:

```tsx
// app/[slug]/(tabs)/overview/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled, isLeagueHidden } from '@/lib/features'
import { dayNameToIndex, getNextMatchSeed, getOverviewViewerCard } from '@/lib/utils'
import { getGameBySlug, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getMyClaimInfo, ensureUnrecordedWeek } from '@/lib/fetchers'
import { computeQuarterlyTable, getQuarterStanding, getLastResult } from '@/lib/sidebar-stats'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { LeagueTabSkeleton } from '@/components/LeagueTabSkeleton'
import { BfcacheRefresh } from '@/components/BfcacheRefresh'
import { InFormWidget, TeamABWidget } from '@/components/StatsSidebar'
import { OverviewDesktopRedirect } from '@/components/overview/OverviewDesktopRedirect'
import { OverviewNextGame } from '@/components/overview/OverviewNextGame'
import { OverviewYourStats } from '@/components/overview/OverviewYourStats'
import { OverviewSignInCard, OverviewLinkProfileCard } from '@/components/overview/OverviewPromptCards'
import { OverviewTableCard } from '@/components/overview/OverviewTableCard'

interface Props {
  params: Promise<{ slug: string }>
}

export default async function LeagueOverviewPage({ params }: Props) {
  const { slug } = await params
  const game = await getGameBySlug(slug)
  if (!game) notFound()
  const leagueId = game.id

  // Everything below is independent given leagueId, so it runs in one batch.
  // The tabs layout (header and sidebar) shares these cached fetchers.
  const [
    { userRole, isAuthenticated },
    features,
    players,
    rawWeeks,
    claim,
  ] = await Promise.all([
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getMyClaimInfo(leagueId), // 'none' for non-members, no query
  ])

  const tier = resolveVisibilityTier(userRole)

  if (isLeagueHidden(features, tier)) {
    return <LeaguePrivateState leagueName={game.name} />
  }

  const isAdmin = tier === 'admin'
  const canSeeMatchHistory = isAdmin || isFeatureEnabled(features, 'match_history', tier)
  const canSeeMatchEntry = isAdmin || isFeatureEnabled(features, 'match_entry', tier)
  const leagueDayIndex = dayNameToIndex(game.day ?? null) ?? undefined

  // Overview is the small-screen landing page, so it must keep week numbers and
  // "games left" honest the same way Results does.
  const weeks = tier !== 'public'
    ? await ensureUnrecordedWeek(leagueId, rawWeeks, leagueDayIndex)
    : rawWeeks

  // claim.playerName is only set for an approved claim.
  const linkedPlayer = claim.playerName
    ? players.find((p) => p.name === claim.playerName) ?? null
    : null
  const viewerCard = getOverviewViewerCard({
    isAuthenticated,
    tier,
    claimStatus: claim.status,
    hasLinkedPlayer: linkedPlayer !== null,
  })

  const table = computeQuarterlyTable(weeks, new Date(), leagueDayIndex)
  const standing = getQuarterStanding(table.allEntries, linkedPlayer?.name)
  const lastResult = canSeeMatchHistory ? getLastResult(weeks) : null

  return (
    <>
      <OverviewDesktopRedirect leagueSlug={slug} />
      <BfcacheRefresh />

      {/* Large screens are redirected to Results; show a placeholder until then
          so the cards never flash next to the sidebar. */}
      <div className="hidden lg:block">
        <LeagueTabSkeleton />
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        <OverviewNextGame
          gameId={leagueId}
          leagueSlug={game.slug}
          leagueName={game.name}
          weeks={weeks}
          allPlayers={players}
          initialScheduledWeek={getNextMatchSeed(weeks)}
          canEdit={canSeeMatchEntry}
          publicMode={tier === 'public'}
          leagueDayIndex={leagueDayIndex}
          linkedPlayerName={linkedPlayer?.name ?? null}
          location={game.location ?? null}
          kickoffTime={game.kickoff_time ?? null}
        />

        {viewerCard === 'your-stats' && linkedPlayer && (
          <OverviewYourStats
            player={linkedPlayer}
            standing={standing}
            quarterLabel={`Q${table.displayQ} ${table.displayYear}`}
          />
        )}
        {viewerCard === 'sign-in' && <OverviewSignInCard leagueSlug={slug} />}
        {viewerCard === 'link-profile' && <OverviewLinkProfileCard />}

        <OverviewTableCard table={table} standing={standing} lastResult={lastResult} />
        <InFormWidget players={players} weeks={weeks} size="page" showWindowTag />
        <TeamABWidget weeks={weeks} size="page" linkedPlayer={linkedPlayer} />
      </div>
    </>
  )
}
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npx eslint "app/[slug]/(tabs)/overview" components/overview`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add "app/[slug]/(tabs)/overview" components/overview/OverviewDesktopRedirect.tsx __tests__/overview-desktop-redirect.test.tsx
git commit -m "Add the Overview tab route" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Landing rule and entry points

**Files:**
- Modify: `app/[slug]/page.tsx`
- Modify: `app/page.tsx`
- Modify: `app/app/league/[id]/page.tsx`
- Modify: `app/results/[id]/page.tsx`
- Modify: `app/invite/page.tsx`
- Modify: `components/ui/navbar.tsx`

`leagueLandingPath` was tested in Task 1. This task wires it in and points every "open this league" link at the league root so the one rule applies.

- [ ] **Step 1: Apply the rule at the league root**

Replace the whole of `app/[slug]/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { leagueLandingPath } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
}

// Small screens land on Overview, large screens on Results. The server cannot
// see the viewport, so it goes by user agent; /overview itself redirects large
// screens to Results on the client.
export default async function LeagueRootPage({ params }: Props) {
  const { slug } = await params
  const userAgent = (await headers()).get('user-agent')
  redirect(leagueLandingPath(slug, userAgent))
}
```

- [ ] **Step 2: Point entry links at the league root**

In `app/page.tsx`, replace:

```tsx
      redirect(`/${validLeagues[0].slug}/results`)
```

with:

```tsx
      redirect(`/${validLeagues[0].slug}`)
```

and replace:

```tsx
                  href={`/${league.slug}/results`}
```

with:

```tsx
                  href={`/${league.slug}`}
```

In `app/app/league/[id]/page.tsx` and in `app/results/[id]/page.tsx`, replace:

```tsx
  redirect(`/${game.slug}/results`)
```

with:

```tsx
  redirect(`/${game.slug}`)
```

In `app/invite/page.tsx`, replace:

```tsx
      window.location.href = `/${preview.league_slug}/results`
```

with:

```tsx
      window.location.href = `/${preview.league_slug}`
```

In `components/ui/navbar.tsx`, there are two identical lines (near lines 274 and 325). Replace both:

```tsx
            <AuthDialog redirect={slug ? `/${slug}/results` : '/'} size="xs" signinOnly />
```

with:

```tsx
            <AuthDialog redirect={slug ? `/${slug}` : '/'} size="xs" signinOnly />
```

Leave these alone: the non-admin fallbacks in `proxy.ts` and `app/[slug]/settings/page.tsx`, and the `x-pathname` default in `app/[slug]/layout.tsx`.

- [ ] **Step 3: Confirm nothing else was missed**

Run: `grep -rn "/results\`" --include='*.ts' --include='*.tsx' app components lib proxy.ts | grep -v __tests__`
Expected: exactly these remain:

```
app/[slug]/layout.tsx          (x-pathname default)
app/[slug]/settings/page.tsx   (non-admin fallback)
components/overview/OverviewDesktopRedirect.tsx
proxy.ts                       (two non-admin fallbacks)
```

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add "app/[slug]/page.tsx" app/page.tsx "app/app/league/[id]/page.tsx" "app/results/[id]/page.tsx" app/invite/page.tsx components/ui/navbar.tsx
git commit -m "Land small screens on the Overview tab when opening a league" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Full verification

**Files:** none changed unless a check fails.

- [ ] **Step 1: Type check, lint, tests, build**

Run: `npx tsc --noEmit`
Expected: no output.

Run: `npm test`
Expected: the same 3 failures in 2 suites as the baseline (`utils.winCopy`, `email.notifications`) and nothing else failing. All suites added by this plan pass.

Run: `npm run lint`
Expected: no more than the baseline 9 errors and 6 warnings, and none in files this plan created.

Run: `npm run build`
Expected: build succeeds and lists `/[slug]/overview` among the routes.

- [ ] **Step 2: Run the app and check each viewport**

Run: `npm run dev` (uses `.env.local`), then open `http://localhost:3000/<league-slug>` for a league with public content.

At **390px** wide (phone user agent, for example Chrome device emulation):
- The league root lands on `/overview`.
- Overview is the first tab and is active. There is no Stats button.
- Cards appear in order: next game, card 2, last result and table, most in form, head to head.
- Signed out: card 2 is the sign-in card; `Log in` opens the dialog; no `YOU` or `YOUR TEAM` markers anywhere.
- Switch to Results: the Stats button is back.

At **820px** wide: the Overview tab is visible and the page uses the same single column.

At **1280px** wide (desktop user agent):
- The league root lands on `/results`. No Overview tab in the bar. Sidebar visible.
- Opening `/<league-slug>/overview` directly shows the skeleton briefly, then Results.

Signed in, where a session is available:
- Unlinked member: link profile card; `Link profile` goes to `/settings`.
- Linked member: your stats card; own row highlighted in the table with `YOU`; `You have played` line under head to head; `YOUR TEAM` and `YOU` on the next game when in the lineup.
- Admin, or a tier with `match_entry`: Build Teams opens the builder inline; saving shows the lineup view; Edit Lineups reopens the builder; Result Game opens the result dialog; Cancel Game opens the confirmation; a cancelled game shows Reactivate.
- Results tab: the next match card and everything else behave as before.

Compare against the prototype (`.context/overview-design/design_handoff_overview_tab/Craft Football App Restyle.dc.html`, Overview screen, Mobile viewport) and fix any spacing or colour that differs from the handoff README.

- [ ] **Step 3: Commit any fixes**

Only if Step 1 or 2 required changes:

```bash
git add -A
git commit -m "Polish the Overview tab after verification" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
