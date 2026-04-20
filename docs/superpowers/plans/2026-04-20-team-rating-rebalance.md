# Team Rating Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recalibrate `ewptScore()` so overall squad quality dominates, the GK modifier is halved, and the standout-player bonus is reduced from 25% to 10%.

**Architecture:** All changes are isolated to one function (`ewptScore` in `lib/utils.ts`) and its test file (`lib/__tests__/utils.wpr.test.ts`). No UI, API, or data changes are needed — the rating numbers displayed on cards update automatically.

**Tech Stack:** TypeScript, Jest (`npm test`)

---

### Task 1: Update ewptScore tests to reflect the new formula

**Files:**
- Modify: `lib/__tests__/utils.wpr.test.ts:307-365`

The four `toBeCloseTo` assertions use hardcoded values derived from the old formula. Update them to match the new formula before touching the implementation, so the tests fail first and then pass once the code is fixed (TDD).

**New formula for reference:**
```
avgWpr * 0.65 + top2Avg * 0.10 + avgForm * 0.25 + gkModifier + varietyBonus + depthBonus
```

**New GK modifiers:**
- 1 GK: `0.5 + (gkWpr / 100) * 2` → range [+0.5, +2.5]
- No GK: `-1.5`
- Two GKs: `-1`

- [ ] **Step 1: Update the four hardcoded `toBeCloseTo` assertions**

Replace the entire `describe('ewptScore — GK quality weighting', ...)` block in `lib/__tests__/utils.wpr.test.ts` with:

```typescript
describe('ewptScore — GK quality weighting', () => {
  function makeTeam(gkWpr: number | null, outfieldWpr = 50): Player[] {
    const outfield = [1, 2, 3, 4].map((i) => makePlayer({ name: `P${i}`, wprOverride: outfieldWpr }))
    if (gkWpr === null) {
      return [makePlayer({ name: 'P0', wprOverride: outfieldWpr }), ...outfield]
    }
    const gk = makePlayer({ name: 'GK', mentality: 'goalkeeper', goalkeeper: true, wprOverride: gkWpr })
    return [gk, ...outfield]
  }

  it('strong GK (WPR 75) scores higher than average GK (WPR 50)', () => {
    expect(ewptScore(makeTeam(75))).toBeGreaterThan(ewptScore(makeTeam(50)))
  })

  it('weak GK (WPR 25) scores lower than average GK (WPR 50)', () => {
    expect(ewptScore(makeTeam(25))).toBeLessThan(ewptScore(makeTeam(50)))
  })

  it('average GK (WPR 50) gives +1.5 modifier', () => {
    // gkModifier = 0.5 + (50/100)*2 = 1.5
    // avgWpr=50, top2Avg=50, avgForm=(7/15)*100≈46.67
    // ewptScore = 50*0.65 + 50*0.10 + 46.67*0.25 + 1.5 = 32.5 + 5.0 + 11.67 + 1.5 ≈ 50.67
    const avgGkTeam = makeTeam(50)
    expect(ewptScore(avgGkTeam)).toBeCloseTo(50.67, 1)
  })

  it('exceptional GK (WPR 100) gives +2.5 modifier', () => {
    // gkModifier = 0.5 + (100/100)*2 = 2.5
    // avgWpr=(100+50+50+50+50)/5=60, top2Avg=(100+50)/2=75, avgForm≈46.67
    // ewptScore = 60*0.65 + 75*0.10 + 46.67*0.25 + 2.5 = 39 + 7.5 + 11.67 + 2.5 ≈ 60.67
    const exceptionalGkTeam = makeTeam(100)
    expect(ewptScore(exceptionalGkTeam)).toBeCloseTo(60.67, 1)
  })

  it('very weak GK (WPR 0) gives +0.5 modifier', () => {
    // gkModifier = 0.5 + (0/100)*2 = 0.5
    // avgWpr=(0+50+50+50+50)/5=40, top2Avg=(50+50)/2=50, avgForm≈46.67
    // ewptScore = 40*0.65 + 50*0.10 + 46.67*0.25 + 0.5 = 26 + 5 + 11.67 + 0.5 ≈ 43.17
    const weakGkTeam = makeTeam(0)
    expect(ewptScore(weakGkTeam)).toBeCloseTo(43.17, 1)
  })

  it('two GKs gives -1 modifier', () => {
    const twoGks = [
      makePlayer({ name: 'GK1', mentality: 'goalkeeper', goalkeeper: true, wprOverride: 70 }),
      makePlayer({ name: 'GK2', mentality: 'goalkeeper', goalkeeper: true, wprOverride: 70 }),
      makePlayer({ name: 'P1', wprOverride: 50 }),
      makePlayer({ name: 'P2', wprOverride: 50 }),
      makePlayer({ name: 'P3', wprOverride: 50 }),
    ]
    // gkModifier = -1
    // avgWpr=(70+70+50+50+50)/5=58, top2Avg=(70+70)/2=70, avgForm≈46.67
    // ewptScore = 58*0.65 + 70*0.10 + 46.67*0.25 + (-1) = 37.7 + 7.0 + 11.67 - 1 ≈ 55.37
    expect(ewptScore(twoGks)).toBeCloseTo(55.37, 1)
  })

  it('balanced squad outscores a team with one star and five weak teammates', () => {
    // Star-heavy team: 1 high-WPR player + 4 weak players, no GK
    const starTeam = [
      makePlayer({ name: 'Star', wprOverride: 85 }),
      makePlayer({ name: 'W1', wprOverride: 30 }),
      makePlayer({ name: 'W2', wprOverride: 30 }),
      makePlayer({ name: 'W3', wprOverride: 30 }),
      makePlayer({ name: 'W4', wprOverride: 30 }),
    ]
    // Balanced team: 5 solid players, no GK
    const balancedTeam = Array.from({ length: 5 }, (_, i) =>
      makePlayer({ name: `B${i}`, wprOverride: 51 })
    )
    expect(ewptScore(balancedTeam)).toBeGreaterThan(ewptScore(starTeam))
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/almaty
npm test -- --testPathPattern="utils.wpr" --no-coverage
```

Expected: The four `toBeCloseTo` tests fail with values matching the old formula (e.g. `52.17`, `65.42`, `45.17`, `56.17`). The new standout-player test may also fail.

- [ ] **Step 3: Commit the failing tests**

```bash
git add lib/__tests__/utils.wpr.test.ts
git commit -m "test: update ewptScore assertions for rebalanced formula"
```

---

### Task 2: Update the ewptScore formula in lib/utils.ts

**Files:**
- Modify: `lib/utils.ts:150-193`

- [ ] **Step 1: Update the JSDoc comment**

Replace the JSDoc block above `ewptScore` (lines 150–161):

```typescript
/**
 * Estimated Weighted Team Performance Indicator (EWTPI).
 *
 * Returns a single 0–100 score for a group of players representing a team.
 *
 *  - 65%: Average WPR — overall team quality floor
 *  - 10%: Top-2 average WPR — standout players have modest impact
 *  - 25%: Average normalised recent form
 *  - GK modifier: scaled by GK WPR — 0.5 + (wprScore(gk)/100)*2, range [+0.5,+2.5];
 *                 -1.5 for no GK, -1 for two (wasted slot)
 *  - Variety bonus: +2 if team covers 3+ different mentalities
 *  - Depth modifier: small bonus/penalty relative to a 5-player baseline
 */
```

- [ ] **Step 2: Update the score weights and GK modifier**

Replace the `gkModifier` block and final return inside `ewptScore` (lines 174–192):

```typescript
  let gkModifier: number
  if (gkCount === 0) {
    gkModifier = -1.5
  } else if (gkCount === 1) {
    const gkWpr = wprScore(gks[0])
    gkModifier = 0.5 + (gkWpr / 100) * 2
  } else {
    gkModifier = -1
  }
  const mentalities = new Set(players.map((p) => p.mentality))
  const varietyBonus = mentalities.size >= 3 ? 2 : 0
  const depthBonus = Math.min((players.length - 5) * 0.5, 3)
  return Math.min(
    100,
    Math.max(
      0,
      avgWpr * 0.65 + top2Avg * 0.10 + avgForm * 0.25 + gkModifier + varietyBonus + depthBonus,
    ),
  )
```

- [ ] **Step 3: Run the tests and confirm they pass**

```bash
npm test -- --testPathPattern="utils.wpr" --no-coverage
```

Expected: All tests in `lib/__tests__/utils.wpr.test.ts` pass, including the new standout-player test.

- [ ] **Step 4: Run the full test suite to check for regressions**

```bash
npm test --no-coverage
```

Expected: All tests pass. No regressions in `autoPick`, `goalkeeper`, `sidebar-stats`, or other test files.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts
git commit -m "feat: rebalance ewptScore — reduce GK modifier and standout-player weight"
```
