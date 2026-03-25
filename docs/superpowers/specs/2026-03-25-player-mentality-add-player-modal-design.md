# Player Mentality Field in Add Player Modal

**Date:** 2026-03-25
**Status:** Approved

---

## Overview

Add a mentality segmented control (GK / DEF / BAL / ATT) to the `new_player` step of `AddPlayerModal`. The existing "Dedicated Goalkeeper" toggle is removed — selecting GK in the mentality control carries the same meaning. All other fields remain unchanged.

---

## Background

The `Mentality` type (`goalkeeper | defensive | balanced | attacking`) and a `MentalityControl` segmented component already exist in `PlayerRosterPanel.tsx`. Admins can currently set mentality per player in Settings → Players. However, when a new player is added via the modal during match setup, mentality defaults silently to `balanced` — there is no way to set it at creation time. This change surfaces mentality at the point of creation so it is set intentionally from day one.

---

## What Changes

### `components/AddPlayerModal.tsx`

**Add:**
- A `newMentality` state variable (`Mentality`), defaulting to `'balanced'`
- A mentality segmented control rendered in the `new_player` step, between the Eye Test field and the footer buttons
- A hint line below the control: `"GK = dedicated goalkeeper, plays in goal every game."`
- `newMentality` passed into the `handleAddNewPlayer` submit call

**Remove:**
- The `newPlayerIsGoalkeeper` state variable
- The "Dedicated goalkeeper" toggle row in the `new_player` step
- The `goalkeeper` prop passed from this toggle into `handleAddNewPlayer` — instead, derive `goalkeeper: newMentality === 'goalkeeper'`

**Segmented control style:** matches `MentalityControl` in `PlayerRosterPanel.tsx` exactly:
- Container: `flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[10px] font-semibold`
- Active segment: `bg-blue-950 text-blue-300 border-blue-800`
- Inactive segment: `text-slate-500 border-slate-700 hover:text-slate-300`
- Labels: GK · DEF · BAL · ATT (matching `MENTALITY_LABELS` order)

**The `MentalityControl` component is NOT extracted** — it is inlined in the modal as a local implementation to keep the change self-contained. If extraction is desired later it can be done as a separate refactor.

### No other files change

- `lib/types.ts` — `Mentality` type already includes `'goalkeeper'`
- `NewPlayerEntry` type — already has `goalkeeper?: boolean`; no schema change needed since `mentality` is derived from it
- API routes — unchanged; `mentality` is not part of the `NewPlayerEntry` payload (it is set on the `player_attributes` row via the roster panel after the player is promoted)
- `PlayerRosterPanel.tsx` — unchanged

---

## Default State

- `newMentality` defaults to `'balanced'` when the modal opens or resets
- Selecting GK sets `newMentality = 'goalkeeper'`, which implies `goalkeeper: true` when submitting
- Selecting any non-GK mentality implies `goalkeeper: false`

---

## Reset Behaviour

When the user navigates Back from `new_player` to `choose`, `newMentality` resets to `'balanced'` alongside the existing resets.

---

## Out of Scope

- Extracting `MentalityControl` into a shared component
- Adding mentality to the `guest` step (guests are one-time, not on the roster)
- Surfacing mentality anywhere in the modal UI beyond the `new_player` step
- Any change to the `PlayerRosterPanel` or Settings tab
