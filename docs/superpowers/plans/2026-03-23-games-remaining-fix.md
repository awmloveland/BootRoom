# Games Remaining Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `QUARTER_GAME_COUNT - maxPlayed` calculation in `computeQuarterlyTable` with a calendar-based count of future game-day occurrences in the current quarter.

**Architecture:** Two new private helpers — `inferGameDay` (infers recurring day-of-week from played weeks) and `gamesLeftInQuarter` (counts forward calendar occurrences) — replace the constant-based subtraction. `computeQuarterlyTable` gains an optional `gameDay` parameter for future config wiring. The old `QUARTER_GAME_COUNT` constant is deleted.

**Tech Stack:** TypeScript, Jest (`npm test`), Next.js 14 codebase. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-03-23-games-remaining-fix-design.md`

---

## File Map

| File | Action | What changes |
|---|---|---|
| `lib/sidebar-stats.ts` | Modify | Remove `QUARTER_GAME_COUNT`; add `inferGameDay` + `gamesLeftInQuarter`; update `computeQuarterlyTable` signature and `gamesLeft` logic; add `gamesTotal` to result |
| `__tests__/sidebar-stats.test.ts` | Modify | Remove 3 old `gamesLeft` tests; add 10 new calendar-aware tests |
| `components/StatsSidebar.tsx` | Modify | Remove `QUARTER_GAME_COUNT` import; use `gamesTotal` for progress bar `fillPct` |

---

## Date Reference (used in tests)

| Date | Day | Notes |
|---|---|---|
| 1 Jan 2026 | Thursday | `new Date(2026, 0, 1)` |
| 6 Jan 2026 | Tuesday | day before first Wednesday |
| 7 Jan 2026 | Wednesday | `gameDay = 3` anchor for mid-Q1 tests |
| 31 Mar 2026 | Tuesday | last day of Q1 2026; `gameDay = 2` for boundary tests |
| 17 Dec 2025 | Wednesday | Q4 2025 anchor for prior-quarter inference test |

**Wednesday counts in Q1 2026 by `now`:**
- `now = Jan 1` → cursor Jan 2 → 12 Wednesdays (Jan 7, 14, 21, 28, Feb 4, 11, 18, 25, Mar 4, 11, 18, 25)
- `now = Jan 6` → cursor Jan 7 → 12 Wednesdays (Jan 7, 14, 21, 28, Feb 4, 11, 18, 25, Mar 4, 11, 18, 25)
- `now = Jan 7` (Wednesday) → cursor Jan 8 → 11 Wednesdays (Jan 14, 21, 28, Feb 4, 11, 18, 25, Mar 4, 11, 18, 25)
- `now = Jan 22` → cursor Jan 23 → 9 Wednesdays (Jan 28, Feb 4, 11, 18, 25, Mar 4, 11, 18, 25)

**Sundays (gameDay=0) in Q1 2026 from Jan 2:** 13 (Jan 4, 11, 18, 25, Feb 1, 8, 15, 22, Mar 1, 8, 15, 22, 29)

---

## Task 1: Delete the three broken `gamesLeft` tests

These three tests will fail once the implementation changes and must be removed first so the red/green cycle is clean.

**Files:**
- Modify: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Delete the three failing tests**

Remove these three `it(...)` blocks from the `describe('computeQuarterlyTable', ...)` suite (lines ~144–167):

```
it('returns gamesLeft as QUARTER_GAME_COUNT minus maxPlayed', ...)
it('returns QUARTER_GAME_COUNT as gamesLeft when entries is empty', ...)
it('clamps gamesLeft to 0 when maxPlayed exceeds QUARTER_GAME_COUNT', ...)
```

Also remove `QUARTER_GAME_COUNT` from the import on line 1 — it will no longer exist:

```ts
// Before:
import { QUARTER_GAME_COUNT, computeInForm, computeQuarterlyTable, computeTeamAB } from '@/lib/sidebar-stats'

// After:
import { computeInForm, computeQuarterlyTable, computeTeamAB } from '@/lib/sidebar-stats'
```

- [ ] **Step 2: Run the full test suite — it should still pass**

```bash
npm test -- --testPathPattern=sidebar-stats
```

Expected: all remaining tests pass (the deleted tests are just gone, not broken).

- [ ] **Step 3: Commit**

```bash
git add __tests__/sidebar-stats.test.ts
git commit -m "test: remove QUARTER_GAME_COUNT-based gamesLeft tests"
```

---

## Task 2: Write the new failing `gamesLeft` tests

Write 10 new tests that exercise calendar-based `gamesLeft`. All should fail at this point because the implementation hasn't changed yet — that's expected and correct.

**Files:**
- Modify: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Add the 10 new tests inside the existing `describe('computeQuarterlyTable', ...)` block**

Append these after the existing tests in that describe block:

```ts
// ─── gamesLeft (calendar-based) ───────────────────────────────────────────────

describe('gamesLeft — calendar-based', () => {
  // Test 1: explicit gameDay, mid-quarter, now is the game day (today excluded)
  it('excludes today and counts remaining Wednesdays when now is a Wednesday', () => {
    // now = 7 Jan 2026 (Wednesday). Cursor starts 8 Jan.
    // Wednesdays 8 Jan→31 Mar: Jan 14,21,28, Feb 4,11,18,25, Mar 4,11,18,25 = 11
    const now = new Date(2026, 0, 7)
    const result = computeQuarterlyTable([], now, 3) // gameDay 3 = Wednesday
    expect(result.gamesLeft).toBe(11)
  })

  // Test 2: first day of quarter
  it('counts correctly when now is the first day of the quarter', () => {
    // now = 1 Jan 2026 (Thursday). Cursor starts 2 Jan.
    // Wednesdays 2 Jan→31 Mar: Jan 7,14,21,28, Feb 4,11,18,25, Mar 4,11,18,25 = 12
    const now = new Date(2026, 0, 1)
    const result = computeQuarterlyTable([], now, 3)
    expect(result.gamesLeft).toBe(12)
  })

  // Test 3: now is the last day of the quarter (also the game day)
  it('returns 0 when now is the last day of the quarter even if it is the game day', () => {
    // now = 31 Mar 2026 (Tuesday = gameDay 2). Cursor starts 1 Apr = Q2.
    // Loop never executes → 0. Works regardless of whether 31 Mar is the game day.
    const now = new Date(2026, 2, 31)
    const result = computeQuarterlyTable([], now, 2) // gameDay 2 = Tuesday = 31 Mar
    expect(result.gamesLeft).toBe(0)
  })

  // Test 4: now is day before a game day (tomorrow counted)
  it('includes tomorrow when now is the day before the game day', () => {
    // now = 6 Jan 2026 (Tuesday). Cursor starts 7 Jan (Wednesday).
    // Wednesdays 7 Jan→31 Mar: Jan 7,14,21,28, Feb 4,11,18,25, Mar 4,11,18,25 = 12
    const now = new Date(2026, 0, 6)
    const result = computeQuarterlyTable([], now, 3)
    expect(result.gamesLeft).toBe(12)
  })

  // Test 5: now = Jan 1 vs now = Jan 6 produce different counts (off-by-one guard)
  it('produces one more count when now is Jan 1 than when now is Jan 6', () => {
    // Jan 1 → cursor Jan 2 → 12 Wednesdays
    // Jan 6 → cursor Jan 7 → 12 Wednesdays
    // These are equal — both start before the first Wednesday (Jan 7)
    // Shift: Jan 7 (Wednesday) → cursor Jan 8 → 11. Confirms today IS excluded.
    const fromJan1 = computeQuarterlyTable([], new Date(2026, 0, 1), 3).gamesLeft
    const fromJan7 = computeQuarterlyTable([], new Date(2026, 0, 7), 3).gamesLeft
    expect(fromJan1).toBe(12)
    expect(fromJan7).toBe(11) // one fewer: Jan 7 itself excluded
  })

  // Test 6: gameDay = 0 (Sunday boundary value)
  it('handles gameDay = 0 (Sunday) correctly', () => {
    // now = 1 Jan 2026 (Thursday). Cursor starts 2 Jan.
    // Sundays 2 Jan→31 Mar: Jan 4,11,18,25, Feb 1,8,15,22, Mar 1,8,15,22,29 = 13
    const now = new Date(2026, 0, 1)
    const result = computeQuarterlyTable([], now, 0)
    expect(result.gamesLeft).toBe(13)
  })

  // Test 7: no weeks, no gameDay — fallback to 0
  it('returns 0 when no weeks exist and gameDay is not provided', () => {
    const result = computeQuarterlyTable([], new Date(2026, 0, 22))
    expect(result.gamesLeft).toBe(0)
  })

  // Test 8: gameDay inferred from played weeks in current quarter
  it('infers gameDay from played weeks in the current quarter', () => {
    // Played week on 7 Jan 2026 (Wednesday = gameDay 3)
    // now = 22 Jan 2026 (Thursday). Cursor starts 23 Jan.
    // Wednesdays 23 Jan→31 Mar: Jan 28, Feb 4,11,18,25, Mar 4,11,18,25 = 9
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const now = new Date(2026, 0, 22)
    const result = computeQuarterlyTable(weeks, now) // no explicit gameDay
    expect(result.gamesLeft).toBe(9)
  })

  // Test 9: gameDay inferred from prior-quarter history (current quarter has only cancelled weeks)
  it('infers gameDay from prior-quarter history when current quarter has only cancelled weeks', () => {
    // Played week in Q4 2025 on 17 Dec (Wednesday = gameDay 3)
    // Cancelled week in Q1 2026 — no played weeks this quarter
    // now = 22 Jan 2026. Cursor starts 23 Jan.
    // Wednesdays 23 Jan→31 Mar: Jan 28, Feb 4,11,18,25, Mar 4,11,18,25 = 9
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '17 Dec 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '07 Jan 2026', status: 'cancelled', teamA: [], teamB: [], winner: null }),
    ]
    const now = new Date(2026, 0, 22)
    const result = computeQuarterlyTable(weeks, now) // no explicit gameDay
    expect(result.gamesLeft).toBe(9)
  })

  // Test 10: explicit gameDay overrides inference
  it('uses explicit gameDay even when played weeks exist with a different day', () => {
    // Played week on Wednesday, but we explicitly pass gameDay = 1 (Monday)
    // now = 1 Jan 2026. Mondays in Q1 from Jan 2: Jan 5,12,19,26, Feb 2,9,16,23, Mar 2,9,16,23,30 = 13
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '07 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const now = new Date(2026, 0, 1)
    const result = computeQuarterlyTable(weeks, now, 1) // explicit Monday
    expect(result.gamesLeft).toBe(13)
  })
})
```

- [ ] **Step 2: Run the new tests — they should all FAIL**

```bash
npm test -- --testPathPattern=sidebar-stats
```

Expected: the 9 new tests fail (implementation unchanged). Other tests still pass. This confirms the tests are live and testing real behaviour.

- [ ] **Step 3: Commit the failing tests**

```bash
git add __tests__/sidebar-stats.test.ts
git commit -m "test: add calendar-based gamesLeft tests (failing)"
```

---

## Task 3: Implement `gamesLeftInQuarter` and `inferGameDay` helpers

Replace the `QUARTER_GAME_COUNT` constant and the `gamesLeft` logic in `lib/sidebar-stats.ts`.

**Files:**
- Modify: `lib/sidebar-stats.ts`

- [ ] **Step 1: Remove `QUARTER_GAME_COUNT` and add the two new helpers**

In `lib/sidebar-stats.ts`:

**Delete** line 4:
```ts
export const QUARTER_GAME_COUNT = 16
```

**Add** these two helpers immediately after the `import` lines (before `computeInForm`):

```ts
// ─── gamesLeftInQuarter ───────────────────────────────────────────────────────

/**
 * Count occurrences of `gameDay` (0=Sun…6=Sat) from tomorrow to the last day
 * of the given quarter. `cursor` is normalized to midnight so the comparison
 * with `quarterEnd` (also midnight) is not skewed by time-of-day.
 */
function gamesLeftInQuarter(q: number, year: number, gameDay: number, now: Date): number {
  // quarterEndMonthIdx: 0-indexed last month of quarter (Q1→2, Q2→5, Q3→8, Q4→11)
  // new Date(year, month+1, 0) = last day of `month`, constructed at local midnight
  const quarterEndMonthIdx = q * 3 - 1
  const quarterEnd = new Date(year, quarterEndMonthIdx + 1, 0)

  let count = 0
  const cursor = new Date(now)
  cursor.setDate(cursor.getDate() + 1) // start from tomorrow — today excluded
  cursor.setHours(0, 0, 0, 0)          // normalize to midnight
  while (cursor <= quarterEnd) {
    if (cursor.getDay() === gameDay) count++
    cursor.setDate(cursor.getDate() + 1)
  }
  return count
}

// ─── inferGameDay ─────────────────────────────────────────────────────────────

/**
 * Infer the league's recurring game day from the most recent played week across
 * ALL history (not just the current quarter). Returns null only when there are
 * zero played weeks ever — e.g. a brand new league.
 */
function inferGameDay(weeks: Week[]): number | null {
  const played = weeks.filter(w => w.status === 'played')
  if (played.length === 0) return null
  // reduce without initial value is safe: `played` is non-empty after the guard above
  const latest = played.reduce((a, b) => (parseWeekDate(a.date) > parseWeekDate(b.date) ? a : b))
  return parseWeekDate(latest.date).getDay()
}
```

- [ ] **Step 2: Update `computeQuarterlyTable` signature and `gamesLeft` logic**

Change the function signature from:

```ts
export function computeQuarterlyTable(weeks: Week[], now: Date = new Date()): QuarterlyTableResult {
```

to:

```ts
export function computeQuarterlyTable(weeks: Week[], now: Date = new Date(), gameDay?: number): QuarterlyTableResult {
```

Then replace the existing `gamesLeft` line:

```ts
// Remove this:
const maxPlayed = entries.length > 0 ? Math.max(...entries.map(e => e.played)) : 0
const gamesLeft = Math.max(0, QUARTER_GAME_COUNT - maxPlayed)
```

with:

```ts
const resolvedGameDay = gameDay ?? inferGameDay(weeks)
const gamesLeft = resolvedGameDay !== null
  ? gamesLeftInQuarter(q, year, resolvedGameDay, now)
  : 0
```

**Important:** `q` and `year` are already in scope from `const { q, year } = quarterOf(now)` on line 75. Do NOT add a second call to `quarterOf` — reuse the existing destructured values.

- [ ] **Step 3: Run the full test suite — all tests should now pass**

```bash
npm test -- --testPathPattern=sidebar-stats
```

Expected: all tests pass, including the 9 new ones.

- [ ] **Step 4: Run the full suite to check for regressions**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar-stats.ts
git commit -m "feat: replace hardcoded QUARTER_GAME_COUNT with calendar-based gamesLeft"
```

---

## Task 4: Final verification

- [ ] **Step 1: Confirm TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Confirm the old `QUARTER_GAME_COUNT` export is fully gone**

```bash
grep -r "QUARTER_GAME_COUNT" .
```

Expected: no matches.

- [ ] **Step 3: Commit if tsc required any fixes, otherwise done**

```bash
git status
```

If clean: no commit needed. If tsc surfaced something: fix, re-run `npm test`, then:

```bash
git add <files>
git commit -m "fix: tsc cleanup after gamesLeft refactor"
```
