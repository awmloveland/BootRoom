# Closest lineup splits — design

## Problem

`autoPick` in `lib/autoPick.ts` does not consistently surface the closest-balanced team splits it can find.

Concrete example (Week 17 dummy lineup, 14 players, 7-a-side):

- Suggested split: Team A 43.238 vs Team B 41.738 → **diff 1.500, 55%/45% win probability.**
- Swapping Will and Tim: Team A 42.561 vs Team B 42.257 → **diff 0.304, 51%/49%.**

The 0.304 split is a strictly better balance and is inside the algorithm's candidate set, but is not presented to the user.

### Why

`autoPick` scores every possible split, builds a **tolerance pool** of "near-best" splits (all splits within ±9.5% of a 50/50 win probability — roughly `bestDiff + 3.08` score points), then **randomly samples three** from that pool and sorts those three by diff (`lib/autoPick.ts:220-245`). The random draw often misses the actual best splits, so users can be shown an inferior option while a visibly closer one exists in the pool.

### Why this matters

The league's design goal is to keep games as close as possible for as long as possible — blowouts are only fun for one side. The team-builder should therefore always surface the tightest splits, not trade tightness for variety.

## Goal

Always show the closest-to-50/50 splits the algorithm can find, up to five suggestions, with team-swap duplicates collapsed.

## Approach

Replace the "tolerance pool + random sample" block in `autoPick` with a "sort ascending by diff + dedup + take top N" block. Bump the suggestion count from 3 to 5. Remove code that only served the old random-sampling approach.

### Behaviour change

| Aspect | Before | After |
|---|---|---|
| Suggestion count | 3 | 5 |
| Selection from scored splits | Random sample from a tolerance pool of "near-best" splits | Sort ascending by diff; take top 5 after team-swap dedup |
| Determinism for a given input | No (random draw within pool) | Yes (ties resolved by natural sort stability; pre-pick randomness unchanged — see below) |
| Behaviour when fewer than 5 unique splits exist | Returns however many were drawn | Returns however many unique splits exist (≤5) |

### What is explicitly preserved

None of these change — they pick among equivalently-good configurations, not between more- and less-balanced ones:

- GK shuffle when 3+ keepers are present (which two get pinned to A and B).
- Odd-player extra-slot coin flip (`extraSlotToA`).
- Random-sample fallback when `n > EXHAUSTIVE_THRESHOLD` (20).
- Pair-pinning alternation, guest placement, count-balance filter for unknowns.
- Team-swap dedup key logic at `lib/autoPick.ts:235-238`.

### Team-swap dedup — correctness

The existing dedup key sorts the two team-member strings alphabetically before joining, so `{A: [1,2,3], B: [4,5,6]}` and `{A: [4,5,6], B: [1,2,3]}` collapse to the same key. With pinned GKs on fixed teams, pure A↔B flips are rarely generated; the dedup remains load-bearing for the equal-size, non-GK case where `combinations(searchPool, sizeA)` enumerates both a subset and its complement.

## Files touched

### `lib/autoPick.ts`

- Change `SUGGESTION_COUNT` from `3` to `5` (line 21).
- Remove `TOLERANCE_WIN_PROB_BAND`, `POOL_EPSILON`, and the `diffForBand` export (all become unused).
- Remove `poolSize` from `AutoPickResult` (not consumed anywhere in the codebase — confirmed via grep for `.poolSize`).
- Replace the `bestDiff` / `pool` / `shuffledPool` / sample-loop block (~lines 220-245) with:
  1. `scored.sort((a, b) => a.diff - b.diff)` (after count-balance filter is applied).
  2. Walk the sorted array, adding to `suggestions` only when the team-swap key is new, until `suggestions.length === SUGGESTION_COUNT` or the array is exhausted.
- Update the header comment on `autoPick` to describe "top N closest after dedup" instead of "random sample from tolerance pool."

### `lib/__tests__/autoPick.test.ts`

- Remove the `diffForBand — inverse logistic helper` describe block (lines ~457-473).
- Remove `diffForBand` from the top-level import.
- Add a new test: **"returns the N smallest-diff splits after dedup"** — given a moderate squad (e.g., 10 players), assert `suggestions[0].diff ≤ suggestions[1].diff ≤ … ≤ suggestions[4].diff` and that no unique split outside `suggestions` has a diff strictly less than `suggestions[SUGGESTION_COUNT - 1].diff`.
- Add a new test: **"returns fewer than N when fewer unique splits exist"** — a squad so small that fewer than 5 unique splits exist after dedup; assert `suggestions.length` equals the count of unique splits and is < 5, and the function does not throw.
- The existing `swap deduplication` test (line 139) continues to pass unchanged.
- The `unknownNames count-balance filter` tests continue to pass — the filter applies before the sort.

## Non-goals

- No UI changes. `components/NextMatchCard.tsx:896` reads `autoPickResult.suggestions.length` dynamically, so "Shuffle teams (1/5)" renders automatically.
- No change to scoring (`ewptScore`, `wprScore`), to pair-pinning, to GK handling, or to the count-balance filter.
- No rename of `bestDiff` (the field stays on `AutoPickResult` as a convenience — it now equals `suggestions[0].diff` when suggestions exist).

## Rollback / relation to prior work

Phase 1 item 1.6 (team-building review, shipped 2026-04-21) introduced `TOLERANCE_WIN_PROB_BAND` and `diffForBand` specifically to formalise the "pool for random sampling" behaviour. This change removes both because the product goal has shifted from "provide variety within a good-enough band" to "always surface the closest splits." The removal is intentional; the constants and helper become dead code.

If we later want variety back, the tolerance-pool code can be recovered from git history — but it should be reintroduced deliberately rather than left in place unused.

## Testing

- New unit tests as above.
- Full `npm test` suite must pass.
- Manual verification: load the Week 17 dummy lineup; confirm the suggested split matches the 51/49 Will↔Tim configuration (or a split with an equal or smaller diff).
- Shuffle-teams button should now cycle through 5 options instead of 3.
