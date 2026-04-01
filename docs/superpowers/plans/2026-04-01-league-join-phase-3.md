# League Join Flow — Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the join flow against edge cases: allow declined users to re-request, add a DB index for query performance, and add RLS policies so users can only read their own request rows.

**Architecture:** A new migration updates `submit_join_request` to upsert (resetting declined rows to pending) and adds RLS policies and a performance index. The API route is updated to handle the upsert cleanly — no 409 on a re-request after a decline.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + RLS), TypeScript strict

**Prerequisite:** Phases 1 and 2 must be merged before starting this plan.

---

## File Map

| Action | File |
|---|---|
| Create | `supabase/migrations/20260401000002_harden_join_requests.sql` |
| Modify | `app/api/league/[id]/join-requests/route.ts` |

---

## Task 1: Database Migration — Upsert, RLS, Index

**Files:**
- Create: `supabase/migrations/20260401000002_harden_join_requests.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Update submit_join_request to upsert:
-- If a declined request exists for the same user+league, reset it to pending.
-- If a pending request already exists, raise an error (caught as 409 in the API).
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

  -- Block if already a member
  IF EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Already a member';
  END IF;

  -- Check for existing request
  SELECT * INTO v_existing
  FROM game_join_requests
  WHERE game_id = p_game_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing.status = 'pending' THEN
      -- Still pending — raise so API returns 409
      RAISE EXCEPTION 'Request already pending';
    ELSIF v_existing.status = 'approved' THEN
      -- Already approved (edge case — should be a member already)
      RAISE EXCEPTION 'Already a member';
    ELSIF v_existing.status = 'declined' THEN
      -- Re-request after decline: reset to pending with new message
      UPDATE game_join_requests
      SET status     = 'pending',
          message    = p_message,
          updated_at = now()
      WHERE id = v_existing.id;
      RETURN;
    END IF;
  END IF;

  -- Read profile details
  SELECT email, display_name INTO v_email, v_display_name
  FROM profiles
  WHERE id = v_user_id;

  -- Fresh insert
  INSERT INTO game_join_requests (game_id, user_id, email, display_name, message)
  VALUES (p_game_id, v_user_id, v_email, COALESCE(v_display_name, v_email), p_message);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_join_request(UUID, TEXT) TO authenticated;

-- Performance index: querying pending requests by league is the hot path
CREATE INDEX IF NOT EXISTS idx_game_join_requests_game_status
  ON public.game_join_requests (game_id, status);

-- RLS: enable row-level security
ALTER TABLE public.game_join_requests ENABLE ROW LEVEL SECURITY;

-- Policy: users can read their own requests
CREATE POLICY "Users can read own join requests"
  ON public.game_join_requests
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: only the submit_join_request and review_join_request RPCs write rows
-- (both are SECURITY DEFINER, so they bypass RLS — no additional INSERT/UPDATE policies needed for anon)
-- Admins query via the get_join_requests RPC (SECURITY DEFINER), so no SELECT policy needed for admin reads.
```

- [ ] **Step 2: Run the migration**

Paste into the Supabase SQL Editor and execute. Verify:
- The `submit_join_request` function is updated (check Database → Functions)
- The index `idx_game_join_requests_game_status` appears in Database → Indexes
- RLS is enabled on `game_join_requests` (Table Editor → game_join_requests → RLS tab shows "Enabled")

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260401000002_harden_join_requests.sql
git commit -m "feat: harden join requests with upsert, RLS, and index"
```

---

## Task 2: Update API Route — Handle Re-request After Decline

**Files:**
- Modify: `app/api/league/[id]/join-requests/route.ts`

The Phase 1 API route treats any RPC error as either a 409 (duplicate) or 500. With Phase 3's upsert logic, a re-request after decline now succeeds (the RPC returns without error). No code change is needed for the happy path. However, the error-matching logic should be tightened so it only returns 409 for the "Request already pending" and "Already a member" cases.

- [ ] **Step 1: Update the error matching in the POST handler**

Open `app/api/league/[id]/join-requests/route.ts`. Find the error handling block:

```ts
if (error) {
  if (
    error.message.includes('Already a member') ||
    error.message.includes('duplicate key')
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

Replace with:

```ts
if (error) {
  if (
    error.message.includes('Request already pending') ||
    error.message.includes('Already a member')
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Manual edge case tests**

With the dev server running, test each edge case:

**Duplicate pending request:**
- Submit a join request as user A for league X
- Submit again without admin review
- Expect: second request returns 409 and shows no duplicate in the DB

**Re-request after decline:**
- Submit a join request as user A for league X
- Admin declines the request
- User A's button should show "Join" again (not "Request pending")
- User A submits a new request
- Expect: the existing declined row is reset to `pending` (check DB), not a new row
- Admin sees the request again in Settings → Members

**Admin approves already-member:**
- Manually insert a row in `game_members` for a user who has a pending request
- Admin approves the pending request via the UI
- Expect: no error, the `game_members` insert is a no-op (ON CONFLICT DO NOTHING)

**Cascade delete:**
- In Supabase, delete a user from `auth.users`
- Expect: their `game_join_requests` row is deleted automatically

- [ ] **Step 4: Commit**

```bash
git add app/api/league/[id]/join-requests/route.ts
git commit -m "feat: tighten error matching for re-request after decline"
```

---

## Final Phase 3 Check

- [ ] Run `npx tsc --noEmit` — no errors
- [ ] Run `npm run build` — builds successfully
- [ ] All manual edge case tests from Task 2 Step 3 pass
- [ ] RLS is confirmed enabled in Supabase dashboard
- [ ] Index confirmed present in Supabase dashboard
