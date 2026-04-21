# New Player AutoPick Balance Fix — Design Spec
_Date: 2026-04-20_

## Problem

The alternating-pin approach for new players (introduced in the 2026-04-14 spec, section 5) distributes unknowns by index rather than by rating. Two issues compound:

1. **Odd counts** — with e.g. 5 new players, Team A gets 3 and Team B gets 2. Since all pins are resolved before `autoPick` runs, the algorithm cannot compensate. The imbalance is locked in.

2. **Ignoring strength hints** — new players now carry a `wprOverride` based on their `strengthHint` (above/average/below). Index-order pinning ignores these ratings, preventing the algorithm from placing them optimally.

The result: games with several new players produce wider team spreads than games run through LineupLab, which is unconstrained.

---

## Goals

- New players enter the free search pool alongside rated players so `autoPick` can distribute them based on their `wprOverride`.
- A count-balance filter guarantees unknowns are never clustered: no split is accepted where the new-player count on one team exceeds the other by more than 1.
- If no split satisfies the count filter, fall back to the best overall split (no filter dropped).
- Guest pairing is unchanged.
- The `autoPick` interface change is backwards-compatible for callers (LineupLab) that already pass no pins.

---

## Design

### 1. `autoPick()` signature change (`lib/autoPick.ts`)

Remove `newPlayerPinsA?: string[]` and `newPlayerPinsB?: string[]`. Replace with:

```ts
export function autoPick(
  players: Player[],
  pairs?: Array<[string, string]>,
  newPlayerNames?: Set<string>,   // used for count-balance filter only — not pinning
): AutoPickResult
```

Remove the new-player pinning loop (currently lines 64–77). New players enter `searchPool` as free agents.

### 2. Count-balance post-filter (`lib/autoPick.ts`)

After the split generation phase (exhaustive or sampled), filter candidate splits before scoring:

```ts
function isCountBalanced(teamA: Player[], teamB: Player[], newNames: Set<string>): boolean {
  const countA = teamA.filter((p) => newNames.has(p.name)).length
  const countB = teamB.filter((p) => newNames.has(p.name)).length
  return Math.abs(countA - countB) <= 1
}
```

Apply this filter when `newPlayerNames` is non-empty and has size ≥ 2. If the filtered set is empty (all splits violate the count constraint), skip the filter and use the full set — this prevents returning zero suggestions.

### 3. `NextMatchCard.tsx` call-site change

Remove:
```ts
const pinsA = newPlayerNames.length >= 2 ? newPlayerNames.filter((_, i) => i % 2 === 0) : undefined
const pinsB = newPlayerNames.length >= 2 ? newPlayerNames.filter((_, i) => i % 2 === 1) : undefined
```

Replace with:
```ts
const newPlayerNameSet = new Set(newPlayerEntries.map((p) => p.name))
```

Update the `autoPick` call:
```ts
// before
const result = autoPick(resolved, pairs, pinsA, pinsB)

// after
const result = autoPick(resolved, pairs, newPlayerNameSet.size > 0 ? newPlayerNameSet : undefined)
```

---

## Files Changed

| File | Change |
|---|---|
| `lib/autoPick.ts` | Remove `newPlayerPinsA`/`newPlayerPinsB` params; remove pin loop; add `newPlayerNames` param; add count-balance filter with fallback |
| `components/NextMatchCard.tsx` | Remove alternating-pin computation; build `newPlayerNameSet`; update `autoPick` call |
| `lib/__tests__/autoPick.test.ts` | Update tests that passed pin arrays; add tests for count-balance filter (even count, odd count, all-same-hint fallback) |

---

## Out of Scope

- Changes to `ewptScore` or `wprScore`
- Changes to `strengthHint` UI or `wprOverride` computation
- Changes to LineupLab (already passes no pins; no change needed)
- Guest pair logic
