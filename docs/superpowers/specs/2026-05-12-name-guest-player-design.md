# Name a guest player after a match — design

**Date:** 2026-05-12
**Status:** Draft

## Problem

During the match-entry / resulting flow, an admin can add a guest (e.g. "Lloyd +1") for a player who brought a +1 to the match. After the match result is recorded, the admin sometimes wants to convert that guest entry into a real, named player — retroactively, so the new player is credited with having played in that match.

Today there is no way to do this from the UI after the resulting flow has been completed. The only option is to never skip the "add as new player" step at result time.

## Goal

Let an admin name a guest entry on a recorded match, converting it into a real player with proper attributes. The match the guest appeared in must remain credited to the new player in stats.

## Non-goals

- Adding a brand-new player who didn't appear in any match (no roster-only "Add player" button). Deferred.
- Editing a guest's associated player, or splitting one guest name across multiple physical people.
- Member- or public-facing entry point. Admin-only.

## Constraints from the existing system

- Player stats are derived from `weeks.team_a` / `weeks.team_b` JSONB arrays joined with `player_attributes`. Renaming a guest name in those JSONB arrays automatically credits the new name with all matches that contained the old name.
- When a match result is posted, `/api/public/league/[id]/result` upserts every name in `team_a` / `team_b` into `player_attributes` with `(game_id, name)`. So a recorded guest like "Lloyd +1" already exists as a `player_attributes` row by the time this feature is used.
- Guest names follow the `${base} +${n}` convention (e.g. "Lloyd +1", "Lloyd +2"), so guests are detectable client-side via a regex on the name.
- A rename endpoint already exists at `/api/league/[id]/players/[name]/rename` and handles cascading the new name across the tables that store player names as strings.

## Approach

### UI entry point — on the match card

On `MatchCard`, in the team list rows for guest entries only (names matching `/\s\+\d+$/`), render an admin-only inline action button (lucide `UserPlus` icon) to the right of the guest's name. Tapping it opens the `NameGuestModal`.

The button is not rendered for non-guests, non-admins, or for guests on cancelled matches.

`TeamList` currently takes `players: string[]`. To preserve its purely-presentational contract, `MatchCard` will continue to pass `players: string[]` to `TeamList`, and the per-guest button will be rendered inside `TeamList` (or a thin wrapper that `MatchCard` controls) by passing an optional `onNameGuest?: (guestName: string) => void` prop. Only when this prop is supplied does the button appear, and only on names matching the guest pattern.

### Modal — `NameGuestModal`

New component at `components/NameGuestModal.tsx`, distinct from `AddPlayerModal`. Mirrors the new-player tab of `AddPlayerModal` for field shape:

- **Name** — required text input, pre-filled empty
- **Mentality** — radio group: GK / DEF / BAL / ATT, default BAL
- **Strength hint** — 1 / 2 / 3 selector, default 2

Header reads "Name <guestName>" (e.g. "Name Lloyd +1"). Submit button: "Add player".

Client-side validation: name is required, must trim non-empty, must not collide with another player in the league (case-insensitive). The available player list is fetched alongside the league players that the page already loads, so no extra fetch is needed.

### API — `POST /api/league/[id]/guests/name`

New endpoint at `app/api/league/[id]/guests/name/route.ts`.

Request body:

```ts
{
  oldName: string;        // "Lloyd +1"
  newName: string;        // "Steve"
  mentality: 'goalkeeper' | 'defensive' | 'balanced' | 'attacking';
  strengthHint: 1 | 2 | 3;
}
```

Behaviour:

1. Verify the caller is an admin or creator of the league. Return 403 otherwise.
2. Trim `newName`, reject if empty (400).
3. Verify `newName` does not exist (case-insensitive) in `player_attributes` for this `game_id`. Return 409 with `{ error: 'name_taken' }` otherwise.
4. Verify `oldName` exists in `player_attributes` for this `game_id` and matches the guest-name pattern. Return 404 with `{ error: 'guest_not_found' }` if not.
5. Inside a single Postgres function (RPC) so the operation is atomic:
   - Update every `weeks` row in this league: replace `oldName` with `newName` in both `team_a` and `team_b` JSONB arrays.
   - Cascade the rename across the same tables that the existing rename endpoint already touches (`player_claims`, `autopick_results`, etc. — match its cascade list exactly so we don't introduce drift).
   - Update the `player_attributes` row: rename `oldName` → `newName`, set `mentality` and `rating` from the request.
6. Return 200 with the updated player row.

Rationale for a new endpoint instead of extending `PATCH .../rename`: this operation is conceptually distinct (naming a guest, not fixing a typo), and it writes attributes in the same call. A new endpoint keeps the client surface simple and the write atomic.

The rename is **global** across the league — every occurrence of the guest name in any past match is replaced. This matches the existing rename semantics and is acceptable because the same guest name string would refer to the same physical person if reused (current behaviour: if Lloyd brings different +1s to different matches, they already share the same name today; this feature does not change that).

### Data flow

1. Admin opens the match card on the league home, sees the guest's `UserPlus` icon.
2. Click → `NameGuestModal` opens, pre-loaded with the guest's name in the header.
3. Admin enters name, picks mentality, picks strength, submits.
4. Client POSTs to `/api/league/[id]/guests/name`.
5. Server validates, runs the RPC, returns 200.
6. Client invalidates the match-card data and the players list, re-renders. The team list now shows the new name. The Players tab shows the new player with one match played, with the correct W/L/D from that match.

### Error handling

- **Name collision (409)** — modal shows "A player with this name already exists." inline below the name field; submit re-enabled.
- **Guest no longer present (404)** — modal closes, toast: "This guest entry is no longer on the match." Client refetches.
- **403** — UI never renders the button for non-admins; the API guard is defense-in-depth.
- **Atomicity** — the RPC ensures we don't end up with a half-renamed week and a stale `player_attributes` row. If the RPC is not practical, the server-side fallback is to update `player_attributes` last so the canonical source-of-truth (`weeks`) is consistent and the operation can be safely retried.

## Testing

- **Unit** — `NameGuestModal` validates required name, surfaces collision error inline, calls the API with the expected payload.
- **Integration** — against a seeded league with a recorded match containing "Lloyd +1", POST to the endpoint and assert:
  - the week's `team_a` / `team_b` no longer contains "Lloyd +1" and now contains the new name
  - `player_attributes` has one row for the new name with the chosen mentality and rating, and the old row is gone
  - `getPlayerStats` returns the new player with one match played and the correct result
- **Manual smoke** — open tonight's match card as admin, click `UserPlus` next to "Lloyd +1", name them "Steve" (DEF, strength 2). Verify Steve appears in the team list, in the Players tab with mentality DEF and rating 2, and in stats with one match played credited correctly.

## Open questions

None at design time.
