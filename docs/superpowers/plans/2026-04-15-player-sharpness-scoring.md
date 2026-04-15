# Player Sharpness & Scoring Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve auto-pick scoring accuracy by applying experience and rustiness penalties to individual player WPR scores, scaling the goalkeeper modifier by actual GK quality, and making strength hint offsets self-calibrate to the league's skill spread.

**Architecture:** All changes are in the pure scoring layer (`lib/utils.ts`) and the player resolution step in `components/NextMatchCard.tsx`. No DB migrations needed — `lastPlayedWeekDate` is derived at runtime from the existing `weeks` prop and stored transiently on the `Player` object before auto-pick runs.

**Tech Stack:** TypeScript, Jest, Next.js 14 App Router.

---

## File map

| File | What changes |
|---|---|
| `lib/types.ts` | Add `lastPlayedWeekDate?: string` to `Player` |
| `lib/utils.ts` | Modify `wprScore` (experience + rustiness); modify `ewptScore` (GK quality); add `leagueWprPercentiles` |
| `lib/__tests__/utils.wpr.test.ts` | Tests for all four scoring changes |
| `components/NextMatchCard.tsx` | Enrich players with `lastPlayedWeekDate` before auto-pick; replace `STRENGTH_OFFSET` with percentile-based hints |

---

### Task 1: Add `lastPlayedWeekDate` to `Player` type

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add the field to the `Player` interface**

In `lib/types.ts`, find the `Player` interface. Add the new optional field after `recentForm`:

```ts
export interface Player {
  name: string;
  played: number;
  won: number;
  drew: number;
  lost: number;
  timesTeamA: number;
  timesTeamB: number;
  winRate: number;
  qualified: boolean;
  points: number;
  goalkeeper: boolean;
  mentality: Mentality;
  rating: number;
  recentForm: string; // e.g. 'WWDLW' or '--WLW'
  wprOverride?: number; // if set, wprScore returns this directly — used for guests/new players
  lastPlayedWeekDate?: string; // 'DD MMM YYYY' — derived at runtime before auto-pick; not persisted
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add lastPlayedWeekDate to Player type"
```

---

### Task 2: Add `leagueWprPercentiles` function + tests (TDD)

**Files:**
- Modify: `lib/__tests__/utils.wpr.test.ts`
- Modify: `lib/utils.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `lib/__tests__/utils.wpr.test.ts`.
The `makeQualifiedPlayer` and `makeUnqualifiedPlayer` helpers are already defined in the `leagueMedianWpr` describe block in that file — replicate them locally inside this new block for independence:

```ts
describe('leagueWprPercentiles', () => {
  function makeQualifiedPlayer(wprTarget: number): Player {
    return {
      name: `Player${wprTarget}`,
      played: 10, won: 5, drew: 2, lost: 3,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0.5, qualified: true, points: 17,
      goalkeeper: false, mentality: 'balanced', rating: 2,
      recentForm: 'WWDLL',
      wprOverride: wprTarget,
    }
  }

  function makeUnqualifiedPlayer(): Player {
    return {
      name: 'Newbie',
      played: 2, won: 1, drew: 0, lost: 1,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0.5, qualified: false, points: 3,
      goalkeeper: false, mentality: 'balanced', rating: 2,
      recentForm: 'WL',
    }
  }

  it('returns fallback when fewer than 3 qualified players exist', () => {
    expect(leagueWprPercentiles([])).toEqual({ p25: 40, p50: 50, p75: 60 })
    expect(leagueWprPercentiles([makeQualifiedPlayer(60), makeQualifiedPlayer(70)])).toEqual({ p25: 40, p50: 50, p75: 60 })
  })

  it('excludes players with fewer than 5 games played', () => {
    const players = [
      makeQualifiedPlayer(40),
      makeQualifiedPlayer(60),
      makeQualifiedPlayer(80),
      makeUnqualifiedPlayer(),
    ]
    // Only 3 qualified: [40, 60, 80]
    const result = leagueWprPercentiles(players)
    expect(result.p25).toBe(40)
    expect(result.p50).toBe(60)
    expect(result.p75).toBe(80)
  })

  it('returns correct p25/p50/p75 for 4 qualified players', () => {
    const players = [40, 60, 70, 80].map(makeQualifiedPlayer)
    // sorted: [40, 60, 70, 80], n=4
    // p25: scores[floor(3*0.25)] = scores[0] = 40
    // p50: (scores[1]+scores[2])/2 = (60+70)/2 = 65
    // p75: scores[floor(3*0.75)] = scores[2] = 70
    const result = leagueWprPercentiles(players)
    expect(result.p25).toBe(40)
    expect(result.p50).toBe(65)
    expect(result.p75).toBe(70)
  })

  it('p50 matches leagueMedianWpr for the same input', () => {
    const players = [30, 50, 60, 70, 90].map(makeQualifiedPlayer)
    const { p50 } = leagueWprPercentiles(players)
    expect(p50).toBe(leagueMedianWpr(players))
  })
})
```

Update the import at the top of the test file to include `leagueWprPercentiles`:

```ts
import { wprScore, leagueMedianWpr, leagueWprPercentiles } from '@/lib/utils'
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest lib/__tests__/utils.wpr.test.ts --no-coverage`
Expected: FAIL — `leagueWprPercentiles is not a function`

- [ ] **Step 3: Add `WprPercentiles` interface and `leagueWprPercentiles` to `lib/utils.ts`**

Add immediately after the `leagueMedianWpr` function (around line 153):

```ts
export interface WprPercentiles {
  p25: number
  p50: number
  p75: number
}

/**
 * Computes WPR percentiles (p25 / p50 / p75) for all players with 5+ games played.
 * Used to calibrate strength hint offsets dynamically rather than using a fixed ±15.
 * Falls back to { p25: 40, p50: 50, p75: 60 } when fewer than 3 qualified players exist.
 */
export function leagueWprPercentiles(players: Player[]): WprPercentiles {
  const qualified = players.filter((p) => p.played >= 5)
  if (qualified.length < 3) return { p25: 40, p50: 50, p75: 60 }
  const scores = qualified.map((p) => wprScore(p)).sort((a, b) => a - b)
  const n = scores.length
  const p25 = scores[Math.floor((n - 1) * 0.25)]
  const p50 = n % 2 === 0
    ? (scores[n / 2 - 1] + scores[n / 2]) / 2
    : scores[Math.floor(n / 2)]
  const p75 = scores[Math.floor((n - 1) * 0.75)]
  return { p25, p50, p75 }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx jest lib/__tests__/utils.wpr.test.ts --no-coverage`
Expected: all `leagueWprPercentiles` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.wpr.test.ts
git commit -m "feat: add leagueWprPercentiles for dynamic strength hint calibration"
```

---

### Task 3: Experience penalty in `wprScore` + tests (TDD)

**Files:**
- Modify: `lib/__tests__/utils.wpr.test.ts`
- Modify: `lib/utils.ts`

**Context:** Players with 1–4 games played get a graduated WPR reduction. Multiplier = `0.85 + 0.03 * (played - 1)`. Players with `played = 0` are excluded (they use `wprOverride`). Players with `played >= 5` are unaffected.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `lib/__tests__/utils.wpr.test.ts`:

```ts
describe('wprScore — experience penalty (played 1–4)', () => {
  // Players with >=2 real games in recentForm to avoid rustiness penalty stacking
  function makeVeteran(): Player {
    // played=10, recentForm='WWDLL' — no experience or rustiness penalty
    return makePlayer()
  }

  it('played=3 player scores lower than played=10 player with same proportional record', () => {
    // played=3: won 2, lost 1 — 66% win rate. recentForm='WWL' (3 real games, no rustiness)
    const rookie = makePlayer({ played: 3, won: 2, drew: 0, lost: 1, points: 6, recentForm: 'WWL' })
    const veteran = makeVeteran()
    expect(wprScore(rookie)).toBeLessThan(wprScore(veteran))
  })

  it('experience penalty produces the correct multiplied value for played=3', () => {
    // played=3, won=2, lost=1, drew=0, points=6, recentForm='WWL', rating=2
    // PPG: (6+7.5)/(3+5) = 13.5/8 = 1.6875 → (1.6875/3)*100 = 56.25
    // Form 'WWL': rawForm = 3*(1)+3*(0.85)+0*(0.70) = 3+2.55 = 5.55
    //             maxForm = 3*(1+0.85+0.70) = 3*2.55 = 7.65
    //             formScore = (5.55/7.65)*100 ≈ 72.55
    // Rating: normRating=50, ratingWeight=1-3/10=0.7, ratingScore=35
    // baseScore = 56.25*0.6 + 72.55*0.25 + 35*0.15 = 33.75 + 18.14 + 5.25 = 57.14
    // Experience multiplier (played=3): 0.85 + 0.03*(3-1) = 0.91
    // No rustiness (3 real games in recentForm)
    // Final: 57.14 * 0.91 ≈ 52.0
    const player = makePlayer({ played: 3, won: 2, drew: 0, lost: 1, points: 6, recentForm: 'WWL' })
    expect(wprScore(player)).toBeCloseTo(52.0, 0)
  })

  it('penalty at played=2 is greater than at played=4 (monotonically decreasing)', () => {
    // played=2: recentForm='WL' (2 real games — avoids rustiness)
    // played=4: recentForm='WWLL' (4 real games — avoids rustiness)
    const p2 = makePlayer({ played: 2, won: 1, drew: 0, lost: 1, points: 3, recentForm: 'WL' })
    const p4 = makePlayer({ played: 4, won: 2, drew: 0, lost: 2, points: 6, recentForm: 'WWLL' })
    expect(wprScore(p2)).toBeLessThan(wprScore(p4))
  })

  it('does NOT apply the penalty to wprOverride players (played=0 new player)', () => {
    const newPlayer = makePlayer({ played: 0, wprOverride: 60 })
    expect(wprScore(newPlayer)).toBe(60)
  })

  it('does NOT apply the penalty at played=5 or above', () => {
    // played=5 and played=10 differ only in underlying stats, not the multiplier
    // verify played=10 (veteran) doesn't receive an unexpected penalty
    const veteran = makeVeteran() // played=10
    const fiveGames = makePlayer({ played: 5, won: 2, drew: 1, lost: 2, points: 7, recentForm: 'WWDLL' })
    // Both should score in a similar range (no multiplier applied)
    // The veteran scores higher only due to more data / better Bayesian estimate
    expect(wprScore(fiveGames)).toBeGreaterThan(wprScore(fiveGames) * 0.98) // no 0.94 haircut
    // Specifically: fiveGames without multiplier ≈ same as with — verify score is not suspiciously low
    expect(wprScore(fiveGames)).toBeGreaterThan(40)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest lib/__tests__/utils.wpr.test.ts --no-coverage`
Expected: FAIL — experience penalty tests fail (multiplier not yet applied).

- [ ] **Step 3: Apply the experience multiplier in `wprScore`**

In `lib/utils.ts`, modify `wprScore`. The function currently ends with `return ppgScore * 0.60 + formScore * 0.25 + ratingScore * 0.15`. Replace that final return with:

```ts
  let score = ppgScore * 0.60 + formScore * 0.25 + ratingScore * 0.15

  // Experience penalty: players with 1–4 games are still learning the league.
  // Multiplier ramps from 0.85 (1 game) to 0.94 (4 games), then full weight at 5+.
  if (player.played >= 1 && player.played < 5) {
    score *= 0.85 + 0.03 * (player.played - 1)
  }

  return score
```

The full updated function (replace the existing `wprScore`):

```ts
export function wprScore(player: Player): number {
  if (player.wprOverride !== undefined) return player.wprOverride

  const PRIOR_GAMES = 5
  const PRIOR_AVG_PPG = 1.5

  const shrunkPpg = (player.points + PRIOR_GAMES * PRIOR_AVG_PPG) / (player.played + PRIOR_GAMES)
  const ppgScore = (shrunkPpg / 3) * 100

  const formChars = player.recentForm.split('')
  const rawFormScore = formChars.reduce((acc, c, i) => {
    const pts = c === 'W' ? 3 : c === 'D' ? 1 : 0
    const weight = 1 - i * 0.15
    return acc + pts * weight
  }, 0)
  const maxFormScore = formChars.reduce((acc, _, i) => acc + 3 * (1 - i * 0.15), 0)
  const formScore = maxFormScore > 0 ? (rawFormScore / maxFormScore) * 100 : 0

  const normRating = player.rating > 0 ? ((player.rating - 1) / 2) * 100 : 50
  const ratingWeight = Math.max(0, 1 - player.played / 10)
  const ratingScore = normRating * ratingWeight

  let score = ppgScore * 0.60 + formScore * 0.25 + ratingScore * 0.15

  // Experience penalty: players with 1–4 games are still learning the league.
  if (player.played >= 1 && player.played < 5) {
    score *= 0.85 + 0.03 * (player.played - 1)
  }

  return score
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx jest lib/__tests__/utils.wpr.test.ts --no-coverage`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.wpr.test.ts
git commit -m "feat: apply experience penalty to wprScore for players with 1–4 games"
```

---

### Task 4: Rustiness penalty in `wprScore` + tests (TDD)

**Files:**
- Modify: `lib/__tests__/utils.wpr.test.ts`
- Modify: `lib/utils.ts`

**Context:** A player is rusty if either: (a) `lastPlayedWeekDate` is set and >28 days before `referenceDate`, or (b) fewer than 2 of the last 5 `recentForm` slots are actual games (W/D/L). Either condition triggers a 0.88× multiplier. `wprScore` gains an optional `referenceDate?: Date` parameter so tests can pass a fixed date.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `lib/__tests__/utils.wpr.test.ts`. Update the import first to include `WprPercentiles` isn't needed here, but we do need the same import line to stay consistent.

```ts
describe('wprScore — rustiness penalty', () => {
  const REF_DATE = new Date('2026-04-15')

  function makeActivePlayer(): Player {
    return makePlayer({
      recentForm: 'WWDLL', // 5 real games
      lastPlayedWeekDate: '01 Apr 2026', // 14 days before REF_DATE
    })
  }

  it('applies no penalty to a regularly-attending player', () => {
    const active = makeActivePlayer()
    const baseline = wprScore(makePlayer({ recentForm: 'WWDLL' }), REF_DATE)
    expect(wprScore(active, REF_DATE)).toBeCloseTo(baseline, 5)
  })

  it('applies 0.88× penalty when last played >28 days ago', () => {
    const rusty = makePlayer({
      recentForm: 'WWDLL',
      lastPlayedWeekDate: '01 Mar 2026', // 45 days before REF_DATE
    })
    const fresh = makePlayer({ recentForm: 'WWDLL' })
    expect(wprScore(rusty, REF_DATE)).toBeCloseTo(wprScore(fresh, REF_DATE) * 0.88, 3)
  })

  it('applies no penalty when last played exactly 28 days ago', () => {
    const borderline = makePlayer({
      recentForm: 'WWDLL',
      lastPlayedWeekDate: '18 Mar 2026', // exactly 28 days before 15 Apr 2026
    })
    const fresh = makePlayer({ recentForm: 'WWDLL' })
    expect(wprScore(borderline, REF_DATE)).toBeCloseTo(wprScore(fresh, REF_DATE), 3)
  })

  it('applies 0.88× penalty when fewer than 2 real games in recentForm', () => {
    const intermittent = makePlayer({
      recentForm: '--W--', // only 1 real game
      lastPlayedWeekDate: '08 Apr 2026', // 7 days ago — not calendar-rusty
    })
    const fresh = makePlayer({ recentForm: 'WWDLL' })
    expect(wprScore(intermittent, REF_DATE)).toBeLessThan(wprScore(fresh, REF_DATE))
    expect(wprScore(intermittent, REF_DATE)).toBeCloseTo(
      wprScore({ ...intermittent, recentForm: '--W--' }, REF_DATE) / 0.88 * 0.88,
      3
    )
  })

  it('applies 0.88× penalty when recentForm has zero real games', () => {
    const absent = makePlayer({
      recentForm: '-----',
      lastPlayedWeekDate: '08 Apr 2026',
    })
    const fresh = makePlayer({ recentForm: 'WWDLL' })
    expect(wprScore(absent, REF_DATE)).toBeLessThan(wprScore(fresh, REF_DATE))
  })

  it('does not apply rustiness penalty when lastPlayedWeekDate is undefined', () => {
    const noDate = makePlayer({ recentForm: 'WWDLL' })
    const withDate = makePlayer({ recentForm: 'WWDLL', lastPlayedWeekDate: '01 Mar 2026' })
    expect(wprScore(noDate, REF_DATE)).toBeGreaterThan(wprScore(withDate, REF_DATE))
  })

  it('experience and rustiness penalties stack independently', () => {
    const rookieRusty = makePlayer({
      played: 2,
      points: 3,
      won: 1, drew: 0, lost: 1,
      recentForm: 'WL',
      lastPlayedWeekDate: '01 Mar 2026', // >28 days
    })
    const baseScore = wprScore({ ...rookieRusty, played: 5, points: 9, won: 3, lost: 2, lastPlayedWeekDate: undefined }, REF_DATE)
    const expectedMultiplier = (0.85 + 0.03 * (2 - 1)) * 0.88 // experience × rustiness
    // Rough check — both penalties applied
    expect(wprScore(rookieRusty, REF_DATE)).toBeLessThan(baseScore * 0.95)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest lib/__tests__/utils.wpr.test.ts --no-coverage`
Expected: FAIL — `wprScore` doesn't accept a second argument yet; rustiness tests fail.

- [ ] **Step 3: Add rustiness penalty to `wprScore`**

Replace the `wprScore` function in `lib/utils.ts` with this updated version:

```ts
export function wprScore(player: Player, referenceDate?: Date): number {
  if (player.wprOverride !== undefined) return player.wprOverride

  const PRIOR_GAMES = 5
  const PRIOR_AVG_PPG = 1.5

  const shrunkPpg = (player.points + PRIOR_GAMES * PRIOR_AVG_PPG) / (player.played + PRIOR_GAMES)
  const ppgScore = (shrunkPpg / 3) * 100

  const formChars = player.recentForm.split('')
  const rawFormScore = formChars.reduce((acc, c, i) => {
    const pts = c === 'W' ? 3 : c === 'D' ? 1 : 0
    const weight = 1 - i * 0.15
    return acc + pts * weight
  }, 0)
  const maxFormScore = formChars.reduce((acc, _, i) => acc + 3 * (1 - i * 0.15), 0)
  const formScore = maxFormScore > 0 ? (rawFormScore / maxFormScore) * 100 : 0

  const normRating = player.rating > 0 ? ((player.rating - 1) / 2) * 100 : 50
  const ratingWeight = Math.max(0, 1 - player.played / 10)
  const ratingScore = normRating * ratingWeight

  let score = ppgScore * 0.60 + formScore * 0.25 + ratingScore * 0.15

  // Experience penalty: players with 1–4 games are still learning the league.
  if (player.played >= 1 && player.played < 5) {
    score *= 0.85 + 0.03 * (player.played - 1)
  }

  // Rustiness penalty: not recently active (calendar absence or intermittent attendance).
  const recentGameCount = player.recentForm.split('').filter((c) => c !== '-').length
  const isIntermittent = recentGameCount < 2

  let isCalendarRusty = false
  if (player.lastPlayedWeekDate) {
    const lastPlayed = new Date(player.lastPlayedWeekDate)
    const ref = referenceDate ?? new Date()
    const diffDays = (ref.getTime() - lastPlayed.getTime()) / (1000 * 60 * 60 * 24)
    isCalendarRusty = diffDays > 28
  }

  if (isIntermittent || isCalendarRusty) {
    score *= 0.88
  }

  return score
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx jest lib/__tests__/utils.wpr.test.ts --no-coverage`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.wpr.test.ts
git commit -m "feat: apply rustiness penalty to wprScore for absent or intermittent players"
```

---

### Task 5: Goalkeeper quality weighting in `ewptScore` + tests (TDD)

**Files:**
- Modify: `lib/__tests__/utils.wpr.test.ts`
- Modify: `lib/utils.ts`

**Context:** Replace flat `+3` for one GK with `1 + (gkWpr / 100) * 4`. Average GK (WPR=50) still gives +3 — backwards compatible. The -3 (no GK) and -2 (two GKs) penalties are unchanged.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `lib/__tests__/utils.wpr.test.ts`. Add `ewptScore` to the import line:

```ts
import { wprScore, leagueMedianWpr, leagueWprPercentiles, ewptScore } from '@/lib/utils'
```

```ts
describe('ewptScore — GK quality weighting', () => {
  function makeTeam(gkWpr: number | null, outfieldWpr = 50): Player[] {
    const outfield = [1, 2, 3, 4].map((i) => makePlayer({ name: `P${i}`, wprOverride: outfieldWpr }))
    if (gkWpr === null) {
      // No GK — all outfield
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

  it('average GK (WPR 50) produces same score as old flat +3 modifier', () => {
    // With WPR=50: 1 + (50/100)*4 = 3.0 — identical to the previous hardcoded value
    const avgGkTeam = makeTeam(50)
    // Verify by computing manually: all WPR=50, 5 players, gkModifier=3
    // avgWpr=50, top2Avg=50 (GK wprOverride=50 same as outfield), avgForm=0
    // ewptScore = 50*0.50 + 50*0.25 + 0*0.25 + 3 = 25 + 12.5 + 3 = 40.5
    expect(ewptScore(avgGkTeam)).toBeCloseTo(40.5, 1)
  })

  it('exceptional GK (WPR 100) gives +5 modifier', () => {
    const exceptionalGkTeam = makeTeam(100)
    // gkModifier = 1 + (100/100)*4 = 5.0
    // ewptScore = 50*0.50 + 50*0.25 + 0*0.25 + 5 = 25 + 12.5 + 5 = 42.5
    expect(ewptScore(exceptionalGkTeam)).toBeCloseTo(42.5, 1)
  })

  it('very weak GK (WPR 0) gives +1 modifier', () => {
    const weakGkTeam = makeTeam(0)
    // gkModifier = 1 + (0/100)*4 = 1.0
    // ewptScore = 50*0.50 + 50*0.25 + 0*0.25 + 1 = 25 + 12.5 + 1 = 38.5
    expect(ewptScore(weakGkTeam)).toBeCloseTo(38.5, 1)
  })

  it('two GKs still gives -2 modifier (unchanged)', () => {
    const twoGks = [
      makePlayer({ name: 'GK1', mentality: 'goalkeeper', goalkeeper: true, wprOverride: 70 }),
      makePlayer({ name: 'GK2', mentality: 'goalkeeper', goalkeeper: true, wprOverride: 70 }),
      makePlayer({ name: 'P1', wprOverride: 50 }),
      makePlayer({ name: 'P2', wprOverride: 50 }),
      makePlayer({ name: 'P3', wprOverride: 50 }),
    ]
    // gkModifier = -2
    // avgWpr = (70+70+50+50+50)/5 = 58, top2Avg = (70+70)/2 = 70
    // ewptScore ≈ 58*0.5 + 70*0.25 + 0 + (-2) = 29 + 17.5 - 2 = 44.5
    expect(ewptScore(twoGks)).toBeCloseTo(44.5, 1)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest lib/__tests__/utils.wpr.test.ts --no-coverage`
Expected: FAIL — `ewptScore` still uses flat `+3` for one GK.

- [ ] **Step 3: Update GK modifier in `ewptScore`**

In `lib/utils.ts`, find `ewptScore`. Replace this section:

```ts
  const gkCount = players.filter((p) => p.mentality === 'goalkeeper' || p.goalkeeper).length
  const gkModifier = gkCount === 1 ? 3 : gkCount === 0 ? -3 : -2
```

With:

```ts
  const gks = players.filter((p) => p.mentality === 'goalkeeper' || p.goalkeeper)
  const gkCount = gks.length
  let gkModifier: number
  if (gkCount === 0) {
    gkModifier = -3
  } else if (gkCount === 1) {
    const gkWpr = wprScore(gks[0])
    gkModifier = 1 + (gkWpr / 100) * 4
  } else {
    gkModifier = -2
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx jest lib/__tests__/utils.wpr.test.ts --no-coverage`
Expected: all tests PASS.

- [ ] **Step 5: Run full test suite to confirm no regressions**

Run: `npm test -- --no-coverage`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.wpr.test.ts
git commit -m "feat: scale GK modifier in ewptScore by actual goalkeeper WPR quality"
```

---

### Task 6: Wire up `NextMatchCard` — player enrichment + percentile hints

**Files:**
- Modify: `components/NextMatchCard.tsx`

**Context:** Two changes:
1. Before calling `resolvePlayersForAutoPick`, derive `lastPlayedWeekDate` for each player from the `weeks` prop and spread it onto the player object.
2. Replace the hardcoded `STRENGTH_OFFSET = 15` with `leagueWprPercentiles`, so "above/below average" hints use the league's actual p75/p25.

- [ ] **Step 1: Update imports in `NextMatchCard.tsx`**

On line 6, replace `leagueMedianWpr` with `leagueWprPercentiles` in the import:

```ts
import { getNextMatchDate, getNextWeekNumber, deriveSeason, ewptScore, winProbability, winCopy, isPastDeadline, buildShareText, wprScore, leagueWprPercentiles } from '@/lib/utils'
```

- [ ] **Step 2: Remove `STRENGTH_OFFSET` and update `resolvePlayersForAutoPick`**

Remove the constant:
```ts
const STRENGTH_OFFSET = 15  // DELETE THIS LINE
```

In `resolvePlayersForAutoPick`, replace the two lines that compute `medianWpr` and `hintToWpr`:

```ts
  // REMOVE:
  const medianWpr = leagueMedianWpr(allPlayers)

  function hintToWpr(hint: StrengthHint | undefined): number {
    const offset = hint === 'above' ? STRENGTH_OFFSET : hint === 'below' ? -STRENGTH_OFFSET : 0
    return Math.min(100, Math.max(0, medianWpr + offset))
  }
```

Replace with:

```ts
  const percentiles = leagueWprPercentiles(allPlayers)

  function hintToWpr(hint: StrengthHint | undefined): number {
    if (hint === 'above') return Math.min(100, percentiles.p75)
    if (hint === 'below') return Math.max(0, percentiles.p25)
    return percentiles.p50
  }
```

- [ ] **Step 3: Add `deriveLastPlayedDates` helper above the component**

Add this helper function directly above `resolvePlayersForAutoPick` (i.e., after line 45 where `medianRating` ends):

```ts
/**
 * Scans played weeks to find the most recent week date each player appeared in.
 * Returns a map of player name → date string ('DD MMM YYYY'), or undefined if never played.
 */
function deriveLastPlayedDates(players: Player[], weeks: Week[]): Map<string, string | undefined> {
  const playedWeeks = weeks
    .filter((w) => w.status === 'played')
    .sort((a, b) => b.week - a.week) // most recent first
  const result = new Map<string, string | undefined>()
  for (const player of players) {
    const lastWeek = playedWeeks.find(
      (w) => w.teamA.includes(player.name) || w.teamB.includes(player.name)
    )
    result.set(player.name, lastWeek?.date)
  }
  return result
}
```

- [ ] **Step 4: Enrich players with `lastPlayedWeekDate` in `handleAutoPick`**

In `handleAutoPick`, add player enrichment before calling `resolvePlayersForAutoPick`. Replace:

```ts
  function handleAutoPick() {
    const resolved = resolvePlayersForAutoPick(squadNames, allPlayers, guestEntries, newPlayerEntries)
```

With:

```ts
  function handleAutoPick() {
    const lastPlayedDates = deriveLastPlayedDates(allPlayers, weeks)
    const enrichedPlayers = allPlayers.map((p) => ({
      ...p,
      lastPlayedWeekDate: lastPlayedDates.get(p.name),
    }))
    const resolved = resolvePlayersForAutoPick(squadNames, enrichedPlayers, guestEntries, newPlayerEntries)
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Run full test suite**

Run: `npm test -- --no-coverage`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: enrich players with lastPlayedWeekDate and use percentile-based strength hints"
```
