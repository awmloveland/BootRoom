# Closest Lineup Splits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always surface the 5 closest-to-50/50 splits in `autoPick`, replacing the current "random-sample from tolerance pool" behaviour that can hide demonstrably better splits.

**Architecture:** Replace the pool-and-sample block in `lib/autoPick.ts` with a deterministic "sort scored splits by diff ascending, walk with team-swap dedup, take top 5" selection. Remove the now-unused tolerance-band helper (`diffForBand`), constants (`TOLERANCE_WIN_PROB_BAND`, `POOL_EPSILON`), and the vestigial `poolSize` field on `AutoPickResult`.

**Tech Stack:** TypeScript, Jest (existing tests). No new dependencies.

**Spec:** [`docs/superpowers/specs/2026-04-21-closest-lineup-splits-design.md`](../specs/2026-04-21-closest-lineup-splits-design.md)

---

## Task 1: Add failing tests for "returns top N closest splits after dedup"

**Files:**
- Modify: `lib/__tests__/autoPick.test.ts` (append new describe block near end of file, before closing of file at line 475)

**Rationale:** Two tests cover the new behaviour:
1. With 10 varied-rated players (70 raw splits → 35 unique after team-swap dedup), `suggestions.length === 5`, is sorted ascending by diff, and no other unique split has a strictly smaller diff than `suggestions[4].diff` (proves "top 5" is correct).
2. With a 4-player squad (3 unique splits after dedup), `suggestions.length === 3` (or fewer) and the call doesn't throw.

Under the current implementation, test 1 fails because `SUGGESTION_COUNT === 3` → `suggestions.length === 3`, not 5. Test 2 may pass already; it guards against future regressions.

- [ ] **Step 1: Add `ewptScore` to the existing imports in `lib/__tests__/autoPick.test.ts`**

In `lib/__tests__/autoPick.test.ts`, line 2:

Replace:

```ts
import type { Player } from '@/lib/types'
```

With:

```ts
import type { Player } from '@/lib/types'
import { ewptScore } from '@/lib/utils'
```

- [ ] **Step 2: Add the new describe block to `lib/__tests__/autoPick.test.ts`**

Insert immediately before the `describe('diffForBand — inverse logistic helper', …)` block at line 457 (that block will be removed in Task 3):

```ts
// ─── Closest-N selection ─────────────────────────────────────────────────────

describe('autoPick — returns closest-N splits', () => {
  it('returns 5 suggestions sorted ascending by diff, and they are the 5 smallest-diff unique splits', () => {
    // 10 players with varied ratings to guarantee >5 unique diffs.
    // No goalkeepers → no GK pinning, so the search is over all 10 players.
    const players = Array.from({ length: 10 }, (_, i) =>
      makePlayer(`P${i + 1}`, { rating: 1 + (i % 3), played: 10, recentForm: 'WLDWL' })
    )

    const result = autoPick(players, undefined, undefined, seededRng(1))

    // 1. Exactly 5 suggestions.
    expect(result.suggestions.length).toBe(5)

    // 2. Sorted ascending by diff.
    for (let i = 1; i < result.suggestions.length; i++) {
      expect(result.suggestions[i].diff).toBeGreaterThanOrEqual(
        result.suggestions[i - 1].diff,
      )
    }

    // 3. `suggestions[4].diff` is no worse than any OTHER unique split's diff.
    //    Independently enumerate every possible 5-vs-5 split, collapse
    //    team-swaps, and assert no unseen split beats the 5th.
    const teamSwapKey = (a: Player[], b: Player[]) =>
      [a.map((p) => p.playerId).sort().join(','), b.map((p) => p.playerId).sort().join(',')]
        .sort()
        .join('|')

    const combinations = <T,>(arr: T[], k: number): T[][] => {
      if (k === 0) return [[]]
      if (k === arr.length) return [[...arr]]
      if (k > arr.length) return []
      const [first, ...rest] = arr
      return [
        ...combinations(rest, k - 1).map((c) => [first, ...c]),
        ...combinations(rest, k),
      ]
    }

    const suggestionKeys = new Set(
      result.suggestions.map((s) => teamSwapKey(s.teamA, s.teamB)),
    )
    const worstSuggestedDiff = result.suggestions[4].diff

    const seen = new Set<string>()
    for (const teamA of combinations(players, 5)) {
      const inA = new Set(teamA.map((p) => p.playerId))
      const teamB = players.filter((p) => !inA.has(p.playerId))
      const key = teamSwapKey(teamA, teamB)
      if (seen.has(key)) continue
      seen.add(key)
      if (suggestionKeys.has(key)) continue
      const diff = Math.abs(ewptScore(teamA) - ewptScore(teamB))
      // Any split NOT in suggestions must have diff >= suggestions[4].diff.
      expect(diff).toBeGreaterThanOrEqual(worstSuggestedDiff)
    }
  })

  it('returns fewer than 5 suggestions when fewer unique splits exist', () => {
    // 4 players → sizeA=2 → C(4,2)=6 raw splits → 3 unique after team-swap dedup.
    const players = [
      makePlayer('A', { rating: 3 }),
      makePlayer('B', { rating: 2 }),
      makePlayer('C', { rating: 1 }),
      makePlayer('D', { rating: 2 }),
    ]
    const result = autoPick(players, undefined, undefined, seededRng(1))

    expect(result.suggestions.length).toBeLessThanOrEqual(5)
    expect(result.suggestions.length).toBeGreaterThan(0)
    // No duplicates among suggestions (team-swap dedup invariant).
    const keys = new Set<string>()
    for (const s of result.suggestions) {
      const key = [
        s.teamA.map((p) => p.playerId).sort().join(','),
        s.teamB.map((p) => p.playerId).sort().join(','),
      ].sort().join('|')
      expect(keys.has(key)).toBe(false)
      keys.add(key)
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify the first fails and the second passes or fails for the expected reason**

Run: `npx jest lib/__tests__/autoPick.test.ts -t "returns closest-N splits" --verbose`

Expected:
- `returns 5 suggestions sorted ascending by diff, and they are the 5 smallest-diff unique splits` → **FAIL**, received `suggestions.length === 3` (current implementation returns 3 random from the pool).
- `returns fewer than 5 suggestions when fewer unique splits exist` → **PASS** (4-player squad already produces ≤3 unique suggestions; just confirms the behaviour survives the refactor).

Do not commit yet — the failing test will be made green in Task 2.

---

## Task 2: Implement closest-N sort-and-dedup selection (TDD green)

**Files:**
- Modify: `lib/autoPick.ts:21` — bump `SUGGESTION_COUNT`
- Modify: `lib/autoPick.ts:220-245` — replace pool/sample block

- [ ] **Step 1: Change `SUGGESTION_COUNT` from 3 to 5**

In `lib/autoPick.ts`, line 21:

```ts
const SUGGESTION_COUNT = 5             // distinct splits surfaced in the UI
```

- [ ] **Step 2: Replace the pool/sample block with a sort-and-take-top-N walk**

In `lib/autoPick.ts`, replace lines 220–245 (from `// Find best (minimum) diff` through the sort call) with the block below. The final `return` on line 247 stays but drops `poolSize` — we'll remove that field in Task 3, for now pass `poolSize: 0` to keep the type valid.

Replace:

```ts
  // Find best (minimum) diff
  const bestDiff = filteredScored.reduce((min, s) => (s.diff < min ? s.diff : min), Infinity)

  // Collect pool: all splits whose score-diff falls within the configured
  // win-probability band (default ±9.5% of 50/50 ≈ 3.08 score points above bestDiff).
  // The band replaces the legacy "5% of bestDiff or +3 absolute" heuristic with a
  // single, semantically-meaningful threshold.
  const tolerance = bestDiff + diffForBand(TOLERANCE_WIN_PROB_BAND)
  const pool = filteredScored.filter((s) => s.diff <= tolerance + POOL_EPSILON)

  // Randomly sample up to 3 from the pool, deduplicating team-swaps, then sort by diff ascending
  const shuffledPool = [...pool].sort(() => rng() - 0.5)
  const seen = new Set<string>()
  const suggestions: typeof shuffledPool = []
  for (const candidate of shuffledPool) {
    const key = [
      [...candidate.teamA].map((p) => p.playerId).sort().join(','),
      [...candidate.teamB].map((p) => p.playerId).sort().join(','),
    ].sort().join('|')
    if (!seen.has(key)) {
      seen.add(key)
      suggestions.push(candidate)
    }
    if (suggestions.length === SUGGESTION_COUNT) break
  }
  suggestions.sort((a, b) => a.diff - b.diff)

  return { suggestions, bestDiff, poolSize: pool.length }
```

With:

```ts
  // Sort all scored splits by diff ascending, then walk with team-swap dedup
  // to collect the top SUGGESTION_COUNT unique splits. This always surfaces
  // the closest-to-50/50 splits the algorithm can find — variety is no longer
  // traded off against tightness.
  const sortedByDiff = [...filteredScored].sort((a, b) => a.diff - b.diff)
  const seen = new Set<string>()
  const suggestions: typeof sortedByDiff = []
  for (const candidate of sortedByDiff) {
    const key = [
      [...candidate.teamA].map((p) => p.playerId).sort().join(','),
      [...candidate.teamB].map((p) => p.playerId).sort().join(','),
    ].sort().join('|')
    if (!seen.has(key)) {
      seen.add(key)
      suggestions.push(candidate)
    }
    if (suggestions.length === SUGGESTION_COUNT) break
  }

  const bestDiff = suggestions.length > 0 ? suggestions[0].diff : 0

  return { suggestions, bestDiff, poolSize: 0 }
```

Note: `poolSize: 0` is a temporary placeholder — Task 3 removes the field entirely.

- [ ] **Step 3: Run the new tests and verify both pass**

Run: `npx jest lib/__tests__/autoPick.test.ts -t "returns closest-N splits" --verbose`

Expected: **both tests PASS**.

- [ ] **Step 4: Run the full autoPick test suite and verify no regressions**

Run: `npx jest lib/__tests__/autoPick.test.ts --verbose`

Expected: all existing tests still pass (pair-pinning, GK, count-balance, swap-dedup, odd-player allocation, synthetic ID). The `diffForBand` describe block still passes — its tests check the helper, which is still exported.

- [ ] **Step 5: Commit**

```bash
git add lib/autoPick.ts lib/__tests__/autoPick.test.ts
git commit -m "$(cat <<'EOF'
feat: autoPick always returns the 5 closest splits (was random 3 from pool)

autoPick previously randomly sampled 3 splits from a tolerance pool of
"near-best" options, so a visibly better split could be hidden behind a
worse one. Now it sorts all scored splits by diff ascending and returns
the top 5 unique splits (team-swap dedup preserved). SUGGESTION_COUNT
bumped from 3 to 5; the Shuffle-teams UI reads this count dynamically.
EOF
)"
```

---

## Task 3: Remove now-unused tolerance-pool code and the `poolSize` field

**Files:**
- Modify: `lib/autoPick.ts` — remove `TOLERANCE_WIN_PROB_BAND`, `POOL_EPSILON`, `diffForBand`, and the `poolSize` field
- Modify: `lib/__tests__/autoPick.test.ts` — remove `diffForBand` import and its describe block

- [ ] **Step 1: Remove `poolSize` from the `AutoPickResult` interface**

In `lib/autoPick.ts`, line 12–16:

Replace:

```ts
export interface AutoPickResult {
  suggestions: AutoPickSuggestion[]  // up to 3, sorted by diff ascending
  bestDiff: number
  poolSize: number
}
```

With:

```ts
export interface AutoPickResult {
  suggestions: AutoPickSuggestion[]  // up to SUGGESTION_COUNT, sorted by diff ascending
  bestDiff: number
}
```

- [ ] **Step 2: Remove `poolSize` from the early-return and final-return**

In `lib/autoPick.ts`:

- Line 86: change `return { suggestions: [], bestDiff: 0, poolSize: 0 }` to `return { suggestions: [], bestDiff: 0 }`.
- The final return (added in Task 2): change `return { suggestions, bestDiff, poolSize: 0 }` to `return { suggestions, bestDiff }`.

- [ ] **Step 3: Remove the `diffForBand` helper and tolerance-pool constants**

In `lib/autoPick.ts`, remove these lines (from the top of the file near lines 26–40):

```ts
// --- Tolerance pool ---
// Accept splits within ±TOLERANCE_WIN_PROB_BAND of a 50/50 match. 0.095 ≈ 3.08
// score points above bestDiff, matching the legacy "+3 absolute" floor for
// typical 5-a-side best diffs.
const TOLERANCE_WIN_PROB_BAND = 0.095
const POOL_EPSILON = 0.001             // float-safety nudge on pool boundary

/**
 * Inverse of `winProbability`'s logistic curve: given a win-probability band
 * (distance from 0.5), return the corresponding score-difference threshold.
 * 1 / (1 + exp(-diff/8)) = 0.5 + band  →  diff = -8 × ln(1/(0.5+band) - 1).
 */
export function diffForBand(band: number): number {
  return -8 * Math.log(1 / (0.5 + band) - 1)
}
```

- [ ] **Step 4: Remove the `diffForBand` describe block from the test file**

In `lib/__tests__/autoPick.test.ts`, remove the entire block at lines 457–474:

```ts
describe('diffForBand — inverse logistic helper', () => {
  it('band = 0.095 yields a diff threshold of ~3.08 (matches legacy +3 absolute floor)', () => {
    expect(diffForBand(0.095)).toBeCloseTo(3.08, 2)
  })

  it('band = 0.05 yields ~1.61', () => {
    expect(diffForBand(0.05)).toBeCloseTo(1.61, 2)
  })

  it('band = 0.2 yields ~6.78', () => {
    expect(diffForBand(0.2)).toBeCloseTo(6.78, 2)
  })

  it('is monotonically increasing in the band', () => {
    expect(diffForBand(0.05)).toBeLessThan(diffForBand(0.1))
    expect(diffForBand(0.1)).toBeLessThan(diffForBand(0.2))
  })
})
```

- [ ] **Step 5: Remove the `diffForBand` import from the test file**

In `lib/__tests__/autoPick.test.ts`, line 1:

Replace:

```ts
import { autoPick, diffForBand, findAssocTeam } from '@/lib/autoPick'
```

With:

```ts
import { autoPick, findAssocTeam } from '@/lib/autoPick'
```

- [ ] **Step 6: Update the `autoPick` header JSDoc comment to reflect the new behaviour**

In `lib/autoPick.ts`, replace the header comment above `export function autoPick` (around lines 63–77) with:

```ts
/**
 * Given a list of players attending the game, return up to SUGGESTION_COUNT
 * (5) balanced team splits — always the closest-to-50/50 splits the algorithm
 * can find, sorted by score diff ascending, with team-swap duplicates collapsed.
 *
 * Uses exhaustive search for n ≤ 20; random sampling for n > 20. Guest players
 * (not in DB) should be passed with a wprOverride set to the appropriate
 * league percentile and all stats at zero.
 *
 * @param pairs - Optional array of [guestName, associatedPlayerName] pairs.
 *   Each guest will be pinned to the same team as their associated player.
 * @param unknownIds - Optional set of `playerId`s that are unknown — guests or
 *   new players. Used as a post-generation count-balance filter: splits where the
 *   unknown-player count differs by more than 1 between teams are discarded. If no
 *   split passes, falls back to the full set.
 * @param random - Optional RNG function returning `[0, 1)`. Defaults to
 *   `Math.random`. Tests pass a seeded generator for deterministic behaviour.
 */
```

- [ ] **Step 7: Run the full test suite and type-check**

Run: `npx jest lib/__tests__/autoPick.test.ts --verbose`

Expected: all tests pass; the `diffForBand` describe block is no longer present.

Run: `npx tsc --noEmit`

Expected: no type errors. Any external consumer of `AutoPickResult.poolSize` would be caught here — the earlier grep confirmed none exist.

- [ ] **Step 8: Run the full project test suite**

Run: `npm test`

Expected: all tests pass across the project.

- [ ] **Step 9: Commit**

```bash
git add lib/autoPick.ts lib/__tests__/autoPick.test.ts
git commit -m "$(cat <<'EOF'
refactor: remove unused tolerance-pool code from autoPick

TOLERANCE_WIN_PROB_BAND, POOL_EPSILON, diffForBand, and AutoPickResult
.poolSize were all in service of the random-sampling selection replaced
in the previous commit. poolSize has no consumers in the codebase.
EOF
)"
```

---

## Task 4: Manual verification

**Files:** none — smoke test in the browser.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

Expected: server starts at `http://localhost:3000` (or configured port).

- [ ] **Step 2: Load the Week 17 dummy lineup**

Navigate to the league's upcoming match page, open the auto-pick lineup for the Week 17 dummy.

Expected:
- Top suggestion is the 51/49 Will↔Tim split (or a split with diff ≤ 0.304).
- "Shuffle teams" button reads **(1/5)** instead of (1/3).
- Cycling through all 5 options produces 5 distinct splits, sorted ascending by diff (each subsequent shuffle shows a progressively wider split).

- [ ] **Step 3: Sanity-check a second league**

Open auto-pick for any other league with a scheduled lineup. Confirm:
- 5 distinct splits are produced.
- No split appears twice as a team-swap of another.
- The first-shown split visibly has the tightest score gap of the five.

- [ ] **Step 4: If anything looks wrong, report back with a screenshot**

If the splits don't sort ascending or a team-swap duplicate appears, the dedup key or sort is broken — stop and report before pushing.

---

## Self-review notes

- **Spec coverage:** every bullet in the design spec maps to a task — behaviour change (Task 2), `SUGGESTION_COUNT` bump (Task 2), removal of `TOLERANCE_WIN_PROB_BAND` / `POOL_EPSILON` / `diffForBand` / `poolSize` (Task 3), header comment update (Task 3, Step 6), new tests (Task 1), manual verification (Task 4).
- **No placeholders:** all code blocks are complete; no "TBD" or "similar to Task N."
- **Type consistency:** `SUGGESTION_COUNT`, `AutoPickResult`, `bestDiff`, and the dedup key structure are referenced identically across tasks.
- **Ordering:** Task 2's `return { ..., poolSize: 0 }` is a deliberate temporary — Task 3 Step 2 removes it immediately. Types never break between commits (each commit leaves the build green).
