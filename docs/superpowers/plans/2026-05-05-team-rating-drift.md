# Team Rating Drift Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `ResultModal` from recomputing team ratings at result-recording time. Reuse the snapshot saved by `save_lineup` so the displayed rating after a game matches the rating shown pre-game.

**Architecture:** Extract a small pure helper `resolveTeamRatingForResult(snapshot, recomputePlayers)` into `lib/utils.ts` that returns the snapshot if present and otherwise falls back to `ewptScore(...)` (preserves behavior for legacy lineups saved before the snapshot column existed). Wire it into `ResultModal.tsx` in place of the existing inline recompute. No DB migration. No backfill.

**Tech Stack:** Next.js 14 App Router, TypeScript, Jest (`NODE_OPTIONS=--experimental-vm-modules jest`), Supabase RPC.

**Spec:** `docs/superpowers/specs/2026-05-05-team-rating-drift-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/utils.ts` | Modify | Add `resolveTeamRatingForResult` helper. |
| `lib/__tests__/utils.resolveTeamRatingForResult.test.ts` | Create | Pure tests for the helper. |
| `components/ResultModal.tsx` | Modify | Replace lines 253-254 to use the helper. |

The codebase tests pure utilities at the unit level (no React-component tests under `components/__tests__/`). Mirroring that pattern keeps the change inside the existing test infrastructure.

---

## Task 1: Add `resolveTeamRatingForResult` helper (TDD)

**Files:**
- Create: `lib/__tests__/utils.resolveTeamRatingForResult.test.ts`
- Modify: `lib/utils.ts` (add a new export below `ewptScore`)

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/utils.resolveTeamRatingForResult.test.ts`:

```ts
// lib/__tests__/utils.resolveTeamRatingForResult.test.ts
import { resolveTeamRatingForResult } from '@/lib/utils'
import type { Player } from '@/lib/types'

// A synthetic player whose recomputed ewptScore would NOT round to 42.000.
// We don't care about the exact number — we only assert which branch ran.
const RECOMPUTE_PLAYERS: Player[] = [
  {
    playerId: 'roster|alice',
    name: 'Alice',
    played: 10, won: 5, drew: 2, lost: 3,
    timesTeamA: 5, timesTeamB: 5,
    winRate: 50, qualified: true, points: 17,
    recentForm: 'WWDLL',
    mentality: 'balanced',
    rating: 2,
  },
]

describe('resolveTeamRatingForResult', () => {
  it('returns the snapshot when it is a number', () => {
    expect(resolveTeamRatingForResult(42.0, RECOMPUTE_PLAYERS)).toBe(42.0)
  })

  it('returns the snapshot even when it is 0', () => {
    expect(resolveTeamRatingForResult(0, RECOMPUTE_PLAYERS)).toBe(0)
  })

  it('falls back to recomputed ewptScore when snapshot is null', () => {
    const result = resolveTeamRatingForResult(null, RECOMPUTE_PLAYERS)
    expect(result).not.toBe(42.0)
    expect(typeof result).toBe('number')
    expect(Number.isFinite(result)).toBe(true)
    // Rounded to 3 decimal places (matches existing parseFloat(...toFixed(3)) behavior)
    expect(result).toBe(parseFloat(result.toFixed(3)))
  })

  it('falls back to recomputed ewptScore when snapshot is undefined', () => {
    const result = resolveTeamRatingForResult(undefined, RECOMPUTE_PLAYERS)
    expect(typeof result).toBe('number')
    expect(Number.isFinite(result)).toBe(true)
  })

  it('rounds the recomputed fallback to 3 decimal places', () => {
    const result = resolveTeamRatingForResult(null, RECOMPUTE_PLAYERS)
    // The string representation should have at most 3 fractional digits.
    const fractional = String(result).split('.')[1] ?? ''
    expect(fractional.length).toBeLessThanOrEqual(3)
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test -- lib/__tests__/utils.resolveTeamRatingForResult.test.ts`

Expected: FAIL — `resolveTeamRatingForResult is not a function` (or TypeScript: `Module '"@/lib/utils"' has no exported member 'resolveTeamRatingForResult'`).

- [ ] **Step 3: Implement the helper**

Open `lib/utils.ts`. Locate the `ewptScore` export (currently around line 178). Immediately after the closing `}` of `ewptScore` and before the `leagueMedianWpr` block, add:

```ts
/**
 * Resolves the team rating to write when a result is recorded.
 *
 * Prefers the snapshot saved by `save_lineup` (the pre-game rating that was
 * shown when teams were balanced). Falls back to a fresh `ewptScore` only
 * for legacy lineups saved before the snapshot column existed.
 *
 * Recomputing at result-recording time is unsafe because the inputs to
 * `ewptScore` (notably `Player.lastPlayedWeekDate` and the per-guest
 * `wprOverride`) are not persisted, so the recomputed value drifts from
 * the snapshot a member saw pre-game.
 */
export function resolveTeamRatingForResult(
  snapshot: number | null | undefined,
  recomputePlayers: Player[],
): number {
  if (snapshot !== null && snapshot !== undefined) return snapshot
  return parseFloat(ewptScore(recomputePlayers).toFixed(3))
}
```

`Player` is already imported in `lib/utils.ts`; no new imports are needed. Verify with:

```bash
grep -n "^import.*Player" lib/utils.ts
```

If `Player` is not imported there, add it to the existing `lib/types` import at the top of the file: `import type { Player } from './types'` (use whichever import form the file already uses).

- [ ] **Step 4: Run the test and verify it passes**

Run: `npm test -- lib/__tests__/utils.resolveTeamRatingForResult.test.ts`

Expected: PASS — all 5 tests green.

- [ ] **Step 5: Run the full unit-test suite to confirm no regressions**

Run: `npm test`

Expected: PASS — no failing tests anywhere. (Existing `lib/__tests__/utils.wpr.test.ts` and `__tests__/match-card-ratings.test.ts` remain green.)

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.resolveTeamRatingForResult.test.ts
git commit -m "Add resolveTeamRatingForResult helper

Pure helper that prefers a pre-saved team-rating snapshot and falls back
to ewptScore only for legacy lineups. Used by ResultModal in the next
commit to stop overwriting the lineup-save snapshot at result time."
```

---

## Task 2: Use the helper in `ResultModal.tsx`

**Files:**
- Modify: `components/ResultModal.tsx` (lines 6, 253-254)

- [ ] **Step 1: Update the import**

In `components/ResultModal.tsx`, locate the existing import on line 6:

```ts
import { cn, ewptScore, buildResultShareText } from '@/lib/utils'
```

Change it to:

```ts
import { cn, ewptScore, buildResultShareText, resolveTeamRatingForResult } from '@/lib/utils'
```

(Keep `ewptScore` — `resolveTeamRatingForResult` calls it internally, but `ResultModal` itself no longer references it directly. Verify by searching the file — if `ewptScore` has no other usages after Step 2, remove it from the import in that step.)

- [ ] **Step 2: Replace the recompute with the helper**

Locate the non-DNF result path. Around lines 253-254 you'll find:

```ts
const teamAScore = parseFloat(ewptScore(resolveTeam(scheduledWeek.teamA)).toFixed(3))
const teamBScore = parseFloat(ewptScore(resolveTeam(scheduledWeek.teamB)).toFixed(3))
```

Replace those two lines with:

```ts
const teamAScore = resolveTeamRatingForResult(
  scheduledWeek.team_a_rating,
  resolveTeam(scheduledWeek.teamA),
)
const teamBScore = resolveTeamRatingForResult(
  scheduledWeek.team_b_rating,
  resolveTeam(scheduledWeek.teamB),
)
```

Now check whether `ewptScore` is still referenced anywhere else in `components/ResultModal.tsx`:

```bash
grep -n "ewptScore" components/ResultModal.tsx
```

Expected: no remaining matches. If so, remove `ewptScore` from the import on line 6 so it reads:

```ts
import { cn, buildResultShareText, resolveTeamRatingForResult } from '@/lib/utils'
```

If there are still matches, leave the import alone.

Do **not** touch `resolveTeam` (lines 232-251) — it is still needed for the fallback path inside `resolveTeamRatingForResult`.

- [ ] **Step 3: Type-check the file**

Run: `npx tsc --noEmit`

Expected: PASS — no type errors.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`

Expected: PASS — Task 1 tests still green, no regressions elsewhere.

- [ ] **Step 5: Manual verification in the browser**

Per CLAUDE.md, UI changes must be exercised in a real browser before declaring success. Two scenarios to walk through.

Start the dev server:

```bash
npm run dev
```

Open the app, sign in, and pick a league where you can record a result.

**Scenario A — snapshot path (the bug we're fixing).**

1. From the league home, build a lineup using auto-pick (or load an existing scheduled week).
2. Note the team ratings shown on the lineup card. Call these *T<sub>A,pre</sub>* and *T<sub>B,pre</sub>*.
3. Open the result modal, pick a winner and goal difference, submit.
4. After save, navigate to the results list (or refresh the league home). Find the just-recorded match.
5. Confirm the displayed team ratings exactly equal *T<sub>A,pre</sub>* and *T<sub>B,pre</sub>*. They should match to the third decimal — no drift.

**Scenario B — fallback path (legacy lineup with no snapshot).**

This guards the fallback branch. If there is a `weeks` row in your test database with `status = 'scheduled'` and `team_a_rating IS NULL`, use it. Otherwise simulate by manually nulling the snapshot in Supabase Studio:

```sql
UPDATE weeks SET team_a_rating = NULL, team_b_rating = NULL
WHERE id = '<scheduled-week-id>';
```

1. Open the result modal for that scheduled week, submit a result.
2. Confirm the saved row has non-null `team_a_rating` and `team_b_rating` (i.e. the recompute fallback ran rather than writing NULLs).

If both scenarios pass, proceed. If either fails, debug — do not commit.

- [ ] **Step 6: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "Use lineup-save rating snapshot when recording a result

ResultModal previously recomputed ewptScore at submit time and sent that
back to record_result, overwriting the snapshot save_lineup wrote earlier.
The recompute drifts because lastPlayedWeekDate (calendar rustiness) and
guest wprOverride values are JIT-only and not persisted.

Use the snapshot via resolveTeamRatingForResult; recompute only as a
fallback for legacy lineups that predate the snapshot column."
```

---

## Self-Review

**Spec coverage**

- Spec § Approach (recommend A) → Tasks 1 + 2 (client-side helper + wiring). ✓
- Spec § Changes / `components/ResultModal.tsx` → Task 2 Steps 1-2. ✓
- Spec § Changes / no migration → no DB tasks; explicitly called out. ✓
- Spec § Changes / no backfill → no migration / data tasks; explicitly out of scope. ✓
- Spec § Tests / snapshot path → Task 1 Step 1 ("returns the snapshot when it is a number") + Task 2 Step 5 Scenario A (browser). ✓
- Spec § Tests / fallback path → Task 1 Step 1 ("falls back to recomputed ewptScore when snapshot is null/undefined") + Task 2 Step 5 Scenario B (browser). ✓
- Spec § Out of scope (reset, persisting `lastPlayedWeekDate`, RPC changes) → no tasks added; consistent with spec. ✓

**Placeholder scan**

- No "TBD" / "TODO" / "implement later" anywhere.
- No "add appropriate error handling" hand-waves.
- All test code is shown verbatim. All edits show the exact replacement.
- Function name `resolveTeamRatingForResult` is consistent across spec, helper definition, import update, and test file.

**Type consistency**

- Helper signature `(snapshot: number | null | undefined, recomputePlayers: Player[]): number` matches `ScheduledWeek.team_a_rating?: number | null` (verified in `lib/types.ts:129`).
- `Player` type imported in `lib/utils.ts` (verified in Task 1 Step 3 with a guarded `grep` and an explicit add-if-missing instruction).
- `resolveTeam` return type (`Player[]`) flows into `recomputePlayers` correctly.

No issues found. Plan is ready.
