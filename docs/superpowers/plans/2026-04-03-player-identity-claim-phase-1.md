# Player Identity Claim — Phase 1: DB + API Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the `player_claims` database table, all Supabase RPCs, and all API routes — no UI changes. Phases 2, 3 and 4 all depend on this being merged first.

**Architecture:** A single `player_claims` table stores claim lifecycle per user per league. Six RPCs encapsulate all business logic (submit, review, assign, cancel, get all, get unclaimed). Four API routes expose these RPCs to the frontend following the same patterns as the existing join-requests routes.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Supabase PostgreSQL + RPC + RLS, `@/lib/supabase/server` client helper.

---

## File Map

| Action | File |
|---|---|
| Create | `supabase/migrations/20260403000001_player_claims.sql` |
| Modify | `lib/types.ts` |
| Create | `app/api/league/[id]/player-claims/route.ts` |
| Create | `app/api/league/[id]/player-claims/[claimId]/route.ts` |
| Create | `app/api/league/[id]/player-claims/[claimId]/review/route.ts` |
| Create | `app/api/league/[id]/player-claims/assign/route.ts` |
| Create | `app/api/player-claims/route.ts` |

---

### Task 1: DB migration — table, indexes, RLS, and all RPCs

**Files:**
- Create: `supabase/migrations/20260403000001_player_claims.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260403000001_player_claims.sql
--
-- Adds the player_claims table and all RPCs for the player identity claim
-- feature. Members can claim a player name in a league; admins review and
-- approve, reject, or redirect claims to a different player name.
--

-- ── player_claims ─────────────────────────────────────────────────────────────
CREATE TABLE player_claims (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id             uuid        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id             uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_name         text        NOT NULL,
  admin_override_name text,
  status              text        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by         uuid        REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, user_id)
);

-- One pending/approved claim per player per league.
-- Rejected claims release the name back to the pool.
CREATE UNIQUE INDEX player_claims_one_per_player
  ON player_claims (game_id, player_name)
  WHERE status IN ('pending', 'approved');

ALTER TABLE player_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own claims" ON player_claims
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_game_admin(game_id));

CREATE POLICY "Members insert own claims" ON player_claims
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins update claims" ON player_claims
  FOR UPDATE TO authenticated
  USING (is_game_admin(game_id))
  WITH CHECK (is_game_admin(game_id));

CREATE POLICY "Members delete own pending claims" ON player_claims
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

CREATE TRIGGER player_claims_set_updated_at
  BEFORE UPDATE ON player_claims
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── submit_player_claim ───────────────────────────────────────────────────────
-- Called by a league member to claim a player name.
-- Upserts: if a rejected row exists for this user+league, resets it to pending.
-- Raises if user already has pending/approved claim, or if name is taken.
CREATE OR REPLACE FUNCTION public.submit_player_claim(
  p_game_id     uuid,
  p_player_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM game_members WHERE game_id = p_game_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this game';
  END IF;

  IF EXISTS (
    SELECT 1 FROM player_claims
    WHERE game_id = p_game_id AND user_id = v_user_id
      AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'Claim already exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM player_claims
    WHERE game_id = p_game_id AND player_name = p_player_name
      AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'Player already claimed';
  END IF;

  -- Upsert: rejected row exists → reset it. No row → insert fresh.
  INSERT INTO player_claims (game_id, user_id, player_name, status, admin_override_name, reviewed_by)
  VALUES (p_game_id, v_user_id, p_player_name, 'pending', NULL, NULL)
  ON CONFLICT (game_id, user_id) DO UPDATE
    SET player_name         = EXCLUDED.player_name,
        status              = 'pending',
        admin_override_name = NULL,
        reviewed_by         = NULL,
        updated_at          = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_player_claim(uuid, text) TO authenticated;

-- ── review_player_claim ───────────────────────────────────────────────────────
-- Called by an admin to approve, reject, or amend a pending claim.
-- override_name: if provided on approve, sets admin_override_name (links to a
-- different player than the one the user claimed).
CREATE OR REPLACE FUNCTION public.review_player_claim(
  p_claim_id     uuid,
  p_action       text,
  p_override_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim  player_claims%ROWTYPE;
  v_admin  uuid;
BEGIN
  v_admin := auth.uid();
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_action NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_claim FROM player_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = v_claim.game_id AND user_id = v_admin
      AND role IN ('creator', 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE player_claims
  SET status              = p_action,
      admin_override_name = CASE WHEN p_action = 'approved' THEN p_override_name ELSE NULL END,
      reviewed_by         = v_admin,
      updated_at          = now()
  WHERE id = p_claim_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_player_claim(uuid, text, text) TO authenticated;

-- ── assign_player_link ────────────────────────────────────────────────────────
-- Called by an admin to directly link a member to a player — no pending step.
-- Replaces any existing claim for that user in that league (upsert).
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
DECLARE
  v_admin uuid;
BEGIN
  v_admin := auth.uid();
  IF v_admin IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = v_admin
      AND role IN ('creator', 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM game_members WHERE game_id = p_game_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Target user is not a member';
  END IF;

  INSERT INTO player_claims (game_id, user_id, player_name, status, reviewed_by)
  VALUES (p_game_id, p_user_id, p_player_name, 'approved', v_admin)
  ON CONFLICT (game_id, user_id) DO UPDATE
    SET player_name         = EXCLUDED.player_name,
        status              = 'approved',
        admin_override_name = NULL,
        reviewed_by         = EXCLUDED.reviewed_by,
        updated_at          = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_player_link(uuid, uuid, text) TO authenticated;

-- ── cancel_player_claim ───────────────────────────────────────────────────────
-- Called by the claim owner to delete a pending claim.
-- No-op if the claim is not found or already reviewed.
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
  IF NOT FOUND THEN RETURN; END IF;

  IF v_claim.user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_claim.status != 'pending' THEN
    RETURN; -- Already reviewed — no-op
  END IF;

  DELETE FROM player_claims WHERE id = p_claim_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_player_claim(uuid) TO authenticated;

-- ── get_player_claims ─────────────────────────────────────────────────────────
-- Returns all claims for a league. Admin/creator only.
-- Joins auth.users and profiles to include display_name and email.
CREATE OR REPLACE FUNCTION public.get_player_claims(p_game_id uuid)
RETURNS TABLE (
  id                  uuid,
  user_id             uuid,
  player_name         text,
  admin_override_name text,
  status              text,
  reviewed_by         uuid,
  display_name        text,
  email               text,
  created_at          timestamptz,
  updated_at          timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = auth.uid()
      AND role IN ('creator', 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    pc.id,
    pc.user_id,
    pc.player_name,
    pc.admin_override_name,
    pc.status,
    pc.reviewed_by,
    p.display_name,
    u.email::text,
    pc.created_at,
    pc.updated_at
  FROM player_claims pc
  JOIN auth.users u ON u.id = pc.user_id
  LEFT JOIN profiles p ON p.id = pc.user_id
  WHERE pc.game_id = p_game_id
  ORDER BY pc.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_claims(uuid) TO authenticated;

-- ── get_unclaimed_players ─────────────────────────────────────────────────────
-- Returns player names available for claiming (not already pending/approved).
-- Derives names from match data + player_attributes roster.
-- Callable by any league member.
CREATE OR REPLACE FUNCTION public.get_unclaimed_players(p_game_id uuid)
RETURNS TABLE (player_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM game_members WHERE game_id = p_game_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this game';
  END IF;

  RETURN QUERY
  WITH all_players AS (
    SELECT DISTINCT jsonb_array_elements_text(w.team_a) AS name
    FROM weeks w WHERE w.game_id = p_game_id AND w.status = 'played'
    UNION
    SELECT DISTINCT jsonb_array_elements_text(w.team_b) AS name
    FROM weeks w WHERE w.game_id = p_game_id AND w.status = 'played'
    UNION
    SELECT pa.name FROM player_attributes pa WHERE pa.game_id = p_game_id
  ),
  claimed AS (
    SELECT pc.player_name AS name FROM player_claims pc
    WHERE pc.game_id = p_game_id AND pc.status IN ('pending', 'approved')
    UNION
    SELECT pc.admin_override_name AS name FROM player_claims pc
    WHERE pc.game_id = p_game_id AND pc.status = 'approved'
      AND pc.admin_override_name IS NOT NULL
  )
  SELECT ap.name
  FROM all_players ap
  WHERE ap.name NOT IN (SELECT c.name FROM claimed c)
  ORDER BY ap.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_unclaimed_players(uuid) TO authenticated;
```

- [ ] **Step 2: Apply the migration in Supabase SQL Editor**

Open the Supabase dashboard for this project → SQL Editor → paste the full file and run it. Verify no errors.

- [ ] **Step 3: Smoke-test the table exists**

In Supabase SQL Editor:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'player_claims' ORDER BY ordinal_position;
```
Expected: 10 rows (id, game_id, user_id, player_name, admin_override_name, status, reviewed_by, created_at, updated_at + constraint).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260403000001_player_claims.sql
git commit -m "feat: add player_claims table and RPCs"
```

---

### Task 2: Add TypeScript types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add types after the existing `JoinRequest` interface**

Open `lib/types.ts`. After the closing `}` of the `JoinRequest` interface (currently around line 162), add:

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
  // Populated in admin views via get_player_claims JOIN
  display_name?: string | null
  email?: string
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors related to the new types.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add PlayerClaim and PlayerClaimStatus types"
```

---

### Task 3: POST /api/league/[id]/player-claims — submit a claim

**Files:**
- Create: `app/api/league/[id]/player-claims/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/league/[id]/player-claims/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET — return all pending claims for a league (admin) or the caller's own claim (member). */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Try admin view first
  const { data: adminData, error: adminError } = await supabase.rpc('get_player_claims', {
    p_game_id: id,
  })

  if (!adminError) {
    return NextResponse.json(adminData ?? [])
  }

  // Not an admin — return only their own claim
  if (adminError.message.includes('Access denied')) {
    const { data: ownClaim, error: ownError } = await supabase
      .from('player_claims')
      .select('*')
      .eq('game_id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (ownError) {
      console.error('[player-claims GET]', ownError)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
    return NextResponse.json(ownClaim ?? null)
  }

  console.error('[player-claims GET]', adminError)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

/** POST — submit a player identity claim. Member only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const playerName = typeof body?.player_name === 'string' ? body.player_name.trim() : null

  if (!playerName) {
    return NextResponse.json({ error: 'player_name is required' }, { status: 400 })
  }

  const { error } = await supabase.rpc('submit_player_claim', {
    p_game_id: id,
    p_player_name: playerName,
  })

  if (error) {
    if (error.message.includes('Claim already exists') || error.message.includes('Player already claimed')) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error.message.includes('Not a member')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[player-claims POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 2: Manually verify POST works**

Use a REST client or browser devtools. Sign in as a league member and POST:
```
POST /api/league/<leagueId>/player-claims
{ "player_name": "Alice Smith" }
```
Expected: `201 { "ok": true }`.

Try submitting again — expected: `409`.

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/player-claims/route.ts
git commit -m "feat: add player-claims GET and POST endpoints"
```

---

### Task 4: DELETE /api/league/[id]/player-claims/[claimId] — cancel a claim

**Files:**
- Create: `app/api/league/[id]/player-claims/[claimId]/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/league/[id]/player-claims/[claimId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** DELETE — cancel a pending claim. Claim owner only. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> }
) {
  const { claimId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.rpc('cancel_player_claim', {
    p_claim_id: claimId,
  })

  if (error) {
    if (error.message.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[player-claims DELETE]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
```

- [ ] **Step 2: Verify in browser devtools**

Submit a claim, note the claim id from a GET call, then DELETE:
```
DELETE /api/league/<leagueId>/player-claims/<claimId>
```
Expected: `204`. Subsequent GET should return `null` for the member's own claim.

- [ ] **Step 3: Commit**

```bash
git add "app/api/league/[id]/player-claims/[claimId]/route.ts"
git commit -m "feat: add player-claims DELETE (cancel) endpoint"
```

---

### Task 5: POST /api/league/[id]/player-claims/[claimId]/review — admin approve/reject/amend

**Files:**
- Create: `app/api/league/[id]/player-claims/[claimId]/review/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/league/[id]/player-claims/[claimId]/review/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** POST — approve, reject, or amend a player claim. Admin/creator only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; claimId: string }> }
) {
  const { claimId } = await params
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const action: string = body.action
  const overrideName: string | null = typeof body.override_name === 'string'
    ? body.override_name.trim() || null
    : null

  if (action !== 'approved' && action !== 'rejected') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { error } = await supabase.rpc('review_player_claim', {
    p_claim_id: claimId,
    p_action: action,
    p_override_name: overrideName,
  })

  if (error) {
    if (error.message.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (error.message.includes('Claim not found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('[player-claims review POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify via REST client**

As admin:
```
POST /api/league/<leagueId>/player-claims/<claimId>/review
{ "action": "approved" }
```
Expected: `200 { "ok": true }`. Check in Supabase that `status = 'approved'` and `reviewed_by` is set.

Try with `{ "action": "approved", "override_name": "Alice S." }` — verify `admin_override_name` is set.

- [ ] **Step 3: Commit**

```bash
git add "app/api/league/[id]/player-claims/[claimId]/review/route.ts"
git commit -m "feat: add player-claims review endpoint (approve/reject/amend)"
```

---

### Task 6: POST /api/league/[id]/player-claims/assign — admin direct assign

**Files:**
- Create: `app/api/league/[id]/player-claims/assign/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/league/[id]/player-claims/assign/route.ts
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
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const userId: string = body.user_id
  const playerName: string = typeof body.player_name === 'string' ? body.player_name.trim() : ''

  if (!userId || !playerName) {
    return NextResponse.json({ error: 'user_id and player_name are required' }, { status: 400 })
  }

  const { error } = await supabase.rpc('assign_player_link', {
    p_game_id: id,
    p_user_id: userId,
    p_player_name: playerName,
  })

  if (error) {
    if (error.message.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (error.message.includes('Target user is not a member')) {
      return NextResponse.json({ error: 'Target user is not a member' }, { status: 404 })
    }
    console.error('[player-claims assign POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 2: Verify via REST client**

As admin:
```
POST /api/league/<leagueId>/player-claims/assign
{ "user_id": "<memberId>", "player_name": "Bob Jones" }
```
Expected: `201`. Check Supabase — claim row should have `status = 'approved'` and `reviewed_by = <adminId>`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/league/[id]/player-claims/assign/route.ts"
git commit -m "feat: add player-claims assign endpoint (admin direct link)"
```

---

### Task 7: GET /api/player-claims — user's own claims across all leagues

This endpoint is used by the `/settings` page to show claim status for all the user's leagues in one request.

**Files:**
- Create: `app/api/player-claims/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/player-claims/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PlayerClaim } from '@/lib/types'

/** GET — return all player claims for the current user across all leagues. */
export async function GET(_request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // RLS automatically scopes this to user_id = auth.uid()
  const { data, error } = await supabase
    .from('player_claims')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[player-claims global GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json((data ?? []) as PlayerClaim[])
}
```

- [ ] **Step 2: Verify**

Sign in as a user with claims in multiple leagues. `GET /api/player-claims` should return an array of all their claim rows across leagues.

- [ ] **Step 3: Commit**

```bash
git add app/api/player-claims/route.ts
git commit -m "feat: add global player-claims GET endpoint for settings page"
```

---

### Task 8: GET /api/league/[id]/player-claims/unclaimed — picker data

The member-facing picker and admin assign picker both need the list of unclaimed player names for a league.

**Files:**
- Create: `app/api/league/[id]/player-claims/unclaimed/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/league/[id]/player-claims/unclaimed/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/** GET — return player names available to claim in this league. Any member. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_unclaimed_players', {
    p_game_id: id,
  })

  if (error) {
    if (error.message.includes('Not a member')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[player-claims unclaimed GET]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // RPC returns rows with a `player_name` column
  const names: string[] = (data ?? []).map((row: { player_name: string }) => row.player_name)
  return NextResponse.json(names)
}
```

- [ ] **Step 2: Verify**

`GET /api/league/<leagueId>/player-claims/unclaimed` — expected: array of player name strings, with no already-claimed names included.

- [ ] **Step 3: Commit**

```bash
git add "app/api/league/[id]/player-claims/unclaimed/route.ts"
git commit -m "feat: add unclaimed players endpoint for claim picker"
```
