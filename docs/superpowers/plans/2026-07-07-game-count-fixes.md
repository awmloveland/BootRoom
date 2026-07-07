# Game-Count Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sidebar "games left" count fixture-aware (today's game counts until its result is recorded) and make the honours tab show the full planned date range for in-progress quarters.

**Architecture:** Both fixes live in `lib/sidebar-stats.ts`. `gamesLeftInQuarter()` gains a `weeks` parameter and skips game days that already have a settled week (any status except `scheduled`). `computeAllQuarters()` gains an `in_progress` branch in its date-range logic that extends the range's end to the last game day of the calendar quarter. No public signatures change; no callers outside this module change.

**Tech Stack:** TypeScript (strict), Jest (`npm test`). Spec: `docs/superpowers/specs/2026-07-07-game-counts-design.md`.

**Calendar facts used by the tests** (verify against a 2026 calendar if editing expectations): 1 Jan 2026 = Thursday; Wednesdays in Q1 2026 are Jan 7/14/21/28, Feb 4/11/18/25, Mar 4/11/18/25 (12 total, last = 25 Mar); 31 Mar 2026 = Tuesday; 17 Dec 2025 = Wednesday; 24 Mar 2026 = Tuesday.

---

### Task 1: Fixture-aware `gamesLeftInQuarter`

**Files:**
- Modify: `lib/sidebar-stats.ts:4-26` (function `gamesLeftInQuarter`) and `lib/sidebar-stats.ts:286-288` (call site in `computeQuarterlyTable`)
- Test: `__tests__/sidebar-stats.test.ts:226-351` (describe block `gamesLeft — calendar-based`)

- [ ] **Step 1: Update the gamesLeft tests to the new semantics**

In `__tests__/sidebar-stats.test.ts`, inside `describe('computeQuarterlyTable')`, make these changes to the `describe('gamesLeft — calendar-based', ...)` block:

**1a.** Rename the describe block:

```ts
  describe('gamesLeft — fixture-aware calendar count', () => {
```

**1b.** Replace Test 1 (`'excludes today and counts remaining Wednesdays when now is a Wednesday'`, currently lines 229–239) with these two tests:

```ts
    // Test 1a: today is the game day and nothing is recorded on it → today counts
    it('counts today when now is an unrecorded game day', () => {
      // now = 7 Jan 2026 (Wednesday). No week dated 7 Jan.
      // Wednesdays 7 Jan→31 Mar: Jan 7,14,21,28, Feb 4,11,18,25, Mar 4,11,18,25 = 12
      // Played week on 1 Jan (Thursday) prevents holdover and collides with no Wednesday.
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 0, 7)
      const result = computeQuarterlyTable(weeks, now, 3) // gameDay 3 = Wednesday
      expect(result.gamesLeft).toBe(12)
    })

    // Test 1b: today's result is already recorded → today no longer counts
    it('stops counting today once a played week is recorded on its date', () => {
      // now = 7 Jan 2026 (Wednesday), played week dated 7 Jan.
      // Wednesdays left: 14,21,28 Jan, Feb 4,11,18,25, Mar 4,11,18,25 = 11
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 0, 7)
      const result = computeQuarterlyTable(weeks, now, 3)
      expect(result.gamesLeft).toBe(11)
    })
```

**1c.** Replace Test 3 (`'returns 0 when now is the last day of the quarter even if it is the game day'`, currently lines 253–263) with these two tests:

```ts
    // Test 3a: last day of quarter, game already recorded → 0
    it('returns 0 on the last day of the quarter once its game is recorded', () => {
      // now = 31 Mar 2026 (Tuesday = gameDay 2), played week dated 31 Mar → settled.
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '31 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 2, 31)
      const result = computeQuarterlyTable(weeks, now, 2)
      expect(result.gamesLeft).toBe(0)
    })

    // Test 3b: last day of quarter, game not yet recorded → 1
    it('returns 1 on the last day of the quarter when its game is unrecorded', () => {
      // now = 31 Mar 2026 (Tuesday = gameDay 2). No week dated 31 Mar.
      // Played week 24 Mar (also Tuesday) prevents holdover.
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '24 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const now = new Date(2026, 2, 31)
      const result = computeQuarterlyTable(weeks, now, 2)
      expect(result.gamesLeft).toBe(1)
    })
```

**1d.** Replace Test 5 (`'produces one more count when now is Jan 1 than when now is Jan 6'`, currently lines 277–290) with these two tests:

```ts
    // Test 5a: a cancelled week settles its date — today
    it('does not count today when its game is cancelled', () => {
      // now = 7 Jan 2026 (Wednesday), cancelled week dated 7 Jan.
      // Played 1 Jan prevents holdover. Wednesdays left: 12 − 1 (7 Jan cancelled) = 11
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
        makeWeek({ week: 2, date: '07 Jan 2026', status: 'cancelled', teamA: [], teamB: [], winner: null }),
      ]
      const now = new Date(2026, 0, 7)
      const result = computeQuarterlyTable(weeks, now, 3)
      expect(result.gamesLeft).toBe(11)
    })

    // Test 5b: a cancelled week settles its date — future
    it('does not count a future game day whose week is already cancelled', () => {
      // now = 7 Jan 2026 (Wednesday). 7 Jan played (settled), 14 Jan cancelled (settled).
      // Wednesdays left: 12 − 2 = 10
      const weeks: Week[] = [
        makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
        makeWeek({ week: 2, date: '14 Jan 2026', status: 'cancelled', teamA: [], teamB: [], winner: null }),
      ]
      const now = new Date(2026, 0, 7)
      const result = computeQuarterlyTable(weeks, now, 3)
      expect(result.gamesLeft).toBe(10)
    })
```

**1e.** Update stale comments in the tests that keep passing unchanged. In Test 2 (`'counts correctly when now is the first day of the quarter'`) replace the comment lines with:

```ts
      // now = 1 Jan 2026 (Thursday). Count starts today; 1 Jan is not a Wednesday.
      // Wednesdays 1 Jan→31 Mar: Jan 7,14,21,28, Feb 4,11,18,25, Mar 4,11,18,25 = 12
```

In Test 4 (`'includes tomorrow when now is the day before the game day'`) replace the comment lines with:

```ts
      // now = 6 Jan 2026 (Tuesday). Count starts today; first Wednesday is 7 Jan.
      // Wednesdays 6 Jan→31 Mar: Jan 7,14,21,28, Feb 4,11,18,25, Mar 4,11,18,25 = 12
```

In Test 8 (`'infers gameDay from played weeks in the current quarter'`) replace the comment line `// now = 22 Jan 2026 (Thursday). Cursor starts 23 Jan.` with:

```ts
      // now = 22 Jan 2026 (Thursday). Count starts today; the 7 Jan played week is in the past.
```

In Test 9 (`'infers gameDay from prior-quarter history...'`) replace the comment line `// now = 22 Jan 2026. Cursor starts 23 Jan.` with:

```ts
      // now = 22 Jan 2026. Count starts today; all settled weeks (17 Dec, 7 Jan, 14 Jan) are in the past.
```

Tests 6, 7, and 10 need no changes (their fixtures have no settled weeks on counted game days, so expectations are identical).

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test -- sidebar-stats`
Expected: FAIL — `counts today when now is an unrecorded game day` expects 12 but receives 11; `returns 1 on the last day of the quarter when its game is unrecorded` expects 1 but receives 0. `does not count a future game day whose week is already cancelled` expects 10 but receives 11. All other tests pass.

- [ ] **Step 3: Implement the fixture-aware count**

In `lib/sidebar-stats.ts`, replace the doc comment and function at lines 6–26 with:

```ts
/**
 * Count game days (0=Sun…6=Sat) from today to the last day of the given quarter
 * that are still to be played. A day stops counting once a week dated on it is
 * settled — any status other than 'scheduled'. Dates are normalized to midnight
 * so comparisons with `quarterEnd` (also midnight) are not skewed by time-of-day.
 */
function gamesLeftInQuarter(q: number, year: number, gameDay: number, now: Date, weeks: Week[]): number {
  // quarterEndMonthIdx: 0-indexed last month of quarter (Q1→2, Q2→5, Q3→8, Q4→11)
  // new Date(year, month+1, 0) = last day of `month`, constructed at local midnight
  const quarterEndMonthIdx = q * 3 - 1
  const quarterEnd = new Date(year, quarterEndMonthIdx + 1, 0)

  const settledDates = new Set(
    weeks
      .filter(w => w.status !== 'scheduled')
      .map(w => {
        const d = parseWeekDate(w.date)
        d.setHours(0, 0, 0, 0)
        return d.getTime()
      })
  )

  let count = 0
  const cursor = new Date(now)
  cursor.setHours(0, 0, 0, 0)
  while (cursor <= quarterEnd) {
    if (cursor.getDay() === gameDay && !settledDates.has(cursor.getTime())) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}
```

Then update the call site in `computeQuarterlyTable` (currently lines 286–288) to pass `weeks`:

```ts
  const gamesLeft = !isHoldover && resolvedGameDay !== null
    ? gamesLeftInQuarter(q, year, resolvedGameDay, now, weeks)
    : 0
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- sidebar-stats`
Expected: PASS — every test in the file.

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "fix(sidebar): count today's unplayed game in games-left

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: In-progress quarter date range on honours

**Files:**
- Modify: `lib/sidebar-stats.ts:352-369` (date-range block inside `computeAllQuarters`; line numbers as of before Task 1 — the block starts with the comment `// Date range`)
- Test: `__tests__/sidebar-stats.test.ts` (describe block `computeAllQuarters`, `── Date ranges ──` section, currently lines 536–577)

- [ ] **Step 1: Add failing tests for the in-progress date range**

In `__tests__/sidebar-stats.test.ts`, inside `describe('computeAllQuarters')`, after the existing test `'uses game-day occurrences for upcoming date range when game day can be inferred'`, add:

```ts
  it('extends an in-progress quarter date range to the last game day of the quarter', () => {
    // Played Wednesdays 7 + 14 Jan 2026. now = 15 Feb 2026 → Q1 2026 in progress.
    // from = earliest recorded week (7 Jan). to = last Wednesday of Q1 = 25 Mar 2026,
    // NOT the latest recorded week (14 Jan) — that was the bug.
    const weeks = [
      makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '14 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
    ]
    const now = new Date(2026, 1, 15)
    const result = computeAllQuarters(weeks, now)
    const q1 = result.find(y => y.year === 2026)!.quarters.find(q => q.q === 1)!
    expect(q1.status).toBe('in_progress')
    expect(q1.dateRange.from).toBe('07 Jan 2026')
    expect(q1.dateRange.to).toBe('25 Mar 2026')
  })

  it('uses game-day bounds for an in-progress quarter with no recorded weeks', () => {
    // Only history is Q4 2025 (Wednesday 17 Dec 2025) → gameDay = 3.
    // now = 15 Feb 2026 → Q1 2026 in progress with zero weeks.
    // from = first Wednesday of Q1 (7 Jan), to = last Wednesday of Q1 (25 Mar).
    const weeks = [
      makeWeek({ week: 1, date: '17 Dec 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const now = new Date(2026, 1, 15)
    const result = computeAllQuarters(weeks, now)
    const q1 = result.find(y => y.year === 2026)!.quarters.find(q => q.q === 1)!
    expect(q1.status).toBe('in_progress')
    expect(q1.dateRange.from).toBe('07 Jan 2026')
    expect(q1.dateRange.to).toBe('25 Mar 2026')
  })

  it('falls back to calendar bounds for an in-progress quarter with no inferrable game day', () => {
    // No weeks at all → gameDay null. now = 15 Feb 2026 → Q1 2026 in progress.
    const now = new Date(2026, 1, 15)
    const result = computeAllQuarters([], now)
    const q1 = result.find(y => y.year === 2026)!.quarters.find(q => q.q === 1)!
    expect(q1.status).toBe('in_progress')
    expect(q1.dateRange.from).toBe('01 Jan 2026')
    expect(q1.dateRange.to).toBe('31 Mar 2026')
  })
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm test -- sidebar-stats`
Expected: FAIL — `extends an in-progress quarter date range...` receives `to: '14 Jan 2026'`. The `no recorded weeks` and `calendar bounds` tests pass already (existing branches produce the same values); the first test is the red one.

- [ ] **Step 3: Implement the in-progress branch**

In `lib/sidebar-stats.ts`, inside `computeAllQuarters`, replace the date-range block (the `let dateRange` statement and its if/else chain, currently lines 352–369) with:

```ts
      // Date range
      // In-progress quarters show their full planned span: earliest recorded week
      // (or first game day) through the last game day of the calendar quarter —
      // not just the weeks recorded so far.
      let dateRange: { from: string; to: string }
      if (status === 'in_progress') {
        const from = qWeeks.length > 0
          ? new Date(Math.min(...qWeeks.map(w => parseWeekDate(w.date).getTime())))
          : gameDay !== null
            ? firstWeekdayOnOrAfter(gameDay, qStart)
            : qStart
        const to = gameDay !== null ? lastWeekdayOnOrBefore(gameDay, qEnd) : qEnd
        dateRange = { from: formatDate(from), to: formatDate(to) }
      } else if (qWeeks.length > 0) {
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
```

(Only the `if (status === 'in_progress')` branch and the leading comment are new; the `else if` / `else` branches are the existing code unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- sidebar-stats`
Expected: PASS — every test in the file.

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "fix(honours): show full planned range for in-progress quarters

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Full verification

**Files:** none new — verification only.

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all suites PASS.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exits 0 with no output.

- [ ] **Step 3: Fix anything that surfaced, then re-run both commands until clean; commit any fixes**

```bash
git add -A
git commit -m "fix: address test/type issues from game-count fixes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Skip this commit if both commands were already clean.)
