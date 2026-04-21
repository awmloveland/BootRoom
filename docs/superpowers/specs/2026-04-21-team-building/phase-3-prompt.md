# Phase 3 Prompt — Testing & Identity Discipline

Paste this entire prompt as the opening message in a fresh Claude Code session.

---

You are implementing Phase 3 of the BootRoom team-building review: two items that together introduce deterministic test infrastructure and synthetic identity at the resolution boundary.

**Working directory:** `/Users/willloveland/conductor/workspaces/bootroom/almaty`
**Branch:** Create a new branch off the result of Phase 2 (e.g. `awmloveland/team-building-phase-3`).

## Prerequisite

**Phases 1 and 2 must be merged first.** Verify:

```
grep -n "findAssocTeam" lib/autoPick.ts                      # must exist (Phase 2, 2.3)
grep -n "excluded = new Set" lib/autoPick.ts                 # must exist (Phase 2, 2.4)
grep -n "EXHAUSTIVE_THRESHOLD" lib/autoPick.ts               # must exist (Phase 2, 2.2)
grep -En "\bgoalkeeper:\s*boolean" lib/types.ts              # must be ABSENT on Player (Phase 1, 2.1)
grep -n "unknownNames" lib/autoPick.ts                       # must exist (Phase 1, 1.5)
```

If any check fails, STOP and raise it with the user.

## Scope — two items, in this order

| Step | Item | Spec |
|---|---|---|
| 1 | **2.6** Optional seedable RNG for `autoPick` | `docs/superpowers/specs/2026-04-21-team-building/2.6-seedable-rng-spec.md` |
| 2 | **2.7** Synthetic player ID at the resolution boundary | `docs/superpowers/specs/2026-04-21-team-building/2.7-synthetic-player-id-spec.md` |

## Read first

1. **`CLAUDE.md`** — project conventions.
2. Each per-item spec above.

## Recommended workflow

1. **Step 1 — Item 2.6 (seedable RNG).**
   - Create `lib/__tests__/helpers/seeded-rng.ts` with the LCG implementation from the spec. Add correctness tests (fixed sequence for seed 42, determinism across instances, distinctness between seeds, outputs in `[0, 1)`).
   - Update `autoPick`'s signature: add `random?: () => number` as the fourth parameter. Inside the function, derive `const rng = random ?? Math.random`. Substitute every `Math.random()` call with `rng()` — there should be four sites (GK shuffle, sample-fallback shuffle, tolerance-pool shuffle, odd-player coin flip from 1.4).
   - Migrate flaky retry-based tests to seeded deterministic ones:
     - `rating-aware` test → single call with `seededRng(SEED)`; choose SEED empirically to produce the target split composition. Assert specific composition.
     - `swap deduplication` test → handful of deterministic seeded runs; each asserts no swap pair.
     - (Optional) 1.4's odd-player distribution test can stay statistical or convert to deterministic — either is fine.
   - Run `npm test` — all pass.

2. **Step 2 — Item 2.7 (synthetic player ID).**
   - Add required `playerId: string` to `Player` in `lib/types.ts`. Run `npx tsc --noEmit` — the compiler errors enumerate the work list.
   - Stamp IDs at every boundary:
     - `resolvePlayersForAutoPick` in `components/NextMatchCard.tsx`: prefix `known|<name>` / `guest|<name>` / `new|<name>`.
     - `lib/data.ts`: prefix `roster|<row.id>` if DB primary key is accessible; otherwise `known|<name>`. Note which you chose.
     - Test fixture helpers (`makePlayer` etc.): default to `known|<name>`.
   - Update `autoPick` internals per the spec:
     - At the top, build `nameToId: Map<string, string>`. Translate `pairs` to ID pairs.
     - Update `findAssocTeam` to accept `assocId: string | undefined`; compare `.playerId` in each branch.
     - `excluded: Set<Player>` (from 2.4) — keep as-is or convert to `Set<string>` of IDs. Either is acceptable; document the choice.
     - Count-balance filter: parameter name becomes `unknownIds: Set<string>`; membership check uses `p.playerId`.
     - Swap-dedup key construction uses `p.playerId` instead of `p.name`.
   - Update `components/NextMatchCard.tsx` `handleAutoPick` to build `unknownIds` from the resolved Player array after `resolvePlayersForAutoPick` returns. Pairs stay name-based at the call site.
   - Add collision tests:
     - Two Players with same name, different `playerId` → each appears exactly once per suggestion.
     - Guest "Alice" (`guest|Alice`) + known "Alice" (`known|Alice`) → distinct entities.
   - Run `npm test` — all pass.

3. **Final verification:** `npm test` (all passing); `npx tsc --noEmit` (clean).

## Constraints

- **Do not** change the external `autoPick` API for `pairs` — stays `Array<[string, string]>` names; internal translation only.
- **Do not** remove `name` from the Player type. Display still uses it.
- **Do not** make `playerId` optional. Required field.
- **Do not** change the behaviour of `ewptScore`, `wprScore`, or the `autoPick` algorithm.
- **Do not** create a new `lib/playerId.ts` file — stamping lives at boundaries.
- **Preserve** the seedable RNG's production default (uses `Math.random()` when no `random` argument is passed).

## When you're done

Report in your final message:

1. A summary per item (2.6 and 2.7), 2–3 lines each.
2. **For 2.6:** the new helper file path, the seed values chosen for migrated tests (one-liner per test describing what that seed produces).
3. **For 2.7:** the `playerId` prefix convention used at each boundary (e.g., "`lib/data.ts`: `roster|<row.id>` — DB ID was available" or "`roster|<name>` — no DB ID accessible").
4. The new collision tests added, with their assertions.
5. Total diff size and files changed.
6. Confirmation that `npm test` passes and `npx tsc --noEmit` is clean.
7. Any judgment calls (e.g., whether `excluded` stayed `Set<Player>` or converted to `Set<string>`).

Do **not** commit or push. Leave changes staged for user review.
