# Player Identity Claim — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the DB foundation and API routes for the player identity claim feature — no UI changes.

**Architecture:** A `player_claims` table with a partial unique index prevents name conflicts. Six SECURITY DEFINER RPCs handle all mutations and queries (bypassing RLS safely). Four Next.js API routes wrap the RPCs using the same patterns as `join-requests`.

**Tech Stack:** PostgreSQL (Supabase), Next.js 14 App Router, TypeScript strict

---

## Files

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260403000001_player_claims.sql` | Create | Table + partial index + 6 RPCs + RLS |
| `lib/types.ts` | Modify | Add `PlayerClaimStatus`, `PlayerClaim` |
| `app/api/league/[id]/player-claims/route.ts` | Create | POST — submit claim |
| `app/api/league/[id]/player-claims/[claimId]/route.ts` | Create | DELETE — cancel claim |
| `app/api/league/[id]/player-claims/[claimId]/review/route.ts` | Create | POST — admin review |
| `app/api/league/[id]/player-claims/assign/route.ts` | Create | POST — admin direct assign |

---

## Task 1: Supabase migration — table + index + RLS

**Files:**
- Create: `supabase/migrations/20260403000001_player_claims.sql`

- [ ] **Step 1: Write the migration (table, index, RLS, trigger)**

```sql
-- supabase/migrations/20260403000001_player_claims.sql
--
-- Phase 1 of the player identity claim feature.
-- Creates player_claims table, partial unique index, RLS policies,
-- and all six RPCs for the claim lifecycle.
--

-- ── player_claims ──────────────────────────────────────────────────────────────
CREATE TABLE player_claims (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id              uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name          text NOT NULL,
  admin_override_name  text,
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by          uuid REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, user_id)
);

-- Prevents two users claiming the same player (pending or approved).
-- Rejected claims release the name back to the pool.
CREATE UNIQUE INDEX player_claims_one_per_player
  ON player_claims (game_id, player_name)
  WHERE status IN ('pending', 'approved');

ALTER TABLE player_claims ENABLE ROW LEVEL SECURITY;

-- Members can read only their own claim rows
CREATE POLICY "Members read own claims" ON player_claims
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_game_admin(game_id));

-- Members can delete only their own pending claim rows
CREATE POLICY "Members delete own claims" ON player_claims
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Admins can update any claim row for their leagues
CREATE POLICY "Admins update claims" ON player_claims
  FOR UPDATE TO authenticated
  USING (is_game_admin(game_id))
  WITH CHECK (is_game_admin(game_id));

CREATE TRIGGER player_claims_set_updated_at
  BEFORE UPDATE ON player_claims
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

- [ ] **Step 2: Commit the table + RLS**

```bash
git add supabase/migrations/20260403000001_player_claims.sql
git commit -m "feat: add player_claims table with RLS"
```

---

## Task 2: Migration — submit_player_claim RPC

**Files:**
- Modify: `supabase/migrations/20260403000001_player_claims.sql`

- [ ] **Step 1: Append submit_player_claim to the migration**

```sql
-- ── submit_player_claim ────────────────────────────────────────────────────────
-- Called by an authenticated league member to claim a player name.
-- - If no row exists: inserts with status pending.
-- - If a rejected row exists for this user+league: resets to pending with new name.
-- - If a pending or approved row exists: raises 'claim_already_exists'.
-- - If the player name is already pending/approved by another user: raises 'player_already_claimed'.
CREATE OR REPLACE FUNCTION public.submit_player_claim(
  p_game_id    uuid,
  p_player_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing player_claims%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Must be a league member
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member';
  END IF;

  -- Check for an existing row for this user+league
  SELECT * INTO v_existing
  FROM player_claims
  WHERE game_id = p_game_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing.status IN ('pending', 'approved') THEN
      RAISE EXCEPTION 'claim_already_exists';
    ELSIF v_existing.status = 'rejected' THEN
      -- Check the new player_name is not already taken by another user
      IF EXISTS (
        SELECT 1 FROM player_claims
        WHERE game_id = p_game_id
          AND player_name = p_player_name
          AND status IN ('pending', 'approved')
          AND user_id <> v_user_id
      ) THEN
        RAISE EXCEPTION 'player_already_claimed';
      END IF;
      -- Reset rejected row to pending with the new name
      UPDATE player_claims
      SET player_name          = p_player_name,
          admin_override_name  = NULL,
          status               = 'pending',
          reviewed_by          = NULL,
          updated_at           = now()
      WHERE id = v_existing.id;
      RETURN;
    END IF;
  END IF;

  -- No existing row — insert fresh
  -- The partial unique index enforces player_name uniqueness for pending/approved
  INSERT INTO player_claims (game_id, user_id, player_name)
  VALUES (p_game_id, v_user_id, p_player_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_player_claim(uuid, text) TO authenticated;
```

---

## Task 3: Migration — review_player_claim RPC

- [ ] **Step 1: Append review_player_claim to the migration**

```sql
-- ── review_player_claim ────────────────────────────────────────────────────────
-- Called by an admin/creator to approve or reject a pending claim.
-- If approved and p_override_name is provided, sets admin_override_name.
CREATE OR REPLACE FUNCTION public.review_player_claim(
  p_claim_id     uuid,
  p_action       text,       -- 'approved' or 'rejected'
  p_override_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim    player_claims%ROWTYPE;
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_claim FROM player_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF NOT is_game_admin(v_claim.game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE player_claims
  SET status              = p_action,
      reviewed_by         = v_admin_id,
      admin_override_name = CASE
                              WHEN p_action = 'approved' THEN p_override_name
                              ELSE admin_override_name
                            END,
      updated_at          = now()
  WHERE id = p_claim_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_player_claim(uuid, text, text) TO authenticated;
```

---

## Task 4: Migration — assign_player_link RPC

- [ ] **Step 1: Append assign_player_link to the migration**

```sql
-- ── assign_player_link ─────────────────────────────────────────────────────────
-- Called by an admin/creator to directly assign a player name to a user,
-- creating an already-approved claim. Replaces any existing claim for that
-- user+league (upsert on the UNIQUE (game_id, user_id) constraint).
CREATE OR REPLACE FUNCTION public.assign_player_link(
  p_game_id     uuid,
  p_user_id     uuid,
  p_player_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO player_claims (game_id, user_id, player_name, status, reviewed_by)
  VALUES (p_game_id, p_user_id, p_player_name, 'approved', auth.uid())
  ON CONFLICT (game_id, user_id) DO UPDATE
    SET player_name         = EXCLUDED.player_name,
        admin_override_name = NULL,
        status              = 'approved',
        reviewed_by         = EXCLUDED.reviewed_by,
        updated_at          = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_player_link(uuid, uuid, text) TO authenticated;
```

---

## Task 5: Migration — cancel_player_claim RPC

- [ ] **Step 1: Append cancel_player_claim to the migration**

```sql
-- ── cancel_player_claim ────────────────────────────────────────────────────────
-- Called by the claim owner to delete a pending claim.
-- No-op (returns quietly) if the claim has already been reviewed.
CREATE OR REPLACE FUNCTION public.cancel_player_claim(p_claim_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim player_claims%ROWTYPE;
BEGIN
  SELECT * INTO v_claim FROM player_claims WHERE id = p_claim_id;

  -- No-op if claim not found or already reviewed
  IF NOT FOUND OR v_claim.status <> 'pending' THEN
    RETURN;
  END IF;

  -- Only the owner may cancel
  IF v_claim.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  DELETE FROM player_claims WHERE id = p_claim_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_player_claim(uuid) TO authenticated;
```

---

## Task 6: Migration — get_player_claims and get_unclaimed_players RPCs

- [ ] **Step 1: Append get_player_claims to the migration**

```sql
-- ── get_player_claims ──────────────────────────────────────────────────────────
-- Returns all claims for a league (all statuses). Admin/creator only.
-- Joins with profiles for display_name and auth.users for email.
CREATE OR REPLACE FUNCTION public.get_player_claims(p_game_id uuid)
RETURNS TABLE (
  id                   uuid,
  game_id              uuid,
  user_id              uuid,
  player_name          text,
  admin_override_name  text,
  status               text,
  reviewed_by          uuid,
  created_at           timestamptz,
  updated_at           timestamptz,
  display_name         text,
  email                text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    pc.id,
    pc.game_id,
    pc.user_id,
    pc.player_name,
    pc.admin_override_name,
    pc.status,
    pc.reviewed_by,
    pc.created_at,
    pc.updated_at,
    pr.display_name,
    au.email
  FROM player_claims pc
  LEFT JOIN profiles pr ON pr.id = pc.user_id
  LEFT JOIN auth.users au ON au.id = pc.user_id
  WHERE pc.game_id = p_game_id
  ORDER BY pc.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_claims(uuid) TO authenticated;
```

- [ ] **Step 2: Append get_unclaimed_players to the migration**

```sql
-- ── get_unclaimed_players ─────────────────────────────────────────────────────
-- Returns distinct player names derived from match data for the league that
-- have no pending or approved claim. Used to populate the claim picker.
-- Requires the caller to be a league member.
CREATE OR REPLACE FUNCTION public.get_unclaimed_players(p_game_id uuid)
RETURNS TABLE (player_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Access denied';
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

GRANT EXECUTE ON FUNCTION public.get_unclaimed_players(uuid) TO authenticated;
```

- [ ] **Step 3: Commit the complete migration**

```bash
git add supabase/migrations/20260403000001_player_claims.sql
git commit -m "feat: add player_claims RPCs — submit, review, assign, cancel, get, unclaimed"
```

---

## Task 7: Add TypeScript types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Append to lib/types.ts**

Add after the `JoinRequest` interface:

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

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add PlayerClaim and PlayerClaimStatus types"
```

---

## Task 8: POST /api/league/[id]/player-claims

**Files:**
- Create: `app/api/league/[id]/player-claims/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST — submit a player identity claim. Member only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const player_name = typeof body?.player_name === 'string' ? body.player_name.trim() : ''

  if (!player_name) {
    return NextResponse.json({ error: 'player_name is required' }, { status: 400 })
  }

  const { error } = await supabase.rpc('submit_player_claim', {
    p_game_id: id,
    p_player_name: player_name,
  })

  if (error) {
    if (
      error.message?.includes('claim_already_exists') ||
      error.message?.includes('player_already_claimed')
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error.message?.includes('Not a member')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[player-claims POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/league/[id]/player-claims/route.ts
git commit -m "feat: add POST /api/league/[id]/player-claims"
```

---

## Task 9: DELETE /api/league/[id]/player-claims/[claimId]

**Files:**
- Create: `app/api/league/[id]/player-claims/[claimId]/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** DELETE — cancel a pending player claim. Claim owner only. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> }
) {
  const { claimId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase.rpc('cancel_player_claim', {
    p_claim_id: claimId,
  })

  if (error) {
    if (error.message?.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[player-claims DELETE]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/league/[id]/player-claims/[claimId]/route.ts
git commit -m "feat: add DELETE /api/league/[id]/player-claims/[claimId]"
```

---

## Task 10: POST /api/league/[id]/player-claims/[claimId]/review

**Files:**
- Create: `app/api/league/[id]/player-claims/[claimId]/review/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST — approve or reject a player claim. Admin/creator only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> }
) {
  const { claimId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const action: string = body.action
  const override_name: string | undefined = typeof body.override_name === 'string'
    ? body.override_name.trim() || undefined
    : undefined

  if (action !== 'approved' && action !== 'rejected') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { error } = await supabase.rpc('review_player_claim', {
    p_claim_id: claimId,
    p_action: action,
    p_override_name: override_name ?? null,
  })

  if (error) {
    if (error.message?.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (error.message?.includes('Claim not found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('[player-claims review POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/league/[id]/player-claims/[claimId]/review/route.ts
git commit -m "feat: add POST /api/league/[id]/player-claims/[claimId]/review"
```

---

## Task 11: POST /api/league/[id]/player-claims/assign

**Files:**
- Create: `app/api/league/[id]/player-claims/assign/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST — directly assign a player link to a member. Admin/creator only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const target_user_id = typeof body?.user_id === 'string' ? body.user_id : ''
  const player_name = typeof body?.player_name === 'string' ? body.player_name.trim() : ''

  if (!target_user_id || !player_name) {
    return NextResponse.json({ error: 'user_id and player_name are required' }, { status: 400 })
  }

  const { error } = await supabase.rpc('assign_player_link', {
    p_game_id: id,
    p_user_id: target_user_id,
    p_player_name: player_name,
  })

  if (error) {
    if (error.message?.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[player-claims assign POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/league/[id]/player-claims/assign/route.ts
git commit -m "feat: add POST /api/league/[id]/player-claims/assign"
```
