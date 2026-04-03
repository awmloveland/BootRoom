# Player Identity Claim — Design Spec

**Date:** 2026-04-03
**Status:** Approved

---

## Overview

Allow league members to associate their account with an existing player name in the league's records. For example, Alice who has been recorded in match data can claim "I am Alice" so her stats and match history are linked to her account. All claims require admin approval. Admins can approve, reject, or redirect a claim to a different player name.

This is primarily a data association feature. The immediate UI change for members is modest — a linked status indicator and a foundation for future "My Stats" views.

---

## Key Design Decisions

- **Players are identified by name, not UUID.** The `player_attributes` table uses `(game_id, name)` as its primary key. Claims reference player names, not IDs.
- **One claim per user per league.** A user can only have one active claim per league at a time.
- **Claimed players are hidden from the picker.** Once a player name has a pending or approved claim, it is removed from the list other members can select — preventing conflicts before they arise. Rejected claims free the name back up.
- **Admin amend flow is first-class.** Admins can redirect a claim to a different player before approving (e.g. the user claimed "Alice Smith" but the admin knows they are "Alice S."). The original claimed name is preserved; the override is stored separately.
- **Claims are independent of join requests.** An admin can approve a join request and reject the claim, or vice versa. They are submitted together but reviewed independently.
- **Member-facing UI lives in `/settings`.** The league settings page redirects non-admins. Global user settings is the correct home for member claim management — it naturally handles the multi-league case.

---

## Database

### New table: `player_claims`

```sql
CREATE TABLE player_claims (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id              uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name          text NOT NULL,       -- what the user originally claimed
  admin_override_name  text,                -- set if admin redirects to a different player
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by          uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, user_id)                 -- one active claim per member per league
);

-- Prevents two users claiming the same player (pending or approved).
-- Rejected claims release the name back to the pool.
CREATE UNIQUE INDEX player_claims_one_per_player
  ON player_claims (game_id, player_name)
  WHERE status IN ('pending', 'approved');
```

**Effective linked name** (once approved): `admin_override_name ?? player_name`

### RPCs

| RPC | Caller | Description |
|---|---|---|
| `submit_player_claim(game_id, player_name)` | Any member | Upserts a claim row. If no row exists, inserts with status pending. If a rejected row exists for this user+league, resets it to pending with the new player_name. Raises error if user already has a pending or approved claim, or if the player name is already pending/approved by another user. |
| `review_player_claim(claim_id, action, override_name?)` | Admin/creator | Sets status to approved or rejected. If action is approved and override_name is provided, sets admin_override_name. |
| `assign_player_link(game_id, user_id, player_name)` | Admin/creator | Creates an already-approved claim directly (admin-initiated, skips pending). Replaces any existing claim for that user in that league. |
| `cancel_player_claim(claim_id)` | Claim owner (member) | Deletes a pending claim. No-op if already reviewed. |
| `get_player_claims(game_id)` | Admin/creator | Returns all claims for the league (all statuses). |
| `get_unclaimed_players(game_id)` | Any member | Returns player names from `get_player_stats` that have no pending or approved claim. Used to populate the picker. |

RLS: members can read and delete only their own claim rows. Admins can read and update all rows for their leagues.

---

## Entry Points

There are four ways a claim can be created or assigned:

### 1 — During a join request

`JoinRequestDialog` gains an optional claim step rendered below the note textarea.

**UI pattern:** Two cards side by side — "Yes / Link my player profile" and "No / I'm new to this league". Default state is neither selected (no claim submitted). Selecting Yes expands an inline player picker below the cards.

**Copy:**
- Question: *"Have you played in this league before?"*
- Yes card sub-label: *"Link my player profile"*
- No card sub-label: *"I'm new to this league"*
- Picker label: *"Select your name to link your match history to your account."*
- Picker footer: *"Can't find your name? You may have played before records began — mention it in your note above and the admin will sort it out."*

**Behaviour:** Submitting the join request with a player selected creates both a `game_join_requests` row and a `player_claims` row (status: pending) in the same API call. Submitting without a selection (No or neither card clicked) creates only the join request row.

### 2 — Onboarding banner (after join approval)

A banner appears on the league page on first visit after a join request is approved, if the member has no claim for that league.

**Copy:**
- Heading: *"Have you played in this league before?"*
- Body: *"Link your account to your player profile to see your stats and match history."*
- Actions: Dismiss | Claim my profile (links to `/settings`)

**Behaviour:** Dismiss stores a flag in `localStorage` keyed by `leagueId`. The banner does not re-appear after dismissal. It is also not shown if a claim already exists (pending or approved).

### 3 — Self-service from `/settings`

A new **League identity** section is added below the existing Account section on `/settings`. One row per league the user belongs to.

**States per league row:**

| State | Display | Action |
|---|---|---|
| No claim | "No player profile linked" | "Claim profile" button — expands inline picker |
| Pending | Amber dot + "Pending — claimed as [name]" | "Cancel claim" button |
| Approved | Green dot + "Linked as [name]" | None (read-only) |
| Rejected | Red dot + "Claim not approved" | Picker re-appears for resubmit |

The picker expands inline within the league row. It fetches unclaimed player names via `get_unclaimed_players`. The same footer copy from entry point 1 applies.

### 4 — Admin-initiated from member management

In the Members list within league settings, each member row shows:
- A green **"Linked: [name]"** badge if a claim is approved
- A dashed **"+ Link player"** button if no approved claim exists

Clicking "+ Link player" opens a small picker (same component, unclaimed names only) and creates an approved claim immediately via `assign_player_link` — no pending state, no review step.

---

## Admin Review UI

The league Settings → Members tab gains two additions:

### Pending join requests — claim chip

When a join request has an attached player claim, a blue chip appears below the note in the request card:

- Shows: amber dot + "Claims to be: [player name]" + "Player identity pending approval"
- Actions (independent of the join approve/decline): **Reject claim** | **Link to different player ›** | **Approve claim**
- "Link to different player" expands a picker to select an override name, then confirms

Approving the join request without touching the claim leaves the claim in pending state — the admin can return to it later via the Player identity claims section.

### Player identity claims section

A new section appears in the Members tab (below Pending requests, above the member list) when any member has a pending claim. This includes claims submitted from settings and claims that were attached to a join request whose join status has since been resolved (approved or declined) but whose claim is still pending. While a join request is still pending, its attached claim is shown inline on the request card only — once the join request is resolved, any remaining pending claim surfaces here.

Each row shows: member name + email + "Claims: [player name]" chip + **Reject** | **Link to different player ›** | **Approve** actions.

Both sections share a red notification badge on the settings gear icon (existing badge logic extended to include pending claims).

---

## Types

Add to `lib/types.ts`:

```ts
export type PlayerClaimStatus = 'pending' | 'approved' | 'rejected'

export interface PlayerClaim {
  id: string
  game_id: string
  user_id: string
  player_name: string
  admin_override_name: string | null
  status: PlayerClaimStatus
  reviewed_by: string | null
  created_at: string
  updated_at: string
  // Derived — populated in admin views
  display_name?: string | null
  email?: string
}
```

---

## API Routes

| Method | Route | Auth | Description |
|---|---|---|---|
| `POST` | `/api/league/[id]/player-claims` | Member | Submit a claim. Body: `{ player_name }`. Returns 201 or 409 (already claimed / name taken). |
| `POST` | `/api/league/[id]/player-claims/[claimId]/review` | Admin | Approve/reject/amend. Body: `{ action: 'approved' \| 'rejected', override_name?: string }`. |
| `DELETE` | `/api/league/[id]/player-claims/[claimId]` | Claim owner | Cancel a pending claim. Returns 204. |
| `POST` | `/api/league/[id]/player-claims/assign` | Admin | Direct assign. Body: `{ user_id, player_name }`. Creates approved claim immediately. |

---

## Phasing

### Phase 1 — Core claim lifecycle
- DB migration: `player_claims` table + all RPCs
- `lib/types.ts` — add `PlayerClaim`, `PlayerClaimStatus`
- `/settings` page — add League identity section with per-league claim rows + inline picker
- League settings → Player identity claims section (standalone claims from existing members)
- Admin member list — add linked badge + "+ Link player" button
- `components/PlayerClaimPicker.tsx` — reusable picker component (shared across all entry points)
- `components/PlayerClaimsTable.tsx` — admin standalone claims review component
- API routes: POST, DELETE, review, assign

### Phase 2 — Join flow integration + onboarding
- `components/JoinRequestDialog.tsx` — add Yes/No cards + inline picker
- `POST /api/league/[id]/join-requests` — extended to optionally create a claim row
- `components/PendingRequestsTable.tsx` — extend request cards to show claim chip + review actions
- Onboarding banner on league page (localStorage dismiss, no claim check)

### Phase 3 — Polish
- Notification badge extended to include pending claims count
- Edge cases: cancel then resubmit, admin assigns after rejection, member deleted (cascade)

---

## Edge Cases

| Scenario | Handling |
|---|---|
| User submits claim, then cancels, then resubmits | Cancel deletes the row; resubmit creates a fresh one. The partial unique index allows this. |
| User's claim is rejected; they resubmit | `submit_player_claim` upserts — resets the rejected row to pending with the new player_name. The `UNIQUE(game_id, user_id)` constraint is preserved because the row already exists. |
| Admin approves join request; claim stays pending | Valid state — admin reviews claim separately from the Player identity claims section. |
| Admin assigns a player to a user who already has an approved claim | `assign_player_link` replaces the existing claim (upsert on `(game_id, user_id)`). |
| Member is in multiple leagues | `/settings` League identity section shows one row per league. Each row is independently managed. |
| Player name has no record in `player_attributes` or match data | `get_unclaimed_players` only returns names derived from actual match data — no phantom names possible. |
| User account deleted | `ON DELETE CASCADE` on `player_claims.user_id` cleans up automatically. |
| League deleted | `ON DELETE CASCADE` on `player_claims.game_id` cleans up automatically. |

---

## Files Affected

### Phase 1
- `supabase/migrations/20260403000001_player_claims.sql` — table + RPCs
- `lib/types.ts` — PlayerClaim, PlayerClaimStatus
- `app/settings/page.tsx` — League identity section
- `components/PlayerClaimPicker.tsx` — new: reusable player name picker
- `components/PlayerClaimsTable.tsx` — new: admin standalone claims review
- `components/AdminMemberTable.tsx` — add linked badge + assign action
- `app/[leagueId]/settings/page.tsx` — Player identity claims section
- `app/api/league/[id]/player-claims/route.ts` — POST handler
- `app/api/league/[id]/player-claims/[claimId]/route.ts` — DELETE handler
- `app/api/league/[id]/player-claims/[claimId]/review/route.ts` — POST handler
- `app/api/league/[id]/player-claims/assign/route.ts` — POST handler

### Phase 2
- `components/JoinRequestDialog.tsx` — Yes/No cards + picker
- `app/api/league/[id]/join-requests/route.ts` — extend to accept optional player_name
- `components/PendingRequestsTable.tsx` — claim chip + review actions on request cards
- `app/[leagueId]/results/page.tsx` — onboarding banner (checks claim status + localStorage)

### Phase 3
- `components/LeaguePageHeader.tsx` — extend notification badge to include pending claims
- `supabase/migrations/` — edge case hardening RLS + indexes
