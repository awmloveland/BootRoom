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

### Phase 1 — DB + API foundation
Backend only. No UI changes. All subsequent phases depend on this being merged first.

- `supabase/migrations/20260403000001_player_claims.sql` — `player_claims` table + partial unique index + all RPCs + RLS policies
- `lib/types.ts` — add `PlayerClaim`, `PlayerClaimStatus`
- `app/api/league/[id]/player-claims/route.ts` — POST (submit claim)
- `app/api/league/[id]/player-claims/[claimId]/route.ts` — DELETE (cancel claim)
- `app/api/league/[id]/player-claims/[claimId]/review/route.ts` — POST (admin approve/reject/amend)
- `app/api/league/[id]/player-claims/assign/route.ts` — POST (admin direct assign)

### Phase 2 — Member settings UI
Member-facing claim management in the global `/settings` page. Depends on Phase 1.

- `components/PlayerClaimPicker.tsx` — new reusable picker (fetches unclaimed players, search input, inline expand/collapse)
- `app/settings/page.tsx` — add League identity section with per-league rows and all four claim states

### Phase 3 — Admin UI
Admin claim review and member list link management. Depends on Phase 1.

- `components/PlayerClaimsTable.tsx` — new standalone claims review component (approve/reject/amend actions)
- `components/AdminMemberTable.tsx` — add green linked badge + dashed "+ Link player" button per row
- `app/[leagueId]/settings/page.tsx` — add Player identity claims section (uses PlayerClaimsTable)

### Phase 4 — Join flow integration + onboarding
Surface claim entry during join and as a first-visit prompt. Depends on Phases 1–3.

- `components/JoinRequestDialog.tsx` — add Yes/No cards + inline PlayerClaimPicker below note textarea
- `app/api/league/[id]/join-requests/route.ts` — extend POST to accept optional `player_name` and create a claim row atomically
- `components/PendingRequestsTable.tsx` — extend request cards to show inline claim chip with approve/reject/amend actions
- `app/[leagueId]/results/page.tsx` — add onboarding banner (localStorage dismiss, hidden if claim exists)
- `components/LeaguePageHeader.tsx` — extend notification badge count to include pending claims

---

## Implementation Prompts

Each prompt below is self-contained and can be pasted directly into a new workspace instance.

---

### Phase 1 Prompt

```
Implement Phase 1 of the player identity claim feature for the BootRoom app.

Spec: docs/superpowers/specs/2026-04-03-player-identity-claim-design.md (read this in full first).

This phase is backend only — no UI changes.

Tasks:
1. Write a Supabase migration creating the `player_claims` table exactly as specified in the spec (columns, constraints, partial unique index on player name). Include all six RPCs: `submit_player_claim`, `review_player_claim`, `assign_player_link`, `cancel_player_claim`, `get_player_claims`, `get_unclaimed_players`. Apply RLS: members can read/delete only their own rows; admins can read/update all rows for their leagues.
2. Add `PlayerClaimStatus` and `PlayerClaim` types to `lib/types.ts`.
3. Create `POST /api/league/[id]/player-claims/route.ts` — requires authenticated member, calls `submit_player_claim`, returns 201 or 409.
4. Create `DELETE /api/league/[id]/player-claims/[claimId]/route.ts` — requires claim owner, calls `cancel_player_claim`, returns 204.
5. Create `POST /api/league/[id]/player-claims/[claimId]/review/route.ts` — requires admin/creator, body: `{ action: 'approved' | 'rejected', override_name?: string }`, calls `review_player_claim`.
6. Create `POST /api/league/[id]/player-claims/assign/route.ts` — requires admin/creator, body: `{ user_id, player_name }`, calls `assign_player_link`.

Follow all conventions in CLAUDE.md: TypeScript strict, no ORMs, use existing Supabase server client helpers.
```

---

### Phase 2 Prompt

```
Implement Phase 2 of the player identity claim feature for the BootRoom app.

Spec: docs/superpowers/specs/2026-04-03-player-identity-claim-design.md (read this in full first). Phase 1 must already be merged.

This phase adds the member-facing claim UI to the global /settings page.

Tasks:
1. Create `components/PlayerClaimPicker.tsx` — a reusable component that accepts `leagueId` and `onClaim(playerName: string)` / `onCancel()` callbacks. It fetches unclaimed player names from `GET /api/league/[id]/player-claims` (or a dedicated endpoint — check what Phase 1 provides), renders a search input and scrollable list, and calls `onClaim` when a name is selected and submitted. Shows the footer copy from the spec. This component will be reused in Phase 3 and 4.
2. Update `app/settings/page.tsx` — add a League identity section below the existing Account section. Fetch the user's leagues and their claim status for each. Render one row per league showing the league name and the correct state (no claim / pending / approved / rejected) as specified in the spec. Wire up the PlayerClaimPicker inline expand, cancel claim, and resubmit flows.

IMPORTANT: Before writing any code, present UI mockups for the League identity section (all four states) and get approval before implementing.

Follow all conventions in CLAUDE.md: Tailwind only, cn() for conditional classes, dark-mode slate palette.
```

---

### Phase 3 Prompt

```
Implement Phase 3 of the player identity claim feature for the BootRoom app.

Spec: docs/superpowers/specs/2026-04-03-player-identity-claim-design.md (read this in full first). Phases 1 and 2 must already be merged.

This phase adds admin claim review UI to the league settings page and the member list.

Tasks:
1. Create `components/PlayerClaimsTable.tsx` — renders pending player claims for admin review. Each row shows: member display name + email + claimed player name chip + Reject / Link to different player / Approve actions. "Link to different player" expands an inline picker (reuse PlayerClaimPicker from Phase 2). Calls the review and assign API routes from Phase 1.
2. Update `components/AdminMemberTable.tsx` — add a green "Linked: [name]" badge to rows with an approved claim, and a dashed "+ Link player" button to rows without one. Clicking "+ Link player" opens PlayerClaimPicker inline and calls the assign endpoint.
3. Update `app/[leagueId]/settings/page.tsx` — add a Player identity claims section in the Members tab, rendered below Pending requests and above the member list. Uses PlayerClaimsTable. Only shown when pending claims exist. Fetch pending claims server-side or on tab mount (follow the same pattern as pending join requests).

IMPORTANT: Before writing any code, present UI mockups for the PlayerClaimsTable and the AdminMemberTable changes, and get approval before implementing.

Follow all conventions in CLAUDE.md.
```

---

### Phase 4 Prompt

```
Implement Phase 4 of the player identity claim feature for the BootRoom app.

Spec: docs/superpowers/specs/2026-04-03-player-identity-claim-design.md (read this in full first). Phases 1, 2, and 3 must already be merged.

This phase surfaces the claim entry point during the join flow and as a first-visit onboarding prompt.

Tasks:
1. Update `components/JoinRequestDialog.tsx` — add Yes/No cards below the note textarea as specified in the spec (copy, two-card layout B, inline PlayerClaimPicker expanding on Yes). Selecting a player name stores it in local state. On submit, pass the optional player_name to the API.
2. Update `POST /api/league/[id]/join-requests/route.ts` — accept an optional `player_name` in the request body. If provided, after inserting the join request row, call `submit_player_claim` to create a pending claim atomically. If the claim fails (e.g. name already taken), still succeed the join request and return a warning in the response body.
3. Update `components/PendingRequestsTable.tsx` — when a join request has an attached player claim (status pending), render the blue claim chip below the note with Reject claim / Link to different player / Approve claim actions, independent of the join approve/decline buttons. Wire up to the review endpoint.
4. Update `app/[leagueId]/results/page.tsx` — add the onboarding banner for newly-approved members who have no claim for that league. Check claim status server-side. Dismiss stores a flag in localStorage keyed by `dismissed-claim-banner-[leagueId]`. Banner links to /settings.
5. Update `components/LeaguePageHeader.tsx` — extend the pending requests notification badge to also count pending player claims. Fetch the combined count server-side.

IMPORTANT: Before writing any code, present UI mockups for the join dialog claim step and the onboarding banner, and get approval before implementing.

Follow all conventions in CLAUDE.md.
```

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
- `supabase/migrations/20260403000001_player_claims.sql` — table + RPCs + RLS
- `lib/types.ts` — PlayerClaim, PlayerClaimStatus
- `app/api/league/[id]/player-claims/route.ts` — POST handler
- `app/api/league/[id]/player-claims/[claimId]/route.ts` — DELETE handler
- `app/api/league/[id]/player-claims/[claimId]/review/route.ts` — POST handler
- `app/api/league/[id]/player-claims/assign/route.ts` — POST handler

### Phase 2
- `components/PlayerClaimPicker.tsx` — new: reusable player name picker
- `app/settings/page.tsx` — League identity section

### Phase 3
- `components/PlayerClaimsTable.tsx` — new: admin standalone claims review
- `components/AdminMemberTable.tsx` — linked badge + assign action
- `app/[leagueId]/settings/page.tsx` — Player identity claims section

### Phase 4
- `components/JoinRequestDialog.tsx` — Yes/No cards + inline picker
- `app/api/league/[id]/join-requests/route.ts` — extend to accept optional player_name
- `components/PendingRequestsTable.tsx` — claim chip + review actions on request cards
- `app/[leagueId]/results/page.tsx` — onboarding banner
- `components/LeaguePageHeader.tsx` — extend notification badge to include pending claims
