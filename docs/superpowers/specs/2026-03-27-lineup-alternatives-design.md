# Lineup Alternatives — Design Spec

**Date:** 2026-03-27
**Scope:** Next Match Card only (`components/NextMatchCard.tsx` + `lib/autoPick.ts`)

---

## Problem

After running Auto-Pick, the admin sees only the single best suggestion. The algorithm already generates up to 3 balanced lineups, but there is no way to browse them. Additionally, "alternative" lineups were previously permitted to be team-swaps — identical player groupings with Team A and Team B labels flipped — which made the alternatives feel redundant.

---

## Changes

### 1. Swap-deduplication in `lib/autoPick.ts`

**Where:** Inside the suggestion collection loop, before a candidate is added to the pool.

**How:** Produce a canonical key for each candidate:
1. Sort each team's player names alphabetically.
2. Sort the two sorted arrays lexicographically to remove label order.
3. Join into a single string key.

If that key already exists in the collected set, discard the candidate.

This guarantees that `{A=[x,y,z], B=[a,b,c]}` and `{A=[a,b,c], B=[x,y,z]}` are treated as the same lineup and only one is kept. No changes to the `AutoPickResult` or `AutoPickSuggestion` interfaces.

### 2. `suggestionIndex` state in `NextMatchCard.tsx`

Add a single new piece of state:

```ts
const [suggestionIndex, setSuggestionIndex] = useState(0)
```

**On auto-pick:** Reset `suggestionIndex` to `0` alongside setting `autoPickResult`.

**On "Try another" click:**
```ts
const next = (suggestionIndex + 1) % autoPickResult.suggestions.length
setSuggestionIndex(next)
setLocalTeamA(autoPickResult.suggestions[next].teamA)
setLocalTeamB(autoPickResult.suggestions[next].teamB)
```

`localTeamA` / `localTeamB` continue to own the displayed lineup, so manual drag edits after cycling are unaffected.

### 3. "Try another" button

**Renders when:** `isAutoPickMode && autoPickResult.suggestions.length > 1`

**Position:** In the existing action button row, between the Re-pick button and the Save Lineup button.

**Label:** `Try another (N/M)` where N = `suggestionIndex + 1`, M = `autoPickResult.suggestions.length`.

**Styling:** Identical to the existing Re-pick button — ghost/outline style, same size and padding. No layout changes to anything else in the card.

---

## What does not change

- The `AutoPickResult` and `AutoPickSuggestion` interfaces are unchanged.
- The algorithm's scoring, GK pinning, and pair-pinning logic are unchanged.
- The balance bar, team display, drag-and-drop, and all other card states are unchanged.
- The `LineupLab` component is out of scope.

---

## Test considerations

- `autoPick.test.ts`: add a case confirming that a pure team-swap is not returned as a second suggestion when the squad only admits one unique split.
- Manual: verify "Try another" only appears when there are 2+ distinct suggestions; verify the counter increments and wraps correctly; verify drag edits after cycling are not lost on the next cycle (they should be — cycling overwrites local state, which is expected and fine).
