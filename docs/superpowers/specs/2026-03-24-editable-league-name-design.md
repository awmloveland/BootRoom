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

- Add `leagueName: string` prop (required)
- Add `name` to the form's controlled state, initialised from the prop
- Render a text input above the location field:
  - Label: "League name"
  - Required; validate non-empty before submit
- Include `name` in the save payload sent to the API

#### `app/api/league/[id]/details/route.ts` (PATCH handler)

- Accept an optional `name` field in the request body
- If present and non-empty, include it in the Supabase `update()` on the `games` table
- `games.name` already exists (NOT NULL) — no migration needed

#### `app/[leagueId]/settings/page.tsx`

- Already fetches and holds `leagueName` from the `games` row
- Pass it as the `leagueName` prop to `<LeagueDetailsForm>`

### Data flow

```
Settings page
  → fetches games row (id, name, location, day, kickoff_time, bio)
  → passes leagueName + leagueDetails to <LeagueDetailsForm>

LeagueDetailsForm (admin only)
  → controlled inputs for: name, location, day, kickoff_time, bio
  → on save: PATCH /api/league/[id]/details { name, location, day, kickoff_time, bio }

PATCH handler
  → verifies caller is admin
  → updates games row with all provided fields
```

### Validation

- `name` must be a non-empty string (client + server)
- No maximum length enforced (consistent with other text fields)

### No changes needed

- `lib/types.ts` — `name` lives on `Game`, not `LeagueDetails`; no type changes required
- DB migrations — `games.name` already exists
- Feature flags — settings form is already admin-only
