# In-Form Recency Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exclude players from the "Most In Form" sidebar widget if their last played game was more than 8 weeks ago.

**Architecture:** `computeInForm` gains a `weeks` parameter and builds a per-player last-played-date map from it. Any player whose last game pre-dates the 8-week cutoff is filtered out before scoring. The component passes its existing `weeks` prop through. Everything else is untouched.

**Tech Stack:** TypeScript, Jest (existing test suite — run with `npm test`)

---

### Task 1: Fix existing `computeInForm` tests to pass `weeks` and `now`

The function signature is about to require `weeks`. Update every existing call in `__tests__/sidebar-stats.test.ts` to pass a `weeks` array that puts the test players within the 8-week window, plus a fixed `now`. This makes the existing tests future-proof before we change the implementation.

**Files:**
- Modify: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Update the five existing `computeInForm` calls**

Replace the entire `describe('computeInForm', ...)` block (lines 35–78) with the following. The only change is adding `weeks` and `now` arguments — the assertions are identical:

```ts
describe('computeInForm', () => {
  // Fixed reference date used across all recency-aware calls
  const NOW = new Date(2026, 2, 31) // 31 Mar 2026

  it('excludes players with played < 5', () => {
    const players = [
      makePlayer({ name: 'Alice', played: 4, recentForm: 'WWWW' }),
      makePlayer({ name: 'Bob',   played: 5, recentForm: 'WWWWW' }),
    ]
    const weeks = [
      makeWeek({ week: 1, date: '17 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const result = computeInForm(players, weeks, NOW)
    expect(result.map(r => r.name)).toEqual(['Bob'])
  })

  it('computes PPG correctly: W=3 D=1 L=0', () => {
    const players = [
      makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' }), // 15/5 = 3.0
      makePlayer({ name: 'Bob',   played: 5, recentForm: 'WDDLL' }), // 5/5  = 1.0
    ]
    const weeks = [
      makeWeek({ week: 1, date: '17 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const result = computeInForm(players, weeks, NOW)
    expect(result[0].name).toBe('Alice')
    expect(result[0].ppg).toBeCloseTo(3.0)
    expect(result[1].ppg).toBeCloseTo(1.0)
  })

  it('uses count of non-dash chars as denominator, not 5', () => {
    const players = [makePlayer({ name: 'Alice', played: 5, recentForm: '--WLW' })]
    const weeks = [
      makeWeek({ week: 1, date: '17 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const result = computeInForm(players, weeks, NOW)
    expect(result[0].ppg).toBeCloseTo(2.0)
  })

  it('returns at most 5 players sorted descending by PPG', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      makePlayer({ name: `P${i}`, played: 5, recentForm: 'W'.repeat(Math.max(0, 5 - i)) + 'L'.repeat(Math.min(i, 5)) })
    )
    const weeks = [
      makeWeek({
        week: 1,
        date: '17 Mar 2026',
        teamA: ['P0', 'P1', 'P2', 'P3'],
        teamB: ['P4', 'P5', 'P6', 'P7'],
        winner: 'teamA',
      }),
    ]
    const result = computeInForm(players, weeks, NOW)
    expect(result).toHaveLength(5)
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].ppg).toBeGreaterThanOrEqual(result[i].ppg)
    }
  })

  it('returns empty array when no qualifying players', () => {
    const players = [makePlayer({ name: 'Alice', played: 3 })]
    const weeks = [
      makeWeek({ week: 1, date: '17 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    expect(computeInForm(players, weeks, NOW)).toEqual([])
  })
```

Do **not** close the `describe` block yet — the recency tests go in the next task.

- [ ] **Step 2: Run the existing tests to confirm they still pass**

```bash
npm test -- --testPathPattern="sidebar-stats" --verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|computeInForm)"
```

Expected: all five `computeInForm` tests pass (they may now fail with a TypeScript/argument-count error — that's fine, it means we're ready for Task 2).

> Note: if the tests currently fail with "Expected 1 arguments, but got 3", that's the TypeScript compiler complaining about the not-yet-updated signature. That is the correct failure mode — proceed to Task 2.

---

### Task 2: Write failing recency tests

Add the recency `describe` block inside `computeInForm`. These tests will fail until Task 3 changes the implementation.

**Files:**
- Modify: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Append the recency describe block, then close the outer describe**

Immediately after the last test from Task 1 (before the closing `})` of `describe('computeInForm', ...)`), add:

```ts
  describe('recency cutoff (8 weeks)', () => {
    // now = 31 Mar 2026; cutoff = 3 Feb 2026 (56 days earlier)
    const NOW = new Date(2026, 2, 31)

    it('includes a player whose last game was 4 weeks ago', () => {
      // 3 Mar 2026 — within 8 weeks
      const players = [makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' })]
      const weeks = [
        makeWeek({ week: 1, date: '03 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const result = computeInForm(players, weeks, NOW)
      expect(result.map(r => r.name)).toContain('Alice')
    })

    it('includes a player whose last game was exactly 8 weeks ago (boundary inclusive)', () => {
      // 3 Feb 2026 — exactly on the cutoff
      const players = [makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' })]
      const weeks = [
        makeWeek({ week: 1, date: '03 Feb 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const result = computeInForm(players, weeks, NOW)
      expect(result.map(r => r.name)).toContain('Alice')
    })

    it('excludes a player whose last game was 9 weeks ago', () => {
      // 27 Jan 2026 — just outside the cutoff
      const players = [makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' })]
      const weeks = [
        makeWeek({ week: 1, date: '27 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const result = computeInForm(players, weeks, NOW)
      expect(result.map(r => r.name)).not.toContain('Alice')
    })

    it('excludes a player with no week entry', () => {
      // Player exists in the players array but never appears in any week
      const players = [makePlayer({ name: 'Ghost', played: 5, recentForm: 'WWWWW' })]
      const weeks: Week[] = []
      const result = computeInForm(players, weeks, NOW)
      expect(result).toHaveLength(0)
    })

    it('uses the most recent week when a player appears in multiple weeks', () => {
      // Old game: 10 Jan 2026 (> 8 weeks ago). Recent game: 17 Mar 2026 (2 weeks ago).
      // Should be included because the most recent game is within the window.
      const players = [makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' })]
      const weeks = [
        makeWeek({ week: 1, date: '10 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
        makeWeek({ week: 2, date: '17 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      ]
      const result = computeInForm(players, weeks, NOW)
      expect(result.map(r => r.name)).toContain('Alice')
    })
  })
}) // closes describe('computeInForm')
```

- [ ] **Step 2: Run the recency tests to confirm they fail**

```bash
npm test -- --testPathPattern="sidebar-stats" --verbose 2>&1 | grep -E "(PASS|FAIL|recency|includes|excludes)"
```

Expected: the 5 new recency tests **FAIL** (the current implementation ignores `weeks` entirely). The 5 existing tests may pass or fail depending on whether TypeScript accepts the extra args in JS test mode — either is fine at this stage.

---

### Task 3: Update `computeInForm` to accept `weeks` and apply the recency filter

**Files:**
- Modify: `lib/sidebar-stats.ts`

- [ ] **Step 1: Add `Week` to the import**

Change line 2 of `lib/sidebar-stats.ts` from:

```ts
import type { Player, Week } from '@/lib/types'
```

It already imports `Week` — no change needed. Confirm the import reads:

```ts
import type { Player, Week } from '@/lib/types'
```

- [ ] **Step 2: Replace `computeInForm` with the recency-aware version**

Replace the entire `computeInForm` function (lines 51–62 of `lib/sidebar-stats.ts`) with:

```ts
export function computeInForm(players: Player[], weeks: Week[], now: Date = new Date()): InFormEntry[] {
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - 56) // 8 weeks = 56 days

  const lastPlayed = new Map<string, Date>()
  for (const w of weeks) {
    if (w.status !== 'played') continue
    const d = parseWeekDate(w.date)
    for (const name of [...w.teamA, ...w.teamB]) {
      const existing = lastPlayed.get(name)
      if (!existing || d > existing) lastPlayed.set(name, d)
    }
  }

  return players
    .filter(p => {
      if (p.played < 5) return false
      const last = lastPlayed.get(p.name)
      return last !== undefined && last >= cutoff
    })
    .map(p => {
      const chars = p.recentForm.split('').filter(c => c !== '-')
      if (chars.length === 0) return { name: p.name, recentForm: p.recentForm, ppg: 0 }
      const points = chars.reduce((acc, c) => acc + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0)
      return { name: p.name, recentForm: p.recentForm, ppg: points / chars.length }
    })
    .sort((a, b) => b.ppg - a.ppg)
    .slice(0, 5)
}
```

- [ ] **Step 3: Run all `computeInForm` tests and confirm they all pass**

```bash
npm test -- --testPathPattern="sidebar-stats" --verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗|×|computeInForm|recency)"
```

Expected: all 10 `computeInForm` tests pass. `computeQuarterlyTable` and `computeTeamAB` tests are unaffected.

- [ ] **Step 4: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "feat: exclude inactive players from Most In Form widget (8-week cutoff)"
```

---

### Task 4: Update `InFormWidget` to pass `weeks`

**Files:**
- Modify: `components/StatsSidebar.tsx`

- [ ] **Step 1: Update the `InFormWidget` props and call**

In `components/StatsSidebar.tsx`, replace the `InFormWidget` function signature and `computeInForm` call (lines 33–35):

```ts
// Before
function InFormWidget({ players }: { players: Player[] }) {
  const entries = computeInForm(players)
```

```ts
// After
function InFormWidget({ players, weeks }: { players: Player[]; weeks: Week[] }) {
  const entries = computeInForm(players, weeks)
```

- [ ] **Step 2: Pass `weeks` at the call site in `StatsSidebar`**

Further down in `StatsSidebar` (inside the return), replace:

```tsx
<InFormWidget    players={players} />
```

with:

```tsx
<InFormWidget    players={players} weeks={weeks} />
```

- [ ] **Step 3: Confirm the TypeScript build has no errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (zero errors).

- [ ] **Step 4: Run the full test suite**

```bash
npm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/StatsSidebar.tsx
git commit -m "feat: wire weeks into InFormWidget for recency filtering"
```
