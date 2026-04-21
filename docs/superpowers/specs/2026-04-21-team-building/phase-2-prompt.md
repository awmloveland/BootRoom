# Phase 2 Prompt — Readability Refactor

Paste this entire prompt as the opening message in a fresh Claude Code session.

---

You are implementing Phase 2 of the BootRoom team-building review: a bundled readability refactor. Four items, all pure refactors — **no behavioural change**. Every existing test must pass unchanged (modulo the new helper tests added in 2.3).

**Working directory:** `/Users/willloveland/conductor/workspaces/bootroom/almaty`
**Branch:** Create a new branch off the result of Phase 1 (e.g. `awmloveland/team-building-phase-2`).

## Prerequisite

**Phase 1 must be merged first.** Verify with these greps:

```
grep -n "avgForm" lib/utils.ts                               # must be ABSENT (Phase 1, 1.2)
grep -En "\bgoalkeeper:\s*boolean" lib/types.ts              # must be ABSENT on Player (Phase 1, 2.1)
grep -n "unknownNames" lib/autoPick.ts                       # must exist (Phase 1, 1.5)
grep -n "TOLERANCE_WIN_PROB_BAND" lib/autoPick.ts            # must exist (Phase 1, 1.6)
```

If any check fails, STOP and raise it with the user.

## Scope — four items, in this order

| Step | Item | Spec |
|---|---|---|
| 1 | **2.3** Refactor pair-pinning with a `findAssocTeam` helper | `docs/superpowers/specs/2026-04-21-team-building/2.3-pair-pinning-helper-spec.md` |
| 2 | **2.4** Replace O(n²) `searchPool.filter` with a Set | `docs/superpowers/specs/2026-04-21-team-building/2.4-set-based-exclusion-spec.md` |
| 3 | **2.2** Hoist magic numbers to named constants | `docs/superpowers/specs/2026-04-21-team-building/2.2-named-constants-spec.md` |
| 4 | **2.5** Drop the size-guard ternary at the NextMatchCard call site | `docs/superpowers/specs/2026-04-21-team-building/2.5-unified-filter-guard-spec.md` |

## Read first

1. **`CLAUDE.md`** — project conventions.
2. Each per-item spec above.

## Recommended workflow

1. **Step 1 — Item 2.3 (pair-pinning helper).** Add the `findAssocTeam` helper in `lib/autoPick.ts`; export it. Add unit tests for the helper (null, pinnedA, pinnedB, pinnedTeamA, pinnedTeamB, precedence). Rewrite the pair-pinning loop per the spec. **Critical:** `pairTeamToggle` flips only in the associated-found-in-pool branch; follower cases do not advance the toggle. All existing pair tests must still pass.

2. **Step 2 — Item 2.4 (Set-based exclusion).** Introduce `const excluded = new Set<Player>()` before the pair-pinning loop. Replace per-iteration `searchPool.filter(...)` calls with `excluded.add(...)`. Add `!excluded.has(p)` guards to `searchPool.find(...)` calls. Add one final `searchPool = searchPool.filter((p) => !excluded.has(p))` after the loop. All existing pair tests must still pass.

3. **Step 3 — Item 2.2 (named constants).** Add the constants blocks at the top of `lib/autoPick.ts` and `lib/utils.ts` per the spec. Substitute every matching literal. Leave curve-fitting constants inline (the experience-penalty ramp `0.85 + 0.03 × (played − 1)`). `npm test` continues to pass unchanged. Do NOT change any value — substitution only.

4. **Step 4 — Item 2.5 (unified filter guard).** In `NextMatchCard.tsx`'s `handleAutoPick`, remove the `size >= 2 ? unknownNameSet : undefined` ternary — pass `unknownNameSet` directly. Optionally expand `autoPick`'s JSDoc to note that empty/singleton sets are safe no-ops.

5. **Final verification:** `npm test` (all passing, including new helper tests from step 1); `npx tsc --noEmit` (clean).

## Constraints

- **No behavioural change.** Every pre-existing test must pass unchanged. Only new additions are the `findAssocTeam` unit tests.
- **Do not** change any weights, thresholds, or formula values.
- **Do not** introduce seedable RNG or synthetic IDs — those are Phase 3.
- **Do not** alter the count-balance filter semantics (the slack, the fallback, the size ≥ 2 guard).
- **Do not** change the `POOL_EPSILON` float-safety epsilon (if the spec hoists it).
- Preserve existing comments where still accurate.

## When you're done

Report in your final message:

1. A short summary per item (2–3 lines each).
2. Total diff size and files changed.
3. Explicit confirmation that all pre-existing tests passed unchanged.
4. The list of new `findAssocTeam` unit tests added.
5. For 2.2: the constants added per file (just names — not the whole blocks), and the count of literal substitutions per file.
6. Confirmation that `npm test` passes (summary line) and `npx tsc --noEmit` is clean.
7. Any judgment calls (e.g., whether `excluded` stayed `Set<Player>` or became `Set<string>`; whether a particular magic number was hoisted or left inline).

Do **not** commit or push. Leave changes staged for user review.
