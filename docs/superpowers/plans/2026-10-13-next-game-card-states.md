# Next game card states Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Overview next game card a compact row before lineups exist, show an "Awaiting result" state from kick-off until the result is saved, and switch every "awaiting result" decision from a fixed 20:00 to the league's kick-off time.

**Architecture:** `isPastDeadline` in `lib/utils.ts` gains an optional `kickoffTime` argument (falls back to 20:00). The league's `kickoff_time` is threaded from the Overview and Results pages down to `NextMatchCard` and `MatchCard`. On Overview, `getNextMatchSeed` keeps a kicked-off scheduled week until the end of the day after the game, and `NextMatchCard` renders a new `NextGameAwaiting` component for it. `NextGameIdle` becomes a one-row card.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Jest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-13-next-game-card-states-design.md`

**Baseline:** on `main` these suites already fail for unrelated reasons (fonts, env, dates) and are not part of this work: `__tests__/og-images-render.test.tsx`, `lib/__tests__/utils.shareLinks.test.ts`, `lib/__tests__/email.templates.test.ts`, `lib/__tests__/email.notifications.test.ts`. Every other suite passes.

**Conventions (from `CLAUDE.md`):** Tailwind utilities only, palette hex values, `cn()` for conditional classes, labels in normal case with `uppercase`, British English, no em dashes in UI copy.

---

## File map

| File | Change |
|---|---|
| `lib/utils.ts` | `parseKickoffTime` (new), `isPastDeadline(date, kickoffTime?)`, `isAwaitingWindowOver` (new), `getNextMatchSeed(weeks, kickoffTime?)` |
| `components/overview/NextGameCard.tsx` | compact `NextGameIdle`; new `NextGameAwaiting`; drop `awaitingResult` from `NextGameLineup` |
| `components/NextMatchCard.tsx` | top-level `kickoffTime` prop; pass to every `isPastDeadline`; render `NextGameAwaiting` on Overview |
| `components/overview/OverviewNextGame.tsx`, `app/[slug]/(tabs)/overview/page.tsx` | pass `kickoffTime` to the seed and card |
| `components/MatchCard.tsx`, `components/WeekList.tsx`, `components/PublicMatchList.tsx` | `kickoffTime` prop on the scheduled branch |
| `components/ResultsSection.tsx`, `components/PublicResultsSection.tsx`, `components/PublicMatchEntrySection.tsx`, `app/[slug]/(tabs)/results/page.tsx` | thread `kickoffTime` |
| Tests | `lib/__tests__/utils.deadline.test.ts`, `lib/__tests__/utils.overview.test.ts`, `__tests__/overview-next-game-card.test.tsx`, `__tests__/next-match-card-overview.test.tsx`, new `__tests__/match-card-kickoff.test.tsx` |

`components/ResultsRefresher.tsx` is unused (nothing imports it); leave it alone.

---

### Task 1: Kick-off time helpers

**Files:**
- Modify: `lib/utils.ts:731-735` (`isPastDeadline`)
- Test: `lib/__tests__/utils.deadline.test.ts`

- [ ] **Step 1: Write the failing tests**

In `lib/__tests__/utils.deadline.test.ts`, change the import line to:

```ts
import { isPastDeadline, isAwaitingWindowOver, parseKickoffTime, getMostRecentExpectedGameDate, formatWeekDate } from '@/lib/utils'
```

Then add, after the existing `describe('isPastDeadline', …)` block:

```ts
// ─── parseKickoffTime ─────────────────────────────────────────────────────────

describe('parseKickoffTime', () => {
  it.each([
    ['18:30', { hours: 18, minutes: 30 }],
    ['09:00', { hours: 9, minutes: 0 }],
    ['6:30pm', { hours: 18, minutes: 30 }],
    ['7pm', { hours: 19, minutes: 0 }],
    ['7PM', { hours: 19, minutes: 0 }],
    ['12pm', { hours: 12, minutes: 0 }],
    ['12:15am', { hours: 0, minutes: 15 }],
    [' 18:30 ', { hours: 18, minutes: 30 }],
  ])('reads %p', (value, expected) => {
    expect(parseKickoffTime(value)).toEqual(expected)
  })

  it.each([null, undefined, '', 'evening', '25:00', '18:75', '13pm'])('returns null for %p', (value) => {
    expect(parseKickoffTime(value)).toBeNull()
  })
})

// ─── isPastDeadline with a kick-off time ──────────────────────────────────────

describe('isPastDeadline with a kick-off time', () => {
  // Thursday 9 Apr 2026 game day.
  afterEach(() => { jest.useRealTimers() })
  const at = (h: number, m: number) => jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, h, m))

  it('is false just before kick-off and true just after', () => {
    at(18, 29)
    expect(isPastDeadline('09 Apr 2026', '18:30')).toBe(false)
    at(18, 31)
    expect(isPastDeadline('09 Apr 2026', '18:30')).toBe(true)
  })

  it('accepts the older 12-hour form', () => {
    at(18, 31)
    expect(isPastDeadline('09 Apr 2026', '6:30pm')).toBe(true)
  })

  it('falls back to 20:00 without a kick-off time', () => {
    at(19, 0)
    expect(isPastDeadline('09 Apr 2026')).toBe(false)
    expect(isPastDeadline('09 Apr 2026', null)).toBe(false)
    at(20, 1)
    expect(isPastDeadline('09 Apr 2026', null)).toBe(true)
  })

  it('falls back to 20:00 when the kick-off time cannot be read', () => {
    at(19, 0)
    expect(isPastDeadline('09 Apr 2026', 'evening')).toBe(false)
    at(20, 1)
    expect(isPastDeadline('09 Apr 2026', 'evening')).toBe(true)
  })
})

// ─── isAwaitingWindowOver ─────────────────────────────────────────────────────

describe('isAwaitingWindowOver', () => {
  afterEach(() => { jest.useRealTimers() })

  it('stays open on game day and the day after', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, 23, 59))
    expect(isAwaitingWindowOver('09 Apr 2026')).toBe(false)
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 10, 23, 59))
    expect(isAwaitingWindowOver('09 Apr 2026')).toBe(false)
  })

  it('closes at midnight two days after the game', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 11, 0, 0))
    expect(isAwaitingWindowOver('09 Apr 2026')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest lib/__tests__/utils.deadline.test.ts`
Expected: FAIL, `parseKickoffTime` and `isAwaitingWindowOver` are not exported, and the kick-off cases fail.

- [ ] **Step 3: Implement**

In `lib/utils.ts`, replace the whole `isPastDeadline` function (currently lines 731-735) with:

```ts
/**
 * A league kick-off time: 'HH:MM' (24-hour, as the league details form saves
 * it) or the older '6:30pm' / '7pm' form. Null when missing or unreadable.
 */
export function parseKickoffTime(value: string | null | undefined): { hours: number; minutes: number } | null {
  if (!value) return null
  const v = value.trim().toLowerCase()

  const h24 = v.match(/^(\d{1,2}):(\d{2})$/)
  if (h24) {
    const hours = Number(h24[1])
    const minutes = Number(h24[2])
    return hours < 24 && minutes < 60 ? { hours, minutes } : null
  }

  const h12 = v.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/)
  if (h12) {
    const hour = Number(h12[1])
    const minutes = Number(h12[2] ?? 0)
    if (hour < 1 || hour > 12 || minutes > 59) return null
    return { hours: (hour % 12) + (h12[3] === 'pm' ? 12 : 0), minutes }
  }

  return null
}

/**
 * True once a game on `dateStr` ('DD MMM YYYY') is waiting for its result:
 * from the league's kick-off time when it has one, otherwise from 20:00.
 */
export function isPastDeadline(dateStr: string, kickoffTime?: string | null): boolean {
  const { hours, minutes } = parseKickoffTime(kickoffTime) ?? { hours: 20, minutes: 0 }
  const deadline = parseWeekDate(dateStr)
  deadline.setHours(hours, minutes, 0, 0)
  return Date.now() > deadline.getTime()
}

/**
 * True from midnight at the end of the day after the game. Until then the
 * Overview card keeps a kicked-off game on screen, waiting for its result.
 */
export function isAwaitingWindowOver(dateStr: string): boolean {
  const closes = parseWeekDate(dateStr)
  closes.setDate(closes.getDate() + 2)
  return Date.now() >= closes.getTime()
}
```

`parseWeekDate` is defined earlier in the same file (line 504) and returns local midnight of the date.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest lib/__tests__/utils.deadline.test.ts`
Expected: PASS (the original four `isPastDeadline` cases included).

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.deadline.test.ts
git commit -m "Let the result deadline follow the league's kick-off time"
```

---

### Task 2: Keep a kicked-off game in the Overview seed

**Files:**
- Modify: `lib/utils.ts` (`getNextMatchSeed`, around line 771)
- Test: `lib/__tests__/utils.overview.test.ts:71-124`

- [ ] **Step 1: Write the failing tests**

Inside `describe('getNextMatchSeed', …)` in `lib/__tests__/utils.overview.test.ts` (system time there is Monday 6 Apr 2026, 12:00), add:

```ts
  it('keeps a scheduled week that has kicked off, for the day after too', () => {
    const today = week({ week: 15, date: '06 Apr 2026', status: 'scheduled', teamA: ['Alice'], teamB: ['Bob'] })
    expect(getNextMatchSeed([today], '11:00')).toMatchObject({ week: 15, status: 'scheduled' })
    const yesterday = week({ week: 15, date: '05 Apr 2026', status: 'scheduled', teamA: ['Alice'], teamB: ['Bob'] })
    expect(getNextMatchSeed([yesterday], '18:30')).toMatchObject({ week: 15, status: 'scheduled' })
  })

  it('drops a scheduled week once the day after the game has ended', () => {
    const old = week({ week: 15, date: '04 Apr 2026', status: 'scheduled', teamA: ['Alice'], teamB: ['Bob'] })
    expect(getNextMatchSeed([old], '18:30')).toBeNull()
  })

  it('drops a cancelled week from kick-off', () => {
    const cancelled = week({ week: 15, date: '06 Apr 2026', status: 'cancelled' })
    expect(getNextMatchSeed([cancelled], '11:00')).toBeNull()
    expect(getNextMatchSeed([cancelled], '18:30')).toMatchObject({ status: 'cancelled' })
  })

  it('treats a cancelled week as 20:00 without a kick-off time', () => {
    const cancelled = week({ week: 15, date: '06 Apr 2026', status: 'cancelled' })
    expect(getNextMatchSeed([cancelled])).toMatchObject({ status: 'cancelled' })
  })
```

Also rename the existing test `'returns null when the scheduled week is past its deadline'` to `'returns null for a scheduled week two days after it was played'`. Its body (02 Apr, viewed on 6 Apr) is unchanged and must still return `null`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest lib/__tests__/utils.overview.test.ts -t getNextMatchSeed`
Expected: FAIL on "keeps a scheduled week that has kicked off" (today's rule returns `null` once 20:00 has passed on 5 Apr) and "drops a cancelled week from kick-off" (11:00 is ignored).

- [ ] **Step 3: Implement**

Replace the doc comment (if any) and body of `getNextMatchSeed` in `lib/utils.ts` with:

```ts
/**
 * The week the Overview next game card starts on, so it is in the first paint.
 * The latest scheduled, cancelled or unrecorded week, except:
 * - unrecorded → null (the card moves on to the next week)
 * - cancelled and past kick-off → null
 * - scheduled and the day after the game has ended → null. Until then a
 *   kicked-off game stays on the card, waiting for its result.
 */
export function getNextMatchSeed(weeks: Week[], kickoffTime?: string | null): ScheduledWeek | null {
  const latest = sortWeeks(
    weeks.filter((w) => w.status === 'scheduled' || w.status === 'cancelled' || w.status === 'unrecorded')
  )[0]
  if (!latest || !latest.id) return null
  if (latest.status === 'unrecorded') return null
  if (latest.status === 'cancelled' && isPastDeadline(latest.date, kickoffTime)) return null
  if (latest.status === 'scheduled' && isAwaitingWindowOver(latest.date)) return null
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest lib/__tests__/utils.overview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.overview.test.ts
git commit -m "Keep a kicked-off game on the Overview card until the day after"
```

---

### Task 3: Compact idle row and awaiting card components

**Files:**
- Modify: `components/overview/NextGameCard.tsx`
- Test: `__tests__/overview-next-game-card.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `__tests__/overview-next-game-card.test.tsx`:

1. Change the import to `import { NextGameAwaiting, NextGameIdle, NextGameLineup } from '@/components/overview/NextGameCard'`.
2. Delete the test `'swaps the badge once the deadline has passed'` and replace it with:

```ts
  it('always shows the upcoming badge', () => {
    render(<NextGameLineup {...LINEUP} />)
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
    expect(screen.queryByText(/awaiting result/i)).not.toBeInTheDocument()
  })
```

3. Replace the whole `describe('NextGameIdle', …)` block with:

```ts
const IDLE = {
  week: 16,
  date: '09 Apr 2026',
  kickoffTime: '18:30',
  onBuildTeams: jest.fn(),
  onCancelGame: jest.fn(),
}

describe('NextGameIdle', () => {
  it('is one row with the week, date and kick-off', () => {
    render(<NextGameIdle {...IDLE} canEdit={false} />)
    expect(screen.getByText('Next game')).toBeInTheDocument()
    expect(screen.getByText('Week 16')).toBeInTheDocument()
    expect(screen.getByText('Thu 09 Apr · 18:30')).toBeInTheDocument()
    expect(screen.queryByText('Lineups not set yet')).not.toBeInTheDocument()
  })

  it('shows non-editors a No lineup badge and no buttons', () => {
    render(<NextGameIdle {...IDLE} canEdit={false} />)
    expect(screen.getByText('No lineup')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('gives editors Cancel and Build Teams instead of the badge', () => {
    const onBuildTeams = jest.fn()
    const onCancelGame = jest.fn()
    render(<NextGameIdle {...IDLE} canEdit onBuildTeams={onBuildTeams} onCancelGame={onCancelGame} />)
    expect(screen.queryByText('No lineup')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Build Teams'])
    fireEvent.click(screen.getByRole('button', { name: 'Build Teams' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onBuildTeams).toHaveBeenCalledTimes(1)
    expect(onCancelGame).toHaveBeenCalledTimes(1)
  })

  it('leaves out missing parts of the meta line', () => {
    const { rerender } = render(<NextGameIdle {...IDLE} kickoffTime={null} canEdit={false} />)
    expect(screen.getByText('Thu 09 Apr')).toBeInTheDocument()
    rerender(<NextGameIdle {...IDLE} date="" kickoffTime="18:30" canEdit={false} />)
    expect(screen.getByText('18:30')).toBeInTheDocument()
    rerender(<NextGameIdle {...IDLE} date="" kickoffTime={null} canEdit={false} />)
    expect(screen.queryByTestId('next-game-meta')).not.toBeInTheDocument()
  })
})

const AWAITING = {
  week: 16,
  teamA: ['Alice', 'Bob'],
  teamB: ['Charlie', 'Dave'],
  kickoffTime: '18:30',
  onEditLineups: jest.fn(),
  onResultGame: jest.fn(),
}

describe('NextGameAwaiting', () => {
  it('shows the kick-off, the badge and both teams on one line each', () => {
    render(<NextGameAwaiting {...AWAITING} canEdit={false} />)
    expect(screen.getByText('Kicked off 18:30')).toBeInTheDocument()
    expect(screen.getByText('Week 16')).toBeInTheDocument()
    expect(screen.getByText('Awaiting result')).toBeInTheDocument()
    expect(screen.getByText('Alice, Bob')).toBeInTheDocument()
    expect(screen.getByText('Charlie, Dave')).toBeInTheDocument()
  })

  it('says Game day when the league has no kick-off time', () => {
    render(<NextGameAwaiting {...AWAITING} kickoffTime={null} canEdit={false} />)
    expect(screen.getByText('Game day')).toBeInTheDocument()
  })

  it('offers no buttons to non-editors', () => {
    render(<NextGameAwaiting {...AWAITING} canEdit={false} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('gives editors Edit Lineups and Result Game', () => {
    const onEditLineups = jest.fn()
    const onResultGame = jest.fn()
    render(<NextGameAwaiting {...AWAITING} canEdit onEditLineups={onEditLineups} onResultGame={onResultGame} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Edit Lineups', 'Result Game'])
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lineups' }))
    fireEvent.click(screen.getByRole('button', { name: 'Result Game' }))
    expect(onEditLineups).toHaveBeenCalledTimes(1)
    expect(onResultGame).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/overview-next-game-card.test.tsx`
Expected: FAIL, `NextGameAwaiting` is not exported and the idle tests fail.

- [ ] **Step 3: Implement**

In `components/overview/NextGameCard.tsx`:

**(a)** Remove `awaitingResult` from `NextGameLineup`: delete the prop and its doc comment from `NextGameLineupProps`, delete `awaitingResult = false,` from the destructuring, and replace the `badge={awaitingResult ? (…) : (…)}` expression with just the Upcoming badge:

```tsx
        badge={
          <span className={cn(BADGE_BASE, 'inline-flex items-center gap-[7px] border-[#38bdf8]/40 bg-[#38bdf8]/12 text-[#7dd3fc]')}>
            <span className="size-1.5 rounded-full bg-[#38bdf8] animate-cf-pulse motion-reduce:animate-none" />
            Upcoming
          </span>
        }
```

**(b)** Replace everything from the `// ─── Not built ───` comment to the end of the file (the `GHOST_A`/`GHOST_B` constants, `GhostColumn`, `NextGameIdleProps` and `NextGameIdle`) with:

```tsx
// ─── Not built ────────────────────────────────────────────────────────────────

interface NextGameIdleProps {
  week: number
  /** Next match date, 'DD MMM YYYY'. Empty when unknown. */
  date: string
  kickoffTime?: string | null
  canEdit: boolean
  onBuildTeams: () => void
  onCancelGame: () => void
}

/** Overview next game card, lineups not built: one row. Renders inside NextMatchCard's card element. */
export function NextGameIdle({ week, date, kickoffTime = null, canEdit, onBuildTeams, onCancelGame }: NextGameIdleProps) {
  const when = [date ? formatFixtureDate(date) : null, kickoffTime].filter(Boolean).join(' · ')

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">Next game</p>
        <p className="mt-[5px] text-[15px] font-bold leading-none tracking-[-.02em] text-[#f4f9ff]">Week {week}</p>
        {when && (
          <p data-testid="next-game-meta" className="mt-1.5 font-plex text-[9px] uppercase tracking-[.12em] text-[#8ba4c4]">
            {when}
          </p>
        )}
      </div>

      {canEdit ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onCancelGame}
            className={cn(
              'h-8 rounded border border-[#e2686f]/40 px-3 text-xs font-bold text-[#e2686f] transition-colors hover:bg-[#e2686f]/10',
              FOCUS_RING
            )}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onBuildTeams}
            className={cn(
              'h-8 rounded bg-[#38bdf8] px-3.5 text-xs font-bold whitespace-nowrap text-[#05101d] transition-colors hover:bg-[#7dd3fc]',
              FOCUS_RING
            )}
          >
            Build Teams
          </button>
        </div>
      ) : (
        <span className={cn(BADGE_BASE, 'border-dashed border-[#223a5c] text-[#4f688a]')}>No lineup</span>
      )}
    </div>
  )
}

// ─── Awaiting result ──────────────────────────────────────────────────────────

function TeamLine({ team, players }: { team: 'A' | 'B'; players: string[] }) {
  const isA = team === 'A'
  return (
    <div className="flex gap-2 py-[3px]">
      <span className={cn(
        'w-[52px] shrink-0 pt-px text-[10.5px] font-bold uppercase tracking-[.04em]',
        isA ? 'text-[#7dd3fc]' : 'text-[#c4b5fd]'
      )}>
        {isA ? 'Team A' : 'Team B'}
      </span>
      <span className="line-clamp-2 min-w-0 font-inter-body text-[11.5px] text-[#cfe0f4]">{players.join(', ')}</span>
    </div>
  )
}

interface NextGameAwaitingProps {
  week: number
  teamA: string[]
  teamB: string[]
  kickoffTime?: string | null
  canEdit: boolean
  onEditLineups: () => void
  onResultGame: () => void
}

/** Overview next game card, from kick-off until the result is saved. Renders inside NextMatchCard's card element. */
export function NextGameAwaiting({
  week,
  teamA,
  teamB,
  kickoffTime = null,
  canEdit,
  onEditLineups,
  onResultGame,
}: NextGameAwaitingProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-[#1b2c46] bg-[#0c1728] px-4 py-3">
        <div>
          <p className="font-plex text-[9px] font-bold uppercase tracking-[.18em] text-[#6f88a8]">
            {kickoffTime ? `Kicked off ${kickoffTime}` : 'Game day'}
          </p>
          <p className="mt-[5px] text-[15px] font-bold leading-none tracking-[-.02em] text-[#f4f9ff]">Week {week}</p>
        </div>
        <span className={cn(BADGE_BASE, 'inline-flex items-center gap-[7px] border-[#fbbf24]/40 bg-[#fbbf24]/8 text-[#fbbf24]')}>
          <span className="size-1.5 rounded-full bg-[#fbbf24]" />
          Awaiting result
        </span>
      </div>

      <div className="px-4 py-2.5">
        <TeamLine team="A" players={teamA} />
        <TeamLine team="B" players={teamB} />
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
```

`formatFixtureDate`, `cn`, `BADGE_BASE` and `FOCUS_RING` are already imported/defined at the top of the file. After this change `Calendar`/`MapPin`/`Share2` are still used by `NextGameLineup`; do not remove those imports.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/overview-next-game-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/overview/NextGameCard.tsx __tests__/overview-next-game-card.test.tsx
git commit -m "Compact Overview idle row and an awaiting result card"
```

(`NextMatchCard` will not type-check until Task 4; that is expected between these two commits.)

---

### Task 4: Wire the states into NextMatchCard and Overview

**Files:**
- Modify: `components/NextMatchCard.tsx`
- Modify: `components/overview/OverviewNextGame.tsx`
- Modify: `app/[slug]/(tabs)/overview/page.tsx`
- Test: `__tests__/next-match-card-overview.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `__tests__/next-match-card-overview.test.tsx`:

1. Change `BASE` so the kick-off time is a top-level prop:

```ts
const BASE = {
  gameId: 'game-1',
  leagueSlug: 'the-boot-room',
  weeks: [],
  onResultSaved: jest.fn(),
  variant: 'overview' as const,
  kickoffTime: '8pm',
  overview: { linkedPlayerName: 'Alice', location: 'Mabley Green' },
}
```

2. In `'renders the idle view with no seed and opens the builder from Build Teams'`, delete the line `expect(screen.getByText('Lineups not set yet')).toBeInTheDocument()`.
3. In `'opens the cancel confirmation from the idle view'`, change `{ name: 'Cancel Game' }` to `{ name: 'Cancel' }`.
4. Add at the end of the `describe` block:

```ts
  it('shows the awaiting card once kick-off has passed', () => {
    // Thursday 9 Apr 2026, 20:30: after the 8pm kick-off.
    jest.setSystemTime(new Date(2026, 3, 9, 20, 30))
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    expect(screen.getByText('Kicked off 8pm')).toBeInTheDocument()
    expect(screen.getByText('Awaiting result')).toBeInTheDocument()
    expect(screen.queryByText('Upcoming')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Edit Lineups' }))
    expect(screen.getByText('Select attending players')).toBeInTheDocument()
  })

  it('opens the result form from the awaiting card', () => {
    jest.setSystemTime(new Date(2026, 3, 9, 20, 30))
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    fireEvent.click(screen.getByRole('button', { name: 'Result Game' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('still shows the lineup before kick-off on game day', () => {
    jest.setSystemTime(new Date(2026, 3, 9, 19, 59))
    render(<NextMatchCard {...BASE} initialScheduledWeek={SCHEDULED} canEdit />)
    expect(screen.getByText('Upcoming')).toBeInTheDocument()
  })

  it('shows the next date and kick-off on the idle row', () => {
    render(<NextMatchCard {...BASE} initialScheduledWeek={null} leagueDayIndex={4} canEdit={false} />)
    expect(screen.getByText('Thu 09 Apr · 8pm')).toBeInTheDocument()
  })
```

`ResultModal` is a Radix `Dialog`, so its content has `role="dialog"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/next-match-card-overview.test.tsx`
Expected: FAIL (type error on `kickoffTime` prop / missing awaiting card).

- [ ] **Step 3: Implement `NextMatchCard`**

In `components/NextMatchCard.tsx`:

**(a)** Import `NextGameAwaiting`:

```ts
import { NextGameAwaiting, NextGameIdle, NextGameLineup } from '@/components/overview/NextGameCard'
```

**(b)** In `interface Props`, add after `linkedPlayerName`:

```ts
  /** League kick-off time ('HH:MM'). A scheduled game awaits its result from then; 20:00 when unset. */
  kickoffTime?: string | null
```

and remove `kickoffTime?: string | null` from the `overview?: { … }` object type.

**(c)** In the function parameters, add `kickoffTime = null,` after `linkedPlayerName = null,`.

**(d)** Directly after the `scheduledWeek` `useState`, add:

```ts
  // Overview keeps a kicked-off game on the card until its result is saved.
  const overviewAwaiting =
    isOverview && cardState === 'lineup' && scheduledWeek !== null &&
    isPastDeadline(scheduledWeek.date, kickoffTime)
```

and change the `shareKey` condition so no share link is fetched for the awaiting card:

```ts
  const shareKey =
    canShareImage && cardState === 'lineup' && !overviewAwaiting && scheduledWeek &&
    scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0
      ? JSON.stringify([scheduledWeek.id, scheduledWeek.teamA, scheduledWeek.teamB])
      : null
```

**(e)** In the client `load()` effect, pass the kick-off time to both checks and add it to the deps:

```ts
        if (week.status === 'scheduled' && isPastDeadline(week.date, kickoffTime)) {
```
```ts
        if (week.status === 'cancelled' && isPastDeadline(week.date, kickoffTime)) {
```
```ts
  }, [gameId, publicMode, isOverview, initialScheduledWeek, kickoffTime])
```

**(f)** Card wrapper (`<div className={cn('rounded-xl border border-[#223a5c] …'`): add the awaiting border:

```tsx
        className={cn(
          'rounded-xl border border-[#223a5c] bg-[#0a1421] overflow-hidden shadow-[0_18px_44px_rgba(0,0,0,.42)]',
          // The Results lineup reads as an open match card.
          !isOverview && cardState === 'lineup' && 'border-[#2c4a72]',
          overviewAwaiting && 'border-[#2c4a72]'
        )}
```

**(g)** Overview idle: pass the date and kick-off time:

```tsx
          <NextGameIdle
            week={nextWeekNum}
            date={nextDate}
            kickoffTime={kickoffTime}
            canEdit={canEdit}
            onBuildTeams={() => { onBuildStart?.(); setCardState('building') }}
            onCancelGame={() => { setError(null); setShowCancelModal(true) }}
          />
```

**(h)** Replace the `{/* ── LINEUP (Overview tab) ── */}` block with:

```tsx
        {/* ── AWAITING RESULT (Overview tab) ── */}
        {overviewAwaiting && scheduledWeek && (
          <NextGameAwaiting
            week={displayWeek}
            teamA={scheduledWeek.teamA}
            teamB={scheduledWeek.teamB}
            kickoffTime={kickoffTime}
            canEdit={canEdit && scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0}
            onEditLineups={handleEditLineup}
            onResultGame={() => { setError(null); setShowResultModal(true) }}
          />
        )}

        {/* ── LINEUP (Overview tab) ── */}
        {isOverview && cardState === 'lineup' && !overviewAwaiting && scheduledWeek && (
          <NextGameLineup
            week={displayWeek}
            date={displayDate}
            format={scheduledWeek.format}
            teamA={scheduledWeek.teamA}
            teamB={scheduledWeek.teamB}
            linkedPlayerName={overview?.linkedPlayerName ?? null}
            location={overview?.location ?? null}
            kickoffTime={kickoffTime}
            canEdit={canEdit && scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0}
            onEditLineups={handleEditLineup}
            onResultGame={() => { setError(null); setShowResultModal(true) }}
            onShare={scheduledWeek.teamA.length > 0 && scheduledWeek.teamB.length > 0 ? handleShare : undefined}
            copied={copied}
          />
        )}
```

**(i)** Results lineup header and cancelled row: pass the kick-off time to the remaining calls:

```tsx
            {isPastDeadline(scheduledWeek.date, kickoffTime) ? (
```
```tsx
            {canEdit && !isPastDeadline(scheduledWeek.date, kickoffTime) && (
```

Then confirm nothing was missed:

Run: `grep -n "isPastDeadline(" components/NextMatchCard.tsx`
Expected: every call passes `kickoffTime` as its second argument.

- [ ] **Step 4: Implement the Overview wiring**

In `components/overview/OverviewNextGame.tsx`, change the `NextMatchCard` call to:

```tsx
    <NextMatchCard
      variant="overview"
      overview={{ linkedPlayerName, location }}
      kickoffTime={kickoffTime}
      gameId={gameId}
```

(the remaining props are unchanged).

In `app/[slug]/(tabs)/overview/page.tsx`, change the seed line in the `OverviewNextGame` props to:

```tsx
          initialScheduledWeek={getNextMatchSeed(weeks, game.kickoff_time ?? null)}
```

- [ ] **Step 5: Run the tests and type-check**

Run: `npx jest __tests__/next-match-card-overview.test.tsx __tests__/overview-next-game-card.test.tsx __tests__/next-match-card-share.test.tsx __tests__/upcoming-card-face-off.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add components/NextMatchCard.tsx components/overview/OverviewNextGame.tsx "app/[slug]/(tabs)/overview/page.tsx" __tests__/next-match-card-overview.test.tsx
git commit -m "Show the awaiting result card on Overview from kick-off"
```

---

### Task 5: Results switches at kick-off too

**Files:**
- Modify: `components/MatchCard.tsx:25-43, 703-718, 768-769`
- Modify: `components/WeekList.tsx`, `components/PublicMatchList.tsx`
- Modify: `components/ResultsSection.tsx`, `components/PublicResultsSection.tsx`, `components/PublicMatchEntrySection.tsx`
- Modify: `app/[slug]/(tabs)/results/page.tsx:79, 120-131, 147-165`
- Create: `__tests__/match-card-kickoff.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/match-card-kickoff.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { MatchCard } from '@/components/MatchCard'
import type { Week } from '@/lib/types'

jest.mock('@/lib/supabase/client', () => ({ createClient: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const SCHEDULED: Week = {
  id: 'w16', season: '2026', week: 16, date: '09 Apr 2026', status: 'scheduled',
  teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'], winner: null,
}

afterEach(() => { jest.useRealTimers() })

describe('MatchCard, scheduled week', () => {
  it('shows Awaiting Result from the league kick-off time', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, 18, 45))
    render(<MatchCard week={SCHEDULED} isOpen={false} onToggle={jest.fn()} kickoffTime="18:30" />)
    expect(screen.getByText('Awaiting Result')).toBeInTheDocument()
  })

  it('stays hidden before kick-off', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, 18, 15))
    const { container } = render(<MatchCard week={SCHEDULED} isOpen={false} onToggle={jest.fn()} kickoffTime="18:30" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('waits for 20:00 when the league has no kick-off time', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 3, 9, 18, 45))
    const { container } = render(<MatchCard week={SCHEDULED} isOpen={false} onToggle={jest.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
```

If `MatchCard` needs further module mocks to render in jsdom, copy them from an existing test that renders it (`grep -rln "MatchCard" __tests__ components/__tests__`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest __tests__/match-card-kickoff.test.tsx`
Expected: FAIL, `kickoffTime` is not a prop and the first test sees nothing at 18:45.

- [ ] **Step 3: Implement `MatchCard`**

In `components/MatchCard.tsx`:

- Add to `interface MatchCardProps` (after `shareUrl`):

```ts
  /** League kick-off time ('HH:MM'). A scheduled week shows as Awaiting Result from then; 20:00 when unset. */
  kickoffTime?: string | null
```

- Add `kickoffTime = null,` to the `MatchCard` destructuring after `shareUrl,`.
- Change the two scheduled checks (around line 768) to:

```tsx
  if (week.status === 'scheduled' && !isPastDeadline(week.date, kickoffTime)) return null
  if (week.status === 'scheduled' && isPastDeadline(week.date, kickoffTime)) {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest __tests__/match-card-kickoff.test.tsx`
Expected: PASS.

- [ ] **Step 5: Thread `kickoffTime` through the lists**

`components/WeekList.tsx`:
- `Props`: add `kickoffTime?: string | null   // league kick-off time; scheduled weeks show as Awaiting Result from then`
- destructuring: add `kickoffTime = null,`
- `<MatchCard …>`: add `kickoffTime={kickoffTime}`

`components/PublicMatchList.tsx`:
- `PublicMatchListProps`: add `kickoffTime?: string | null              // league kick-off time; scheduled weeks show as Awaiting Result from then`
- signature: `export function PublicMatchList({ weeks, celebration = null, leagueName, leagueSlug, season, resultShareUrl, kickoffTime = null }: PublicMatchListProps)`
- `<MatchCard …>`: add `kickoffTime={kickoffTime}`

`components/PublicMatchEntrySection.tsx`:
- `Props`: add `kickoffTime?: string | null`
- signature: add `kickoffTime = null` to the destructured props
- `<NextMatchCard …>`: add `kickoffTime={kickoffTime}`

`components/ResultsSection.tsx`:
- `Props`: add `kickoffTime?: string | null        // league kick-off time, when a scheduled game starts awaiting its result`
- destructuring: add `kickoffTime = null,`
- `<NextMatchCard …>` and `<WeekList …>`: add `kickoffTime={kickoffTime}` to both

`components/PublicResultsSection.tsx`:
- `Props`: add `kickoffTime: string | null`
- destructuring: add `kickoffTime,`
- `<PublicMatchEntrySection …>` and `<PublicMatchList …>`: add `kickoffTime={kickoffTime}` to both

Then update `components/__tests__/PublicResultsSection.test.tsx`: in its `renderSection` helper, add `kickoffTime={null}` alongside the other required props so it still type-checks.

- [ ] **Step 6: Thread it from the Results page**

In `app/[slug]/(tabs)/results/page.tsx`:

- line 79: `if (first && !isPastDeadline(first.date, game.kickoff_time ?? null)) {`
- `<PublicResultsSection …>`: add `kickoffTime={game.kickoff_time ?? null}`
- `<ResultsSection …>`: add `kickoffTime={game.kickoff_time ?? null}`

- [ ] **Step 7: Type-check and run the affected tests**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

Run: `npx jest __tests__/match-card-kickoff.test.tsx components/__tests__/PublicResultsSection.test.tsx __tests__/upcoming-card-face-off.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/MatchCard.tsx components/WeekList.tsx components/PublicMatchList.tsx components/PublicMatchEntrySection.tsx components/ResultsSection.tsx components/PublicResultsSection.tsx components/__tests__/PublicResultsSection.test.tsx "app/[slug]/(tabs)/results/page.tsx" __tests__/match-card-kickoff.test.tsx
git commit -m "Show Awaiting Result on Results from the league's kick-off time"
```

---

### Task 6: Full verification

- [ ] **Step 1: Every `isPastDeadline` call is accounted for**

Run: `grep -rn "isPastDeadline(" app components lib | grep -v __tests__`
Expected: calls that pass a kick-off time in `NextMatchCard.tsx`, `MatchCard.tsx`, `results/page.tsx` and inside `getNextMatchSeed`; calls without one only in `lib/fetchers.ts` (`ensureUnrecordedWeek`), `app/api/league/[id]/lineup-share/route.ts` and `nextLeagueGame` in `lib/utils.ts`, which the spec leaves at 20:00.

- [ ] **Step 2: Lint, types, tests**

Run: `npm run lint && npx tsc --noEmit -p tsconfig.json && npx jest`
Expected: lint and types clean. Jest: only the four baseline suites listed at the top fail, with the same failures as before.

- [ ] **Step 3: Manual check at 390px**

Run `npm run dev`. Local dev reads the production database, so browse signed out and do not save anything. Check `/craft-football/overview` at 390px wide:

- The next game card is a single row (week, date · kick-off, No lineup badge) when no lineup is set.
- If lineups are set, the Upcoming card renders as before.

The admin buttons, the awaiting state and Results at kick-off are covered by the component tests; confirming them against live data would need writes, which are off limits locally.

- [ ] **Step 4: Commit any fixes** from the checks above with a message describing them.
