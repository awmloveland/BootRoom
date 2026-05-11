# Guest Rating Discount & Pair-Pinning Coin Flip — Design Spec
_Date: 2026-05-11_

## Problem

When a guest (+1) is included in a 7v7 lineup, the team containing the guest consistently looks weaker to the eye across all 5 surfaced auto-pick suggestions, even though the EWTPI score difference is small.

Two interacting causes:

1. **Guest WPR over-stated.** `hintToWpr` (`components/NextMatchCard.tsx:79–83`) maps the "Average" strength hint to the league's `p50` — the median WPR of *qualified, fully-penalised* regulars. `wprScore` then short-circuits at line 111 because `wprOverride` is set, so the guest bypasses the experience penalty (× 0.85 for `played === 1`) and rustiness penalty (× 0.88) that any real low-history or absent player would receive. In effect, an "Average" guest is rated as a *seasoned, in-form, median regular* — the most generous reading of "average."

2. **Pair pin always lands on Team A.** `autoPick.ts:109` initialises `pairTeamToggle = true`, so the first guest+associated pair is unconditionally pushed onto Team A. Combined with the GK pin (one GK each team), this means Team A gets 3 pinned players (GK + Lloyd + guest) while Team B gets 1 (the other GK). The team composition is identical regardless of label, but the "Team A" column always carries the pair across every game.

Result: the optimizer thinks the split is balanced (small EWTPI diff) because it correctly compensates for the guest's true contribution — but the guest is *not* contributing what the algorithm assumes, and the labelling bias makes the asymmetry visible across games.

---

## Goals

- An "Average" guest is rated more conservatively, reflecting that the hint usually means "I don't know" rather than "I am confident this player is median."
- "Below" and "Above" hints retain more of their nominal value (they convey real, if uncertain, information).
- The team containing the +1 pair is labelled "Team A" or "Team B" with equal probability across games, removing the persistent Team A labelling bias.
- No UI changes, no DB changes, no API changes.
- Both guests and new players share the rating-discount fix (they share `hintToWpr`).
- The `autoPick` interface is unchanged.

---

## Design

### 1. Rating discount in `hintToWpr` (`components/NextMatchCard.tsx:79–83`)

Apply a multiplier to the percentile lookup, matching the existing experience-penalty curve used for real players in `wprScore`:

```ts
const HINT_UNKNOWN_MULTIPLIER = 0.85  // "Average" — treated as "no info"
const HINT_EXPLICIT_MULTIPLIER = 0.92 // "Below" / "Above" — explicit but uncertain

function hintToWpr(hint: StrengthHint | undefined): number {
  if (hint === 'above') return Math.min(100, percentiles.p75) * HINT_EXPLICIT_MULTIPLIER
  if (hint === 'below') return Math.max(0, percentiles.p25) * HINT_EXPLICIT_MULTIPLIER
  return percentiles.p50 * HINT_UNKNOWN_MULTIPLIER
}
```

Calibration rationale:
- `0.85` matches the `played === 1` experience-penalty multiplier in `wprScore` (`lib/utils.ts:144`). An unknown guest with no hint is treated as a brand-new league member with one game on record.
- `0.92` is mid-way between the 1-game (`0.85`) and 5-game (`1.0`) multipliers — an explicit "Below"/"Above" carries roughly the same evidentiary weight as 3 games of observed play.

Constants live alongside the function in `NextMatchCard.tsx`. They are not exported (no other caller needs them).

The clamp expressions (`Math.min(100, …)` and `Math.max(0, …)`) are applied to the raw percentile *before* multiplication — multiplication can only move toward zero, so a clamped p75 multiplied by 0.92 cannot exceed 92, and the 0–100 invariant holds.

This change affects:
- Guests resolved at `NextMatchCard.tsx:100` (via `hintToWpr(guest.strengthHint)`).
- New players resolved at `NextMatchCard.tsx:115` (via `hintToWpr(newPlayer.strengthHint)`).

It does not affect resolved roster players (they bypass `hintToWpr` entirely on line 87) or the `unknown|` fallback branch (no `wprOverride` set).

### 2. Randomise initial pair toggle (`lib/autoPick.ts:109`)

Replace:

```ts
let pairTeamToggle = true
```

with:

```ts
let pairTeamToggle = rng() < 0.5
```

`rng` is the function already destructured at line 73 (defaults to `Math.random`, overridable in tests). The change preserves the alternating behaviour for multiple pairs (toggle still flips with each new pair-pin) — it only randomises the starting team.

This sits naturally alongside the existing GK shuffle (line 100) and the odd-squad slot randomisation (line 156): every structural pinning decision now uses `rng`.

### 3. Tests

**`hintToWpr` (new — extract for testing or test indirectly via `resolvePlayersForAutoPick`)**

Three new test cases:
- "Average" hint → `percentiles.p50 * 0.85`.
- "Above" hint → `Math.min(100, percentiles.p75) * 0.92`.
- "Below" hint → `Math.max(0, percentiles.p25) * 0.92`.

If `hintToWpr` remains a closure inside `resolvePlayersForAutoPick`, test indirectly: construct fixture `allPlayers` with a known WPR distribution, build a guest with each hint, assert the resulting `wprOverride`.

**`autoPick` pair toggle**

Update any existing test that asserted "first pair pinned to Team A." Two new tests using a seeded RNG:
- RNG returns `0.0` (heads → A): pair lands on Team A.
- RNG returns `0.9` (tails → B): pair lands on Team B.

A third test confirms the alternation still works: with `rng() = 0.9` as initial (toggle = false, so first pair to B) and two guest pairs, the second pair lands on A.

**Regression coverage**

Add one end-to-end test in `autoPick` that mirrors the user's scenario:
- 14 players (2 GKs, 12 outfielders), one guest paired with a mid-rated regular, "Average" hint.
- With the rating discount applied, assert that across the surfaced suggestions, the pair's team has a higher mean WPR among its 5 free slots than the other team — confirming the optimizer is compensating for the discounted guest.

---

## Out of scope

- Adding an "Unknown" / "Don't know" option to the strength selector (rejected in favour of silent recalibration of "Average").
- Changing EWTPI weights (top-2 weighting, GK modifier, depth bonus) — those are not implicated.
- Persisting guest ratings or evolving them from match results.
- Tuning the `0.85` / `0.92` constants based on production data — these are starting values; revisit if user reports of unfair splits persist.

---

## Acceptance criteria

1. A guest entered with the default "Average" hint has a `wprOverride` strictly lower than the league's median qualified WPR.
2. A guest entered with "Above" or "Below" has a `wprOverride` lower than the corresponding raw percentile but higher than the "Average" value.
3. Across 100 simulated runs of `autoPick` with one guest pair and a deterministic but varying `rng` seed, the pair lands on Team A approximately 50% of the time.
4. All existing `autoPick` and `NextMatchCard` tests continue to pass after the toggle-related assertions are updated.
