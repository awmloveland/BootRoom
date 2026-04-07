# Join Flow Bugs — Design Spec
**Date:** 2026-04-07

## Problem Summary

A new user signed up via the public league join flow and encountered two failures:

1. **"Failed to load player names"** when trying to link themselves to a player in the join dialog.
2. **Join request never reached the admin** — admin sees no pending requests in Settings → Members.

Additionally, the admin UI gives no feedback when there are zero pending requests, making it impossible to distinguish "none yet" from "fetch failed."

---

## Root Causes

### Bug 1 — `get_unclaimed_players` blocks non-members

`GET /api/league/[id]/player-claims` calls the `get_unclaimed_players` RPC, which checks `game_members` before returning data:

```sql
IF NOT EXISTS (
  SELECT 1 FROM game_members WHERE game_id = p_game_id AND user_id = auth.uid()
) THEN
  RAISE EXCEPTION 'Access denied';
END IF;
```

The user calling this endpoint is trying to **join** the league — they are not yet a member. This always returns 403, causing the "Failed to load player names" error in `PlayerClaimPicker`.

### Bug 2 — `submit_join_request` fails silently when no profile exists

The `submit_join_request` RPC (harden version) looks up `email` and `display_name` from the `profiles` table:

```sql
SELECT email, display_name INTO v_email, v_display_name
FROM profiles WHERE id = v_user_id;
```

If no profile row exists (e.g. `claim_profile` ran without an active session — which can happen silently when Supabase email confirmation is enabled), `v_email` is NULL. The subsequent INSERT into `game_join_requests` then fails with a NOT NULL constraint violation, which surfaces as a generic 500 → "Something went wrong" in the dialog. The user clicked Send but the request was never created.

### UX gap — Admin pending requests section hidden when empty

The Members tab only renders the pending requests block when `pendingRequests.length > 0`. When the array is empty (whether because there are genuinely no requests, or because the fetch errored silently), the section is completely absent. Admins have no way to confirm the state.

---

## Design

### 1. DB Migration: Fix `get_unclaimed_players`

Replace the `game_members` membership check with an auth-only check.

**Before:**
```sql
IF NOT EXISTS (
  SELECT 1 FROM game_members WHERE game_id = p_game_id AND user_id = auth.uid()
) THEN
  RAISE EXCEPTION 'Access denied';
END IF;
```

**After:**
```sql
IF auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Not authenticated';
END IF;
```

**Rationale:** Player names come from `weeks.team_a`/`team_b`, which are already visible in public match results. Any signed-in user can safely see the list of unclaimed names for a league they are attempting to join. Cross-league leakage is not a concern: the function filters by `p_game_id` and returns nothing for an invalid or unrelated game ID.

**Migration file:** `supabase/migrations/20260407000001_fix_unclaimed_players_auth.sql`

---

### 2. DB Migration: Harden `submit_join_request`

Add an explicit profile existence check immediately after the uid-null guard, before the profile lookup SELECT.

```sql
IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
  RAISE EXCEPTION 'profile_not_found';
END IF;
```

This converts a silent NOT NULL constraint violation into a named, catchable exception.

**API route update** (`POST /api/league/[id]/join-requests`): handle `profile_not_found` → return 422 with:
```json
{ "error": "profile_not_found" }
```

**Dialog update** (`JoinRequestDialog`): handle 422 specifically and show:
> "Your profile isn't set up yet — try signing out and back in."

**Migration file:** `supabase/migrations/20260407000002_harden_submit_join_request.sql`

---

### 3. Admin UX: Pending requests visibility

**Current behaviour:** The pending requests block is conditionally rendered only when `pendingLoading || pendingRequests.length > 0`. When loading finishes with zero results, the block disappears entirely.

**New behaviour:** After loading completes (`!pendingLoading`), always render the pending requests section. When `pendingRequests.length === 0`, show a single line:

```
No pending requests
```

When `pendingRequests.length > 0`, render the existing `PendingRequestsTable` unchanged.

**File:** `app/[leagueId]/settings/page.tsx` — update the members section conditional.

---

### 4. Immediate Workaround (no code change)

While the fix is being deployed, use the existing **member invite link** in Settings → Members → Copy. Send it directly to the affected user. When she accepts, she joins as a member immediately — no approval queue. Once she is a member, link her player identity from Settings → Players.

---

## Files Changed

| File | Change |
|---|---|
| `supabase/migrations/20260407000001_fix_unclaimed_players_auth.sql` | New migration — relax `get_unclaimed_players` to auth-only |
| `supabase/migrations/20260407000002_harden_submit_join_request.sql` | New migration — add `profile_not_found` guard |
| `app/api/league/[id]/join-requests/route.ts` | Handle `profile_not_found` → 422 |
| `components/JoinRequestDialog.tsx` | Handle 422 with user-friendly message |
| `app/[leagueId]/settings/page.tsx` | Always show pending requests state after load |

---

## Out of Scope

- Changes to the `claim_profile` function itself (it will continue to silently no-op when called without a session; the guard in `submit_join_request` is the correct place to catch this)
- Email confirmation settings in Supabase Auth (operational, not a code change)
- New player-picker UI improvements beyond what's needed for the bug fix
