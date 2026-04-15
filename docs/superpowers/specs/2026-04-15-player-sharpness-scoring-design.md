# Player Sharpness & Scoring Quality — Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Branch:** awmloveland/new-player-lineup-balance (extends existing work)

---

## Overview

Extends the WPR and EWPT scoring models with four improvements that make team
balance more accurate by accounting for player experience, recent activity,
goalkeeper quality, and league skill spread.

No UI changes. All changes are in the scoring layer (`lib/utils.ts`,
`lib/types.ts`) and the player resolution step in `NextMatchCard.tsx`.

---

## Section 1 — Experience penalty

### Problem
Players with 1–4 games played have a thin statistical record. Their WPR is
computed from limited data and doesn't reflect the fact that they're still
learning how the league plays. A player who's attended 2 games is treated
identically to one with 20 games by the scoring model.

### Change
Apply a graduated multiplier inside `wprScore` when `played >= 1 && played < 5`:

| Games played | Multiplier | WPR effect on a score of 50 |
|---|---|---|
| 1 | 0.85 | → 42.5 |
| 2 | 0.88 | → 44.0 |
| 3 | 0.91 | → 45.5 |
| 4 | 0.94 | → 47.0 |
| 5+ | 1.00 | → no change |

Formula: `multiplier = 0.85 + 0.03 * (played - 1)`

### Scope exclusions
- Players with `played = 0` (new players / guests) are excluded. They already
  receive a `wprOverride` set to the league median. Applying an additional
  penalty would conflict with the deliberate "treat as average until we know
  more" decision.
- The multiplier is applied **after** any `wprOverride` short-circuit is
  skipped — i.e., only for DB players with a partial record.

---

## Section 2 — Rustiness penalty

### Problem
A player who hasn't played recently underperforms their historical stats.
Two patterns need to be caught:

1. **Extended absence** — not played in >28 days (4 weeks)
2. **Intermittent attendance** — shows up occasionally but is not in a regular
   rhythm; their `recentForm` has fewer than 2 actual game results (W/D/L)
   in the last 5 slots

### Data change
`Player` gains a new optional field:

```ts
lastPlayedWeekDate?: string  // 'DD MMM YYYY' — date of most recent played week
```

Derived in `NextMatchCard` (or equivalent resolution site) by scanning
`allWeeks` for `status === 'played'` weeks where the player appears in
`teamA` or `teamB`. The most recent matching week's `date` is assigned.
Players with no played history have it `undefined` — the rustiness check is
skipped for them.

### Penalty
Either condition triggers the penalty independently:

- `lastPlayedWeekDate` is >28 days before `referenceDate`, **or**
- `recentForm.split('').filter(c => c !== '-').length < 2`

Penalty: multiply WPR by **0.88** (12% reduction).

`wprScore` gains an optional second parameter `referenceDate?: Date` (defaults
to `new Date()` when omitted). This keeps the function testable — tests pass a
fixed date; production callers omit it.

### Examples
| recentForm | Absent days | Penalty? | Reason |
|---|---|---|---|
| `----W` | 35 | Yes | Both conditions: absent >28d and only 1 game in last 5 |
| `--W--` | 21 | Yes | <2 games in last 5 (only 1), even though not >28d |
| `W--L-` | 14 | No | 2 games in last 5, <28d absent |
| `WWDLW` | 7 | No | Regular attender |

---

## Section 3 — Goalkeeper quality weighting

### Problem
`ewptScore` applies a flat `+3` for having exactly one GK, regardless of
whether they're the league's best or worst player. In 5-a-side, the GK is
disproportionately impactful — a strong GK is worth significantly more than
a weak one.

### Change
Replace the flat `+3` with a quality-scaled modifier based on the GK's
`wprScore`:

```
gkModifier = 1 + (gkWpr / 100) * 4
```

| GK WPR | Modifier |
|---|---|
| 0 (very weak) | +1.0 |
| 25 | +2.0 |
| 50 (average) | +3.0 ← same as today |
| 75 | +4.0 |
| 100 (exceptional) | +5.0 |

The "no GK" penalty (`-3`) and "two GKs" penalty (`-2`) are unchanged —
these are structural issues unrelated to quality.

### New/guest GKs
New players and guests assigned as goalkeeper have `wprOverride` set to the
league median. Their `wprScore` returns the median (~50), giving a modifier
of ~`+3` — the neutral default. No special case needed.

---

## Section 4 — Dynamic strength hint offsets

### Problem
The "above average" and "below average" strength hints for new players and
guests apply a fixed `±15` WPR offset from the league median. This is
arbitrary and doesn't reflect the actual skill spread in the league:
- In a tight, competitive league, ±15 is too aggressive.
- In a wide-skill league, ±15 may be too conservative.

### Change
Replace the fixed `±15` with percentile-based values from the qualified
player pool (5+ games played):

| Hint | Value |
|---|---|
| `above` | 75th percentile WPR of qualified players |
| `average` | 50th percentile (median) — unchanged |
| `below` | 25th percentile WPR of qualified players |

A new `leagueWprPercentiles` function in `lib/utils.ts` computes all three
values from the same sorted WPR array that `leagueMedianWpr` already builds:

```ts
interface WprPercentiles {
  p25: number  // "below average"
  p50: number  // "average" / median
  p75: number  // "above average"
}

function leagueWprPercentiles(players: Player[]): WprPercentiles
```

`resolvePlayersForAutoPick` calls this once and uses `p25`/`p50`/`p75` to
resolve `strengthHint → wprOverride` for each new player and guest.

### Fallback
Fewer than 3 qualified players (very new league): return `{ p25: 40, p50: 50, p75: 60 }`.

### UI
The AddPlayerModal strength selector labels ("Below average / Average / Above
average") are unchanged. This is a behind-the-scenes calibration.

---

## Files changed

| File | Change |
|---|---|
| `lib/types.ts` | Add `lastPlayedWeekDate?: string` to `Player` |
| `lib/utils.ts` | Modify `wprScore` (experience + rustiness multipliers); modify `ewptScore` (GK quality formula); add `leagueWprPercentiles` |
| `components/NextMatchCard.tsx` | Derive `lastPlayedWeekDate` for each player before auto-pick; call `leagueWprPercentiles` instead of `leagueMedianWpr` for strength hints |
| `lib/__tests__/utils.wpr.test.ts` | Tests for experience multiplier, rustiness penalty, GK quality modifier, percentile function |

---

## Out of scope

- Team/pair chemistry scoring — deferred; signal too noisy at current data volumes
- UI indicators for "rusty" or "inexperienced" players — informational display
  deferred; this spec addresses only the scoring impact
- Changes to how players are distributed across teams — covered by the prior
  new-player-lineup-balance spec
