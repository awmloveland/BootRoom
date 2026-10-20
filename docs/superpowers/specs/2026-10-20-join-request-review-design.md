# Join request review — design

**Date:** 2026-10-20

## Summary

Reviewing someone who wants to join is confusing. A join request made with a
player name creates two records, a join request and a player claim, and the
admin approves them separately: "Approve" on the request, then "Approve
claim" on a chip underneath it. Someone who says they're new gets no player
at all, so the admin has to add one on the Players tab and link it by hand
afterwards (as happened with John Easton).

This change gives every request one card and one approval. Approving makes
the person a member (for a join request), creates a new squad player if
needed, and links the player to their account, in one database transaction.
The admin, not the requester, names new players.

## Decisions (settled during brainstorming)

1. **Direction A from the mockups** ("plain sentence, one switch link"). Each
   card states who the person will play as, with Decline and Approve. The
   alternative is one link away, not an always-visible switch (B) or a review
   dialog (C).
2. **Two outcomes only:** an existing squad player, or a new player. There is
   no "member only, no player" option. Every approval links a player.
3. **Requesters never type a name.** They pick themselves from the list, say
   they can't find their name, or say they're new.
4. **"Can't find your name? Send without it"** is added under the name list
   in the join dialog.
5. **Member claims use the same card.** Claims from people who are already
   members (made from their settings) join the same list as join requests.
6. **No feature flag.** Admins see and approve every request.

Mockups: `.superpowers/brainstorm/22374-1792493048/content/request-card-v2.html`
(direction A, states A1–A3; gitignored, not committed).

## Requester: join dialog

`components/JoinRequestDialog.tsx` keeps its layout: optional note, then
"Have you played in this league before?" with Yes and No.

- **Yes:** the existing `PlayerClaimPicker` (selection only). Below it, a new
  link: "Can't find your name? Send without it". Choosing it replaces the
  picker with a muted line, "No problem, the admin will find you or add you
  when they approve.", with a "Pick my name" link to go back.
- **No:** unchanged. Nothing to type.

The request body becomes `{ message, player_name, played_before }`:

| Choice | `player_name` | `played_before` |
|---|---|---|
| Yes, picked a name | the name | `true` |
| Yes, can't find name | `null` | `true` |
| No | `null` | `false` |
| Neither chosen | `null` | `null` |

"Neither chosen" stays allowed, as today; the admin card treats it like
"No".

Sending no longer creates a `player_claims` row. Nothing is reserved or
created until an admin approves.

## Admin: Settings → Members

### One list

`PendingRequestsTable` and `PlayerClaimsTable` are replaced by one component,
`components/PendingReviewList.tsx`, headed **"Waiting for you (n)"**. It lists
pending join requests (oldest first) followed by pending member claims (claims
from users who don't have a pending join request). Each item renders a
`components/ReviewCard.tsx`.

The settings page passes in the roster it already loads from
`GET /api/league/[id]/players` (`PlayerAttribute[]` with `played` and
`linked_display_name`). The page loads it for the Members tab as well as the
Players tab. The card uses it for the squad list, game counts and both
warnings, so it no longer calls `get_unclaimed_players`.

### Card anatomy

- **Header:** initials avatar, display name, email, relative time
  ("2 days ago"), and the requester's note in italics (clamped to two lines,
  tap to expand, as today). Member claims show "Wants to link to a player"
  in place of the note.
- **Plays as box:** see states below.
- **Footer:** "Decline" (ghost, left) and "Approve" (primary, right).

### Plays as states

The card starts from what the person chose:

| Person chose | Card opens on |
|---|---|
| A name | **Existing**: that player, marked "Their pick" |
| Can't find name | **Squad list** open, with the note "They've played before but couldn't find their name." |
| New, or nothing | **New player**, name field filled with their profile display name |
| Member claim | **Existing**: the claimed player, marked "Their pick" |

**Existing.** One line: player name, "· N games" (or "· no games yet"), the
"Their pick" tag when it is what they chose, and a "Change" link. "Change"
opens the squad list in place.

**Squad list.** A search field over the roster, each row showing the name and
game count. Players already linked to another account are listed but
disabled, with "Linked to {name}". Picking a row returns to **Existing**. The
foot of the list has "+ Not in the list? Add as a new player", which switches
to **New player**.

**New player.** Label "Plays as · new player", a text input the admin can
edit straight away, the hint "Added to the squad when you approve." (or "They
said they're new. Added to the squad when you approve." when they chose No),
and the link "Already in the squad? Pick them", which opens the squad list.

### Warnings (Approve disabled while shown)

- **Name clash.** In **New player**, if the trimmed name matches a roster
  name case-insensitively (the same rule as `NewPlayerForm`), the box border
  and input turn amber (`#fbbf24`) with "There's already a {name} in the
  squad." and a "Link to {name} instead" link that switches to **Existing**
  with that player. The link is hidden if that player is linked to someone
  else.
- **Already linked.** In **Existing**, if the player has a
  `linked_display_name` that isn't this person, the line turns amber with
  "{player} is already linked to {name}." and "Change" stays available.
  Two requesters can now pick the same name, since picking no longer
  reserves it, so this is the guard.
- An empty new-player name also disables Approve.

### Approve and Decline

- **Approve (join request)** → `POST /api/league/[id]/join-requests/[requestId]/approve`
  with `{ player_name, create_player }`.
- **Approve (member claim)** → `POST /api/league/[id]/player-claims/[claimId]/approve`
  with the same body.
- **Decline (join request)** → the existing review route with
  `action: 'declined'`.
- **Decline (member claim)** → the existing claim review route with
  `action: 'rejected'`.

On success the card is removed and `onChanged` runs, which reloads the list,
members and roster and refreshes the router so the banner updates (as
`handlePendingChanged` does today). Errors show under the card's footer in
`#e2686f`. A 409 from the server (clash or already linked, decided after the
card loaded) shows its message and reloads the roster.

The requester notification email (`notifyRequesterOfReview`) still
sends on join approve and decline.

## Database (hand-run migration)

One migration, `supabase/migrations/20261020000001_single_step_join_review.sql`:

1. `ALTER TABLE game_join_requests ADD COLUMN played_before boolean;`
   (nullable; existing rows stay null).
2. `submit_join_request(p_game_id, p_message, p_player_name, p_played_before)`:
   same checks as today, stores `player_name` and `played_before`, and no
   longer inserts into `player_claims`. The 3-argument version is dropped.
   The old 2-argument version is dropped if it still exists.
3. `get_join_requests` also returns `player_name` and `played_before`.
4. New `approve_join_request(p_request_id uuid, p_player_name text, p_create_player boolean)`,
   SECURITY DEFINER, admin or creator only, in one transaction:
   - request must be pending, else raise `request_not_pending`
   - trimmed name must be non-empty
   - if `p_create_player`: raise `player_exists` if a `player_attributes` row
     matches case-insensitively, else insert one with the defaults used by
     "+ Add player" (strength average, mentality balanced)
   - if not: raise `player_not_found` unless the name is on the roster or
     in a played line-up (older players may have no `player_attributes` row)
   - raise `player_already_linked` if an approved claim on that name belongs
     to another user, and `player_claim_pending` if another user has a
     pending claim on it (the claims table allows one live claim per name)
   - insert `game_members (…, 'member') ON CONFLICT DO NOTHING`
   - upsert an approved `player_claims` row for `(game_id, user_id)` with the
     name and a null override (as `assign_player_link` does)
   - set the request to approved with `reviewed_by`
5. New `approve_player_claim(p_claim_id uuid, p_player_name text, p_create_player boolean)`:
   the same player steps for a pending member claim, then sets the claim
   approved with `player_name` = the chosen name and a null override.
6. `review_join_request` on decline also sets any pending `player_claims` row
   for that user and league to rejected. This cleans up claims left by
   requests made before this change.

`review_player_claim` and `assign_player_link` are unchanged. The app stops
calling `review_player_claim` for approvals but keeps it for rejecting.

The player steps live in one internal helper, `link_reviewed_player`, used
by both approve functions and not callable by clients.

The API routes map the raised errors to 409 (`player_exists`,
`player_already_linked`, `player_claim_pending`, `request_not_pending`,
`claim_not_pending`) and 400 (`player_not_found`,
empty name), with British English messages, for example "There's already a
John E in the squad."

### Requests waiting when this ships

Pending requests made before the migration have `player_name` set on the
request, plus a pending claim. The card reads `player_name` from the request,
so they show as "Their pick". Approving upserts the claim to approved.
Declining rejects it (step 6). `played_before` is null for them; if
`player_name` is null too, the card treats it as "New".

`get_unclaimed_players` still excludes names with pending claims, which now
only come from member claims and legacy rows.

## Banner and counts

`getPendingRequests` and `getPendingBadgeCount` keep their logic: join
requests, plus member claims from users without a pending join request.
`pendingRequestsBannerText` copy is unchanged. `PendingRequestSummary` is
unchanged.

## Types

In `lib/types.ts`:

- `PendingJoinRequest` gains `player_name: string | null` and
  `played_before: boolean | null`.
- `ReviewItem` is a union, `{ kind: 'join'; request: PendingJoinRequest } |
  { kind: 'claim'; claim: PlayerClaim }`, used by `PendingReviewList`.

## Removed

- `components/PendingRequestsTable.tsx` and `components/PlayerClaimsTable.tsx`.
- The `standaloneClaims` split in `app/[slug]/settings/page.tsx` moves into
  `PendingReviewList`.

## Not changing

- The "Link player" buttons on the Members table and the Players tab.
- The claim flow in a member's own settings (`submit_player_claim`).
- Notification emails.
- The banner component and its link to `?tab=members`.

## Testing

- `components/__tests__/ReviewCard.test.tsx`:
  - opens on Existing with "Their pick" for a picked name
  - opens on the squad list with the hint for "can't find name"
  - opens on New player with the profile name for "new" and for null
  - Change → pick a row → Existing with that player
  - "Add as a new player" and "Already in the squad? Pick them" switch modes
  - name clash shows the warning, disables Approve, and "Link to … instead"
    switches to Existing
  - already-linked player shows the warning and disables Approve
  - Approve posts the right body to the right route for join and claim
  - Decline posts the decline action
  - a 409 shows the server message
- `components/__tests__/PendingReviewList.test.tsx`: orders join requests
  before member claims and drops claims from users with a pending request.
- `components/__tests__/JoinRequestDialog.test.tsx`: the "Can't find your
  name?" link sends `player_name: null, played_before: true`; No sends
  `played_before: false`.
- Route tests for both approve routes: body validation and error mapping.

The SQL is checked by hand in the Supabase SQL Editor. There is no local
Postgres.
