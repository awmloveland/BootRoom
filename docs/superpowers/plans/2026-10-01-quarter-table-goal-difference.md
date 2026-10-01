# Goal difference in quarter tables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a signed GD column in the sidebar and honours quarter tables, and rank players by Points, GD, fewer games played, Wins, Name.

**Architecture:** Both tables are built by one private function, `aggregateWeeks` in `lib/sidebar-stats.ts`. It gains a `goalDiff` accumulator (winners `+goal_difference`, losers `-goal_difference`, draws and unrecorded margins `0`) and a new comparator. The two table components render the new field through a small `formatGoalDiff` helper in `lib/utils.ts`. No database, SQL or all-time stats changes.

**Tech Stack:** Next.js 14, TypeScript, Tailwind, Jest with ts-jest.

**Spec:** `docs/superpowers/specs/2026-10-01-quarter-table-goal-difference-design.md`

---

## Background for the implementer

- A played game is a `Week` (`lib/types.ts`). `teamA` and `teamB` are arrays of player names. `winner` is `'teamA' | 'teamB' | 'draw' | null`. `goal_difference` is the whole-game margin as a **non-negative** number (`0` for a draw, `null` or missing when not recorded). It has no sign, so the sign comes from which side the player was on.
- `aggregateWeeks` (`lib/sidebar-stats.ts:262-278`) is called by `computeQuarterlyTable` (sidebar) and `computeAllQuarters` (honours). The first entry of its sorted output is the quarter champion everywhere.
- Copy rules (CLAUDE.md): British English, no em dashes in UI copy. Styling uses Tailwind classes only. Merge conditional classes with `cn()`.
- Tests run with `npm test` (Jest, ts-jest). One file: `npx jest __tests__/sidebar-stats.test.ts`.
- New tests go in `__tests__/sidebar-stats.test.ts`, not `lib/__tests__/sidebar-stats.quarters.test.ts` as the spec suggested. That file already has a flexible `makeWeek(overrides)` helper and the existing `computeQuarterlyTable` tests.

## File map

| File | Change |
|---|---|
| `lib/utils.ts` | Add `formatGoalDiff(goalDiff)` |
| `lib/__tests__/utils.formatGoalDiff.test.ts` | New: tests for `formatGoalDiff` |
| `lib/sidebar-stats.ts` | `QuarterlyEntry.goalDiff`, GD accumulation, new comparator |
| `__tests__/sidebar-stats.test.ts` | New GD and ranking tests |
| `lib/__tests__/utils.quarterShare.test.ts` | Fixture: add `goalDiff` |
| `__tests__/quarter-celebration.test.tsx` | Fixture: add `goalDiff` |
| `components/StatsSidebar.tsx` | GD column in `QuarterlyTableWidget` |
| `components/HonoursSection.tsx` | GD column in `CompletedCardBody` |

---

### Task 0: Baseline

- [ ] **Step 1: Confirm the suite is green before changing anything**

Run: `npm test 2>&1 | tail -8`
Expected: `Tests:` line with 0 failed. If anything already fails, note which tests so they aren't blamed on this work.

---

### Task 1: `formatGoalDiff` helper

**Files:**
- Create: `lib/__tests__/utils.formatGoalDiff.test.ts`
- Modify: `lib/utils.ts` (after `formatWinner`, around line 65)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/utils.formatGoalDiff.test.ts`:

```ts
import { formatGoalDiff } from '../utils'

describe('formatGoalDiff', () => {
  it('prefixes positive values with a plus sign', () => {
    expect(formatGoalDiff(5)).toBe('+5')
    expect(formatGoalDiff(12)).toBe('+12')
  })

  it('shows zero without a sign', () => {
    expect(formatGoalDiff(0)).toBe('0')
  })

  it('shows negative values with a minus sign', () => {
    expect(formatGoalDiff(-3)).toBe('-3')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest lib/__tests__/utils.formatGoalDiff.test.ts`
Expected: FAIL, `formatGoalDiff` is not exported from `../utils`.

- [ ] **Step 3: Implement**

In `lib/utils.ts`, directly after the closing brace of `formatWinner` (line 65), add:

```ts

/** Signed goal difference for standings tables, e.g. '+5', '0', '-3'. */
export function formatGoalDiff(goalDiff: number): string {
  return goalDiff > 0 ? `+${goalDiff}` : String(goalDiff)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest lib/__tests__/utils.formatGoalDiff.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.formatGoalDiff.test.ts
git commit -m "Add formatGoalDiff helper for standings tables

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Accumulate GD in `aggregateWeeks`

**Files:**
- Modify: `lib/sidebar-stats.ts:93-100` (`QuarterlyEntry`), `lib/sidebar-stats.ts:262-278` (`aggregateWeeks`)
- Modify: `lib/__tests__/utils.quarterShare.test.ts:4-8` (fixture)
- Modify: `__tests__/quarter-celebration.test.tsx:17-20` (fixture)
- Test: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Write the failing tests**

In `__tests__/sidebar-stats.test.ts`, add this block directly after the closing `})` of the `describe('computeQuarterlyTable', ...)` block (find the end of the block. It contains the nested `describe('gamesLeft — fixture-aware calendar count', ...)`):

```ts
// ─── goal difference ──────────────────────────────────────────────────────────

describe('quarter table goal difference', () => {
  const now = new Date(2026, 2, 20) // 20 Mar 2026, Q1

  function gdOf(weeks: Week[], name: string): number | undefined {
    return computeQuarterlyTable(weeks, now).entries.find(e => e.name === name)?.goalDiff
  }

  it('gives winners +margin and losers -margin', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'], winner: 'teamA', goal_difference: 3 }),
    ]
    expect(gdOf(weeks, 'Alice')).toBe(3)
    expect(gdOf(weeks, 'Bob')).toBe(3)
    expect(gdOf(weeks, 'Charlie')).toBe(-3)
    expect(gdOf(weeks, 'Dave')).toBe(-3)
  })

  it('applies the margin correctly when Team B wins', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice'], teamB: ['Charlie'], winner: 'teamB', goal_difference: 2 }),
    ]
    expect(gdOf(weeks, 'Alice')).toBe(-2)
    expect(gdOf(weeks, 'Charlie')).toBe(2)
  })

  it('gives both sides 0 for a draw', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice'], teamB: ['Charlie'], winner: 'draw', goal_difference: 0 }),
    ]
    expect(gdOf(weeks, 'Alice')).toBe(0)
    expect(gdOf(weeks, 'Charlie')).toBe(0)
  })

  it('counts an unrecorded margin as 0 but still counts the result', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice'], teamB: ['Charlie'], winner: 'teamB', goal_difference: null }),
      makeWeek({ week: 2, date: '12 Jan 2026', teamA: ['Alice'], teamB: ['Charlie'], winner: 'teamB' }), // field missing
    ]
    const entries = computeQuarterlyTable(weeks, now).entries
    const alice = entries.find(e => e.name === 'Alice')!
    const charlie = entries.find(e => e.name === 'Charlie')!
    expect(alice.goalDiff).toBe(0)
    expect(alice.played).toBe(2)
    expect(alice.lost).toBe(2)
    expect(charlie.goalDiff).toBe(0)
    expect(charlie.won).toBe(2)
    expect(charlie.points).toBe(6)
  })

  it('sums margins across games', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice'], teamB: ['Charlie'], winner: 'teamA', goal_difference: 3 }),
      makeWeek({ week: 2, date: '12 Jan 2026', teamA: ['Charlie'], teamB: ['Alice'], winner: 'teamA', goal_difference: 1 }),
      makeWeek({ week: 3, date: '19 Jan 2026', teamA: ['Alice'], teamB: ['Charlie'], winner: 'draw', goal_difference: 0 }),
    ]
    expect(gdOf(weeks, 'Alice')).toBe(2)    // +3 -1 +0
    expect(gdOf(weeks, 'Charlie')).toBe(-2) // -3 +1 +0
  })

  it('ignores cancelled weeks', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice'], teamB: ['Charlie'], winner: 'teamA', goal_difference: 3 }),
      makeWeek({ week: 2, date: '12 Jan 2026', status: 'cancelled', teamA: ['Alice'], teamB: ['Charlie'], winner: null, goal_difference: null }),
    ]
    expect(gdOf(weeks, 'Alice')).toBe(3)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest __tests__/sidebar-stats.test.ts -t "quarter table goal difference"`
Expected: FAIL. Either a type error that `goalDiff` does not exist on `QuarterlyEntry`, or assertions receiving `undefined`.

- [ ] **Step 3: Add the field to `QuarterlyEntry`**

In `lib/sidebar-stats.ts`, replace the interface at lines 93-100:

```ts
export interface QuarterlyEntry {
  name: string
  played: number
  won: number
  drew: number
  lost: number
  points: number
  goalDiff: number  // sum of signed win margins; see aggregateWeeks
}
```

- [ ] **Step 4: Accumulate GD in `aggregateWeeks`**

In `lib/sidebar-stats.ts`, replace the body of `aggregateWeeks` (lines 262-278) with the version below. **Leave the sort comparator unchanged in this task.** Task 3 changes it.

```ts
function aggregateWeeks(weeks: Week[]): QuarterlyEntry[] {
  const map = new Map<string, QuarterlyEntry>()
  for (const w of weeks) {
    if (w.status !== 'played') continue
    // goal_difference is an unsigned margin: winners gain it, losers lose it.
    // An unrecorded margin counts as 0.
    const margin = w.goal_difference ?? 0
    const allPlayers = [...w.teamA, ...w.teamB]
    for (const name of allPlayers) {
      if (!map.has(name)) map.set(name, { name, played: 0, won: 0, drew: 0, lost: 0, points: 0, goalDiff: 0 })
      const e = map.get(name)!
      e.played++
      const onTeamA = w.teamA.includes(name)
      if (w.winner === 'draw') { e.drew++; e.points += 1 }
      else if ((w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA)) { e.won++; e.points += 3; e.goalDiff += margin }
      else { e.lost++; e.goalDiff -= margin }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.points - a.points || b.won - a.won || a.name.localeCompare(b.name))
}
```

- [ ] **Step 5: Update the two test fixtures that build `QuarterlyEntry` by hand**

In `lib/__tests__/utils.quarterShare.test.ts`, change the `entry` helper's return line (line 7) from:

```ts
  return { name, played, won, drew, lost, points }
```

to:

```ts
  return { name, played, won, drew, lost, points, goalDiff: 0 }
```

In `__tests__/quarter-celebration.test.tsx`, change the two entries (lines 18-19) to:

```ts
    { name: 'Marcus', played: 6, won: 5, drew: 1, lost: 0, points: 16, goalDiff: 9 },
    { name: 'Danny', played: 6, won: 3, drew: 0, lost: 3, points: 9, goalDiff: -1 },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx jest __tests__/sidebar-stats.test.ts lib/__tests__/utils.quarterShare.test.ts __tests__/quarter-celebration.test.tsx`
Expected: PASS, including the 6 new `quarter table goal difference` tests.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (exit 0). The components don't read `goalDiff` yet, so nothing else should break.

- [ ] **Step 8: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts lib/__tests__/utils.quarterShare.test.ts __tests__/quarter-celebration.test.tsx
git commit -m "Accumulate signed goal difference in quarter standings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: New ranking order

Order becomes: Points (high first), GD (high first), Played (fewer first), Won (high first), Name (A to Z).

**Files:**
- Modify: `lib/sidebar-stats.ts` (the `return` line at the end of `aggregateWeeks`)
- Test: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Write the failing tests**

In `__tests__/sidebar-stats.test.ts`, add this block directly after the `describe('quarter table goal difference', ...)` block from Task 2. The player names are chosen so that alphabetical order (the old final tiebreak) gives the *wrong* answer. Each test fails until the matching tiebreak exists.

```ts
// ─── ranking order ────────────────────────────────────────────────────────────

describe('quarter table ranking', () => {
  const now = new Date(2026, 2, 20) // 20 Mar 2026, Q1

  function order(weeks: Week[]): string[] {
    return computeQuarterlyTable(weeks, now).entries.map(e => e.name)
  }

  it('ranks higher GD first when points are level', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice'], teamB: ['Opp1'], winner: 'teamA', goal_difference: 1 }),
      makeWeek({ week: 2, date: '12 Jan 2026', teamA: ['Zed'], teamB: ['Opp2'], winner: 'teamA', goal_difference: 4 }),
    ]
    const names = order(weeks)
    // Both on 3 pts. Zed +4 beats Alice +1
    expect(names.indexOf('Zed')).toBeLessThan(names.indexOf('Alice'))
  })

  it('ranks fewer games played first when points and GD are level', () => {
    const weeks: Week[] = [
      // Zed: 1 game, 3 pts, GD +2
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Zed'], teamB: ['Opp1'], winner: 'teamA', goal_difference: 2 }),
      // Bob: 2 games, 3 pts, GD +3 -1 = +2
      makeWeek({ week: 2, date: '12 Jan 2026', teamA: ['Bob'], teamB: ['Opp2'], winner: 'teamA', goal_difference: 3 }),
      makeWeek({ week: 3, date: '19 Jan 2026', teamA: ['Opp3'], teamB: ['Bob'], winner: 'teamA', goal_difference: 1 }),
    ]
    const names = order(weeks)
    expect(names.indexOf('Zed')).toBeLessThan(names.indexOf('Bob'))
  })

  it('falls back to wins when points, GD and games played are level', () => {
    const weeks: Week[] = [
      // Zed: W by 2, L by 1, L by 1 → 3 pts, GD 0, 3 played, 1 win
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Zed'], teamB: ['Opp1'], winner: 'teamA', goal_difference: 2 }),
      makeWeek({ week: 2, date: '12 Jan 2026', teamA: ['Opp2'], teamB: ['Zed'], winner: 'teamA', goal_difference: 1 }),
      makeWeek({ week: 3, date: '19 Jan 2026', teamA: ['Opp3'], teamB: ['Zed'], winner: 'teamA', goal_difference: 1 }),
      // Bob: three draws → 3 pts, GD 0, 3 played, 0 wins
      makeWeek({ week: 4, date: '26 Jan 2026', teamA: ['Bob'], teamB: ['Opp4'], winner: 'draw', goal_difference: 0 }),
      makeWeek({ week: 5, date: '02 Feb 2026', teamA: ['Bob'], teamB: ['Opp4'], winner: 'draw', goal_difference: 0 }),
      makeWeek({ week: 6, date: '09 Feb 2026', teamA: ['Bob'], teamB: ['Opp4'], winner: 'draw', goal_difference: 0 }),
    ]
    const names = order(weeks)
    expect(names.indexOf('Zed')).toBeLessThan(names.indexOf('Bob'))
  })

  it('falls back to name when everything else is level', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Zed', 'Alice'], teamB: ['Opp1', 'Opp2'], winner: 'teamA', goal_difference: 2 }),
    ]
    expect(order(weeks).slice(0, 2)).toEqual(['Alice', 'Zed'])
  })

  it('decides the quarter champion on GD when points are level', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '10 Jan 2026', teamA: ['Bob'], teamB: ['Opp1'], winner: 'teamA', goal_difference: 1 }),
      makeWeek({ week: 2, date: '17 Jan 2026', teamA: ['Zed'], teamB: ['Opp2'], winner: 'teamA', goal_difference: 5 }),
    ]
    const q1 = computeAllQuarters(weeks, new Date(2026, 6, 8)) // Q3 2026, so Q1 is completed
      .find(y => y.year === 2026)!
      .quarters.find(q => q.q === 1)!
    expect(q1.status).toBe('completed')
    expect(q1.champion).toBe('Zed')
    expect(q1.entries![0].name).toBe('Zed')
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx jest __tests__/sidebar-stats.test.ts -t "quarter table ranking"`
Expected: 3 FAIL (`ranks higher GD first`, `ranks fewer games played first`, `decides the quarter champion on GD`). 2 PASS (`falls back to wins`, `falls back to name`). The last two guard behaviour the old comparator already has.

- [ ] **Step 3: Replace the comparator**

In `lib/sidebar-stats.ts`, replace the last line of `aggregateWeeks`:

```ts
  return Array.from(map.values()).sort((a, b) => b.points - a.points || b.won - a.won || a.name.localeCompare(b.name))
```

with:

```ts
  // Points, then GD, then fewer games played, then wins, then name
  return Array.from(map.values()).sort((a, b) =>
    b.points - a.points ||
    b.goalDiff - a.goalDiff ||
    a.played - b.played ||
    b.won - a.won ||
    a.name.localeCompare(b.name)
  )
```

- [ ] **Step 4: Run the whole sidebar-stats file to verify it passes**

Run: `npx jest __tests__/sidebar-stats.test.ts lib/__tests__/sidebar-stats.quarters.test.ts lib/__tests__/sidebar-stats.celebration.test.ts`
Expected: all PASS. If an older test fails because it relied on wins breaking a points tie, check the fixture. Update the test only if its expectation contradicts the new agreed ranking order, and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "Rank quarter tables by points, GD, fewer games, wins, name

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: GD column in the sidebar quarter table

**Files:**
- Modify: `components/StatsSidebar.tsx:2` (import), `:146-150` (header), `:187-190` (row)

- [ ] **Step 1: Import the helper**

Change line 2:

```ts
import { cn } from '@/lib/utils'
```

to:

```ts
import { cn, formatGoalDiff } from '@/lib/utils'
```

- [ ] **Step 2: Add the header label**

In `QuarterlyTableWidget`, between the `L` and `Pts` header spans:

```tsx
        <span className="w-[18px] text-center">L</span>
        <span className="w-[26px] text-center">GD</span>
        <span className="w-[26px] text-right text-[#6f88a8]">Pts</span>
```

- [ ] **Step 3: Add the row cell**

In the same component, between the `e.lost` span and the `e.points` span:

```tsx
                <span className="font-plex text-[10.5px] text-[#4f688a] w-[18px] text-center shrink-0">
                  {e.lost}
                </span>
                <span className="font-plex text-[10.5px] text-[#4f688a] w-[26px] text-center shrink-0">
                  {formatGoalDiff(e.goalDiff)}
                </span>
```

(The `e.points` span that follows is unchanged.)

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint components/StatsSidebar.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/StatsSidebar.tsx
git commit -m "Show GD in the sidebar quarter table

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: GD column in the honours standings

**Files:**
- Modify: `components/HonoursSection.tsx:6` (import), `:127-128` (header), `:154-155` (row)

- [ ] **Step 1: Import the helper**

Change line 6:

```ts
import { cn, buildQuarterShareText, shareOrCopy } from '@/lib/utils'
```

to:

```ts
import { cn, buildQuarterShareText, shareOrCopy, formatGoalDiff } from '@/lib/utils'
```

- [ ] **Step 2: Add the header label**

In `CompletedCardBody`, between the `L` and `Pts` header spans:

```tsx
          <span className="w-5 text-center">L</span>
          <span className="w-7 text-center">GD</span>
          <span className="w-[30px] text-right text-[#6f88a8]">Pts</span>
```

- [ ] **Step 3: Add the row cell**

Between the `e.lost` span and the `e.points` span:

```tsx
              <span className="font-plex text-[11px] text-[#6f88a8] w-5 text-center shrink-0">{e.lost}</span>
              <span className="font-plex text-[11px] text-[#6f88a8] w-7 text-center shrink-0">{formatGoalDiff(e.goalDiff)}</span>
```

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint components/HonoursSection.tsx`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/HonoursSection.tsx
git commit -m "Show GD in the honours quarter standings

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Full verification

- [ ] **Step 1: Full test suite**

Run: `npm test 2>&1 | tail -8`
Expected: 0 failed. Compare with the Task 0 baseline.

- [ ] **Step 2: Lint and typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Visual check**

Run `npm run dev` and open a league's Honours tab (`/[slug]/honours`) that has at least one completed quarter with recorded margins. Check:

- Sidebar quarter table: header reads `P W D L GD PTS`. GD values show as `+N`, `0`, `-N` and line up under the header. At 375px wide, long names truncate with an ellipsis and the numbers don't wrap or overflow.
- Honours board: open a completed quarter. Header reads `PLAYER P W D L GD PTS`. Values align. Where two players are level on points, the one with the higher GD is ranked above.
- Save screenshots of both tables to `.context/` for the PR.

- [ ] **Step 4: Tidy up**

Run: `git status`
Expected: clean working tree, five commits from this plan on the branch.
