# Team Building Review — Design Spec
_Date: 2026-04-21_
_Status: Draft_

## Problem

A top-to-bottom review of the team-building stack — `wprScore` (lib/utils.ts), `ewptScore` (lib/utils.ts), `autoPick` (lib/autoPick.ts), and `resolvePlayersForAutoPick` (components/NextMatchCard.tsx) — surfaced a mix of correctness issues, overlapping logic, and code-quality friction. The recent rebalance (2026-04-20) and new-player count-balance filter (2026-04-20) moved the stack in the right direction, but left several real unfairnesses intact and several redundancies worth cleaning up.

This spec consolidates the findings into three tiers: behavioural fixes, code-quality improvements, and deferred items with rationale.

---

## Goals

- Remove concrete unfairnesses in the scoring maths so lineups built with new players, guests, or short-history rosters are rated on equal footing with rated-only squads.
- Reduce duplicate representations and magic numbers so the algorithm is readable top-to-bottom.
- Make `autoPick` testable without flaky retry loops.
- Capture everything the review surfaced — including items we're explicitly parking — so nothing is lost.

---

## Scope & tiering

Three tiers:

1. **Behavioural fixes** — change the output of `wprScore` / `ewptScore` / `autoPick`. Require test updates. Land together.
2. **Code-quality improvements** — same outputs, cleaner implementation. Can land independently.
3. **Deferred** — called out explicitly with rationale for why they're parked.

Implementation can bundle behavioural fixes into one PR (all small, all related) and stage code-quality items as separate PRs to keep reviews focused.

---

## 1. Behavioural fixes

### 1.1 Fix the form denominator for short-history players

**Problem.** `wprScore` (lib/utils.ts:96–104) computes `maxFormScore` by summing `3 * (1 - i * 0.15)` over all 5 form slots, including `'-'` slots representing games the player hasn't played. A player with `recentForm = 'WW---'` (2 games, both won) scores `5.55 / 10.5 = 52.9` — a C grade for a 100% win record. A standalone `playerFormScore` helper (lib/utils.ts:138–147) has the same bug, but it's only used by `ewptScore` and is being deleted under 1.2.

**Fix.** In `wprScore`, skip `'-'` slots when building the denominator:

```ts
const maxFormScore = formChars.reduce(
  (acc, c, i) => c === '-' ? acc : acc + 3 * (1 - i * 0.15),
  0,
)
```

The existing `maxFormScore > 0 ? ... : 0` guard already handles the all-dashes case.

**Tests.** `'WW---'` scores 100 on form (perfect wins in played slots); `'LL---'` scores 0; `'-----'` scores 0 without NaN; `'W----'` scores 100.

### 1.2 Drop the team-form component from `ewptScore`; redistribute to avgWpr

**Problem.** Form is double-counted. `wprScore` already weights form at 25% per-player, so `avgWpr` inside `ewptScore` carries ~16% form content. The explicit `avgForm × 0.25` stacks another 25% on top, giving form ~41% of the team score. This runs counter to the rebalance goal of "overall quality dominates." It also introduces the guest/new-player form-drag bug: unknowns with `recentForm = ''` contribute 0 to `avgForm`, pulling the team score down just by being on the lineup.

**Fix.** Remove the `avgForm` term. Redistribute the 25% weight to `avgWpr`:

```ts
// ewptScore — before
avgWpr * 0.65 + top2Avg * 0.10 + avgForm * 0.25 + gkModifier + varietyBonus + depthBonus

// ewptScore — after
avgWpr * 0.90 + top2Avg * 0.10 + gkModifier + varietyBonus + depthBonus
```

Remove the local `avgForm` computation and the `playerFormScore` helper (no other consumers).

**Tests.**
- A team of 5 rated players with avg form 60 scores the same (within 1 pt) as the same team with form 40. (Form is no longer a team-level multiplier.)
- A team of 5 rated + 1 guest with avg WPR 55 scores within 1 pt of a team of 6 rated with avg WPR 55. (Guests no longer drag the team score down.)
- The existing `utils.wpr.test.ts` hard-coded assertions need recomputing.

### 1.3 Exclude goalkeeper mentality from the variety bonus

**Problem.** The variety bonus (lib/utils.ts:182–183) awards +2 when a team has 3+ distinct mentalities. `'goalkeeper'` counts as a mentality, so {GK, balanced, attacking} earns variety=3 → +2, even though that's really just 2 outfielder variations. The keeper is already rewarded via `gkModifier`; counting it toward variety is a double benefit.

**Fix.**

```ts
const mentalities = new Set(
  players
    .filter((p) => p.mentality !== 'goalkeeper' && !p.goalkeeper)
    .map((p) => p.mentality),
)
const varietyBonus = mentalities.size >= 3 ? 2 : 0
```

**Tests.**
- {GK, balanced, balanced, balanced, balanced} → no variety bonus (only 1 outfielder mentality).
- {GK, balanced, attacking, defensive} → variety bonus +2 (3 outfielder mentalities).
- {balanced, attacking, defensive, balanced, attacking} (no GK) → variety bonus +2.

### 1.4 Stop always giving the odd player to Team A

**Problem.** `sizeA = Math.ceil(n/2) - ...` (lib/autoPick.ts:111). With n=11, Team A gets 6, Team B gets 5 every single run. The depth modifier `(n-5) × 0.5` then gives A a systematic +0.5 pts. Small but persistent.

**Fix.** When n is odd, randomise which team gets the extra slot (Math.random once per call), or alternate based on some deterministic signal (e.g., week number). Randomisation is simpler and, with the seedable-RNG item (2.6), testable.

```ts
const teamAGetsOdd = n % 2 === 0 ? true : Math.random() < 0.5
const halfSize = teamAGetsOdd ? Math.ceil(n / 2) : Math.floor(n / 2)
const sizeA = Math.max(
  0,
  Math.min(searchPool.length, halfSize - (pinnedA ? 1 : 0) - pinnedTeamA.length),
)
```

**Tests.** Over 100 runs with n=11, odd player lands on Team A between 35% and 65% of the time (soft bound for random variance). With a seeded RNG (see 2.6), deterministic.

### 1.5 Extend the count-balance filter to all unknowns (not just new players)

**Problem.** The count-balance filter only considers `newPlayerNames`. If an admin adds 3 guests all marked "below average" and they all associate with players on the same team, Team A ends up with 3 below-median-WPR guests locked in. No filter catches this.

**Fix.** Rename the `autoPick` parameter from `newPlayerNames` to `unknownPlayerNames` (or `unknownNames`). Include both `GuestEntry` and `NewPlayerEntry` names in the set at the call site:

```ts
// components/NextMatchCard.tsx — handleAutoPick
const unknownNameSet = new Set<string>()
for (const g of guestEntries) unknownNameSet.add(g.name)
for (const p of newPlayerEntries) unknownNameSet.add(p.name)
const result = autoPick(
  resolved,
  pairs,
  unknownNameSet.size >= 2 ? unknownNameSet : undefined,
)
```

The filter logic inside `autoPick` is unchanged. The guest-pairing constraint still takes precedence — guests stay with their associated player — but within that constraint, the filter now prefers splits where unknowns are spread evenly.

**Tests.** 4 guests paired with 4 different associated players on mixed teams → filter accepts. 4 guests all paired with associated players on the same team → filter rejects most splits, falls back (guest pairing wins). Add a case mixing 2 guests and 2 new players.

### 1.6 Reframe the tolerance pool in win-probability terms

**Problem.** The tolerance pool threshold `Math.max(bestDiff * 1.05, bestDiff + 3)` (lib/autoPick.ts:168) uses two magic numbers in score-units. They're not grounded in anything semantically meaningful.

**Math clarification.** `winProbability` (lib/utils.ts:237–240) is a monotonic function of `(scoreA − scoreB)`, so minimising `|winProbA − 0.5|` selects the same splits as minimising `|diff|`. This change **does not re-rank splits**. It reframes the tolerance parameter into a semantically clearer unit.

**Fix.** Replace both magic numbers with a single win-probability band, converted to a score-diff threshold via the inverse logistic. Drop the `× 1.05` percentage multiplier — it's not grounded in anything and the band alone is sufficient:

```ts
// lib/autoPick.ts
const TOLERANCE_WIN_PROB_BAND = 0.095 // accept splits within 40.5%–59.5% win probability
// diff such that winProb(a,b) = 0.5 + BAND:
//   1 / (1 + e^(-diff/8)) = 0.5 + BAND  →  diff = -8 * ln(1/(0.5+BAND) - 1)
function diffForBand(band: number): number {
  return -8 * Math.log(1 / (0.5 + band) - 1)
}

const tolerance = bestDiff + diffForBand(TOLERANCE_WIN_PROB_BAND)
const pool = filteredScored.filter((s) => s.diff <= tolerance + 0.001)
```

`band = 0.095` gives a diff threshold of ~3 points, matching the current `+3` absolute floor for small `bestDiff`. Dropping the `× 1.05` floor means splits ≥ bestDiff + ~3 points are excluded even when `bestDiff` is large. In practice `bestDiff` is small (<5) for 5–7-a-side lineups, so the change is barely observable. Reviewers should confirm this is acceptable; if not, keep the `× 1.05` floor and document it as "percentage fallback for degenerate squads."

**Tests.** For a squad producing splits with diffs `[0, 1, 2, 3, 4, 5, 10]` and `bestDiff = 0`, the pool contains `[0, 1, 2, 3]` with band=0.095 (same as current behaviour at +3 floor).

---

## 2. Code-quality improvements

### 2.1 Collapse dual goalkeeper representation

`p.goalkeeper || p.mentality === 'goalkeeper'` appears throughout. Pick one canonical field — recommend `mentality === 'goalkeeper'` since `Mentality` is already the 4-way enum — and remove the `goalkeeper: boolean` column from `Player`, `GuestEntry`, `NewPlayerEntry` where safe. If the DB column must stay for storage reasons, derive it at the DB boundary only. Document the rule at the top of `lib/types.ts`.

### 2.2 Hoist magic numbers to named constants

Top of `lib/autoPick.ts`:
```ts
const EXHAUSTIVE_THRESHOLD = 20
const SAMPLE_SIZE = 500
const SUGGESTION_COUNT = 3
const COUNT_BALANCE_SLACK = 1 // max difference in unknown count per team
```

Top of `lib/utils.ts` (or a `lib/scoring-constants.ts` if preferred):
```ts
const WPR_PPG_WEIGHT = 0.60
const WPR_FORM_WEIGHT = 0.25
const WPR_RATING_WEIGHT = 0.15
const EWPT_AVG_WEIGHT = 0.90
const EWPT_TOP2_WEIGHT = 0.10
const STRENGTH_HINT_OFFSET = 15 // WPR points between "below" / "average" / "above"
const RUSTINESS_DAYS_THRESHOLD = 28
```

No behavioural change — just moves the knobs to one place.

### 2.3 Refactor pair-pinning with a single placement helper

The pair-pinning loop (lib/autoPick.ts:65–108) has five parallel branches for "where is the associated player?" (normal, pinned-as-A-GK, pinned-as-B-GK, already-in-pinnedTeamA, already-in-pinnedTeamB). Collapse into one helper:

```ts
function findAssocTeam(
  assocName: string,
  pinnedA: Player | null,
  pinnedB: Player | null,
  pinnedTeamA: Player[],
  pinnedTeamB: Player[],
): 'A' | 'B' | null {
  if (assocName === pinnedA?.name) return 'A'
  if (assocName === pinnedB?.name) return 'B'
  if (pinnedTeamA.some((p) => p.name === assocName)) return 'A'
  if (pinnedTeamB.some((p) => p.name === assocName)) return 'B'
  return null
}
```

Use the helper to either place the guest on the same team or fall through to normal alternation.

### 2.4 Replace `searchPool.filter(...)` in the pair loop with a Set

`searchPool = searchPool.filter(...)` inside the pair loop (lib/autoPick.ts:77, 82, 87, 92, 101) is O(n) per iteration, O(n²) overall. Collect all names to exclude in a Set, then filter once at the end of the pair phase.

### 2.5 Unify the count-balance filter guard

Currently the call site (NextMatchCard) guards on `size > 0` and the callee (`autoPick`) guards on `size >= 2`. Two places encode "when does this apply?" Pick one: always pass the set (let the filter decide internally), or guard fully at the call site. Recommend the former — `autoPick` owns its own filter semantics.

### 2.6 Add an optional seedable RNG parameter

`autoPick` uses `Math.random()` for three things: shuffling the GK pool, random-sampling splits at n>20, and shuffling the tolerance pool before picking suggestions. All three are untestable deterministically today, which is why the rating-aware test in `autoPick.test.ts` retries 20 times looking for a specific split. Accept an optional `random?: () => number` parameter on `autoPick`; production passes nothing (defaults to `Math.random`); tests pass a seeded RNG (e.g., a tiny LCG helper in `__tests__/helpers/seeded-rng.ts`).

Convert the 20-iteration retry test to a single deterministic assertion.

### 2.7 Add a synthetic player ID at the resolution boundary

`autoPick` uses `p.name` as the identity key for pair matching, count-balance, and swap dedup. Two players with identical names would silently collide. Add `playerId: string` stamped by `resolvePlayersForAutoPick` (e.g., `name + '|' + (isGuest ? 'guest' : isNew ? 'new' : 'known')`). Use `playerId` everywhere downstream; names become display-only. Low-risk but disciplined.

---

## 3. Deferred

Each of these was raised in review and explicitly deferred. Captured here so they don't get lost.

### 3.1 Recalibrate the logistic win-probability against historical results
`winProbability`'s `/ 8` scale factor is not calibrated. Requires 50+ games of post-rebalance data before it's worth fitting. Revisit once that data exists. Stored `team_a_rating` / `team_b_rating` and `winner` on the `games` table are the inputs.

### 3.2 Per-role WPRs and tactical balance
`ewptScore` treats WPR as a scalar. A team of 5 attackers could score the same as a team of 2 attackers + 2 defenders + 1 balanced. Only the (crude) variety bonus protects against this. Fixing requires per-role WPRs or structural constraints (e.g., "at least one defensive-mentality player per team"). Significant modelling work.

### 3.3 Chemistry / familiarity modelling
Two players who've often played together are likely to function better than two strangers of equal rating. Could be added as a "team cohesion" term based on historical same-team count. Non-trivial and likely limited effect.

### 3.4 Cadence-aware rustiness threshold
The 28-day rustiness window is calendar-based. A monthly league makes this too aggressive; a twice-weekly league makes it too loose. Should scale with the league's typical interval. Cheap to compute but not urgent.

### 3.5 Strength-hint resolution — 5 levels or continuous slider
Three hints with ±15 WPR jumps is coarse. A single "above" step is a 15-point swing, which can move `avgWpr` on a 6-player team by 2.5 points. Could become 5 levels (much below / below / average / above / much above) or a continuous slider with labelled anchors. UX decision.

### 3.6 GK modifier empirical tuning
Post-rebalance range is +0.5 to +2.5. Whether that matches the real impact of a good keeper in 5-a-side depends on match data. Pending the same empirical calibration pass as 3.1.

### 3.7 Top-2 bonus empirical tuning
The 10% top-2 weight was halved in the rebalance. Whether 10% is the right floor or whether it should be lower/higher depends on match data. Pending 3.1.

### 3.8 Rating-aware sampling for n > 20
The random-sample fallback at n > 20 is rating-oblivious — 500 shuffles may miss the optimum. A seeded snake-draft + local-swap refinement would be faster and better. This branch rarely (never?) fires for 5-a-side/7-a-side leagues, so low priority.

### 3.9 Remove dead `rating` field on `GuestEntry` and `NewPlayerEntry`
Both types set `rating: 2` unconditionally now. The `rating` field is no longer used for scoring (`wprOverride` takes over). Removing requires an audit of stored `LineupMetadata` JSON in the `games` table to confirm nothing downstream reads it. Deferred until that audit.

### 3.10 Noise scaling in win probability
Logistic is translation-invariant — a 5-point gap at 40/45 predicts the same win probability as at 80/85. In reality, weak-vs-weak matches are noisier. Modelling requires a score-level-dependent noise term. Out of scope without historical data.

---

## Files changed (behavioural + code-quality)

| File | Change |
|---|---|
| `lib/utils.ts` | 1.1 form denominator; 1.2 drop `avgForm` from `ewptScore`, redistribute; 1.3 exclude GK from variety; 2.1 canonical GK field; 2.2 named constants |
| `lib/autoPick.ts` | 1.4 odd-player alternation; 1.5 rename `newPlayerNames` → `unknownNames`; 1.6 win-prob-derived tolerance; 2.2 named constants; 2.3 pair-placement helper; 2.4 Set-based exclusion; 2.5 unify filter guard; 2.6 optional `random` param; 2.7 synthetic ID |
| `components/NextMatchCard.tsx` | 1.5 build `unknownNameSet` from guests + new players; 2.5 pass the set unconditionally; 2.7 stamp `playerId` in `resolvePlayersForAutoPick` |
| `lib/types.ts` | 2.1 document canonical GK field; 2.7 add `playerId?: string` to `Player` |
| `lib/__tests__/autoPick.test.ts` | 1.4, 1.5, 1.6 assertions; 2.6 deterministic rewrite of the rating-aware test |
| `lib/__tests__/utils.wpr.test.ts` | 1.1, 1.2, 1.3 recomputed hardcoded assertions |
| `lib/__tests__/helpers/seeded-rng.ts` (new) | 2.6 tiny LCG helper |

---

## Out of scope

- Changes to `winProbability` or `winCopy` other than the tolerance reframing in 1.6.
- Retroactive recalculation of stored `team_a_rating` / `team_b_rating` on past games.
- UI changes to the strength-hint selector, rating slider, or match-card display.
- DB schema changes (the `rating` removal in 3.9 is deferred for this reason).
- All items in section 3.

---

## Implementation approach

All behavioural fixes (1.1–1.6) are small, share test files, and together represent "the fairness pass." Bundle as one PR.

Code-quality items (2.1–2.7) are independent. Stage as 3 PRs:
- **PR-A**: 2.1 GK canonicalisation + 2.2 named constants (foundation — touches types + constants used everywhere)
- **PR-B**: 2.3 pair-placement helper + 2.4 Set-based exclusion + 2.5 unified filter guard (autoPick internals)
- **PR-C**: 2.6 seedable RNG + 2.7 synthetic ID (testability + identity)

Total: 4 PRs if behavioural fixes go together, or 5 if split.
