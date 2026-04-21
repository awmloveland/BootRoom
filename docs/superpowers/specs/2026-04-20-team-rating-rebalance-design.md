# Team Rating Rebalance — Design Spec

**Date:** 2026-04-20
**Status:** Approved

---

## Problem

Auto-picked lineups have felt unbalanced in practice. Team A (which typically receives the goalkeeper) has been looking noticeably weaker than Team B in terms of outfield player quality. The root cause is that the goalkeeper modifier and standout-player bonus are over-weighted, causing the algorithm to compensate for a strong GK or a single high-scoring player by loading weaker outfield players onto the same team.

---

## Goal

Recalibrate the team rating formula so that **overall squad quality is the dominant factor**, a goalkeeper still helps but doesn't distort the lineup, and a single standout player has modest rather than outsized influence.

---

## What Changes

### `ewptScore()` in `lib/utils.ts`

The weighted breakdown of the score changes as follows:

| Component | Current | New |
|---|---|---|
| Average squad quality (all players) | 50% | 65% |
| Top-2 player average | 25% | 10% |
| Average recent form (all players) | 25% | 25% |

The GK modifier scaling changes:

| Situation | Current | New |
|---|---|---|
| One GK (great, WPR ~100) | +5 | +2.5 |
| One GK (average, WPR ~50) | +3 | +1.5 |
| One GK (weak, WPR ~0) | +1 | +0.5 |
| No GK | -3 | -1.5 |
| Two GKs | -2 | -1 |

The GK modifier formula changes from:
```
1 + (gkWpr / 100) * 4        // range [+1, +5]
```
to:
```
0.5 + (gkWpr / 100) * 2      // range [+0.5, +2.5]
```

The no-GK penalty changes from `-3` to `-1.5`.
The two-GK penalty changes from `-2` to `-1`.

**Variety bonus (+2 for 3+ mentalities) is unchanged.**
**Depth modifier is unchanged.**

---

## What Does Not Change

- The per-player WPR formula is unchanged.
- Historical `team_a_rating` / `team_b_rating` snapshots stored on past games are not recalculated. The new formula only applies to lineups saved going forward.
- The `winProbability()` and `winCopy()` functions are unchanged — they operate on whatever scores `ewptScore` produces.

---

## Tests

The following test files contain hardcoded expected values derived from the current formula weights and will need updating:

- `lib/__tests__/utils.wpr.test.ts` — hardcoded `ewptScore` assertions with exact calculated values
- `lib/__tests__/autoPick.test.ts` — no hardcoded score values, no changes needed
- `__tests__/match-card-ratings.test.ts` — no score logic here, no changes needed

Any new tests should cover:
- A team with a great GK scores meaningfully higher than an identical team with no GK, but the gap is less than 5 points.
- A team with one high-scoring player and six weak ones scores lower than a team of seven average players.

---

## Out of Scope

- Changes to the per-player WPR formula.
- Any UI changes — the rating numbers displayed on match cards and lineup share text update automatically.
- Retroactive recalculation of stored game ratings.
