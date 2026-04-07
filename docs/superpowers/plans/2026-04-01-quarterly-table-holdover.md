# Quarterly Table Holdover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the previous quarter's final standings in the QuarterlyTableWidget until the first game of the new quarter has been resulted.

**Architecture:** Add `isHoldover: boolean` to `QuarterlyTableResult`. At the top of `computeQuarterlyTable()`, check if the current calendar quarter has zero played weeks — if so, step back one quarter and compute that quarter's data instead. The widget reads `isHoldover` to append `· Final` to the label and suppress the games-left badge.

**Tech Stack:** TypeScript, Jest (tests at `__tests__/sidebar-stats.test.ts`), React (component at `components/StatsSidebar.tsx`)

---

### Task 1: Add `isHoldover` to `QuarterlyTableResult` and write failing tests

**Files:**
- Modify: `lib/sidebar-stats.ts` (type only — line 92)
- Modify: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Add `isHoldover` to the return type**

In `lib/sidebar-stats.ts`, update the `QuarterlyTableResult` interface (currently at line 92):

```ts
export interface QuarterlyTableResult {
  quarterLabel: string
  entries: QuarterlyEntry[]
  lastChampion: string | null
  lastQuarterLabel: string | null
  gamesLeft: number
  gamesTotal: number
  isHoldover: boolean
}
```

Also add `isHoldover: false` to the existing `return` statement at the bottom of `computeQuarterlyTable()` so it compiles:

```ts
return { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft, gamesTotal, isHoldover: false }
```

- [ ] **Step 2: Write three failing holdover tests**

Add this describe block inside `describe('computeQuarterlyTable', ...)` in `__tests__/sidebar-stats.test.ts`, after the existing tests:

```ts
describe('holdover — shows previous quarter when current quarter has no played games', () => {
  it('returns previous quarter data and isHoldover=true when current quarter is empty', () => {
    // now = 1 Apr 2026 (Q2). Q1 has played data, Q2 has none.
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '15 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q1
      makeWeek({ week: 2, date: '22 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q1
    ]
    const now = new Date(2026, 3, 1) // 1 Apr 2026 = Q2
    const result = computeQuarterlyTable(weeks, now)
    expect(result.isHoldover).toBe(true)
    expect(result.quarterLabel).toBe('Q1 26')
    expect(result.entries.find(e => e.name === 'Alice')?.won).toBe(2)
    expect(result.gamesLeft).toBe(0)
  })

  it('returns current quarter data and isHoldover=false once first Q2 game is played', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '15 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q1
      makeWeek({ week: 2, date: '02 Apr 2026', teamA: ['Charlie'], teamB: ['Dave'], winner: 'teamA' }), // Q2
    ]
    const now = new Date(2026, 3, 3) // 3 Apr 2026 = Q2
    const result = computeQuarterlyTable(weeks, now)
    expect(result.isHoldover).toBe(false)
    expect(result.quarterLabel).toBe('Q2 26')
    expect(result.entries.find(e => e.name === 'Charlie')).toBeDefined()
  })

  it('steps back to Q4 of prior year when Q1 has no played games', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '10 Dec 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q4 2025
    ]
    const now = new Date(2026, 0, 5) // 5 Jan 2026 = Q1 (no Q1 games yet)
    const result = computeQuarterlyTable(weeks, now)
    expect(result.isHoldover).toBe(true)
    expect(result.quarterLabel).toBe('Q4 25')
    expect(result.entries.find(e => e.name === 'Alice')).toBeDefined()
  })
})
```

- [ ] **Step 3: Run the new tests to verify they fail**

```bash
npx jest __tests__/sidebar-stats.test.ts --testNamePattern="holdover" --no-coverage
```

Expected: 3 FAIL — `isHoldover` is always `false`, `quarterLabel` is wrong for Q2 holdover case.

- [ ] **Step 4: Commit type stub**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "test: add failing holdover tests for computeQuarterlyTable"
```

---

### Task 2: Implement holdover logic in `computeQuarterlyTable()`

**Files:**
- Modify: `lib/sidebar-stats.ts` (function body, lines 129–154)

- [ ] **Step 1: Replace the function body with holdover logic**

Replace the entire `computeQuarterlyTable` function in `lib/sidebar-stats.ts`:

```ts
export function computeQuarterlyTable(weeks: Week[], now: Date = new Date(), gameDay?: number): QuarterlyTableResult {
  const { q, year } = quarterOf(now)

  // Holdover: if no played games in the current calendar quarter, show the previous quarter
  const currentPlayedCount = weeks.filter(w => weekInQuarter(w, q, year) && w.status === 'played').length
  const isHoldover = currentPlayedCount === 0

  const displayQ = isHoldover ? (q === 1 ? 4 : q - 1) : q
  const displayYear = isHoldover ? (q === 1 ? year - 1 : year) : year
  const yy = String(displayYear).slice(-2)
  const quarterLabel = `Q${displayQ} ${yy}`

  const displayWeeks = weeks.filter(w => weekInQuarter(w, displayQ, displayYear))
  const entries = aggregateWeeks(displayWeeks).slice(0, 5)

  // gamesLeft is 0 during holdover (the displayed quarter is complete)
  const resolvedGameDay = gameDay ?? inferGameDay(weeks)
  const gamesLeft = !isHoldover && resolvedGameDay !== null
    ? gamesLeftInQuarter(q, year, resolvedGameDay, now)
    : 0

  const gamesPlayed = displayWeeks.filter(w => w.status === 'played').length
  const gamesTotal = gamesPlayed + gamesLeft

  // Champion banner: always based on the calendar previous quarter (not the displayed quarter)
  const prevQ = q === 1 ? 4 : q - 1
  const prevYear = q === 1 ? year - 1 : year
  const prevYY = String(prevYear).slice(-2)
  const prevWeeks = weeks.filter(w => weekInQuarter(w, prevQ, prevYear))
  const prevEntries = aggregateWeeks(prevWeeks)
  const lastChampion = prevEntries.length > 0 ? prevEntries[0].name : null
  const lastQuarterLabel = prevEntries.length > 0 ? `Q${prevQ} ${prevYY}` : null

  return { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft, gamesTotal, isHoldover }
}
```

- [ ] **Step 2: Run the new holdover tests**

```bash
npx jest __tests__/sidebar-stats.test.ts --testNamePattern="holdover" --no-coverage
```

Expected: 3 PASS.

- [ ] **Step 3: Run the full test suite to check for regressions**

```bash
npx jest __tests__/sidebar-stats.test.ts --no-coverage
```

Expected output: some failures in the existing `computeQuarterlyTable` and `gamesLeft` tests (see Task 3).

---

### Task 3: Fix regressions in existing tests

**Files:**
- Modify: `__tests__/sidebar-stats.test.ts`

The existing tests use `computeQuarterlyTable([], new Date(2026, 0, ...))` — empty weeks, Q1 now. With holdover logic, empty Q1 → holdover to Q4 2025, causing `quarterLabel` and `gamesLeft` to differ from expectations. Fix by adding a played Q1 week to each affected test so holdover does not trigger.

- [ ] **Step 1: Fix "handles Q1 rollover correctly"**

This test:
```ts
it('handles Q1 rollover correctly (prev = Q4 of prior year)', () => {
  const now = new Date(2026, 0, 15) // Q1 2026
  const result = computeQuarterlyTable([], now)
  expect(result.lastQuarterLabel).toBeNull() // no data
  expect(result.quarterLabel).toBe('Q1 26')
})
```

Replace with:
```ts
it('handles Q1 rollover correctly (prev = Q4 of prior year)', () => {
  // A Q1 played week is needed so holdover does not trigger
  const weeks: Week[] = [
    makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
  ]
  const now = new Date(2026, 0, 15) // Q1 2026
  const result = computeQuarterlyTable(weeks, now)
  expect(result.lastQuarterLabel).toBeNull() // no Q4 2025 data
  expect(result.quarterLabel).toBe('Q1 26')
  expect(result.isHoldover).toBe(false)
})
```

- [ ] **Step 2: Fix the gamesLeft tests that use empty weeks in Q1**

Each test below currently calls `computeQuarterlyTable([], new Date(2026, 0, ...), gameDay)`. With holdover, empty Q1 triggers holdover → `gamesLeft = 0`. Fix each by adding a Q1 played week before the `now` date.

Find the `describe('gamesLeft — calendar-based', ...)` block. Update the affected tests as follows (tests that pass a non-empty `weeks` array already are unaffected):

**"excludes today and counts remaining Wednesdays when now is a Wednesday"**
(now = 7 Jan 2026)
```ts
it('excludes today and counts remaining Wednesdays when now is a Wednesday', () => {
  const weeks: Week[] = [
    makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
  ]
  const now = new Date(2026, 0, 7)
  const result = computeQuarterlyTable(weeks, now, 3)
  expect(result.gamesLeft).toBe(11)
})
```

**"counts correctly when now is the first day of the quarter"**
(now = 1 Jan 2026 — no game yet, but we need to avoid holdover; add a game ON Jan 1)
```ts
it('counts correctly when now is the first day of the quarter', () => {
  const weeks: Week[] = [
    makeWeek({ week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
  ]
  const now = new Date(2026, 0, 1)
  const result = computeQuarterlyTable(weeks, now, 3)
  expect(result.gamesLeft).toBe(12)
})
```

**"returns 0 when now is the last day of the quarter even if it is the game day"**
(now = 31 Mar 2026)
```ts
it('returns 0 when now is the last day of the quarter even if it is the game day', () => {
  const weeks: Week[] = [
    makeWeek({ week: 1, date: '31 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
  ]
  const now = new Date(2026, 2, 31)
  const result = computeQuarterlyTable(weeks, now, 2)
  expect(result.gamesLeft).toBe(0)
})
```

**"includes tomorrow when now is the day before the game day"**
(now = 6 Jan 2026)
```ts
it('includes tomorrow when now is the day before the game day', () => {
  const weeks: Week[] = [
    makeWeek({ week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
  ]
  const now = new Date(2026, 0, 6)
  const result = computeQuarterlyTable(weeks, now, 3)
  expect(result.gamesLeft).toBe(12)
})
```

**"produces one more count when now is Jan 1 than when now is Jan 6"**
```ts
it('produces one more count when now is Jan 1 than when now is Jan 6', () => {
  const weeksWithGame = [
    makeWeek({ week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
  ]
  const fromJan1 = computeQuarterlyTable(weeksWithGame, new Date(2026, 0, 1), 3).gamesLeft
  const fromJan7 = computeQuarterlyTable(weeksWithGame, new Date(2026, 0, 7), 3).gamesLeft
  expect(fromJan1).toBe(12)
  expect(fromJan7).toBe(11)
})
```

**"handles gameDay = 0 (Sunday) correctly"**
(now = 1 Jan 2026)
```ts
it('handles gameDay = 0 (Sunday) correctly', () => {
  const weeks: Week[] = [
    makeWeek({ week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
  ]
  const now = new Date(2026, 0, 1)
  const result = computeQuarterlyTable(weeks, now, 0)
  expect(result.gamesLeft).toBe(13)
})
```

**"returns 0 when no weeks exist and gameDay is not provided"** — this test is still valid (holdover with no history → `gamesLeft = 0`). No change needed.

**"uses explicit gameDay even when played weeks exist with a different day"** — already has a Q1 played week. No change needed.

**"infers gameDay from played weeks in the current quarter"** — already has a Q1 played week. No change needed.

**"infers gameDay from prior-quarter history when current quarter has only cancelled weeks"** — has a cancelled Q1 week (not played). With new logic: Q1 has 0 played → holdover to Q4 2025. Fix:
```ts
it('infers gameDay from prior-quarter history when current quarter has only cancelled weeks', () => {
  // Played week in Q4 2025 on 17 Dec (Wednesday = gameDay 3)
  // Played week in Q1 2026 — needed to prevent holdover
  // now = 22 Jan 2026. Cursor starts 23 Jan.
  // Wednesdays 23 Jan→31 Mar: Jan 28, Feb 4,11,18,25, Mar 4,11,18,25 = 9
  const weeks: Week[] = [
    makeWeek({ week: 1, date: '17 Dec 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ week: 2, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q1 played → prevents holdover
    makeWeek({ week: 3, date: '14 Jan 2026', status: 'cancelled', teamA: [], teamB: [], winner: null }),
  ]
  const now = new Date(2026, 0, 22)
  const result = computeQuarterlyTable(weeks, now)
  expect(result.gamesLeft).toBe(9)
})
```

Note: this test originally tested that `inferGameDay` falls back to prior-quarter history. That is still exercised since the most recent played week is now Jan 7 (Wednesday), so `inferGameDay` returns 3. The test intent is preserved.

- [ ] **Step 3: Run the full test suite**

```bash
npx jest __tests__/sidebar-stats.test.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "feat: quarterly table holdover — show previous quarter until first Q2 game"
```

---

### Task 4: Update `QuarterlyTableWidget` to show `· Final` label during holdover

**Files:**
- Modify: `components/StatsSidebar.tsx` (lines 83–175)

- [ ] **Step 1: Destructure `isHoldover` and update the header label**

In `components/StatsSidebar.tsx`, update the `QuarterlyTableWidget` function:

```tsx
function QuarterlyTableWidget({ weeks, leagueDayIndex }: { weeks: Week[]; leagueDayIndex?: number }) {
  const { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft, isHoldover } = computeQuarterlyTable(weeks, new Date(), leagueDayIndex)
  const showGamesLeft = entries.length > 0 && gamesLeft > 0

  return (
    <div className="rounded-lg border border-slate-700 bg-transparent overflow-hidden">
      {/* Header with inline column labels */}
      <div className="px-3 py-2 border-b border-slate-700/40 flex items-center gap-1">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 shrink-0">
            {quarterLabel}
          </span>
          {isHoldover && (
            <span className="text-[10px] font-semibold text-slate-500 shrink-0">· Final</span>
          )}
          {showGamesLeft && (
            <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 border border-slate-700 rounded px-[5px] py-[1px]">
              {gamesLeft} games left
            </span>
          )}
        </div>
        <span className="text-[10px] font-semibold uppercase text-slate-700 w-[22px] text-center">P</span>
        <span className="text-[10px] font-semibold uppercase text-slate-700 w-[18px] text-center">W</span>
        <span className="text-[10px] font-semibold uppercase text-slate-700 w-[18px] text-center">D</span>
        <span className="text-[10px] font-semibold uppercase text-slate-700 w-[18px] text-center">L</span>
        <span className="text-[10px] font-semibold uppercase text-slate-500 w-[28px] text-right">Pts</span>
      </div>

      <div className="px-3 py-3">
        {entries.length === 0 ? (
          <EmptyState message="Quarter just started" />
        ) : (
          <div className="flex flex-col gap-[2px]">
            {entries.map((e, i) => (
              <div
                key={e.name}
                className={cn(
                  'flex items-center gap-1 py-[3px]',
                  i === 0 ? '-mx-3 px-3 bg-sky-400/[0.06]' : '-mx-1 px-1'
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
                <span className="text-[11px] text-slate-600 w-[22px] text-center shrink-0">
                  {e.played}
                </span>
                <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">
                  {e.won}
                </span>
                <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">
                  {e.drew}
                </span>
                <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">
                  {e.lost}
                </span>
                <span className={cn(
                  'text-[12px] font-bold w-[28px] text-right shrink-0',
                  i === 0 ? 'text-sky-300' : 'text-slate-300'
                )}>
                  {e.points}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Previous quarter champion */}
        {lastChampion && lastQuarterLabel && (
          <>
            <div className="border-t border-slate-700/40 mt-2 mb-3" />
            <div className="flex items-center justify-between bg-amber-400/[0.07] border border-amber-400/[0.14] rounded-md px-[10px] py-[6px]">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-amber-600 mb-0">
                  {lastQuarterLabel} Champion
                </p>
                <p className="text-[13px] font-bold text-yellow-200 uppercase">{lastChampion}</p>
              </div>
              <span className="text-lg leading-none">🏆</span>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

The only changes vs the original:
1. `isHoldover` destructured from `computeQuarterlyTable` result
2. `{isHoldover && <span>· Final</span>}` inserted after the `quarterLabel` span
3. `gamesTotal` removed from destructuring (unused in widget)

- [ ] **Step 2: Run all tests to confirm nothing broken**

```bash
npx jest --no-coverage
```

Expected: all tests PASS. (`StatsSidebar` is not unit-tested, so no test changes needed here.)

- [ ] **Step 3: Commit**

```bash
git add components/StatsSidebar.tsx
git commit -m "feat: show '· Final' label in quarterly table widget during holdover"
```
