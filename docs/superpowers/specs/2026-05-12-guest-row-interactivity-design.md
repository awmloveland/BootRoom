# Guest row interactivity — design

**Date:** 2026-05-12
**Status:** Draft

## Problem

The admin-only "name a guest" affordance on `MatchCard` was shipped as a small `UserPlus` icon-only button on the right of guest rows (see `2026-05-12-name-guest-player-design.md`). In practice the row doesn't read as interactive — there's no visual signal that the entry is a placeholder waiting to be filled, and the icon alone doesn't communicate the action.

## Goal

Make the guest row visibly read as "placeholder, click to fill" and give the action a labelled, discoverable target — without growing the row's footprint or changing any other behaviour.

## Non-goals

- Changes to who sees the affordance (admin-only, guest rows only, non-cancelled matches) — unchanged from the prior spec.
- Changes to `NameGuestModal`, the API, or the `onNameGuest` callback contract.
- Whole-row click target. The button remains the only hit target.
- Changes to `WeekList`, `MatchCard`, or non-guest rows.

## Approach

Two changes inside `components/TeamList.tsx` only:

### 1. Dashed border on guest rows

Guest rows currently share the same solid team-tinted border as real-player rows. Swap `border` to `border-dashed` *for guest rows only*. The dashed treatment communicates "incomplete / placeholder" without changing colour, padding, or layout.

- Team A guest row: `border border-dashed border-sky-900/60` (replaces the existing solid sky border)
- Team B guest row: `border border-dashed border-violet-900/60` (replaces the existing solid violet border)
- Non-guest rows: unchanged.

Detection is the existing `isGuestName(player)` predicate.

### 2. Labelled "+ Add Player" button

Replace the icon-only `UserPlus` button with an inline icon + text button:

- Icon: lucide `Plus` (h-3.5 w-3.5)
- Label: `Add Player` (capital P), `whitespace-nowrap` so it never wraps
- Layout: `inline-flex items-center gap-1`
- Type: text-only — transparent background, no border, no padding box. Padding kept tight (`px-1 py-0.5`) so the row height does not grow.
- Font: `text-[11px] font-semibold`
- Team-coloured text:
  - Team A: `text-sky-400 hover:text-sky-300`
  - Team B: `text-violet-400 hover:text-violet-300`
- Hover: `hover:underline` in addition to the colour shift
- Focus: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400` for Team A, `focus-visible:ring-violet-400` for Team B, matching existing focus patterns in `MatchCard` / `HonoursSection`
- `type="button"` (already present)
- `aria-label={`Name ${player}`}` is kept — the visible "Add Player" text reads to sighted users, the aria-label gives screen-reader users the guest's name as part of the action

The icon swap from `UserPlus` to `Plus` is deliberate: with a text label present, `Plus` is the more direct "add an item" affordance and matches the "+ Add Player" reading.

### Click target

Unchanged: the button is the only hit target. The row itself does not get a hover state or `cursor-pointer`. This keeps the contract consistent with the prior spec and avoids a hover state on cancelled-match guest rows (which already render in a separate `CancelledCard` path that never receives `onNameGuest`).

## Data flow

Unchanged from `2026-05-12-name-guest-player-design.md`.

## Error handling

Unchanged. All error/success paths are owned by `NameGuestModal` and `WeekList`.

## Testing

- **Visual / manual** — on a league with a recorded match containing "Will +1" as a guest, signed in as admin:
  - Guest rows render with a dashed team-tinted border; non-guest rows stay solid.
  - The right edge of each guest row shows "+ Add Player" in the team colour.
  - Hovering the button brightens the text and adds an underline; the row itself does not change.
  - Tab-focusing the button shows a team-coloured ring.
  - Clicking opens `NameGuestModal` exactly as before, pre-filled with the guest's name.
- **Negative** — as a member (non-admin), guest rows render without the button and *without* a dashed border (the dashed border is gated on the same `showNameGuest` condition).
- **Negative** — on a cancelled match, no guest rows render the button or the dashed border (the cancelled path goes through `CancelledCard`, which is unaffected).

## Out of scope / explicitly chosen against

- **Whole-row click target.** Considered; rejected because it would imply the row is the action target, conflicting with the existing icon-on-the-right pattern used elsewhere in the app, and would complicate keyboard semantics.
- **Pill / outlined button.** Considered; rejected as visually heavier than needed for an inline row action.
- **Hover state on the row body.** Considered; rejected — the button's hover state is sufficient feedback, and adding a row-level hover would imply row-level interactivity that doesn't exist.

## Open questions

None at design time.
