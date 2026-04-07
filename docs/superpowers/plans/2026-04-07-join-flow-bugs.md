# Join Flow Bugs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix "failed to load player names" in the join dialog, harden silent join-request submission failures, and make the admin pending-requests section always show a definite state.

**Architecture:** Two SQL migrations fix the DB layer (relax `get_unclaimed_players` auth check; add a `profile_not_found` guard to `submit_join_request`). Two frontend files handle the new 422 response and always-visible pending-requests UI. No new files — all changes are targeted edits.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (PostgreSQL + RLS), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-07-join-flow-bugs-design.md`

---

## File Map

| File | Change type | Purpose |
|---|---|---|
| `supabase/migrations/20260407000001_fix_unclaimed_players_auth.sql` | Create | Relax `get_unclaimed_players` to auth-only |
| `supabase/migrations/20260407000002_harden_submit_join_request.sql` | Create | Add `profile_not_found` guard to `submit_join_request` |
| `app/api/league/[id]/join-requests/route.ts` | Modify | Map `profile_not_found` exception → 422 |
| `components/JoinRequestDialog.tsx` | Modify | Handle 422 with user-friendly message |
| `app/[leagueId]/settings/page.tsx` | Modify | Always render pending-requests state after load |

---

## Task 1: Migration — fix `get_unclaimed_players`

**Files:**
- Create: `supabase/migrations/20260407000001_fix_unclaimed_players_auth.sql`

- [ ] **Step 1: Write the migration**

Create the file with this exact content:

```sql
-- supabase/migrations/20260407000001_fix_unclaimed_players_auth.sql
--
-- The join dialog calls get_unclaimed_players before the user is a league member.
-- The previous game_members check always returned 'Access denied' for non-members,
-- causing "Failed to load player names" in the join flow.
-- Player names come from weeks.team_a / team_b which are already visible in public
-- match results, so authentication-only access is appropriate.
--
CREATE OR REPLACE FUNCTION public.get_unclaimed_players(p_game_id uuid)
RETURNS TABLE (player_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.name
  FROM weeks w
  CROSS JOIN LATERAL (
    SELECT jsonb_array_elements_text(w.team_a) AS name
    UNION
    SELECT jsonb_array_elements_text(w.team_b) AS name
  ) p
  WHERE w.game_id = p_game_id
    AND w.status = 'played'
    AND NOT EXISTS (
      SELECT 1 FROM player_claims pc
      WHERE pc.game_id = p_game_id
        AND pc.player_name = p.name
        AND pc.status IN ('pending', 'approved')
    )
  ORDER BY p.name;
END;
$$;
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Copy the file contents into the Supabase dashboard → SQL Editor and run it.

Expected: `Success. No rows returned.`

- [ ] **Step 3: Verify the function definition updated**

Run this in SQL Editor:

```sql
SELECT prosrc
FROM pg_proc
JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
WHERE proname = 'get_unclaimed_players'
  AND nspname = 'public';
```

Expected: the function body should contain `IF auth.uid() IS NULL` and no longer reference `game_members`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260407000001_fix_unclaimed_players_auth.sql
git commit -m "fix: relax get_unclaimed_players to auth-only for join dialog"
```

---

## Task 2: Migration — harden `submit_join_request`

**Files:**
- Create: `supabase/migrations/20260407000002_harden_submit_join_request.sql`

- [ ] **Step 1: Write the migration**

Create the file with this exact content:

```sql
-- supabase/migrations/20260407000002_harden_submit_join_request.sql
--
-- Adds an explicit profile existence check to submit_join_request.
-- Previously, if claim_profile ran without an active session (silently no-ops),
-- the profile row would not exist. The subsequent SELECT email FROM profiles
-- would return NULL, causing the INSERT into game_join_requests to fail with a
-- NOT NULL constraint violation — surfaced as a generic 500 in the API.
-- This change converts that silent failure to a named exception the API can map
-- to a 422 with a user-friendly message.
--
CREATE OR REPLACE FUNCTION public.submit_join_request(
  p_game_id UUID,
  p_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      UUID;
  v_email        TEXT;
  v_display_name TEXT;
  v_existing     game_join_requests%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Block if already a league member
  IF EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Already a member';
  END IF;

  -- Verify profile exists before attempting insert (profile may be missing if
  -- claim_profile ran without an active session and silently no-oped)
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Check for any existing request row for this user+league
  SELECT * INTO v_existing
  FROM game_join_requests
  WHERE game_id = p_game_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing.status = 'pending' THEN
      RAISE EXCEPTION 'Request already pending';
    ELSIF v_existing.status = 'approved' THEN
      RAISE EXCEPTION 'Already a member';
    ELSIF v_existing.status = 'declined' THEN
      UPDATE game_join_requests
      SET status     = 'pending',
          message    = p_message,
          updated_at = now()
      WHERE id = v_existing.id;
      RETURN;
    END IF;
  END IF;

  -- Look up profile details and insert fresh row
  SELECT email, display_name INTO v_email, v_display_name
  FROM profiles
  WHERE id = v_user_id;

  INSERT INTO game_join_requests (game_id, user_id, email, display_name, message)
  VALUES (p_game_id, v_user_id, v_email, COALESCE(v_display_name, v_email), p_message);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_join_request(UUID, TEXT) TO authenticated;
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Copy the file contents into the Supabase dashboard → SQL Editor and run it.

Expected: `Success. No rows returned.`

- [ ] **Step 3: Verify the guard was added**

Run this in SQL Editor:

```sql
SELECT prosrc
FROM pg_proc
JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
WHERE proname = 'submit_join_request'
  AND nspname = 'public';
```

Expected: the function body should contain `profile_not_found`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260407000002_harden_submit_join_request.sql
git commit -m "fix: add profile_not_found guard to submit_join_request"
```

---

## Task 3: API route — map `profile_not_found` → 422

**Files:**
- Modify: `app/api/league/[id]/join-requests/route.ts`

Current POST error handling block (lines ~50–62):

```ts
if (error) {
  if (
    error.message?.includes('Request already pending') ||
    error.message?.includes('Already a member')
  ) {
    return NextResponse.json(
      { error: 'Request already exists or you are already a member' },
      { status: 409 }
    )
  }
  console.error('[join-requests POST]', error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```

- [ ] **Step 1: Add the `profile_not_found` case**

Replace the error handling block above with:

```ts
if (error) {
  if (
    error.message?.includes('Request already pending') ||
    error.message?.includes('Already a member')
  ) {
    return NextResponse.json(
      { error: 'Request already exists or you are already a member' },
      { status: 409 }
    )
  }
  if (error.message?.includes('profile_not_found')) {
    return NextResponse.json({ error: 'profile_not_found' }, { status: 422 })
  }
  console.error('[join-requests POST]', error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/league/\[id\]/join-requests/route.ts
git commit -m "fix: map profile_not_found to 422 in join-requests route"
```

---

## Task 4: JoinRequestDialog — handle 422

**Files:**
- Modify: `components/JoinRequestDialog.tsx`

Current `handleSubmit` response handling (lines ~71–86):

```ts
if (res.status === 201) {
  setSubmitted(true)
  return
}

if (res.status === 409) {
  setError("You've already sent a request to this league.")
  return
}

setError('Something went wrong. Please try again.')
```

- [ ] **Step 1: Add the 422 case**

Replace the block above with:

```ts
if (res.status === 201) {
  setSubmitted(true)
  return
}

if (res.status === 409) {
  setError("You've already sent a request to this league.")
  return
}

if (res.status === 422) {
  setError("Your profile isn't set up yet — try signing out and back in.")
  return
}

setError('Something went wrong. Please try again.')
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/JoinRequestDialog.tsx
git commit -m "fix: show profile setup error message on 422 in join dialog"
```

---

## Task 5: Admin settings — always show pending requests state

**Files:**
- Modify: `app/[leagueId]/settings/page.tsx`

Find the members section in the JSX (around line 339). Current block:

```tsx
{/* Pending join requests */}
{(pendingLoading || pendingRequests.length > 0) && (
  pendingLoading ? (
    <p className="text-slate-400 text-sm">Loading requests…</p>
  ) : (
    <PendingRequestsTable
      leagueId={leagueId}
      initialRequests={pendingRequests}
      pendingClaims={pendingClaims}
    />
  )
)}
```

- [ ] **Step 1: Replace with always-visible state**

Replace the block above with:

```tsx
{/* Pending join requests */}
{pendingLoading ? (
  <p className="text-slate-400 text-sm">Loading requests…</p>
) : pendingRequests.length > 0 ? (
  <PendingRequestsTable
    leagueId={leagueId}
    initialRequests={pendingRequests}
    pendingClaims={pendingClaims}
  />
) : (
  <p className="text-sm text-slate-500">No pending requests.</p>
)}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke-test in the browser**

Start the dev server (`npm run dev`), sign in as admin, go to Settings → Members. Confirm:
- While loading: "Loading requests…" appears
- After load with zero pending requests: "No pending requests." appears
- After load with a pending request: the `PendingRequestsTable` renders as before

- [ ] **Step 4: Commit**

```bash
git add app/\[leagueId\]/settings/page.tsx
git commit -m "fix: always show pending requests state in admin members tab"
```

---

## Task 6: End-to-end smoke test

No automated tests cover the join flow (it requires a live Supabase session). Manually verify the full fix.

- [ ] **Step 1: Open the public league page in a private browser window (unauthenticated)**

Navigate to `/{leagueId}/results`. Confirm the "Join League" button is visible.

- [ ] **Step 2: Click "Join League" and sign up**

Fill in the signup form and submit. Confirm:
- No "Profile setup failed" error appears
- The `JoinRequestDialog` opens automatically

- [ ] **Step 3: Select "Yes" (played before) and confirm player names load**

Confirm:
- The `PlayerClaimPicker` shows a list of player names (no "Failed to load player names" error)
- You can search and select a name

- [ ] **Step 4: Submit the join request**

Click "Send request". Confirm:
- "Request sent!" screen appears (not "Something went wrong")

- [ ] **Step 5: Verify the request appears for admin**

In a separate window signed in as admin, go to Settings → Members. Confirm:
- The pending request row is visible with the correct display name and email
- The attached player claim chip (if a player was selected in step 3) appears

- [ ] **Step 6: Approve the request**

Click "Approve". Confirm:
- The request row disappears
- The "No pending requests." message appears
- The approved user now appears in the member list below
