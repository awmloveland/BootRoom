# Team Balance — Guest Pre-Pinning Design

**Date:** 2026-03-21
**Status:** Approved

---

## Problem

Guest players are always placed on the same team as their associated league player (hard constraint). The current implementation satisfies this constraint via a post-hoc patching step (`pinGuestsToAssociatedTeam`) that runs *after* `autoPick` has found its best balanced split. The patch swaps the guest with the last player in the target team — an arbitrary choice that ignores balance — undoing the work `autoPick` already did. This results in noticeably unbalanced lineups whenever guests are present.

A secondary UX issue: the "Plays with" dropdown in `AddPlayerModal` only lists players who are currently marked as attending, making it impossible to associate a guest with a player who hasn't been selected yet.

---

## Goals

1. `autoPick` produces the most balanced split possible **within** the hard guest-pairing constraint, rather than finding an unconstrained optimum and then breaking it.
2. The "Plays with" dropdown shows the full league roster.

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

1. **GK pinning** (unchanged) — one GK pinned to each team when ≥2 GKs exist.
2. **Pair pinning** (new) — for each `[guestName, associatedPlayerName]` pair where both names are present in the player list:
   - If either player was already consumed by GK pinning, skip the pair constraint for that player (the GK pin takes priority; the guest is left in the free pool).
   - Otherwise, assign both players to the same pre-pinned team, alternating A/B across pairs to avoid stacking all pairs on one side.
   - Remove both from the search pool.
3. **Free pool search** — `combinations` / random-sampling runs on the remaining players as today.

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
- No change to the suggestions UX or save flow.

### `AddPlayerModal` change

- The "Plays with" `<select>` switches from the `players` prop (attending only) to `allLeaguePlayers` (full roster). The `allLeaguePlayers` prop already exists on the component.
- The existing warning ("isn't in the current lineup") stays, now correctly firing when a non-attending player is selected from the full list.

---

## Files Changed

| File | Nature of change |
|---|---|
| `lib/autoPick.ts` | Add `pairs` param; pre-pin pairs after GK pinning; remove pairs from search pool |
| `components/NextMatchCard.tsx` | Build `pairs` from `guestEntries`; pass to `autoPick`; delete `pinGuestsToAssociatedTeam` |
| `components/AddPlayerModal.tsx` | Swap dropdown source from `players` to `allLeaguePlayers` |

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Associated player not attending | Pair is not formed; guest goes into free pool and is distributed by balance alone |
| Guest's associated player is a pinned GK | GK pin takes priority; guest goes into free pool |
| Two guests share the same associated player | Both guests are pre-pinned to the same team as the associated player |
| No guests | `pairs` is empty / undefined; behaviour identical to today |
| New players (no associated player) | Unaffected — distributed freely as today |

---

## Testing

- Unit test `autoPick` with a simple squad containing one (guest, associated) pair; assert both appear on the same team in all returned suggestions.
- Test with zero pairs to confirm no regression.
- Test with a GK who is also an associated player to confirm GK pin takes priority.
- Manual: add a guest in the UI, run auto-pick, verify guest and associated player land on the same team.
- Manual: verify "Plays with" dropdown shows the full league roster.
