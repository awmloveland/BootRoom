# Team Rating Algorithm Adjustments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the star-player boost from team ratings and shorten the new-player experience penalty from a 4-game ramp to a 3-game ramp.

**Architecture:** Both changes are isolated edits to two functions in `lib/utils.ts` — `ewptScore` (team rating) and `wprScore` (per-player rating) — plus their existing unit tests in `lib/__tests__/utils.wpr.test.ts`. No other files reference the changed constants or behavior. Each task follows TDD: update the tests to describe the new behavior first, confirm they fail against the current implementation, then change the implementation to make them pass.

**Tech Stack:** TypeScript, Jest (`npm test`)

**Spec:** `docs/superpowers/specs/2026-07-07-team-rating-algorithm-adjustments-design.md`

---

### Task 1: Remove the star-player boost from `ewptScore`

**Files:**
- Modify: `lib/utils.ts:14-25` (constants), `lib/utils.ts:169-217` (`ewptScore`)
- Test: `lib/__tests__/utils.wpr.test.ts:360-479` (`describe('ewptScore — GK quality weighting', ...)` and the variety-bonus describe block)

- [ ] **Step 1: Update the GK-weighting tests to expect scores without the top-2 term**

In `lib/__tests__/utils.wpr.test.ts`, replace the four GK-modifier tests (currently at lines 368–400):

```ts
  it('average GK (WPR 50) gives +1.5 modifier', () => {
    // avgWpr=50, gkModifier=1.5 → ewptScore = 50 + 1.5 = 51.5
    const avgGkTeam = makeTeam(50)
    expect(ewptScore(avgGkTeam)).toBeCloseTo(51.5, 1)
  })

  it('exceptional GK (WPR 100) gives +2.5 modifier', () => {
    // avgWpr=(100+50*4)/5=60, gkModifier=2.5 → ewptScore = 60 + 2.5 = 62.5
    const exceptionalGkTeam = makeTeam(100)
    expect(ewptScore(exceptionalGkTeam)).toBeCloseTo(62.5, 1)
  })

  it('very weak GK (WPR 0) gives +0.5 modifier', () => {
    // avgWpr=(0+50*4)/5=40, gkModifier=0.5 → ewptScore = 40 + 0.5 = 40.5
    const weakGkTeam = makeTeam(0)
    expect(ewptScore(weakGkTeam)).toBeCloseTo(40.5, 1)
  })

  it('two GKs gives -1 modifier', () => {
    const twoGks = [
      makePlayer({ name: 'GK1', mentality: 'goalkeeper', wprOverride: 70 }),
      makePlayer({ name: 'GK2', mentality: 'goalkeeper', wprOverride: 70 }),
      makePlayer({ name: 'P1', wprOverride: 50 }),
      makePlayer({ name: 'P2', wprOverride: 50 }),
      makePlayer({ name: 'P3', wprOverride: 50 }),
    ]
    // avgWpr=(70+70+50+50+50)/5=58, gkModifier=-1 → ewptScore = 58 - 1 = 57
    expect(ewptScore(twoGks)).toBeCloseTo(57, 1)
  })
```

Then, in the `describe('ewptScore — variety bonus excludes goalkeeper', ...)` block, update the comment at (currently) line 455 to drop the `top2Avg` mention:

```ts
    // Both have ≤2 outfielder mentalities → neither should get the variety bonus.
    // They share avgWpr, GK modifier, and depth. So scores should match.
    expect(ewptScore(mixed)).toBeCloseTo(ewptScore(uniform), 1)
```

Leave the `'balanced squad outscores a team with one star and five weak teammates'` test (currently lines 402–416) exactly as-is — its assertion (`toBeGreaterThan`) doesn't hardcode a score and remains valid (the margin actually grows).

- [ ] **Step 2: Run the tests to verify the four GK tests now fail**

Run: `npm test -- lib/__tests__/utils.wpr.test.ts -t "GK quality weighting"`
Expected: FAIL — `average GK`, `exceptional GK`, `very weak GK`, and `two GKs` tests fail because the current implementation still adds the top-2 term (e.g. exceptional GK test expects `62.5` but implementation returns `64`).

- [ ] **Step 3: Remove the star-player boost from `ewptScore`**

In `lib/utils.ts`, remove the two constants at lines 15–16:

```ts
// --- Team score (ewptScore, post-1.2) ---
const GK_BASE_BONUS = 0.5              // minimum GK bonus when exactly one keeper present
const GK_WPR_SCALE = 2.0               // added per unit of (gkWpr / 100)
const NO_GK_PENALTY = -1.5
const DUAL_GK_PENALTY = -1
const VARIETY_BONUS = 2
const VARIETY_MIN_MENTALITIES = 3      // post-1.3: outfielders only
const DEPTH_BASELINE = 5               // team size where depth bonus = 0
const DEPTH_PER_EXTRA_PLAYER = 0.5
const DEPTH_MAX_BONUS = 3              // cap on cumulative depth bonus
```

(This deletes the old `EWPT_AVG_WEIGHT` and `EWPT_TOP2_WEIGHT` lines that preceded `GK_BASE_BONUS`.)

Update the `ewptScore` JSDoc (currently lines 169–180):

```ts
/**
 * Estimated Weighted Team Performance Indicator (EWTPI).
 *
 * Returns a single 0–100 score for a group of players representing a team.
 *
 *  - Average WPR — overall team quality (form is already baked in per-player)
 *  - GK modifier: scaled by GK WPR — 0.5 + (wprScore(gk)/100)*2, range [+0.5,+2.5];
 *                 -1.5 for no GK, -1 for two (wasted slot)
 *  - Variety bonus: +2 if outfielders cover 3+ different mentalities
 *  - Depth modifier: small bonus/penalty relative to a 5-player baseline
 */
```

Replace the function body (currently lines 181–217):

```ts
export function ewptScore(players: Player[]): number {
  if (players.length === 0) return 0
  const wprScores = players.map((p) => wprScore(p))
  const avgWpr = wprScores.reduce((sum, s) => sum + s, 0) / players.length
  const gks = players.filter((p) => p.mentality === 'goalkeeper')
  const gkCount = gks.length
  let gkModifier: number
  if (gkCount === 0) {
    gkModifier = NO_GK_PENALTY
  } else if (gkCount === 1) {
    const gkWpr = wprScore(gks[0])
    gkModifier = GK_BASE_BONUS + (gkWpr / 100) * GK_WPR_SCALE
  } else {
    gkModifier = DUAL_GK_PENALTY
  }
  // Variety bonus rewards tactical diversity among outfielders.
  // Goalkeepers are excluded — they're already credited via `gkModifier`.
  const outfielderMentalities = new Set(
    players.filter((p) => p.mentality !== 'goalkeeper').map((p) => p.mentality),
  )
  const varietyBonus = outfielderMentalities.size >= VARIETY_MIN_MENTALITIES ? VARIETY_BONUS : 0
  const depthBonus = Math.min(
    (players.length - DEPTH_BASELINE) * DEPTH_PER_EXTRA_PLAYER,
    DEPTH_MAX_BONUS,
  )
  return Math.min(
    100,
    Math.max(0, avgWpr + gkModifier + varietyBonus + depthBonus),
  )
}
```

Note this also drops the now-unnecessary `.sort((a, b) => b - a)` on `wprScores` (it was only needed to find the top-2 scores).

- [ ] **Step 4: Run the full test file to verify it passes**

Run: `npm test -- lib/__tests__/utils.wpr.test.ts`
Expected: PASS — all tests in the file pass, including the four updated GK tests and the unchanged balanced-vs-star test.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.wpr.test.ts
git commit -m "feat(ratings): remove star-player boost from team rating"
```

---

### Task 2: Shorten the new-player experience penalty from 4 games to 3

**Files:**
- Modify: `lib/utils.ts:97-99` (JSDoc), `lib/utils.ts:144-148` (penalty logic)
- Test: `lib/__tests__/utils.wpr.test.ts:214-347` (`describe('wprScore — experience penalty (played 1–4)', ...)` and the rustiness-stacking test)

- [ ] **Step 1: Update the experience-penalty tests to describe the 3-game ramp**

In `lib/__tests__/utils.wpr.test.ts`, rename the describe block (currently line 214):

```ts
describe('wprScore — experience penalty (played 1–3)', () => {
```

Remove the now-unused `makeVeteran` helper (currently lines 216–219):

```ts
  function makeVeteran(): Player {
    // played=10, recentForm='WWDLL' — no experience or rustiness penalty
    return makePlayer()
  }
```

Keep the `played=1` test (currently lines 221–232) unchanged — the multiplier at `played=1` is still `0.85`.

Replace the `played=3` test (currently lines 234–247):

```ts
  it('experience penalty produces the correct multiplied value for played=3', () => {
    // played=3, won=2, lost=1, drew=0, points=6, recentForm='WWL', rating=2
    // PPG: (6+7.5)/(3+5) = 13.5/8 = 1.6875 → (1.6875/3)*100 = 56.25
    // Form 'WWL': rawForm = 3*(1)+3*(0.85)+0*(0.70) = 3+2.55 = 5.55
    //             maxForm = 3*(1+0.85+0.70) = 3*2.55 = 7.65
    //             formScore = (5.55/7.65)*100 ≈ 72.55
    // Rating: normRating=50, ratingWeight=1-3/10=0.7, ratingScore=35
    // baseScore = 56.25*0.6 + 72.55*0.25 + 35*0.15 = 33.75 + 18.14 + 5.25 = 57.14
    // Experience multiplier (played=3, last penalised game): 0.85 + 0.05*(3-1) = 0.95
    // No rustiness (3 real games in recentForm)
    // Final: 57.14 * 0.95 ≈ 54.3
    const player = makePlayer({ played: 3, won: 2, drew: 0, lost: 1, points: 6, recentForm: 'WWL' })
    expect(wprScore(player)).toBeCloseTo(54.3, 0)
  })
```

Keep the `wprOverride` test (currently lines 249–252) unchanged.

Replace the `played=5` test (currently lines 254–265):

```ts
  it('does NOT apply the penalty at played=4 or above', () => {
    // played=4 is the first fully-trusted game under the shortened 3-game ramp.
    // A player with 2W 1D 1L record should score between 40 and 80 (no penalty applied).
    const fourGames = makePlayer({ played: 4, won: 2, drew: 1, lost: 1, points: 7, recentForm: 'WWDL' })
    expect(wprScore(fourGames)).toBeGreaterThan(40)
    expect(wprScore(fourGames)).toBeLessThan(80)
  })
```

Replace the monotonicity test (currently lines 267–273):

```ts
  it('penalty ramp is strictly monotonic across played=1,2,3', () => {
    // Same recentForm ('DD', 2 real games — avoids rustiness) and draw-only record
    // for all three so only `played` (and its experience multiplier) differs.
    const p1 = makePlayer({ played: 1, won: 0, drew: 1, lost: 0, points: 1, recentForm: 'DD' })
    const p2 = makePlayer({ played: 2, won: 0, drew: 2, lost: 0, points: 2, recentForm: 'DD' })
    const p3 = makePlayer({ played: 3, won: 0, drew: 3, lost: 0, points: 3, recentForm: 'DD' })
    expect(wprScore(p1)).toBeLessThan(wprScore(p2))
    expect(wprScore(p2)).toBeLessThan(wprScore(p3))
  })
```

In the `describe('wprScore — rustiness penalty', ...)` block, update the stale comment coefficient in the stacking test (currently line 344):

```ts
    const expectedMultiplier = (0.85 + 0.05 * (2 - 1)) * 0.88 // experience × rustiness
```

- [ ] **Step 2: Run the tests to verify the updated ones fail**

Run: `npm test -- lib/__tests__/utils.wpr.test.ts -t "experience penalty"`
Expected: FAIL — the `played=3`, `played=4 or above`, and monotonic-ramp tests fail against the current 4-game/`0.03`-step implementation.

- [ ] **Step 3: Shorten the experience-penalty ramp in `wprScore`**

In `lib/utils.ts`, update the JSDoc bullet (currently lines 97–99):

```ts
 * Two penalties are applied after the base score:
 *  - Experience penalty (×0.85–0.95): players with 1–3 games played are still
 *    learning the league. Multiplier ramps from 0.85 at 1 game to 0.95 at 3 games.
```

Update the penalty logic (currently lines 144–148):

```ts
  // Experience penalty: players with 1–3 games are still learning the league.
  // Multiplier ramps from 0.85 (1 game) to 0.95 (3 games), then full weight at 4+.
  if (player.played >= 1 && player.played < 4) {
    score *= 0.85 + 0.05 * (player.played - 1)
  }
```

- [ ] **Step 4: Run the full test file to verify it passes**

Run: `npm test -- lib/__tests__/utils.wpr.test.ts`
Expected: PASS — all tests pass, including the rustiness-stacking test (which still holds: at `played=2` the combined experience × rustiness discount is `0.90 × 0.88 ≈ 0.792`, still well under the test's `0.95` threshold).

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.wpr.test.ts
git commit -m "feat(ratings): shorten new-player experience penalty from 4 games to 3"
```

---

### Task 3: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every test file in the repo passes, not just `utils.wpr.test.ts` (confirms no other file depends on the removed `EWPT_AVG_WEIGHT`/`EWPT_TOP2_WEIGHT` constants or the old 4-game penalty window).

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: PASS — no unused-variable or type errors introduced by removing `EWPT_AVG_WEIGHT`, `EWPT_TOP2_WEIGHT`, `top2Avg`, or `makeVeteran`.
