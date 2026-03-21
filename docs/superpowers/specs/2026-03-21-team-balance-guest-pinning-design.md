# Team Balance — Guest Pre-Pinning Design

**Date:** 2026-03-21
**Status:** In Review

---

## Problem

Guest players are always placed on the same team as their associated league player (hard constraint). The current implementation satisfies this constraint via a post-hoc patching step (`pinGuestsToAssociatedTeam`) that runs *after* `autoPick` has found its best balanced split. The patch swaps the guest with the last player in the target team — an arbitrary choice that ignores balance — undoing the work `autoPick` already did. This results in noticeably unbalanced lineups whenever guests are present.

A secondary correctness issue: `pinGuestsToAssociatedTeam` is only applied to `suggestions[0]`. Suggestions 1 and 2 are returned to the UI without guest constraints applied, meaning they are silently broken when guests are present.

A secondary UX issue: the "Plays with" dropdown in `AddPlayerModal` only lists players who are currently marked as attending, making it impossible to associate a guest with a player who hasn't been selected yet.

---

## Goals

1. `autoPick` produces the most balanced split possible **within** the hard guest-pairing constraint, rather than finding an unconstrained optimum and then breaking it.
2. All returned suggestions satisfy the guest constraint (not just suggestion 0).
3. The "Plays with" dropdown shows the full league roster.

---

## Non-Goals

- Making the guest-pairing constraint soft/optional.
- Changing how new players (no associated player) are distributed.
- Any DB schema, API, or type changes.

---

## Design

### Core principle

Treat each (guest, associatedPlayer) pair as an atomic pre-pinned unit, exactly like the existing GK pinning. The combination search runs only over the remaining free players, so it finds the globally best balance *given* the constraints — rather than patching a balance-blind result afterwards.

### Pinning order in `autoPick`

1. **GK pinning** (unchanged except guest exclusion) — one GK pinned to each team when ≥2 GKs exist. **Guests are excluded from the GK candidate pool entirely**, even if `goalkeeper: true`. A guest's team placement is governed by pair pinning (step 2); admitting them to the GK shuffle would create a conflict between the two pinning steps. A guest who is a GK will still be flagged as a goalkeeper in the scoring (their `goalkeeper` field is passed through to `ewptScore` as-is), but they will not be used to fill a pinned GK slot.
2. **Pair pinning** (new) — iterate through `pairs`. For each `[guestName, associatedPlayerName]`:

   a. Look up both names in a `pinnedSide` map (tracks which team each already-pinned player belongs to).

   b. **Associated player already pinned** (as GK or by a previous pair): pin the guest to the same side as the associated player. Remove the guest from the free pool. The alternation counter does **not** increment (no new side decision was made).

   c. **Neither player pinned yet**: assign both to side A or B by toggling the alternation counter (starts at A). Pin both, remove both from the free pool. Increment the alternation counter.

   d. **Associated player not in squad**: skip. Neither player is pinned; the guest remains in the free pool.

   e. **Guest not in player list** (shouldn't happen in practice): skip.

3. **sizeA recalculation** — after all pinning, compute:
   ```
   playersOnA = count of players pinned to Team A (GK + pair pins)
   sizeA = Math.ceil(n / 2) - playersOnA
   sizeA = Math.max(0, Math.min(freePool.length, sizeA))   // clamp for safety
   ```
   The clamp handles pathological cases (e.g. so many guests that one side is over-full from pinning alone). In practice with 5–7-a-side squads this is unreachable.

4. **Free pool search** — `combinations` / random-sampling runs on the free pool using `sizeA` as today.

5. **Reconstruct teams** — prepend pinned players to their respective teams before scoring, as today for GKs.

### Handling multiple guests per associated player

`pairs` is `Array<[guestName, associatedPlayerName]>`. Two guests both associated with the same player produce two entries, e.g. `[["Alice +1", "Alice"], ["Alice +2", "Alice"]]`.

When processing `["Alice +1", "Alice"]`: Alice is not yet pinned → both are pinned to (say) Team A; alternation counter increments.

When processing `["Alice +2", "Alice"]`: Alice is already in `pinnedSide` as Team A → Alice +2 is pinned to Team A. Alternation counter does **not** increment.

Result: all three players (Alice, Alice +1, Alice +2) end up on Team A. This is correct.

### `autoPick` signature change

```ts
export function autoPick(
  players: Player[],
  pairs?: Array<[string, string]>,  // [guestName, associatedPlayerName][]
): AutoPickResult
```

`pairs` is optional — callers that don't pass it get identical behaviour to today.

### `NextMatchCard` changes

- `handleAutoPick` builds `pairs` from `guestEntries` and passes them to `autoPick`.
- `pinGuestsToAssociatedTeam` function is deleted entirely.
- All three returned suggestions now satisfy the guest constraint by construction.

### `AddPlayerModal` changes

- The "Plays with" `<select>` switches from the `players` prop (attending only) to `allLeaguePlayers` (full roster). The `allLeaguePlayers` prop already exists on the component.
- The existing warning fires when a non-attending player is selected. Its copy must be updated to reflect the new behaviour — the old text says "can't be pinned to a team", which referred to the deleted post-hoc step. New copy: *"[player] isn't in the current lineup. The guest will be distributed freely by balance until [player] is also added."*

---

## Files Changed

| File | Nature of change |
|---|---|
| `lib/autoPick.ts` | Add `pairs` param; pre-pin pairs after GK pinning; recompute `sizeA`; remove pairs from search pool |
| `components/NextMatchCard.tsx` | Build `pairs` from `guestEntries`; pass to `autoPick`; delete `pinGuestsToAssociatedTeam` |
| `components/AddPlayerModal.tsx` | Swap dropdown source from `players` to `allLeaguePlayers`; update warning copy |

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Associated player not attending | Pair is not formed; guest stays in free pool and is distributed by balance alone |
| Guest's associated player is a pinned GK | GK pin takes priority; guest is then pinned to the same side as the GK (follows them) |
| Two guests share the same associated player | Both guests end up pinned to the same team as the associated player (three players total, all same side) |
| No guests | `pairs` is empty / undefined; behaviour identical to today |
| New players (no associated player) | Unaffected — distributed freely as today |
| Extreme pinning causes over-full team | `sizeA` is clamped; free pool distributes remaining players as evenly as possible |

---

## Testing

- Unit test `autoPick` with a simple squad containing one (guest, associated) pair; assert both appear on the same team in **all** returned suggestions (not just suggestion 0 — verifying the regression from the old post-hoc approach is fixed).
- Unit test with two guests sharing the same associated player; assert all three are on the same team.
- Unit test with zero pairs to confirm no regression in the unconstrained case.
- Unit test with a GK who is also an associated player; assert GK pin takes priority and guest is pinned to the same side as the GK.
- Unit test where the guest themselves has `goalkeeper: true`; assert the guest is excluded from the GK pinning step, placed via pair pinning, and the `goalkeeper` flag is still reflected in their player object for scoring.
- Manual: add a guest in the UI, run auto-pick, verify guest and associated player land on the same team.
- Manual: verify "Plays with" dropdown shows the full league roster.
- Manual: select a non-attending player from the dropdown and verify the updated warning copy appears.
