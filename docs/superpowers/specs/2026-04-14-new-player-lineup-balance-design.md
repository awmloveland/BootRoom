# New Player Lineup Balance — Design Spec
_Date: 2026-04-14_

## Problem

When new players or guests are added to a game and rated via the eye-test slider (defaulting to the league average rating of 2), the resulting lineups are systematically unbalanced. Recent games with new players have seen 6-goal margins of victory. Two compounding causes:

1. **Inaccurate default rating** — admins default to rating 2 (league average) without meaningful guidance. First-time players almost never perform at league average due to lack of familiarity with the format, tempo, and other players.
2. **Clustering of unknowns** — with no pinning logic for new players, `autoPick` can place multiple unknowns on the same team, creating a side with no chemistry or positional understanding.

---

## Goals

- New players and guests receive a scoring default that represents a true league-average unknown, not a guess anchored to a coarse 1–3 slider.
- Admins retain the ability to override when they have prior knowledge of a player's ability.
- When multiple new players attend, they are spread across both teams.
- Guest pairing (guests follow their associated player) is unchanged.

---

## Design

### 1. WPR override field on Player

Add `wprOverride?: number` to the `Player` interface in `lib/types.ts`.

In `wprScore` (`lib/utils.ts`), if `player.wprOverride !== undefined`, return it directly without computing from stats. This is the only change to the scoring logic.

```ts
// lib/types.ts
export interface Player {
  // ...existing fields...
  wprOverride?: number  // if set, wprScore returns this directly
}
```

```ts
// lib/utils.ts — top of wprScore
export function wprScore(player: Player): number {
  if (player.wprOverride !== undefined) return player.wprOverride
  // ...existing computation...
}
```

### 2. League median WPR computation

In `resolvePlayersForAutoPick` (`components/NextMatchCard.tsx`), compute the **median WPR** of all `allPlayers` with `played >= 5` before resolving names. Assign this value as `wprOverride` for every new player and guest.

```ts
function leagueMedianWpr(players: Player[]): number {
  const qualified = players.filter((p) => p.played >= 5)
  if (qualified.length < 3) return 50  // fallback for very new leagues
  const scores = qualified.map((p) => wprScore(p)).sort((a, b) => a - b)
  const mid = Math.floor(scores.length / 2)
  return scores.length % 2 === 0
    ? (scores[mid - 1] + scores[mid]) / 2
    : scores[mid]
}
```

The median (not mean) is used to avoid skew from outlier star players pulling the average up.

### 3. Override selector on GuestEntry and NewPlayerEntry

Replace the `rating` field as the primary scoring input with a `strengthHint` field on both entry types:

```ts
// lib/types.ts
export type StrengthHint = 'below' | 'average' | 'above'

export interface GuestEntry {
  type: 'guest'
  name: string
  associatedPlayer: string
  rating: number           // kept for DB backwards compat, no longer drives scoring
  goalkeeper?: boolean
  strengthHint: StrengthHint  // new — drives wprOverride
}

export interface NewPlayerEntry {
  type: 'new_player'
  name: string
  rating: number           // kept for DB backwards compat
  mentality: Mentality
  goalkeeper?: boolean
  strengthHint: StrengthHint  // new — drives wprOverride
}
```

`strengthHint` maps to `wprOverride` at resolution time:

| strengthHint | wprOverride |
|---|---|
| `'below'` | median − 15 |
| `'average'` | median |
| `'above'` | median + 15 |

The ±15 offset represents roughly the gap between a mid-table and top/bottom-third player in a typical league. `wprOverride` is clamped to [0, 100].

### 4. AddPlayerModal UI change

Remove `EyeTestSlider` from both the guest and new player sub-flows. Replace with a three-way selector component:

```
[ Below average ]  [ Average ← default ]  [ Above average ]
```

- **Average** is selected by default, no admin action needed for most cases.
- Labels use plain language, no numeric scale.
- The `avgRating` prop on `AddPlayerModal` is removed since it only existed to seed the slider default.
- `rating` on the entry is set to a fixed value of `2` for DB compatibility (the field is no longer meaningful for scoring).

### 5. New player team distribution in autoPick

Extend `autoPick` in `lib/autoPick.ts` with two new optional parameters:

```ts
export function autoPick(
  players: Player[],
  pairs?: Array<[string, string]>,
  newPlayerPinsA?: string[],   // new — names to pin to Team A
  newPlayerPinsB?: string[],   // new — names to pin to Team B
): AutoPickResult
```

Inside `autoPick`, resolve `newPlayerPinsA` and `newPlayerPinsB` names from the pool and prepend them to `pinnedTeamA` / `pinnedTeamB` respectively, before the search runs.

In `NextMatchCard.tsx`, before calling `autoPick`, alternate-pin new players:

```ts
const newPlayerNames = newPlayerEntries.map((p) => p.name)
const newPlayerPinsA = newPlayerNames.filter((_, i) => i % 2 === 0)
const newPlayerPinsB = newPlayerNames.filter((_, i) => i % 2 === 1)
// Only pass pins when there are 2+ new players
const pinsA = newPlayerNames.length >= 2 ? newPlayerPinsA : undefined
const pinsB = newPlayerNames.length >= 2 ? newPlayerPinsB : undefined
```

With only 1 new player, no pinning is applied — they're distributed freely.

Guest pairing is untouched. If a guest's associated player happens to be pinned to Team A via new player alternation, the existing pair logic resolves correctly.

**Backwards compatibility:** Existing lineup metadata saved before this change will not have `strengthHint` on entries. When loading saved metadata in `NextMatchCard.tsx`, any entry missing `strengthHint` defaults to `'average'`.

---

## Files Changed

| File | Change |
|---|---|
| `lib/types.ts` | Add `wprOverride` to `Player`; add `StrengthHint` type; add `strengthHint` to `GuestEntry` and `NewPlayerEntry` |
| `lib/utils.ts` | Short-circuit `wprScore` when `wprOverride` is set |
| `components/NextMatchCard.tsx` | Add `leagueMedianWpr()`; update `resolvePlayersForAutoPick` to inject `wprOverride`; compute new player alternating pins before `autoPick` call |
| `lib/autoPick.ts` | Add `newPlayerPinsA` / `newPlayerPinsB` parameters; resolve and prepend to `pinnedTeamA` / `pinnedTeamB` |
| `components/AddPlayerModal.tsx` | Replace `EyeTestSlider` with three-way strength selector for both guest and new player flows; remove `avgRating` prop from component interface |
| `lib/__tests__/autoPick.test.ts` | Add tests for new player alternating distribution |
| `lib/__tests__/utils.wpr.test.ts` | Add test for `wprOverride` short-circuit |

---

## Out of Scope

- Post-game rating accuracy tracking (possible future improvement)
- Changing how guests are paired to their associated player
- Any changes to the `ewptScore` team scoring function
- Any changes to how existing roster players are scored
