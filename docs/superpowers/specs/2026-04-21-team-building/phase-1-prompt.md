# Phase 1 Prompt — Fairness & Foundations

Paste this entire prompt as the opening message in a fresh Claude Code session.

---

You are implementing Phase 1 of the BootRoom team-building review: one foundation refactor plus six behavioural fixes, bundled into a single coherent PR.

**Working directory:** `/Users/willloveland/conductor/workspaces/bootroom/almaty`
**Branch:** Create a new branch off `awmloveland/team-ratings-exploration` (e.g. `awmloveland/team-building-phase-1`).

## Scope — seven items, in this order

| Step | Item | Spec |
|---|---|---|
| 1 | **2.1** Collapse dual goalkeeper representation | `docs/superpowers/specs/2026-04-21-team-building/2.1-goalkeeper-representation-spec.md` |
| 2 | **1.3** Exclude GK mentality from variety bonus | `docs/superpowers/specs/2026-04-21-team-building/1.3-variety-bonus-gk-exclusion-spec.md` |
| 3 | **1.1** Fix form denominator for short-history players | `docs/superpowers/specs/2026-04-21-team-building/1.1-form-denominator-spec.md` |
| 4 | **1.2** Drop `ewptScore`'s form component; redistribute to `avgWpr` | `docs/superpowers/specs/2026-04-21-team-building/1.2-ewpt-form-component-spec.md` |
| 5 | **1.4** Randomise odd-player allocation | `docs/superpowers/specs/2026-04-21-team-building/1.4-odd-player-allocation-spec.md` |
| 6 | **1.5** Extend count-balance filter to guests (`unknownNames`) | `docs/superpowers/specs/2026-04-21-team-building/1.5-unknown-count-balance-spec.md` |
| 7 | **1.6** Reframe tolerance pool in win-probability terms | `docs/superpowers/specs/2026-04-21-team-building/1.6-win-prob-tolerance-spec.md` |

## Read first

1. **`CLAUDE.md`** — project conventions. Follow them.
2. **`docs/superpowers/specs/2026-04-21-team-building-review-design.md`** — umbrella spec for context.
3. The **per-item spec for each step** — source of truth for that individual change.

If a per-item prompt conflicts with this phase prompt's ordering, follow the phase prompt (bundling has test-economy implications). If a per-item spec conflicts with the phase prompt's detail, follow the spec.

## Why bundle these seven

All seven items touch `lib/utils.ts`, `lib/autoPick.ts`, or their test files (`lib/__tests__/utils.wpr.test.ts`, `lib/__tests__/autoPick.test.ts`). Each individual item would require its own pass of recomputing hardcoded assertions in `utils.wpr.test.ts`. Doing the recomputation once across all seven is far more efficient than six separate rewrites.

Items 2.1 → 1.3 are closely coupled — 2.1's type change simplifies 1.3's filter, so they travel best together.

## Recommended workflow

1. **Step 1 — Item 2.1 (goalkeeper representation).** Start here. The type change is the ground truth for everything else. Follow 2.1's spec audit procedure (`grep -rn "goalkeeper" lib/ components/ app/ __tests__/`). Run `npx tsc --noEmit` and let compiler errors drive the read-site updates. Update test fixtures (replace `goalkeeper: true` with `mentality: 'goalkeeper'`). All existing tests should still pass after this step.

2. **Step 2 — Item 1.3 (variety bonus GK exclusion).** With 2.1 in place, simplify to `players.filter((p) => p.mentality !== 'goalkeeper')`. Add the new test cases per 1.3's spec. Existing `ewptScore` hardcoded test values will shift — **hold off recomputing now**; do one combined pass after step 4.

3. **Step 3 — Item 1.1 (form denominator).** In `wprScore`, skip `'-'` slots when building `maxFormScore`. Add the `WW---` / `W----` / `WLD--` / `LL---` / `-----` tests. Existing `wprScore` hardcoded values may shift — again, hold off recomputing.

4. **Step 4 — Item 1.2 (drop ewptScore form component).** Remove the `avgForm` computation; drop the `avgForm * 0.25` term; raise `avgWpr` weight to 0.90; delete `playerFormScore`. Update the JSDoc. Add the new regression tests (form invariance, guest-drag check).

5. **Now do the combined `utils.wpr.test.ts` recomputation.** Walk every failing hardcoded assertion; recompute using the new formulas (post-1.1 + 1.2 + 1.3); update and re-run. This is the bulk of the test work.

6. **Step 5 — Item 1.4 (odd-player allocation).** In `autoPick`, add the `extraSlotToA` coin-flip and `halfSize` variable per 1.4's spec. Add the distribution tests with soft bounds (35–65 of 100). Note: Phase 3's item 2.6 will later convert these to deterministic seeded tests; for Phase 1 the soft-bound form is acceptable.

7. **Step 6 — Item 1.5 (unknownNames rename + guest inclusion).** Rename the `autoPick` parameter `newPlayerNames` → `unknownNames`. Update `NextMatchCard.handleAutoPick` to build the unknown set from both `guestEntries` and `newPlayerEntries`. Rename the describe block and local variables in existing tests. Add the new mixed-unknown tests. Keep the call-site `size >= 2 ? set : undefined` ternary (Phase 2 removes it).

8. **Step 7 — Item 1.6 (win-probability tolerance).** Add `TOLERANCE_WIN_PROB_BAND` and `diffForBand` helper. Replace the `max(bestDiff × 1.05, bestDiff + 3)` expression with `bestDiff + diffForBand(TOLERANCE_WIN_PROB_BAND)`. Add pool-contents and helper tests.

9. **Final verification:** `npm test` (all passing), `npx tsc --noEmit` (clean). If anything fails at this stage it's a regression — find and fix before reporting done.

## Constraints

- **Do not** hoist magic numbers to named constants. That's Phase 2 (item 2.2).
- **Do not** refactor the pair-pinning loop. That's Phase 2 (items 2.3 / 2.4).
- **Do not** drop the `size >= 2 ? set : undefined` ternary at the `NextMatchCard` call site. That's Phase 2 (item 2.5).
- **Do not** introduce a seedable RNG or synthetic player IDs. Those are Phase 3.
- **Do** keep changes scoped to: `lib/types.ts`, `lib/utils.ts`, `lib/autoPick.ts`, `lib/data.ts`, `components/NextMatchCard.tsx`, the two test files, plus any UI component files that read `.goalkeeper` on a Player (found during 2.1's audit).
- **Do** preserve existing comments where still accurate. Update comments that contradict new behaviour.

## When you're done

Report in your final message:

1. A short summary per item (2–3 lines each) describing what was changed.
2. Total diff size — lines added / lines removed across all files, and the count of files changed.
3. The list of tests **added** per item and tests **updated** per item (with old → new values where applicable).
4. Confirmation that `npm test` passes (summary line) and `npx tsc --noEmit` is clean.
5. Any judgment calls that deserve user review (e.g., an ambiguous edge case in the 2.1 data-layer translation; a specific seed selected for a soft-bound test; a decision about whether a particular magic number counts as intertwined-formula or top-level-tunable).

Do **not** commit or push. Leave changes staged for user review.
