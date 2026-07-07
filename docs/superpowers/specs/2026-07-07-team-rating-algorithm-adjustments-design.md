# Team Rating Algorithm Adjustments — Design

## Context

Two adjustments to the team-building rating algorithm in `lib/utils.ts`, requested
because both mechanisms were suspected of skewing team scores in tight matches:

1. The "star player" boost in `ewptScore` gives modest extra credit to a team's
   top 2 players. This is unnecessary and can distort close team-balance
   decisions.
2. The new-player experience penalty in `wprScore` discounts a player's score
   for their first 4 games (full trust only at game 5). This window is too
   long and skews ratings for longer than needed.

Both mechanisms live entirely in `lib/utils.ts`. A repo-wide search confirmed
no UI copy, other components, or other lib files reference the specific
constants or the "5 games" / "first 4 games" framing — the change is fully
contained to `lib/utils.ts`, its tests, and its doc comments.

## Change 1: Remove star-player boost (`ewptScore`, lines 181–217)

**Current formula:**

```ts
avgWpr * EWPT_AVG_WEIGHT + top2Avg * EWPT_TOP2_WEIGHT + gkModifier + varietyBonus + depthBonus
// EWPT_AVG_WEIGHT = 0.90, EWPT_TOP2_WEIGHT = 0.10
```

**New formula:**

```ts
avgWpr + gkModifier + varietyBonus + depthBonus
```

- Delete the `EWPT_TOP2_WEIGHT` constant (line 16) and the `top2Avg`
  computation (lines 185–188).
- Delete the `EWPT_AVG_WEIGHT` constant (line 15) — `avgWpr` is used directly
  at full weight, so team-score scale is preserved rather than dropping ~10%.
- GK modifier, variety bonus, and depth bonus are unaffected.
- Update the `ewptScore` JSDoc (lines 169–180) to remove the "10%: Top-2
  average WPR" bullet.

## Change 2: Shorten new-player experience penalty (`wprScore`, lines 144–148)

**Current formula (4-game penalty window):**

```ts
if (player.played >= 1 && player.played < 5) {
  score *= 0.85 + 0.03 * (player.played - 1)
}
// played=1: 0.85, played=2: 0.88, played=3: 0.91, played=4: 0.94, played=5+: 1.0
```

**New formula (3-game penalty window, same starting severity):**

```ts
if (player.played >= 1 && player.played < 4) {
  score *= 0.85 + 0.05 * (player.played - 1)
}
// played=1: 0.85, played=2: 0.90, played=3: 0.95, played=4+: 1.0
```

- Starting discount at `played=1` is unchanged (`0.85`, 15% discount) — the
  goal is to shorten the *duration*, not change how harshly a brand-new
  player is initially discounted.
- Step size changes from `0.03` to `0.05` so the ramp reaches full weight
  (`1.0`) one game sooner (at `played=4` instead of `played=5`).
- Update the `wprScore` JSDoc (lines 97–99) to describe the 3-game,
  `0.85–0.95` ramp instead of the 4-game, `0.85–0.94` ramp.
- Rustiness penalty (lines 150–164) is unchanged and continues to stack
  multiplicatively with the experience penalty.
- `HINT_UNKNOWN_MULTIPLIER` (the `0.85` guest/unknown-strength discount in
  `hintToWpr`, lines 295–310) is unchanged. It's designed to mirror the
  game-1 experience penalty, which stays at `0.85`, so the two remain
  aligned without any edit.

## Non-goals

- `WPR_RATING_WEIGHT` / rating-prior fade (fades to zero by `played=10`) —
  a distinct mechanism from the experience penalty, not in scope.
- Rustiness penalty, GK modifier, variety bonus, depth bonus — unchanged.
- `hintToWpr` / guest rating discount — unchanged.
- No UI copy changes — no user-facing text references either mechanism's
  duration or magnitude.

## Testing

`lib/__tests__/utils.wpr.test.ts`:

- `describe('wprScore — experience penalty (played 1–4)')` → rename to
  `(played 1–3)`; update expected multipliers for `played=1/2/3`
  (`0.85/0.90/0.95`); add/adjust an assertion that `played=4` now receives
  full weight (`1.0`), which previously only applied from `played=5`.
- `ewptScore` test comments referencing `top2Avg` (around lines 369, 376,
  383, 397, 455) → rewrite expected values without the top-2 term.
- The existing "balanced squad outscores a team with one star and five weak
  teammates" test should still pass (and by a larger margin, since the
  star's extra credit is gone) — verify against the new formula rather than
  assuming.

No other test files reference these constants.
