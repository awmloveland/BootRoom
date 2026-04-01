# League Join Flow — Design Spec

**Date:** 2026-04-01
**Status:** Approved

---

## Overview

Allow visitors and unauthenticated users to request membership to a league directly from the public league page. Admins review and approve or decline requests. The feature is delivered in three sequential phases.

---

## Phases

### Phase 1 — Sign-up + Join Request Submission
- Smart Join/Share button on the league page
- Re-add signup mode to AuthDialog (first name, last name, email, password)
- JoinRequestDialog with optional message
- `game_join_requests` DB table + API route to submit a request

### Phase 2 — Admin Review UI + Notification Badge
- Pending Requests section in Settings → Members tab
- Approve / Decline actions
- Red notification dot on settings gear icon when pending requests exist

### Phase 3 — Edge Case Hardening
- Duplicate request prevention (DB constraint + API guard)
- Declined users can re-request
- Admin approving an already-member is a no-op
- Audit trail: all requests retained in DB with final status

---

## Database

### New table: `game_join_requests`

```sql
CREATE TABLE game_join_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text NOT NULL,
  display_name text NOT NULL,
  message      text,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'declined')),
  reviewed_by  uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, user_id)
);
```

### RPCs

| RPC | Who can call | Description |
|---|---|---|
| `submit_join_request(game_id, message)` | Any authenticated user | Inserts a pending request. Raises an error if a pending request already exists (caught by API as 409). |
| `review_join_request(request_id, action)` | Admin/creator only | Sets status; if `approved`, inserts row into `game_members` (role: `member`). |
| `get_join_requests(game_id)` | Admin/creator only | Returns all pending requests for the league. |

RLS: users can only read their own rows. Admins can read all rows for their leagues.

---

## Phase 1 — UI Detail

### Join/Share Button (`LeaguePageHeader.tsx`)

Sits alongside the existing settings icon (lines 38–44) in `LeaguePageHeader`. Visible to all visitors.

| User state | Button label | Variant | Action |
|---|---|---|---|
| Not signed in | Join | primary | Opens AuthDialog in `signup` mode, with `leagueId` in context |
| Signed in, not a member, no pending request | Join | primary | Opens JoinRequestDialog |
| Signed in, pending request | Request pending | ghost, disabled | None |
| Signed in, member or admin | Share | ghost | Copies league URL to clipboard, shows brief "Link copied" toast |

The user's join request status is resolved server-side in `getAuthAndRole()` (or a new parallel fetch) and passed as a prop. No client-side polling.

### AuthDialog — Signup Mode

Re-add `signup` to the `mode` union (`'signin' | 'forgot' | 'signup'`).

Fields:
- First name (required)
- Last name (required)
- Email (required)
- Password (required, min 8 chars)

On successful sign-up → immediately open JoinRequestDialog for the current league. Email confirmation (if enabled in Supabase) happens in the background and does not gate the join request.

### JoinRequestDialog

A Radix Dialog modal:
- Heading: "Request to join [League Name]"
- Optional textarea: "Add a note (optional)" — placeholder: "e.g. I play on Tuesdays with the 5-a-side crew"
- Primary CTA: "Send request"
- On submit → `POST /api/league/[id]/join-requests`
- On success → dialog closes, button transitions to "Request pending" state

### API Route: `POST /api/league/[id]/join-requests`

- Requires authenticated session
- Calls `submit_join_request(game_id, message)`
- Returns `201` on success
- Returns `409` if request already exists or user is already a member

---

## Phase 2 — UI Detail

### Pending Requests section (`app/[leagueId]/settings/page.tsx`, Members tab)

Renders above the existing member list. Only shown when `pendingRequests.length > 0`.

Each row:
- Display name + email
- Optional message (2-line clamp, expand on hover/click if needed)
- **Approve** button (primary) + **Decline** button (ghost/destructive)

On approve/decline → `POST /api/league/[id]/join-requests/[requestId]/review` with `{ action: 'approved' | 'declined' }` → row removed from list optimistically.

### Notification badge (`LeaguePageHeader.tsx`)

Admins with ≥1 pending request see a `size-2 rounded-full bg-red-500` dot absolutely positioned over the top-right of the settings gear icon. Pending count fetched server-side alongside existing page data — no polling.

### API Route: `POST /api/league/[id]/join-requests/[requestId]/review`

- Requires admin/creator role (checked via existing `is_game_admin()` RPC)
- Body: `{ action: 'approved' | 'declined' }`
- Calls `review_join_request(request_id, action)`
- If approved: inserts into `game_members` with `role: 'member'`
- Returns `200` on success; `404` if request not found; `409` if already a member (approved gracefully)

---

## Phase 3 — Edge Case Hardening

| Scenario | Handling |
|---|---|
| Duplicate request | `UNIQUE(game_id, user_id)` at DB level; API returns `409` |
| Declined user re-requests | Declined status does not block a new request (upsert resets to `pending`) |
| Admin approves already-member | RPC checks `game_members` first; returns success without duplicating |
| User account deleted | `ON DELETE CASCADE` on `game_join_requests.user_id` cleans up automatically |
| Request with no matching user | Not possible — `submit_join_request` requires an authenticated session |

---

## Files Affected

### Phase 1
- `supabase/migrations/` — new migration for `game_join_requests` table + RPCs
- `lib/types.ts` — add `JoinRequest` type + `JoinRequestStatus`
- `components/LeaguePageHeader.tsx` — add Join/Share button
- `components/AuthDialog.tsx` — re-add `signup` mode
- `components/JoinRequestDialog.tsx` — new component
- `app/api/league/[id]/join-requests/route.ts` — POST handler

### Phase 2
- `app/[leagueId]/settings/page.tsx` — add Pending Requests section
- `components/PendingRequestsTable.tsx` — new component
- `components/LeaguePageHeader.tsx` — add notification badge
- `app/api/league/[id]/join-requests/[requestId]/review/route.ts` — POST handler
- `lib/fetchers.ts` — add `getPendingJoinRequests(leagueId)`

### Phase 3
- `app/api/league/[id]/join-requests/route.ts` — upsert on re-request after decline
- `supabase/migrations/` — RLS policies, index on `(game_id, status)`

---

## Implementation Prompts

Each prompt below is self-contained and can be pasted directly into a new workspace.

---

### Phase 1 Prompt

```
Implement Phase 1 of the league join flow for the BootRoom app at /Users/willloveland/conductor/workspaces/bootroom/oslo-v1.

Spec: docs/superpowers/specs/2026-04-01-league-join-flow-design.md (read this first).

Tasks:
1. Write a Supabase migration creating the `game_join_requests` table and the `submit_join_request` RPC (see spec for schema).
2. Add `JoinRequest` and `JoinRequestStatus` types to `lib/types.ts`.
3. Create `POST /api/league/[id]/join-requests/route.ts` — authenticated, calls `submit_join_request`, returns 201 or 409.
4. Re-add `signup` mode to `components/AuthDialog.tsx` — fields: first name, last name, email, password. On success, trigger the JoinRequestDialog for the current league if a leagueId is in context.
5. Create `components/JoinRequestDialog.tsx` — Radix Dialog with optional message textarea and "Send request" CTA.
6. Update `components/LeaguePageHeader.tsx` — add Join/Share button alongside the settings icon with the four states described in the spec. Button state is resolved from a new `joinStatus` prop passed from the page.
7. Update `app/[leagueId]/results/page.tsx` — fetch the current user's join request status server-side and pass it to LeaguePageHeader.

IMPORTANT: Before writing any code, present UI mockups or sketches for each new UI element (the button states, AuthDialog signup mode, JoinRequestDialog) and get approval before implementing.

Follow all conventions in CLAUDE.md: Tailwind only, cn() for conditional classes, dark-mode slate palette, no new libraries.
```

---

### Phase 2 Prompt

```
Implement Phase 2 of the league join flow for the BootRoom app at /Users/willloveland/conductor/workspaces/bootroom/oslo-v1.

Spec: docs/superpowers/specs/2026-04-01-league-join-flow-design.md (read this first). Phase 1 must already be merged.

Tasks:
1. Write a Supabase migration adding `review_join_request` and `get_join_requests` RPCs (see spec).
2. Create `POST /api/league/[id]/join-requests/[requestId]/review/route.ts` — admin-only, approve or decline, inserts into game_members if approved.
3. Add `getPendingJoinRequests(leagueId)` to `lib/fetchers.ts`.
4. Create `components/PendingRequestsTable.tsx` — renders pending requests with Approve/Decline buttons.
5. Update `app/[leagueId]/settings/page.tsx` — add Pending Requests section above the member list in the Members tab, only shown when requests exist.
6. Update `components/LeaguePageHeader.tsx` — add red dot notification badge on the settings gear icon for admins with pending requests. Fetch pending count server-side.

IMPORTANT: Before writing any code, present UI mockups or sketches for the Pending Requests section and the notification badge, and get approval before implementing.

Follow all conventions in CLAUDE.md.
```

---

### Phase 3 Prompt

```
Implement Phase 3 of the league join flow for the BootRoom app at /Users/willloveland/conductor/workspaces/bootroom/oslo-v1.

Spec: docs/superpowers/specs/2026-04-01-league-join-flow-design.md (read this first). Phases 1 and 2 must already be merged.

Tasks:
1. Update `submit_join_request` RPC (or add a new migration) to upsert — if a declined request exists for the same user+league, reset it to `pending` so the user can re-request.
2. Add a DB index on `(game_id, status)` for query performance.
3. Add RLS policies so users can only read their own rows; admins can read all rows for their leagues.
4. Update `POST /api/league/[id]/join-requests` to handle the upsert case cleanly (no 409 on re-request after decline).
5. Test all edge cases from the spec: duplicate request, declined re-request, admin approves already-member, cascade delete.

Follow all conventions in CLAUDE.md.
```
