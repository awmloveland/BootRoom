# Honours: Hide Active Quarter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the current active quarter from appearing in the Honours tab, even when all its DB weeks are resulted.

**Architecture:** Add a `now` parameter to `computeAllCompletedQuarters` in `lib/sidebar-stats.ts`. For each quarter bucket, compute its calendar end date and skip it if that date hasn't passed yet. The call site in `honours/page.tsx` passes `new Date()`. Existing checks (no unrecorded/scheduled weeks, at least one played week) are unchanged.

**Tech Stack:** TypeScript, Next.js 14 App Router, Jest (tests via `npm test`)

---

## File Map

- **Modify:** `lib/sidebar-stats.ts` — add `now` param and calendar-end guard to `computeAllCompletedQuarters`
- **Modify:** `app/[leagueId]/honours/page.tsx` — pass `new Date()` to `computeAllCompletedQuarters`
- **Modify:** `__tests__/sidebar-stats.test.ts` — add test for active-quarter exclusion

---

### Task 1: Add failing test for active-quarter exclusion

**Files:**
- Modify: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Add the failing test**

Open `__tests__/sidebar-stats.test.ts` and add this test inside the `describe('computeAllCompletedQuarters', ...)` block (after the existing tests):

```ts
it('excludes a quarter whose calendar end date has not yet passed', () => {
  // Q2 2026 ends June 30 2026. If now is April 7 2026, Q2 should be hidden
  // even though its only week is resulted.
  const now = new Date(2026, 3, 7) // April 7 2026
  const weeks: Week[] = [
    makeWeek({ week: 1, date: '06 Apr 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
  ]
  expect(computeAllCompletedQuarters(weeks, now)).toEqual([])
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm test -- --testPathPattern=sidebar-stats --verbose 2>&1 | tail -30
```

Expected: FAIL — `computeAllCompletedQuarters` does not yet accept a `now` argument, so TypeScript compilation may error, or the test asserts `[]` but gets a result with the Q2 quarter.

---

### Task 2: Implement the calendar-end guard in `computeAllCompletedQuarters`

**Files:**
- Modify: `lib/sidebar-stats.ts`

- [ ] **Step 1: Update the function signature and add the guard**

In `lib/sidebar-stats.ts`, change the `computeAllCompletedQuarters` function signature and add a calendar-end check inside the loop. Replace:

```ts
export function computeAllCompletedQuarters(weeks: Week[]): HonoursYear[] {
  // Group all weeks by (year, q) bucket key
  const buckets = new Map<string, Week[]>()
  for (const w of weeks) {
    const d = parseWeekDate(w.date)
    const { q, year } = quarterOf(d)
    const key = `${year}-${q}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(w)
  }

  const completed: CompletedQuarter[] = []

  for (const [key, qWeeks] of buckets) {
    // A quarter is complete only when every week is played or cancelled.
    // A single unrecorded or scheduled week keeps the quarter hidden.
    const hasIncomplete = qWeeks.some(w => w.status === 'unrecorded' || w.status === 'scheduled')
    if (hasIncomplete) continue
```

with:

```ts
export function computeAllCompletedQuarters(weeks: Week[], now: Date = new Date()): HonoursYear[] {
  // Group all weeks by (year, q) bucket key
  const buckets = new Map<string, Week[]>()
  for (const w of weeks) {
    const d = parseWeekDate(w.date)
    const { q, year } = quarterOf(d)
    const key = `${year}-${q}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(w)
  }

  const completed: CompletedQuarter[] = []

  for (const [key, qWeeks] of buckets) {
    const [yearStr, qStr] = key.split('-')
    const year = Number(yearStr)
    const q = Number(qStr)

    // Skip quarters whose calendar end date hasn't passed yet.
    // new Date(year, q * 3, 0) = last day of the last month of quarter q.
    // Q1 → Mar 31, Q2 → Jun 30, Q3 → Sep 30, Q4 → Dec 31.
    const quarterEnd = new Date(year, q * 3, 0)
    if (now <= quarterEnd) continue

    // A quarter is complete only when every week is played or cancelled.
    // A single unrecorded or scheduled week keeps the quarter hidden.
    const hasIncomplete = qWeeks.some(w => w.status === 'unrecorded' || w.status === 'scheduled')
    if (hasIncomplete) continue
```

Also remove the `const [yearStr, qStr] = key.split('-')` and subsequent `year`/`q` variable declarations that appear *later* in the same loop body (they are now declared above), replacing:

```ts
    const [yearStr, qStr] = key.split('-')
    const year = Number(yearStr)
    const q = Number(qStr)
    const yy = String(year).slice(-2)
```

with just:

```ts
    const yy = String(year).slice(-2)
```

- [ ] **Step 2: Run the new test to confirm it passes**

```bash
npm test -- --testPathPattern=sidebar-stats --verbose 2>&1 | tail -30
```

Expected: all tests PASS including the new active-quarter exclusion test.

- [ ] **Step 3: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "fix: exclude active quarter from honours tab

A quarter is now only shown once its calendar end date has passed,
preventing the current quarter from appearing even when all its
resulted weeks exist in the DB.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Update call site in `honours/page.tsx`

**Files:**
- Modify: `app/[leagueId]/honours/page.tsx`

- [ ] **Step 1: Pass `new Date()` to `computeAllCompletedQuarters`**

In `app/[leagueId]/honours/page.tsx`, change line 86:

```ts
<HonoursSection data={computeAllCompletedQuarters(weeks)} />
```

to:

```ts
<HonoursSection data={computeAllCompletedQuarters(weeks, new Date())} />
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (no errors).

- [ ] **Step 3: Run full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/[leagueId]/honours/page.tsx
git commit -m "fix: pass now to computeAllCompletedQuarters in honours page

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
