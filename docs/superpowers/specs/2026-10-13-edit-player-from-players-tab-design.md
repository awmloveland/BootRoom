# Edit player from the Players tab — design

**Date:** 2026-10-13

## Summary

Admins can already edit a player's name, strength, mentality and member link,
and delete them, from Settings → Players (`PlayerRosterPanel`). This change
lets them do the same from the Players tab without leaving the league page.

An open player card on the Players tab gets a full-width **Edit player**
button at its foot, visible to admins only. It opens an **Edit player** modal:
a form with Save and Cancel, and a Delete button that swaps the modal to a
confirmation.

Mockups from brainstorming are in `.superpowers/brainstorm/` (gitignored):
`entry-points.html`, `modal-save-model.html`, `full-flow.html`.

## Decisions (settled during brainstorming)

1. **Entry point: button at the foot of an open card.** Collapsed rows look
   the same for admins as for members. Rejected: a pencil on every row (clutter,
   mis-taps inside the tappable header), a "⋯" menu (extra layer), and an
   edit-mode toggle (easy to forget you're in it).
2. **The button spans the card's width.**
3. **Form with Save and Cancel**, not save-as-you-tap. Nothing is written
   until Save; Cancel or closing the modal discards changes. This differs from
   Settings on purpose: a modal reads as a form, and a rename (which changes the
   name everywhere) should be deliberate.
4. **Delete uses the standard destructive button**: the red outline style
   (`border-[#e2686f]/40 text-[#e2686f] hover:bg-[#e2686f]/10`), as on
   "Remove member" and "Confirm Cancellation".
5. **Delete confirmation replaces the modal's content**, rather than stacking
   a second dialog. Cancel returns to the form with unsaved edits intact.
6. **No feature flag.** The button is admin-only, and admins bypass flags, so a
   flag would gate nothing. Settings → Players stays as it is.

## UI

### Player card (`components/PlayerCard.tsx`)

- New optional prop `onEdit?: () => void`. When set, the open card renders a
  final section below the teammates chart:
  - `border-t border-[#17263c] pt-3.5` divider, matching the card's other
    sections.
  - A full-width outline button: `h-9 w-full rounded border border-[#223a5c]
    text-[#cfe0f4] text-[13px] font-bold hover:border-[#38bdf8] hover:text-white`,
    with a `Pencil` icon (lucide) and the label "Edit player".
- When `onEdit` is undefined (members, public), nothing changes.

### Edit player modal (new `components/EditPlayerModal.tsx`)

Radix Dialog, same shell as `AddRosterPlayerModal`: centred,
`max-w-[calc(100%-32px)] sm:max-w-sm`, `rounded-[14px]`, header with title
"Edit player" and an X close button.

Body, top to bottom:

| Field | Control | Notes |
|---|---|---|
| Name | Text input | Required; trimmed. Inline error if it matches another player's name (case-insensitive), checked against the roster list before submit. |
| Strength | `StrengthPills` (md) | Only shown while `played < 10`, with the same "· no longer used after N more games" hint as Settings. |
| Mentality | Mentality segmented control (GK · DEF · BAL · ATT) | Shared with Settings (see Refactor). |
| Member link | Lime chip with the linked member's name, or "+ Link member" | "+ Link member" opens `MemberLinkPicker` inside the modal. Choosing a member stages the link (shows the chip); it is written on Save. No unlink control, matching Settings. |

Footer: **Delete** (destructive outline) on the left; **Cancel** (outline) and
**Save** (primary sky) on the right. Save is disabled while saving, while the
name is empty, or when nothing has changed. Labels switch to "Saving…" while
in flight.

Delete confirmation view (same modal, content swapped), laid out like
"Remove member?":

- Title: "Delete {name}?"
- Body: the same copy as Settings: "They'll be removed from the roster, the
  Players tab and the team builder. Past match line-ups keep their name.
  {linked name} will be unlinked. This can't be undone."
- Buttons, right-aligned: **Cancel** (back to the form) and **Delete player**
  (destructive outline, "Deleting…" in flight).

Errors from any request show as a red line above the footer
(`text-xs text-[#e2686f]`), and the modal stays open.

## Data flow

### Loading

The Players tab's `Player[]` (from `get_player_stats_public`) has no member
link info. When an admin first opens the modal, `PublicPlayerList` fetches
`GET /api/league/[id]/players` (existing, admin only, returns
`PlayerAttribute[]` with `played` and link fields) and keeps the result in
state for later opens. The modal shows a skeleton body until the roster is
loaded; on failure it shows "Couldn't load player details." with a Retry.

The roster list also feeds the client-side name collision check.

### Saving

On Save, only changed parts are sent, in this order:

1. Strength and mentality, if changed: `PATCH /api/league/[id]/players/[name]`
   under the **current** name.
2. Member link, if staged: `POST /api/league/[id]/player-claims/assign` with
   the current name.
3. Rename, if changed: `PATCH /api/league/[id]/players/[name]/rename`.

Renaming last means steps 1 and 2 always address a name that exists. If a step
fails, later steps are skipped, the error is shown, and the modal stays open.
Any steps that already succeeded stay saved. The modal then refetches the
roster and resets the form's baseline to it, keeping the admin's unsaved
values for the failed and skipped fields, so a second Save only resends
those.

On success: close the modal, `router.refresh()` so the server-rendered stats
pick up the new name and mentality, update the cached roster in place, and
keep the card open under its new name (`setOpenPlayer(newName)`).

### Deleting

`DELETE /api/league/[id]/players/[name]`. On success: close the modal, drop
the player from the cached roster, `router.refresh()`. The card disappears
from the list.

### Wiring

- `app/[slug]/(tabs)/players/page.tsx` passes `leagueId` and `isAdmin` to
  `PublicPlayerList`.
- `PublicPlayerList` owns `editingPlayer: string | null`, the cached roster,
  and renders `EditPlayerModal`. It passes `onEdit` to each `PlayerCard` only
  when `isAdmin`.

No API, RPC or migration changes.

## Refactor

`MentalityControl` is a private function inside `PlayerRosterPanel.tsx`. Move
it to `components/ui/MentalityControl.tsx` (next to `StrengthPills`) and import
it in both places. No behaviour change in Settings.

## Testing

Component tests in `components/__tests__/`, following
`PlayerRosterPanel.delete.test.tsx`:

- `PlayerCard`: "Edit player" renders only when `onEdit` is passed and the
  card is open; clicking it calls `onEdit`.
- `EditPlayerModal`:
  - Strength hidden at 10+ games, shown with the countdown below 10.
  - Save disabled with no changes and with an empty name; inline error on a
    duplicate name.
  - Save with mentality + rename sends PATCH before rename, with the right
    URLs and bodies; only changed parts are sent.
  - A failed request keeps the modal open and shows the error.
  - Delete → confirmation view → Cancel returns to the form with edits kept;
    Delete player sends DELETE and calls the close/refresh callback.
- Run the existing `PlayerRosterPanel` tests to confirm the `MentalityControl`
  move changes nothing.

## Out of scope

- Changing Settings → Players.
- Unlinking a member (not possible in Settings either).
- Editing from anywhere other than the Players tab.
