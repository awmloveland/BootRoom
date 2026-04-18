# Results tab: sort weeks by date — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the results list sort by actual match date (ground truth) instead of by the renumbered `week` column, and align all other "most recent" / "within-year ordering" sites to use the same source of truth.

**Architecture:** Change the comparator inside `sortWeeks()` from `(season DESC, week DESC)` to parsed-date descending. Replace four hand-rolled "most recent" finders with `sortWeeks(...)[0]`. Replace three inline `b.week - a.week` sorts in secondary surfaces (year stats, last-played lookup, streak walk) with a parsed-date comparator. No schema changes, no migration, no feature flag.

**Tech Stack:** TypeScript, Next.js 14, Jest, existing `parseWeekDate` helper (`'DD MMM YYYY'` → `Date`).

---

## File map

| File | Change |
|---|---|
| `lib/__tests__/utils.season.test.ts` | Modify — add regression tests for `sortWeeks` ordering by date |
| `lib/utils.ts` | Modify — rewrite `sortWeeks`, `deriveSeason`, `computeYearStats` recent form |
| `components/WeekList.tsx` | Modify — replace `mostRecent` reduce with `sortWeeks(...)[0]` |
| `components/PublicMatchList.tsx` | Modify — replace `mostRecent` reduce with `sortWeeks(...)[0]` |
| `components/ResultsSection.tsx` | Modify — replace `reduce` with `sortWeeks(...)[0]` |
| `components/NextMatchCard.tsx` | Modify — sort `deriveLastPlayedDates` played weeks by date |
| `lib/sidebar-stats.ts` | Modify — sort `computeTeamAB` streak walk by date |
| `app/[slug]/results/page.tsx` | Modify — sort scheduled weeks by date ascending |

---

## Task 1: Add regression tests for `sortWeeks`

TDD the main behavioural change. These tests must fail against the current `sortWeeks` (which ignores `date`), then pass after Task 2.

**Files:**
- Modify: `lib/__tests__/utils.season.test.ts`

- [ ] **Step 1: Add `sortWeeks` import and describe block at the top of the tests file**

At `lib/__tests__/utils.season.test.ts:1`, change the import from:

```ts
import { deriveSeason, getNextWeekNumber, computeYearStats } from '@/lib/utils'
```

to:

```ts
import { deriveSeason, getNextWeekNumber, computeYearStats, sortWeeks } from '@/lib/utils'
```

Then, immediately after the `makeWeek` helper (after line 15), append this new describe block before the existing `describe('deriveSeason', ...)`:

```ts
describe('sortWeeks', () => {
  it('orders weeks by date descending', () => {
    const weeks = [
      makeWeek({ season: '2026', week: 1, date: '01 Jan 2026' }),
      makeWeek({ season: '2026', week: 3, date: '15 Jan 2026' }),
      makeWeek({ season: '2025', week: 50, date: '05 Dec 2025' }),
    ]
    const sorted = sortWeeks(weeks)
    expect(sorted.map((w) => w.date)).toEqual([
      '15 Jan 2026',
      '01 Jan 2026',
      '05 Dec 2025',
    ])
  })

  it('orders by date even when week numbers are non-chronological within a year', () => {
    // Regression: a retroactive entry with a higher week number but earlier date.
    // Before the fix, sortWeeks used (season DESC, week DESC) so week 6 would
    // appear above week 5 despite being earlier. After the fix, date wins.
    const weeks = [
      makeWeek({ season: '2026', week: 5, date: '10 Mar 2026' }),
      makeWeek({ season: '2026', week: 6, date: '03 Mar 2026' }),
    ]
    const sorted = sortWeeks(weeks)
    expect(sorted.map((w) => w.date)).toEqual(['10 Mar 2026', '03 Mar 2026'])
  })

  it('places a later-dated year above an earlier-dated year regardless of week numbers', () => {
    const weeks = [
      makeWeek({ season: '2026', week: 1, date: '02 Jan 2026' }),
      makeWeek({ season: '2025', week: 99, date: '31 Dec 2025' }),
    ]
    const sorted = sortWeeks(weeks)
    expect(sorted[0].season).toBe('2026')
    expect(sorted[1].season).toBe('2025')
  })

  it('does not mutate its input', () => {
    const weeks = [
      makeWeek({ date: '01 Jan 2026' }),
      makeWeek({ date: '15 Jan 2026' }),
    ]
    const snapshot = weeks.map((w) => w.date)
    sortWeeks(weeks)
    expect(weeks.map((w) => w.date)).toEqual(snapshot)
  })
})
```

- [ ] **Step 2: Run the new tests and verify the regression test fails**

Run:
```
npm test -- --testPathPattern=utils.season
```
Expected: the test `orders by date even when week numbers are non-chronological within a year` FAILS, because the current implementation sorts by `(season DESC, week DESC)` and will return `['03 Mar 2026', '10 Mar 2026']` (week 6 before week 5). The other new tests may happen to pass (they align with `week` ordering).

- [ ] **Step 3: Commit the failing regression tests**

```bash
git add lib/__tests__/utils.season.test.ts
git commit -m "test: add regression tests for sortWeeks date ordering"
```

---

## Task 2: Change `sortWeeks` to sort by parsed date descending

**Files:**
- Modify: `lib/utils.ts:17-22`

- [ ] **Step 1: Replace `sortWeeks` with a date-based comparator**

In `lib/utils.ts`, replace lines 17-22:

```ts
/** Sort weeks descending by season then week number (most recent first). */
export function sortWeeks(weeks: Week[]): Week[] {
  return [...weeks].sort((a, b) =>
    a.season !== b.season ? b.season.localeCompare(a.season) : b.week - a.week
  )
}
```

with:

```ts
/** Sort weeks descending by actual match date (most recent first). */
export function sortWeeks(weeks: Week[]): Week[] {
  return [...weeks].sort(
    (a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime()
  )
}
```

`parseWeekDate` is already defined later in the same file at `lib/utils.ts:304` and handles the `'DD MMM YYYY'` format. JavaScript hoists function declarations, so forward reference is fine.

- [ ] **Step 2: Run the `sortWeeks` tests and verify all four pass**

Run:
```
npm test -- --testPathPattern=utils.season
```
Expected: all `sortWeeks` tests PASS, plus all existing `deriveSeason` / `getNextWeekNumber` / `computeYearStats` tests continue to pass.

- [ ] **Step 3: Run the full test suite to catch anything else that depends on the old ordering**

Run:
```
npm test
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/utils.ts
git commit -m "fix: sort weeks by actual date instead of by renumbered week column"
```

---

## Task 3: Rewrite `deriveSeason` to use `sortWeeks`

The existing `deriveSeason` duplicates the old `(season, week)` comparator inline. Now that `sortWeeks` is the canonical order, `deriveSeason` becomes a one-liner.

**Files:**
- Modify: `lib/utils.ts:414-422`

- [ ] **Step 1: Replace `deriveSeason` with a `sortWeeks`-based implementation**

In `lib/utils.ts`, replace lines 414-422:

```ts
export function deriveSeason(weeks: Week[]): string {
  const played = getPlayedWeeks(weeks)
  if (played.length === 0) return String(new Date().getFullYear())
  const latest = [...played].sort((a, b) => {
    if (a.season !== b.season) return b.season.localeCompare(a.season)
    return b.week - a.week
  })[0]
  return latest.season
}
```

with:

```ts
export function deriveSeason(weeks: Week[]): string {
  const played = getPlayedWeeks(weeks)
  if (played.length === 0) return String(new Date().getFullYear())
  return sortWeeks(played)[0].season
}
```

- [ ] **Step 2: Run the `deriveSeason` tests**

Run:
```
npm test -- --testPathPattern=utils.season
```
Expected: both existing `deriveSeason` tests PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/utils.ts
git commit -m "refactor: derive season via sortWeeks"
```

---

## Task 4: Sort `computeYearStats` recent form by date

Within a year, `computeYearStats` currently picks the last 5 games by `b.week - a.week`. If week numbers within a year are non-chronological (the scenario this project is fixing), recent form is wrong. Switch to date.

**Files:**
- Modify: `lib/utils.ts:401-402`
- Test: `lib/__tests__/utils.season.test.ts`

- [ ] **Step 1: Add a regression test that exercises non-chronological week numbers**

In `lib/__tests__/utils.season.test.ts`, inside the existing `describe('computeYearStats', ...)` block, append this test after the existing tests (just before the closing `})` at line 111):

```ts
it('builds recentForm by date even when week numbers are non-chronological', () => {
  // Regression: week 6 is dated earlier than week 5. Recent form must follow date order, not week number.
  const weeksOutOfOrder: Week[] = [
    makeWeek({ season: '2026', week: 1, date: '01 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 2, date: '08 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
    makeWeek({ season: '2026', week: 3, date: '15 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
    makeWeek({ season: '2026', week: 4, date: '22 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ season: '2026', week: 6, date: '03 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
    makeWeek({ season: '2026', week: 5, date: '10 Mar 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
  ]
  const stats = computeYearStats('Alice', weeksOutOfOrder, '2026')
  // Newest-first by date: 10 Mar (W), 03 Mar (L), 22 Jan (W), 15 Jan (D), 08 Jan (L)
  expect(stats.recentForm).toBe('WLWDL')
})
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:
```
npm test -- --testPathPattern=utils.season
```
Expected: the new test FAILS — current implementation sorts by `b.week - a.week`, so week 6 (03 Mar, L) is placed before week 5 (10 Mar, W), giving `'LWWDL'` or similar instead of the correct `'WLWDL'`.

- [ ] **Step 3: Replace the comparator inside `computeYearStats`**

In `lib/utils.ts`, replace line 402:

```ts
    .sort((a, b) => b.week - a.week)
```

with:

```ts
    .sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime())
```

- [ ] **Step 4: Run the tests and verify all pass**

Run:
```
npm test -- --testPathPattern=utils.season
```
Expected: all `computeYearStats` tests PASS including the new regression test.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.season.test.ts
git commit -m "fix: sort computeYearStats recent form by date"
```

---

## Task 5: Replace `mostRecent` finder in `WeekList`

**Files:**
- Modify: `components/WeekList.tsx:36-41`

- [ ] **Step 1: Replace the reduce-based `mostRecent` with `sortWeeks(...)[0]`**

In `components/WeekList.tsx`, update the imports at line 7. Current:

```ts
import { getPlayedWeeks, getMonthKey, formatMonthYear } from '@/lib/utils'
```

Change to:

```ts
import { getPlayedWeeks, getMonthKey, formatMonthYear, sortWeeks } from '@/lib/utils'
```

Then replace lines 36-41:

```ts
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = playedWeeks.length > 0
    ? playedWeeks.reduce((a, b) =>
        a.season > b.season || (a.season === b.season && a.week > b.week) ? a : b
      )
    : null
```

with:

```ts
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = sortWeeks(playedWeeks)[0] ?? null
```

- [ ] **Step 2: Type-check and lint**

Run:
```
npx tsc --noEmit
npm run lint
```
Expected: no new errors.

- [ ] **Step 3: Run full test suite to catch any snapshot/component test breakage**

Run:
```
npm test
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/WeekList.tsx
git commit -m "refactor: find most-recent week via sortWeeks in WeekList"
```

---

## Task 6: Replace `mostRecent` finder in `PublicMatchList`

**Files:**
- Modify: `components/PublicMatchList.tsx:14-20`

- [ ] **Step 1: Replace the reduce-based `mostRecent` with `sortWeeks(...)[0]`**

In `components/PublicMatchList.tsx`, update the imports at line 7. Current:

```ts
import { getMonthKey, formatMonthYear, getPlayedWeeks } from '@/lib/utils'
```

Change to:

```ts
import { getMonthKey, formatMonthYear, getPlayedWeeks, sortWeeks } from '@/lib/utils'
```

Then replace lines 15-20:

```ts
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = playedWeeks.length > 0
    ? playedWeeks.reduce((a, b) =>
        a.season > b.season || (a.season === b.season && a.week > b.week) ? a : b
      )
    : null
```

with:

```ts
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = sortWeeks(playedWeeks)[0] ?? null
```

- [ ] **Step 2: Type-check and lint**

Run:
```
npx tsc --noEmit
npm run lint
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/PublicMatchList.tsx
git commit -m "refactor: find most-recent week via sortWeeks in PublicMatchList"
```

---

## Task 7: Fix default `openWeek` in `ResultsSection`

**Files:**
- Modify: `components/ResultsSection.tsx:39-43`

- [ ] **Step 1: Add `sortWeeks` to the existing `@/lib/utils` import**

In `components/ResultsSection.tsx`, replace line 5:

```ts
import { getPlayedWeeks } from '@/lib/utils'
```

with:

```ts
import { getPlayedWeeks, sortWeeks } from '@/lib/utils'
```

- [ ] **Step 2: Replace the `reduce` inside the `useState` initializer**

In `components/ResultsSection.tsx`, replace lines 39-43:

```ts
  const [openWeek, setOpenWeek] = useState<number | null>(() => {
    const played = getPlayedWeeks(weeks)
    if (played.length === 0) return null
    return played.reduce((a, b) => (a.week > b.week ? a : b)).week
  })
```

with:

```ts
  const [openWeek, setOpenWeek] = useState<number | null>(() => {
    const played = getPlayedWeeks(weeks)
    if (played.length === 0) return null
    return sortWeeks(played)[0].week
  })
```

- [ ] **Step 3: Type-check and lint**

Run:
```
npx tsc --noEmit
npm run lint
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add components/ResultsSection.tsx
git commit -m "fix: pick default open week by date in ResultsSection"
```

---

## Task 8: Sort `deriveLastPlayedDates` by date in `NextMatchCard`

**Files:**
- Modify: `components/NextMatchCard.tsx:54-57`

- [ ] **Step 1: Confirm `parseWeekDate` is importable or already imported**

Run:
```
grep -n "parseWeekDate\|from '@/lib/utils'" components/NextMatchCard.tsx
```

- [ ] **Step 2: Ensure `parseWeekDate` is imported from `@/lib/utils`**

If `parseWeekDate` is not already imported, add it to the existing `@/lib/utils` import statement. Example:

```ts
import { parseWeekDate, /* other existing imports */ } from '@/lib/utils'
```

- [ ] **Step 3: Replace the sort comparator in `deriveLastPlayedDates`**

In `components/NextMatchCard.tsx`, replace lines 54-57:

```ts
function deriveLastPlayedDates(players: Player[], weeks: Week[]): Map<string, string | undefined> {
  const playedWeeks = weeks
    .filter((w) => w.status === 'played')
    .sort((a, b) => b.week - a.week) // most recent first
```

with:

```ts
function deriveLastPlayedDates(players: Player[], weeks: Week[]): Map<string, string | undefined> {
  const playedWeeks = weeks
    .filter((w) => w.status === 'played')
    .sort((a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime()) // most recent first
```

- [ ] **Step 4: Type-check and lint**

Run:
```
npx tsc --noEmit
npm run lint
```
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "fix: sort last-played lookup by date in NextMatchCard"
```

---

## Task 9: Sort `computeTeamAB` streak walk by date

**Files:**
- Modify: `lib/sidebar-stats.ts:356`

- [ ] **Step 1: Confirm `parseWeekDate` is already imported in `lib/sidebar-stats.ts`**

Run:
```
grep -n "parseWeekDate" lib/sidebar-stats.ts
```
Expected: at least one match (it's already used at `lib/sidebar-stats.ts:39` and `:141`).

- [ ] **Step 2: Replace the streak-walk sort comparator**

In `lib/sidebar-stats.ts`, replace line 356:

```ts
  const sorted = [...played].sort((a, b) => b.week - a.week)
```

with:

```ts
  const sorted = [...played].sort(
    (a, b) => parseWeekDate(b.date).getTime() - parseWeekDate(a.date).getTime()
  )
```

- [ ] **Step 3: Type-check and run tests**

Run:
```
npx tsc --noEmit
npm test
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/sidebar-stats.ts
git commit -m "fix: sort computeTeamAB streak by date"
```

---

## Task 10: Sort scheduled weeks by date in results page

`app/[slug]/results/page.tsx:127` currently picks the scheduled week with the lowest `week` number. Scheduled weeks were also renumbered by the backfill, so for consistency with the rest of this spec, switch to date-ascending.

**Files:**
- Modify: `app/[slug]/results/page.tsx:125-127`

- [ ] **Step 1: Add `parseWeekDate` to the `@/lib/utils` import**

In `app/[slug]/results/page.tsx`, locate line 8 — the existing `@/lib/utils` import. Current:

```ts
import { sortWeeks, dayNameToIndex, isPastDeadline, getMostRecentExpectedGameDate, getNextWeekNumber, deriveSeason } from '@/lib/utils'
```

Change to:

```ts
import { sortWeeks, dayNameToIndex, isPastDeadline, getMostRecentExpectedGameDate, getNextWeekNumber, deriveSeason, parseWeekDate } from '@/lib/utils'
```

- [ ] **Step 2: Replace the scheduled-week sort**

In `app/[slug]/results/page.tsx`, replace lines 125-127:

```ts
    const first = weeks
      .filter((w) => w.status === 'scheduled')
      .sort((a, b) => a.week - b.week)[0]
```

with:

```ts
    const first = weeks
      .filter((w) => w.status === 'scheduled')
      .sort((a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime())[0]
```

Note: the existing variable is called `first` — keep the name. Ascending date order (earliest date first) matches the previous intent (lowest week first).

- [ ] **Step 3: Type-check and lint**

Run:
```
npx tsc --noEmit
npm run lint
```
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/[slug]/results/page.tsx
git commit -m "fix: pick next scheduled week by date"
```

---

## Task 11: Full verification

Before opening the PR, run the full test + build pipeline and click through the results tab in the browser.

- [ ] **Step 1: Run the full test suite**

Run:
```
npm test
```
Expected: all tests pass.

- [ ] **Step 2: Run a production build**

Run:
```
npm run build
```
Expected: build succeeds with no type errors.

- [ ] **Step 3: Manual check**

Start the dev server and navigate to a league's results tab:

```
npm run dev
```

Open `http://localhost:3000/<league-slug>` (replace with an actual slug). Confirm:

1. The most recent played week is at the top of the list.
2. Within each year, cards are ordered by date (most recent first).
3. The `YearDivider` appears between the last 2026 card and the first 2025 card.
4. The `MonthDivider` appears between months within a year.
5. The card that opens by default is the most recent played week.

If any of these fail, stop and report — do not declare the task complete.

- [ ] **Step 4: Open the PR**

The workspace branch is already `awmloveland/fix-results-order`. Push and open a PR:

```bash
git push -u origin awmloveland/fix-results-order
gh pr create --title "fix: sort results by date to handle per-year week resets" --body "$(cat <<'BODY'
## Summary
- Results list now sorts by actual match date instead of by the renumbered `week` column introduced in #98, so cards display in true chronological order even when week numbers within a year are non-chronological.
- Four duplicated "most-recent" finders collapse to `sortWeeks(...)[0]`.
- Three secondary per-year sorts (`computeYearStats` recent form, `deriveLastPlayedDates`, `computeTeamAB` streak) switch to date-based comparators.
- No schema changes; `season` and `week` columns stay as the migration set them.

See `docs/superpowers/specs/2026-04-19-results-date-sort-design.md` for the full design.

## Test plan
- [ ] `npm test` — all tests pass, including new `sortWeeks` regression tests
- [ ] `npm run build` — production build succeeds
- [ ] Visit `/[league-slug]` results tab — matches in strict chronological order, dividers render correctly, default-open card is the most recent played week

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Notes for the implementer

- **Do not change the migration files** — the fix is entirely application-side.
- **Do not remove `season` or `week` from `Week` or `WeekRow` types** — both are still used as labels (YearDivider, card title), just not as sort keys.
- **`openWeek === week.week` comparisons stay** in `WeekList`, `PublicMatchList`, and `ResultsSection`. Per-year `week` is still unique within a given render's year grouping.
- **`parseWeekDate` is cheap** but gets called a lot in a sort. If Jest flags performance, it's fine to cache the parsed timestamp inside `sortWeeks` via a `map(w => [parseWeekDate(w.date).getTime(), w])` pattern — not needed for correctness, only if profiling shows it.
