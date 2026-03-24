# Editable League Name

**Date:** 2026-03-24
**Status:** Approved

## Problem

The league name "The Boot Room" was set directly in the database and cannot be corrected through the UI. The correct name is "Craft Football". There is also no path for future admins to rename a league after creation.

## Goal

Allow league admins to edit the league name from the League Details tab in Settings, using the same save action as other details fields (location, day, kickoff time, bio).

## Out of Scope

- Inline editing of the name on the league header
- League creation flow (separate future work)
- Member or public access to edit the name

---

## Design

### Approach

Extend the existing `LeagueDetailsForm` component and `PATCH /api/league/[id]/details` endpoint to include the `name` field. No new routes, no DB migration, no feature flag.

### Changes

#### `components/LeagueDetailsForm.tsx`

- Add `leagueName: string` prop (required). This is passed separately from `initialDetails` because `name` lives on the `Game` type, not `LeagueDetails` — extending `LeagueDetails` would conflate two distinct data shapes.
- Add `onNameSaved: (name: string) => void` prop so the settings page can update its local `leagueName` state after a successful save, keeping the header subtitle in sync without a full page reload.
- Add `name` to the form's controlled state, initialised from the `leagueName` prop.
- Render a text input above the location field:
  - Label: "League name"
  - Required; `maxLength={80}`; validate non-empty before submit
- Include `name` in the save payload sent to the API on every save (not optional).
- The `LeagueInfoBar` live preview rendered inside the form does not need to reflect live name edits — the info bar displays location, day/time, player count, and bio. The name update becomes visible to the admin via the settings page subtitle (updated through `onNameSaved`) after a successful save.

#### `app/api/league/[id]/details/route.ts` (PATCH handler)

- Accept `name` in the request body. `name` must not follow the nullable coercion pattern used for other fields. Extract it explicitly:
  ```ts
  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  ```
- Include `name` in the Supabase `update()` on the `games` table alongside the other fields.
- `games.name` already exists (NOT NULL) — no migration needed.

#### `app/[leagueId]/settings/page.tsx`

- Already fetches and holds `leagueName` from the `games` row via `fetchGames()`.
- Pass `leagueName` as the `leagueName` prop to `<LeagueDetailsForm>`. **The form does not source `name` from `loadDetails` / the GET `/api/league/[id]/details` endpoint** — those only return `location`, `day`, `kickoff_time`, and `bio`. The GET handler does not need to change.
- Pass a handler for `onNameSaved` that calls `setLeagueName(name)` so the subtitle updates immediately after save.

### Data flow

```
Settings page
  → fetchGames() → leagueName state
  → loadDetails() → leagueDetails state (location, day, kickoff_time, bio)
  → passes leagueName + leagueDetails + onNameSaved to <LeagueDetailsForm>

LeagueDetailsForm (admin only)
  → controlled inputs for: name (from leagueName prop), location, day, kickoff_time, bio
  → client validates name is non-empty and ≤ 80 chars before submit
  → on save: PATCH /api/league/[id]/details { name, location, day, kickoff_time, bio }
  → on success: calls onNameSaved(name) so page header subtitle updates immediately

PATCH handler
  → verifies caller is admin
  → returns 400 if name is absent or blank
  → updates games row with all provided fields
```

### Validation

| Field  | Client              | Server                        |
|--------|---------------------|-------------------------------|
| `name` | Required, maxLength 80 | Required; 400 if absent/blank |
| Others | Unchanged           | Unchanged (nullable, no max)  |

### No changes needed

- `lib/types.ts` — `name` lives on `Game`, not `LeagueDetails`; `LeagueDetails` is not extended
- DB migrations — `games.name` already exists
- GET `/api/league/[id]/details` — does not need to return `name`; the settings page already has it from `fetchGames()`
- Feature flags — settings form is already admin-only
