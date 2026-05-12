# Add Player from Settings — Design

**Date:** 2026-05-12
**Status:** Approved (pending user spec review)

## Problem

Admins can edit existing roster players from the **Settings → Players** tab
(`PlayerRosterPanel`), but there is no way to **create** a new roster player
from this tab. New players today only enter the system through the lineup
builder's `AddPlayerModal`, where creation is deferred until a match result is
confirmed (via the `promote_roster` RPC).

Admins want to add players directly from settings — independent of any match —
using the same fields and feel as the lineup builder's "new player" flow:
**name, strength, mentality**.

## Goals

- Admin can add a new roster player from the Settings → Players tab.
- The form fields, defaults, and visual treatment match the lineup builder's
  "new player" form (consistency).
- The new player persists immediately and appears in the roster list.
- Form logic lives in **one** place — no drift between settings and lineup
  builder.

## Non-goals

- No "Guest" creation path here — settings is for the persistent roster only.
- No member-linking inside the add flow — the existing expand-and-link
  affordance on each row covers that after creation.
- No bulk import.
- No edit/delete from this modal — existing PATCH-on-row UI handles edits;
  delete is not part of this feature.

## UX

### Trigger

A primary **"+ Add player"** button rendered above the player list in
`PlayerRosterPanel`, right-aligned. Visible to admins only (the panel itself
already only mounts on the admin-gated settings page).

Empty-roster state: same button, plus a brief "No players yet." message above
it.

### Modal

Reuse the visual treatment of `AddPlayerModal`:

- Backdrop overlay
- Card: `bg-slate-800`, `border-slate-700`
- Title: **"Add player"**
- Three fields (in order): name (text input, autoFocus), strength
  (`StrengthPills`: Below / Average / Above, default **Average**), mentality
  (button group: GK / DEF / BAL / ATT, default **Balanced**)
- Footer: **Cancel** + **Add** buttons

Dismiss on backdrop click, Esc, or Cancel.

### Post-save behaviour

On successful save: modal closes, the new player appears in the list (sorted
alphabetically in place), no auto-expand. (Matches the lineup builder's
close-on-submit behaviour. Bulk-add and auto-expand were considered and
rejected as premature.)

## Component architecture

Extract a shared **`NewPlayerForm`** component that owns the three fields,
local state, client-side validation, and an `onSubmit(values)` callback. It is
**presentational + local state only** — no fetch, no knowledge of where it is
used.

Files:

- `components/NewPlayerForm.tsx` — **new**, shared form
- `components/AddPlayerModal.tsx` — **refactored**: step 2 ("new player")
  swaps its inline form for `<NewPlayerForm />`. Wires `onSubmit` to its
  existing client-side handler (`onAdd({ type: 'new_player', ... })`).
- `components/AddRosterPlayerModal.tsx` — **new**, thin modal that renders
  `<NewPlayerForm />` only (no Guest/New chooser step). Wires `onSubmit` to
  the server-write handler.
- `components/PlayerRosterPanel.tsx` — adds the "+ Add player" button and
  modal wiring; appends the returned player to local state on success.

### `NewPlayerForm` props (sketch)

```ts
interface NewPlayerFormProps {
  existingNames: string[]                       // for client-side collision check
  initialValues?: { strength?: Strength; mentality?: Mentality }
  submitting?: boolean
  submitError?: string | null
  onSubmit: (values: { name: string; strength: Strength; mentality: Mentality }) => void
  onCancel: () => void
  submitLabel?: string                          // default 'Add'
}
```

The form does its own case-insensitive name-collision check against
`existingNames` and surfaces the error inline before calling `onSubmit`.

## API + persistence

### New endpoint: `POST /api/league/[id]/players`

Lives in the existing `app/api/league/[id]/players/route.ts` file alongside
the `GET` handler.

**Auth:** require signed-in user + `is_game_admin` RPC check (mirrors the
existing `GET` handler).

**Request body:**

```ts
{ name: string; strength: Strength; mentality: Mentality }
```

**Server-side validation:**

- Trim name; reject empty (400).
- Mentality must be one of the four enum values (400).
- Case-insensitive collision check against existing `player_attributes` rows
  for this league → **409** with `{ error: 'A player with that name already exists' }`.

**Write:** Call the existing `promote_roster(p_game_id, p_entries)` RPC with a
single entry. Rating is derived via `strengthToRating(strength)`. This reuses
the exact path that lineup-result confirmation uses, so behaviour stays
consistent (upsert semantics, mentality storage, goalkeeper flag derived from
`mentality === 'goalkeeper'`).

**Response (200):** the new `PlayerAttribute`:

```ts
{
  name,
  strength,
  mentality,
  played: 0,
  linked_user_id: null,
  linked_display_name: null,
}
```

The client appends this to local state without a refetch.

### Client behaviour in `PlayerRosterPanel`

- On 200: append to local `players` state, re-sort alphabetically, close
  modal.
- On 409: surface the collision message inline in the modal (do not close).
- On other errors: show a generic error in the modal.

## Validation summary

| Rule | Client | Server |
|---|---|---|
| Trimmed name non-empty | yes (disable submit) | yes (400) |
| Case-insensitive name collision | yes (inline error before submit) | yes (409, authoritative) |
| Mentality is valid enum value | n/a (UI only emits valid values) | yes (400) |
| Strength is valid enum value | n/a (UI only emits valid values) | yes (via `strengthToRating`) |

## Testing

This codebase has no unit-test framework set up. Verification bar:

- `npm run lint`
- `npm run build`
- Manual exercise in localhost.

**Manual checklist:**

- Happy path: add a player → appears in list, sorted in place.
- Duplicate name (case-insensitive): inline error, modal stays open.
- Cancel / Esc / backdrop dismiss: no write, no state change.
- New player can immediately be expanded and edited via existing PATCH flow
  (strength, mentality, member link, rename).
- Refresh: new player persists.
- Empty roster: button still works; first player creates correctly.

## Localhost iteration

Once code lands, start `npm run dev` and walk through the modal together. The
shared `NewPlayerForm` is the natural place to iterate — spacing, default
focus, error placement, button labels — and tweaks are contained to that
component and `AddRosterPlayerModal` so the lineup-builder flow is unaffected.

## Open questions

None.
