# Join Request Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-step join request + player claim review with one card and one Approve that makes the person a member, creates a new squad player if needed, and links them.

**Architecture:** A hand-run SQL migration adds `played_before` to join requests, stops creating claims at request time, and adds two SECURITY DEFINER approve functions sharing one internal helper. Two new API routes call them. On the client, a pure-logic layer in `lib/utils.ts` decides each card's starting state and what blocks Approve; `ReviewCard` and `PendingReviewList` render it on Settings → Members, replacing `PendingRequestsTable` and `PlayerClaimsTable`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, Supabase (Postgres + RPC), Jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-20-join-request-review-design.md`

**Conventions to follow (from `CLAUDE.md`):**
- Tailwind utility classes only, merged with `cn()` from `@/lib/utils`. No `style` props.
- Palette hex values as arbitrary Tailwind values (e.g. `bg-[#0a1421]`). Warning colour is `#fbbf24`, destructive `#e2686f`.
- British English, no em dashes in UI copy.
- Labels are written in normal case and uppercased with the `uppercase` class.
- Tests: `npm test -- <path>` runs Jest. Component tests need `/** @jest-environment jsdom */` at the top.

---

## File map

| File | Change | Responsibility |
|---|---|---|
| `supabase/migrations/20261020000001_single_step_join_review.sql` | Create | Schema + RPCs |
| `lib/types.ts` | Modify | `PendingJoinRequest` fields, `ReviewItem`, `PlaysAs`, `ReviewProblem` |
| `lib/utils.ts` | Modify | `timeAgo`, `gamesLabel`, `buildReviewItems`, `initialPlaysAs`, `findRosterPlayer`, `reviewProblem` |
| `lib/__tests__/utils.reviewCard.test.ts` | Create | Tests for the above |
| `lib/playerUtils.ts` | Modify | `parseApproveBody`, `approveErrorResponse` |
| `__tests__/approve-body.test.ts` | Create | Tests for the above |
| `app/api/league/[id]/join-requests/route.ts` | Modify | Accept `played_before` |
| `app/api/league/[id]/join-requests/[requestId]/approve/route.ts` | Create | Approve a join request |
| `app/api/league/[id]/player-claims/[claimId]/approve/route.ts` | Create | Approve a member claim |
| `__tests__/join-review-routes.test.ts` | Create | Route tests |
| `components/PlayerClaimPicker.tsx` | Modify | `footerText` accepts a ReactNode |
| `components/JoinRequestDialog.tsx` | Modify | "Can't find your name?" link, `played_before` |
| `components/__tests__/JoinRequestDialog.test.tsx` | Create | Dialog tests |
| `components/ReviewCard.tsx` | Create | One request/claim card |
| `components/__tests__/ReviewCard.test.tsx` | Create | Card tests |
| `components/PendingReviewList.tsx` | Create | "Waiting for you" list |
| `components/__tests__/PendingReviewList.test.tsx` | Create | List tests |
| `app/[slug]/settings/page.tsx` | Modify | Wire the list, load roster on Members |
| `components/PendingRequestsTable.tsx` | Delete | Replaced |
| `components/PlayerClaimsTable.tsx` | Delete | Replaced |

---

### Task 1: SQL migration

**Files:**
- Create: `supabase/migrations/20261020000001_single_step_join_review.sql`

There is no local Postgres, so this task has no automated test. The file is applied by hand in the Supabase SQL Editor after review (Task 10). Write it so it is safe to run once on the live database.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20261020000001_single_step_join_review.sql
--
-- Single-step join request review.
--
-- Before: a join request made with a player name also created a pending
-- player_claims row, and the admin approved the two separately. People who
-- said they were new got no player at all.
--
-- After:
--   * submit_join_request only records what the requester chose
--     (player_name, played_before). It no longer creates a claim.
--   * approve_join_request does everything in one transaction: links an
--     existing player or creates a new one, adds the member, and approves.
--   * approve_player_claim does the same for claims from existing members.
--   * Declining a join request also rejects any pending claim left over from
--     requests made before this change.

-- ── 1. played_before ─────────────────────────────────────────────────────────
ALTER TABLE game_join_requests ADD COLUMN IF NOT EXISTS played_before boolean;

-- ── 2. submit_join_request ───────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.submit_join_request(uuid, text);
DROP FUNCTION IF EXISTS public.submit_join_request(uuid, text, text);

CREATE OR REPLACE FUNCTION public.submit_join_request(
  p_game_id       uuid,
  p_message       text    DEFAULT NULL,
  p_player_name   text    DEFAULT NULL,
  p_played_before boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id      uuid;
  v_email        text;
  v_display_name text;
  v_existing     game_join_requests%ROWTYPE;
  v_player_name  text := NULLIF(btrim(p_player_name), '');
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Already a member';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = v_user_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT * INTO v_existing
  FROM game_join_requests
  WHERE game_id = p_game_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing.status = 'pending' THEN
      RAISE EXCEPTION 'Request already pending';
    ELSIF v_existing.status = 'approved' THEN
      RAISE EXCEPTION 'Already a member';
    ELSE
      UPDATE game_join_requests
      SET status        = 'pending',
          message       = p_message,
          player_name   = v_player_name,
          played_before = p_played_before,
          reviewed_by   = NULL,
          updated_at    = now()
      WHERE id = v_existing.id;
    END IF;
  ELSE
    SELECT email, display_name INTO v_email, v_display_name
    FROM profiles
    WHERE id = v_user_id;

    INSERT INTO game_join_requests
      (game_id, user_id, email, display_name, message, player_name, played_before)
    VALUES
      (p_game_id, v_user_id, v_email, COALESCE(v_display_name, v_email),
       p_message, v_player_name, p_played_before);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_join_request(uuid, text, text, boolean) TO authenticated;

-- ── 3. get_join_requests: also return player_name and played_before ─────────
-- The return type changes, so the function must be dropped first.
DROP FUNCTION IF EXISTS public.get_join_requests(uuid);

CREATE FUNCTION public.get_join_requests(p_game_id uuid)
RETURNS TABLE (
  id            uuid,
  user_id       uuid,
  email         text,
  display_name  text,
  message       text,
  status        text,
  created_at    timestamptz,
  player_name   text,
  played_before boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Qualified: "user_id" is also an output column name.
  IF NOT EXISTS (
    SELECT 1 FROM game_members gm
    WHERE gm.game_id = p_game_id
      AND gm.user_id = auth.uid()
      AND gm.role IN ('creator', 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    gjr.id,
    gjr.user_id,
    gjr.email,
    gjr.display_name,
    gjr.message,
    gjr.status,
    gjr.created_at,
    gjr.player_name,
    gjr.played_before
  FROM game_join_requests gjr
  WHERE gjr.game_id = p_game_id
    AND gjr.status = 'pending'
  ORDER BY gjr.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_join_requests(uuid) TO authenticated;

-- ── 4. link_reviewed_player (internal) ───────────────────────────────────────
-- Links p_user_id to a player, creating the player first when asked.
-- Shared by approve_join_request and approve_player_claim. Not callable by
-- clients; the approve functions run as the owner and may call it.
CREATE OR REPLACE FUNCTION public.link_reviewed_player(
  p_game_id       uuid,
  p_user_id       uuid,
  p_player_name   text,
  p_create_player boolean
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_player_name, ''));
BEGIN
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'player_name_required';
  END IF;

  IF p_create_player THEN
    -- Same case-insensitive rule as "+ Add player".
    IF EXISTS (
      SELECT 1 FROM player_attributes
      WHERE game_id = p_game_id AND lower(name) = lower(v_name)
    ) THEN
      RAISE EXCEPTION 'player_exists';
    END IF;

    -- Defaults match "+ Add player": strength average (rating 2), balanced.
    INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
    VALUES (p_game_id, v_name, 2, 'balanced', false);
  ELSE
    -- Older players may only exist in played line-ups.
    IF NOT EXISTS (
      SELECT 1 FROM player_attributes
      WHERE game_id = p_game_id AND name = v_name
    ) AND NOT EXISTS (
      SELECT 1 FROM weeks w
      WHERE w.game_id = p_game_id
        AND w.status = 'played'
        AND (w.team_a ? v_name OR w.team_b ? v_name)
    ) THEN
      RAISE EXCEPTION 'player_not_found';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM player_claims
    WHERE game_id = p_game_id
      AND user_id <> p_user_id
      AND status = 'approved'
      AND (player_name = v_name OR admin_override_name = v_name)
  ) THEN
    RAISE EXCEPTION 'player_already_linked';
  END IF;

  -- player_claims allows one pending/approved claim per name.
  IF EXISTS (
    SELECT 1 FROM player_claims
    WHERE game_id = p_game_id
      AND user_id <> p_user_id
      AND status = 'pending'
      AND player_name = v_name
  ) THEN
    RAISE EXCEPTION 'player_claim_pending';
  END IF;

  INSERT INTO player_claims (game_id, user_id, player_name, status, reviewed_by)
  VALUES (p_game_id, p_user_id, v_name, 'approved', auth.uid())
  ON CONFLICT (game_id, user_id) DO UPDATE
    SET player_name         = EXCLUDED.player_name,
        admin_override_name = NULL,
        status              = 'approved',
        reviewed_by         = EXCLUDED.reviewed_by,
        updated_at          = now();

  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION public.link_reviewed_player(uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;

-- ── 5. approve_join_request ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_join_request(
  p_request_id    uuid,
  p_player_name   text,
  p_create_player boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request game_join_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_request FROM game_join_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF NOT is_game_admin(v_request.game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'request_not_pending';
  END IF;

  PERFORM link_reviewed_player(v_request.game_id, v_request.user_id, p_player_name, p_create_player);

  INSERT INTO game_members (game_id, user_id, role)
  VALUES (v_request.game_id, v_request.user_id, 'member')
  ON CONFLICT (game_id, user_id) DO NOTHING;

  UPDATE game_join_requests
  SET status      = 'approved',
      reviewed_by = auth.uid(),
      updated_at  = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_join_request(uuid, text, boolean) TO authenticated;

-- ── 6. approve_player_claim ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_player_claim(
  p_claim_id      uuid,
  p_player_name   text,
  p_create_player boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim player_claims%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_claim FROM player_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;

  IF NOT is_game_admin(v_claim.game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF v_claim.status <> 'pending' THEN
    RAISE EXCEPTION 'claim_not_pending';
  END IF;

  -- Upserts this user's claim row (the one being approved) to approved.
  PERFORM link_reviewed_player(v_claim.game_id, v_claim.user_id, p_player_name, p_create_player);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_player_claim(uuid, text, boolean) TO authenticated;

-- ── 7. review_join_request: declining also rejects a leftover claim ─────────
CREATE OR REPLACE FUNCTION public.review_join_request(
  p_request_id uuid,
  p_action     text  -- 'approved' or 'declined'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request  game_join_requests%ROWTYPE;
  v_admin_id uuid;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_action NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  SELECT * INTO v_request FROM game_join_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = v_request.game_id
      AND user_id = v_admin_id
      AND role IN ('creator', 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  UPDATE game_join_requests
  SET status      = p_action,
      reviewed_by = v_admin_id,
      updated_at  = now()
  WHERE id = p_request_id;

  IF p_action = 'approved' THEN
    INSERT INTO game_members (game_id, user_id, role)
    VALUES (v_request.game_id, v_request.user_id, 'member')
    ON CONFLICT (game_id, user_id) DO NOTHING;
  ELSE
    UPDATE player_claims
    SET status      = 'rejected',
        reviewed_by = v_admin_id,
        updated_at  = now()
    WHERE game_id = v_request.game_id
      AND user_id = v_request.user_id
      AND status  = 'pending';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_join_request(uuid, text) TO authenticated;
```

`weeks.team_a` / `team_b` are `jsonb` (`20250313000001_initial_schema.sql:20`), so the `?` operator in section 4 is correct.

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20261020000001_single_step_join_review.sql
git commit -m "Add single-step join review migration"
```

---

### Task 2: Types and pure review logic

**Files:**
- Modify: `lib/types.ts` (the `PendingJoinRequest` interface near line 243, plus new types after `PlayerClaim`)
- Modify: `lib/utils.ts` (append at the end)
- Test: `lib/__tests__/utils.reviewCard.test.ts`

- [ ] **Step 1: Update types**

In `lib/types.ts`, change `PendingJoinRequest` to:

```ts
export interface PendingJoinRequest {
  id: string
  user_id: string
  email: string
  display_name: string
  message: string | null
  status: JoinRequestStatus
  created_at: string
  /** The player they picked when asking to join, if any. */
  player_name: string | null
  /** true: has played before; false: new; null: didn't say (or sent before this was asked). */
  played_before: boolean | null
}
```

After the `PlayerClaim` interface, add:

```ts
/** One item awaiting review on Settings → Members. */
export type ReviewItem =
  | { kind: 'join'; request: PendingJoinRequest }
  | { kind: 'claim'; claim: PlayerClaim }

/** Who a reviewed person will play as, while the admin is deciding. */
export type PlaysAs =
  | { mode: 'existing'; name: string }
  | { mode: 'list' }
  | { mode: 'new'; name: string }

/** Why Approve is disabled on a review card. */
export type ReviewProblem =
  | { kind: 'choose' }
  | { kind: 'empty' }
  | { kind: 'clash'; player: PlayerAttribute }
  | { kind: 'linked'; player: PlayerAttribute }
```

- [ ] **Step 2: Write the failing tests**

Create `lib/__tests__/utils.reviewCard.test.ts`:

```ts
import {
  buildReviewItems,
  findRosterPlayer,
  gamesLabel,
  initialPlaysAs,
  reviewProblem,
  timeAgo,
} from '../utils'
import type { PendingJoinRequest, PlayerAttribute, PlayerClaim } from '../types'

function request(overrides: Partial<PendingJoinRequest> = {}): PendingJoinRequest {
  return {
    id: 'r1',
    user_id: 'u1',
    email: 'john@example.com',
    display_name: 'John Easton',
    message: null,
    status: 'pending',
    created_at: '2026-10-20T10:00:00Z',
    player_name: null,
    played_before: null,
    ...overrides,
  }
}

function claim(overrides: Partial<PlayerClaim> = {}): PlayerClaim {
  return {
    id: 'c1',
    game_id: 'g1',
    user_id: 'u9',
    player_name: 'Sam O',
    admin_override_name: null,
    status: 'pending',
    reviewed_by: null,
    created_at: '2026-10-19T10:00:00Z',
    updated_at: '2026-10-19T10:00:00Z',
    display_name: 'Sam Okafor',
    email: 'sam@example.com',
    ...overrides,
  }
}

function player(name: string, overrides: Partial<PlayerAttribute> = {}): PlayerAttribute {
  return {
    name,
    strength: 'average',
    mentality: 'balanced',
    played: 0,
    linked_user_id: null,
    linked_display_name: null,
    ...overrides,
  }
}

describe('timeAgo', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  it('says just now under a minute', () => {
    expect(timeAgo('2026-10-20T11:59:30Z', now)).toBe('just now')
  })
  it('counts minutes', () => {
    expect(timeAgo('2026-10-20T11:59:00Z', now)).toBe('1 minute ago')
    expect(timeAgo('2026-10-20T11:15:00Z', now)).toBe('45 minutes ago')
  })
  it('counts hours', () => {
    expect(timeAgo('2026-10-20T11:00:00Z', now)).toBe('1 hour ago')
    expect(timeAgo('2026-10-20T01:00:00Z', now)).toBe('11 hours ago')
  })
  it('counts days up to 30', () => {
    expect(timeAgo('2026-10-19T12:00:00Z', now)).toBe('1 day ago')
    expect(timeAgo('2026-10-18T09:00:00Z', now)).toBe('2 days ago')
  })
  it('shows a date after 30 days', () => {
    expect(timeAgo('2026-09-01T12:00:00Z', now)).toBe('1 Sept')
  })
})

describe('gamesLabel', () => {
  it('handles none, one and many', () => {
    expect(gamesLabel(0)).toBe('no games yet')
    expect(gamesLabel(1)).toBe('1 game')
    expect(gamesLabel(23)).toBe('23 games')
  })
})

describe('buildReviewItems', () => {
  it('lists join requests first, then member claims oldest first', () => {
    const items = buildReviewItems(
      [request({ id: 'r1', user_id: 'u1' })],
      [
        claim({ id: 'c2', user_id: 'u3', created_at: '2026-10-19T12:00:00Z' }),
        claim({ id: 'c1', user_id: 'u2', created_at: '2026-10-18T12:00:00Z' }),
      ],
    )
    expect(items.map((i) => (i.kind === 'join' ? i.request.id : i.claim.id))).toEqual(['r1', 'c1', 'c2'])
  })

  it('drops claims from people with a pending join request', () => {
    const items = buildReviewItems([request({ user_id: 'u1' })], [claim({ user_id: 'u1' })])
    expect(items).toHaveLength(1)
    expect(items[0].kind).toBe('join')
  })
})

describe('initialPlaysAs', () => {
  it('opens on the player they picked', () => {
    expect(initialPlaysAs({ kind: 'join', request: request({ player_name: 'John E', played_before: true }) }))
      .toEqual({ mode: 'existing', name: 'John E' })
  })
  it('opens the squad list when they played before but did not pick', () => {
    expect(initialPlaysAs({ kind: 'join', request: request({ played_before: true }) }))
      .toEqual({ mode: 'list' })
  })
  it('opens on a new player named after their profile when new', () => {
    expect(initialPlaysAs({ kind: 'join', request: request({ played_before: false }) }))
      .toEqual({ mode: 'new', name: 'John Easton' })
  })
  it('treats an unanswered request as new', () => {
    expect(initialPlaysAs({ kind: 'join', request: request() }))
      .toEqual({ mode: 'new', name: 'John Easton' })
  })
  it('opens a member claim on the claimed player', () => {
    expect(initialPlaysAs({ kind: 'claim', claim: claim() }))
      .toEqual({ mode: 'existing', name: 'Sam O' })
  })
})

describe('findRosterPlayer', () => {
  it('matches case-insensitively and ignores surrounding spaces', () => {
    const roster = [player('John E')]
    expect(findRosterPlayer(roster, '  john e ')?.name).toBe('John E')
    expect(findRosterPlayer(roster, 'John')).toBeUndefined()
  })
})

describe('reviewProblem', () => {
  const roster = [
    player('John E'),
    player('Sam O', { played: 23, linked_user_id: 'other', linked_display_name: 'Sam Smith' }),
    player('Dave S', { linked_user_id: 'u1', linked_display_name: 'John Easton' }),
  ]

  it('needs a choice while the squad list is open', () => {
    expect(reviewProblem({ mode: 'list' }, roster, 'u1')).toEqual({ kind: 'choose' })
  })
  it('needs a name for a new player', () => {
    expect(reviewProblem({ mode: 'new', name: '   ' }, roster, 'u1')).toEqual({ kind: 'empty' })
  })
  it('flags a new name already in the squad', () => {
    expect(reviewProblem({ mode: 'new', name: 'john e' }, roster, 'u1'))
      .toEqual({ kind: 'clash', player: roster[0] })
  })
  it('flags an existing player linked to someone else', () => {
    expect(reviewProblem({ mode: 'existing', name: 'Sam O' }, roster, 'u1'))
      .toEqual({ kind: 'linked', player: roster[1] })
  })
  it('allows a player already linked to this person', () => {
    expect(reviewProblem({ mode: 'existing', name: 'Dave S' }, roster, 'u1')).toBeNull()
  })
  it('allows a free existing player or a fresh new name', () => {
    expect(reviewProblem({ mode: 'existing', name: 'John E' }, roster, 'u1')).toBeNull()
    expect(reviewProblem({ mode: 'new', name: 'John Easton' }, roster, 'u1')).toBeNull()
  })
  it('allows an existing name missing from the roster (server checks line-ups)', () => {
    expect(reviewProblem({ mode: 'existing', name: 'Old Timer' }, roster, 'u1')).toBeNull()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- lib/__tests__/utils.reviewCard.test.ts`
Expected: FAIL, `timeAgo` (and the others) are not exported from `../utils`.

- [ ] **Step 4: Implement**

Append to `lib/utils.ts` (add `PendingJoinRequest`, `PlayerClaim`, `PlayerAttribute`, `ReviewItem`, `PlaysAs`, `ReviewProblem` to its existing `import type { … } from './types'` line; check which are already imported first):

```ts
// --- Join request review (Settings → Members) ---

/** "just now", "5 minutes ago", "2 days ago", or "1 Sept" after 30 days. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days <= 30) return `${days} day${days === 1 ? '' : 's'} ago`
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** "no games yet", "1 game", "23 games". */
export function gamesLabel(played: number): string {
  if (played === 0) return 'no games yet'
  return `${played} game${played === 1 ? '' : 's'}`
}

/**
 * Join requests (in the order given, oldest first from the RPC), then claims
 * from existing members, oldest first. A claim from someone who also has a
 * pending join request is left out: it predates single-step review and is
 * settled by reviewing the request.
 */
export function buildReviewItems(requests: PendingJoinRequest[], claims: PlayerClaim[]): ReviewItem[] {
  const requestUsers = new Set(requests.map((r) => r.user_id))
  const memberClaims = claims
    .filter((c) => !requestUsers.has(c.user_id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
  return [
    ...requests.map((request): ReviewItem => ({ kind: 'join', request })),
    ...memberClaims.map((claim): ReviewItem => ({ kind: 'claim', claim })),
  ]
}

/** Where a review card starts, based on what the person chose. */
export function initialPlaysAs(item: ReviewItem): PlaysAs {
  if (item.kind === 'claim') return { mode: 'existing', name: item.claim.player_name }
  const { player_name, played_before, display_name } = item.request
  if (player_name) return { mode: 'existing', name: player_name }
  if (played_before === true) return { mode: 'list' }
  return { mode: 'new', name: display_name }
}

/** Case-insensitive roster lookup, the same rule as "+ Add player". */
export function findRosterPlayer(roster: PlayerAttribute[], name: string): PlayerAttribute | undefined {
  const target = name.trim().toLowerCase()
  return roster.find((p) => p.name.toLowerCase() === target)
}

/** What stops Approve, or null when it can go ahead. `userId` is the person being reviewed. */
export function reviewProblem(playsAs: PlaysAs, roster: PlayerAttribute[], userId: string): ReviewProblem | null {
  if (playsAs.mode === 'list') return { kind: 'choose' }
  if (playsAs.mode === 'new') {
    if (!playsAs.name.trim()) return { kind: 'empty' }
    const clash = findRosterPlayer(roster, playsAs.name)
    return clash ? { kind: 'clash', player: clash } : null
  }
  const existing = roster.find((p) => p.name === playsAs.name)
  if (existing?.linked_user_id && existing.linked_user_id !== userId) {
    return { kind: 'linked', player: existing }
  }
  return null
}
```

Note on the date format: `en-GB` short month for September is `Sept` in current Node/ICU. If the test fails because your Node prints `Sep`, change the test's expected string to match `new Date('2026-09-01T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })`, not the implementation.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- lib/__tests__/utils.reviewCard.test.ts`
Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors only in files that build `PendingJoinRequest` objects without the two new fields. Fix each by adding `player_name: null, played_before: null` (likely only tests and `lib/fetchers.ts` callers; `grep -rn "PendingJoinRequest" app components lib __tests__`). `PendingRequestsTable.tsx` may also complain; it is deleted in Task 8, so leave it if it's the only error.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/utils.ts lib/__tests__/utils.reviewCard.test.ts
git commit -m "Add review card types and logic"
```

---

### Task 3: Approve body parsing and error mapping

**Files:**
- Modify: `lib/playerUtils.ts` (append)
- Test: `__tests__/approve-body.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/approve-body.test.ts`:

```ts
import { approveErrorResponse, parseApproveBody } from '@/lib/playerUtils'

describe('parseApproveBody', () => {
  it('trims the name and reads create_player', () => {
    expect(parseApproveBody({ player_name: '  John Easton ', create_player: true }))
      .toEqual({ player_name: 'John Easton', create_player: true })
  })
  it('defaults create_player to false', () => {
    expect(parseApproveBody({ player_name: 'Sam O' })).toEqual({ player_name: 'Sam O', create_player: false })
  })
  it('rejects a missing or blank name', () => {
    expect(parseApproveBody({})).toBeNull()
    expect(parseApproveBody({ player_name: '   ' })).toBeNull()
    expect(parseApproveBody(null)).toBeNull()
    expect(parseApproveBody({ player_name: 'Sam', create_player: 'yes' })).toBeNull()
  })
})

describe('approveErrorResponse', () => {
  it.each([
    ['Access denied', 403, 'Forbidden'],
    ['Request not found', 404, 'Not found'],
    ['Claim not found', 404, 'Not found'],
    ['request_not_pending', 409, 'This has already been reviewed.'],
    ['claim_not_pending', 409, 'This has already been reviewed.'],
    ['player_exists', 409, "There's already a John E in the squad."],
    ['player_already_linked', 409, 'John E is already linked to another member.'],
    ['player_claim_pending', 409, 'Someone else has a pending claim for John E.'],
    ['player_not_found', 400, "John E isn't in the squad."],
    ['player_name_required', 400, 'Enter a player name.'],
  ])('maps %s', (message, status, error) => {
    expect(approveErrorResponse(message, 'John E')).toEqual({ status, error })
  })

  it('falls back to 500', () => {
    expect(approveErrorResponse('boom', 'John E')).toEqual({ status: 500, error: 'Internal server error' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/approve-body.test.ts`
Expected: FAIL, `parseApproveBody` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/playerUtils.ts`:

```ts
export interface ApproveInput {
  player_name: string
  create_player: boolean
}

/**
 * Validates a POST …/approve body for a join request or player claim.
 * Returns null if the name is missing or blank, or create_player isn't a boolean.
 */
export function parseApproveBody(body: unknown): ApproveInput | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>
  if (typeof b.player_name !== 'string') return null
  const player_name = b.player_name.trim()
  if (!player_name) return null
  if (b.create_player !== undefined && typeof b.create_player !== 'boolean') return null
  return { player_name, create_player: b.create_player === true }
}

/** Maps an approve RPC error message to an HTTP status and user-facing copy. */
export function approveErrorResponse(message: string, playerName: string): { status: number; error: string } {
  if (message.includes('Access denied')) return { status: 403, error: 'Forbidden' }
  if (message.includes('not found') && !message.includes('player_not_found')) return { status: 404, error: 'Not found' }
  if (message.includes('_not_pending')) return { status: 409, error: 'This has already been reviewed.' }
  if (message.includes('player_exists')) return { status: 409, error: `There's already a ${playerName} in the squad.` }
  if (message.includes('player_already_linked')) return { status: 409, error: `${playerName} is already linked to another member.` }
  if (message.includes('player_claim_pending')) return { status: 409, error: `Someone else has a pending claim for ${playerName}.` }
  if (message.includes('player_not_found')) return { status: 400, error: `${playerName} isn't in the squad.` }
  if (message.includes('player_name_required')) return { status: 400, error: 'Enter a player name.' }
  return { status: 500, error: 'Internal server error' }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- __tests__/approve-body.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/playerUtils.ts __tests__/approve-body.test.ts
git commit -m "Add approve body parsing and error mapping"
```

---

### Task 4: API routes

**Files:**
- Modify: `app/api/league/[id]/join-requests/route.ts` (POST, lines 30-79)
- Create: `app/api/league/[id]/join-requests/[requestId]/approve/route.ts`
- Create: `app/api/league/[id]/player-claims/[claimId]/approve/route.ts`
- Test: `__tests__/join-review-routes.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/join-review-routes.test.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import {
  notifyAdminsOfJoinRequest,
  notifyRequesterOfReview,
} from '@/lib/email/send-join-request-notifications'

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }))
jest.mock('@/lib/email/send-join-request-notifications', () => ({
  notifyAdminsOfJoinRequest: jest.fn().mockResolvedValue(undefined),
  notifyRequesterOfReview: jest.fn().mockResolvedValue(undefined),
}))

import { POST as submitRequest } from '@/app/api/league/[id]/join-requests/route'
import { POST as approveRequest } from '@/app/api/league/[id]/join-requests/[requestId]/approve/route'
import { POST as approveClaim } from '@/app/api/league/[id]/player-claims/[claimId]/approve/route'

const rpc = jest.fn()

function setup({ user = true, rpcError = null as null | { message: string } } = {}) {
  rpc.mockResolvedValue({ data: null, error: rpcError })
  ;(createClient as jest.Mock).mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: user ? { id: 'u1', email: 'a@example.com' } : null },
        error: null,
      }),
    },
    rpc,
  })
}

function post(body: unknown) {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const requestParams = { params: Promise.resolve({ id: 'g1', requestId: 'r1' }) }
const claimParams = { params: Promise.resolve({ id: 'g1', claimId: 'c1' }) }

beforeEach(() => {
  rpc.mockReset()
  ;(notifyAdminsOfJoinRequest as jest.Mock).mockClear()
  ;(notifyRequesterOfReview as jest.Mock).mockClear()
})

describe('POST join-requests', () => {
  it('passes played_before to submit_join_request', async () => {
    setup()
    const res = await submitRequest(
      post({ message: null, player_name: null, played_before: true }) as never,
      { params: Promise.resolve({ id: 'g1' }) },
    )
    expect(res.status).toBe(201)
    expect(rpc).toHaveBeenCalledWith('submit_join_request', {
      p_game_id: 'g1',
      p_message: null,
      p_player_name: null,
      p_played_before: true,
    })
  })

  it('sends null when played_before is missing or not a boolean', async () => {
    setup()
    await submitRequest(post({ played_before: 'yes' }) as never, { params: Promise.resolve({ id: 'g1' }) })
    expect(rpc.mock.calls[0][1].p_played_before).toBeNull()
  })
})

describe('POST join-requests/[requestId]/approve', () => {
  it('requires sign-in', async () => {
    setup({ user: false })
    const res = await approveRequest(post({ player_name: 'Sam O' }), requestParams)
    expect(res.status).toBe(401)
  })

  it('rejects a blank name without calling the RPC', async () => {
    setup()
    const res = await approveRequest(post({ player_name: ' ' }), requestParams)
    expect(res.status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('approves, creating a player, and notifies the requester', async () => {
    setup()
    const res = await approveRequest(post({ player_name: 'John Easton', create_player: true }), requestParams)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('approve_join_request', {
      p_request_id: 'r1',
      p_player_name: 'John Easton',
      p_create_player: true,
    })
    expect(notifyRequesterOfReview).toHaveBeenCalledWith('r1', 'approved', expect.any(String))
  })

  it('maps a name clash to 409 with a readable message', async () => {
    setup({ rpcError: { message: 'player_exists' } })
    const res = await approveRequest(post({ player_name: 'John E', create_player: true }), requestParams)
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: "There's already a John E in the squad." })
    expect(notifyRequesterOfReview).not.toHaveBeenCalled()
  })
})

describe('POST player-claims/[claimId]/approve', () => {
  it('approves the claim with the chosen player', async () => {
    setup()
    const res = await approveClaim(post({ player_name: 'Sam O' }), claimParams)
    expect(res.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('approve_player_claim', {
      p_claim_id: 'c1',
      p_player_name: 'Sam O',
      p_create_player: false,
    })
  })

  it('maps an already-linked player to 409', async () => {
    setup({ rpcError: { message: 'player_already_linked' } })
    const res = await approveClaim(post({ player_name: 'Sam O' }), claimParams)
    expect(res.status).toBe(409)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- __tests__/join-review-routes.test.ts`
Expected: FAIL, cannot find module `…/approve/route`.

- [ ] **Step 3: Update the submit route**

In `app/api/league/[id]/join-requests/route.ts`, replace the block from `const playerName =` to the end of the `supabase.rpc('submit_join_request', …)` call with:

```ts
  const playerName =
    typeof body?.player_name === 'string' && body.player_name.trim()
      ? body.player_name.trim()
      : null
  const playedBefore = typeof body?.played_before === 'boolean' ? body.played_before : null

  // Only records what they chose. The player link is made when an admin
  // approves (approve_join_request).
  const { error } = await supabase.rpc('submit_join_request', {
    p_game_id: id,
    p_message: message,
    p_player_name: playerName,
    p_played_before: playedBefore,
  })
```

- [ ] **Step 4: Create the join request approve route**

Create `app/api/league/[id]/join-requests/[requestId]/approve/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { approveErrorResponse, parseApproveBody } from '@/lib/playerUtils'
import { notifyRequesterOfReview } from '@/lib/email/send-join-request-notifications'

/**
 * POST — approve a join request in one step: link an existing player or
 * create a new one, add the member, and mark the request approved.
 * Admin/creator only. Body: { player_name, create_player? }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { requestId } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = parseApproveBody(await request.json().catch(() => null))
  if (!parsed) {
    return NextResponse.json({ error: 'Enter a player name.' }, { status: 400 })
  }

  const { error } = await supabase.rpc('approve_join_request', {
    p_request_id: requestId,
    p_player_name: parsed.player_name,
    p_create_player: parsed.create_player,
  })

  if (error) {
    const { status, error: message } = approveErrorResponse(error.message ?? '', parsed.player_name)
    if (status === 500) console.error('[join-requests approve POST]', error)
    return NextResponse.json({ error: message }, { status })
  }

  const origin = request.headers.get('origin') ?? 'https://craft-football.com'
  notifyRequesterOfReview(requestId, 'approved', origin)
    .catch(err => console.error('[email:notifyRequesterOfReview]', err))

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Create the claim approve route**

Create `app/api/league/[id]/player-claims/[claimId]/approve/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { approveErrorResponse, parseApproveBody } from '@/lib/playerUtils'

/**
 * POST — approve an existing member's player claim, linking them to the
 * chosen player (created first if create_player). Admin/creator only.
 * Body: { player_name, create_player? }.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; claimId: string }> }
) {
  const { claimId } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = parseApproveBody(await request.json().catch(() => null))
  if (!parsed) {
    return NextResponse.json({ error: 'Enter a player name.' }, { status: 400 })
  }

  const { error } = await supabase.rpc('approve_player_claim', {
    p_claim_id: claimId,
    p_player_name: parsed.player_name,
    p_create_player: parsed.create_player,
  })

  if (error) {
    const { status, error: message } = approveErrorResponse(error.message ?? '', parsed.player_name)
    if (status === 500) console.error('[player-claims approve POST]', error)
    return NextResponse.json({ error: message }, { status })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- __tests__/join-review-routes.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add "app/api/league/[id]/join-requests" "app/api/league/[id]/player-claims/[claimId]/approve" __tests__/join-review-routes.test.ts
git commit -m "Add single-step approve routes for join requests and claims"
```

---

### Task 5: Join dialog, "Can't find your name?"

**Files:**
- Modify: `components/PlayerClaimPicker.tsx` (the `footerText` prop type, line ~16)
- Modify: `components/JoinRequestDialog.tsx`
- Test: `components/__tests__/JoinRequestDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/JoinRequestDialog.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'

jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const fetchMock = jest.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) {
      return Promise.resolve({ ok: true, json: async () => ({ players: ['Sam O', 'John E'] }) })
    }
    return Promise.resolve({ ok: true, status: 201, json: async () => ({ ok: true }) })
  })
  global.fetch = fetchMock as unknown as typeof fetch
})

function renderDialog() {
  render(
    <JoinRequestDialog leagueId="g1" leagueName="The Boot Room" open onOpenChange={() => {}} onSuccess={() => {}} />,
  )
}

function sentBody() {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  return JSON.parse(call![1].body as string)
}

describe('JoinRequestDialog', () => {
  it('sends the picked name with played_before true', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Sam O' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(sentBody()).toEqual({ message: null, player_name: 'Sam O', played_before: true }))
  })

  it('lets them send without a name when they cannot find it', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send without it' }))
    expect(screen.getByText(/the admin will find you or add you/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(sentBody()).toEqual({ message: null, player_name: null, played_before: true }))
  })

  it('can go back to picking a name', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /Yes/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Send without it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pick my name' }))
    expect(await screen.findByRole('button', { name: 'Sam O' })).toBeInTheDocument()
  })

  it('sends played_before false for someone new', async () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: /No/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }))
    await waitFor(() => expect(sentBody()).toEqual({ message: null, player_name: null, played_before: false }))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/__tests__/JoinRequestDialog.test.tsx`
Expected: FAIL. The first test fails because the body has no `played_before`; the second because there is no "Send without it" button.

If the Radix dialog doesn't render in jsdom, check `components/__tests__/EditPlayerModal.test.tsx` for how it opens a dialog and copy its setup.

- [ ] **Step 3: Let the picker footer take a node**

In `components/PlayerClaimPicker.tsx`, change the prop:

```ts
  /** Override the footer copy — defaults to the settings-page version. */
  footerText?: React.ReactNode
```

and add `import type React from 'react'` at the top if `React` isn't already in scope (the file imports `{ useEffect, useState } from 'react'`; change that line to `import { useEffect, useState, type ReactNode } from 'react'` and use `footerText?: ReactNode` instead).

- [ ] **Step 4: Update the dialog**

In `components/JoinRequestDialog.tsx`:

1. Delete the `JOIN_CLAIM_FOOTER` constant.
2. Add state after `selectedPlayer`:

```ts
  // "Yes, but I can't find my name": send without one, the admin sorts it.
  const [cantFind, setCantFind] = useState(false)
```

3. In `handleOpenChange`'s reset block, add `setCantFind(false)`.
4. Replace the `body: JSON.stringify({ … })` in `handleSubmit` with:

```ts
        body: JSON.stringify({
          message: message.trim() || null,
          player_name: claimChoice === 'yes' ? selectedPlayer : null,
          played_before: claimChoice === 'yes' ? true : claimChoice === 'no' ? false : null,
        }),
```

5. In both Yes/No button `onClick` handlers, add `setCantFind(false)` next to `setSelectedPlayer(null)`.
6. Replace the whole `{claimChoice === 'yes' && ( … )}` block with:

```tsx
                {claimChoice === 'yes' && (
                  <div className="mt-3">
                    {selectedPlayer ? (
                      <div className="flex items-center justify-between rounded-lg border border-[#38bdf8]/50 bg-[#38bdf8]/8 px-3 py-2">
                        <span className="text-sm text-[#7dd3fc]">{selectedPlayer}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedPlayer(null)}
                          className="text-xs text-[#8ba4c4] hover:text-[#dff1ff] transition-colors ml-2"
                        >
                          Change
                        </button>
                      </div>
                    ) : cantFind ? (
                      <div className="rounded-lg border border-[#1b2c46] bg-[#0c1728] px-3 py-2.5">
                        <p className="text-xs text-[#8ba4c4] leading-relaxed">
                          No problem, the admin will find you or add you when they approve.
                        </p>
                        <button
                          type="button"
                          onClick={() => setCantFind(false)}
                          className="mt-1.5 text-xs text-[#38bdf8] hover:text-[#7dd3fc] transition-colors"
                        >
                          Pick my name
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-[#8ba4c4] mb-2">
                          Select your name to link your match history to your account.
                        </p>
                        <PlayerClaimPicker
                          leagueId={leagueId}
                          selectionOnly
                          footerText={
                            <>
                              Can&apos;t find your name?{' '}
                              <button
                                type="button"
                                onClick={() => setCantFind(true)}
                                className="text-[#38bdf8] hover:text-[#7dd3fc] transition-colors"
                              >
                                Send without it
                              </button>
                            </>
                          }
                          onClaim={(name) => setSelectedPlayer(name)}
                          onCancel={() => {
                            setClaimChoice(null)
                            setSelectedPlayer(null)
                          }}
                        />
                      </>
                    )}
                  </div>
                )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- components/__tests__/JoinRequestDialog.test.tsx components/__tests__/LeagueJoinArea.share.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add components/PlayerClaimPicker.tsx components/JoinRequestDialog.tsx components/__tests__/JoinRequestDialog.test.tsx
git commit -m "Let requesters send without finding their name"
```

---

### Task 6: ReviewCard

**Files:**
- Create: `components/ReviewCard.tsx`
- Test: `components/__tests__/ReviewCard.test.tsx`

Mockup reference: direction A, states A1–A3 in `.superpowers/brainstorm/22374-1792493048/content/request-card-v2.html` (open it in a browser if it still exists).

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/ReviewCard.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReviewCard } from '@/components/ReviewCard'
import type { PendingJoinRequest, PlayerAttribute, PlayerClaim, ReviewItem } from '@/lib/types'

function request(overrides: Partial<PendingJoinRequest> = {}): ReviewItem {
  return {
    kind: 'join',
    request: {
      id: 'r1',
      user_id: 'u1',
      email: 'john@example.com',
      display_name: 'John Easton',
      message: "Dave's mate from work",
      status: 'pending',
      created_at: new Date().toISOString(),
      player_name: null,
      played_before: false,
      ...overrides,
    },
  }
}

function claim(overrides: Partial<PlayerClaim> = {}): ReviewItem {
  return {
    kind: 'claim',
    claim: {
      id: 'c1',
      game_id: 'g1',
      user_id: 'u9',
      player_name: 'Sam O',
      admin_override_name: null,
      status: 'pending',
      reviewed_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      display_name: 'Sam Okafor',
      email: 'sam@example.com',
      ...overrides,
    },
  }
}

function player(name: string, overrides: Partial<PlayerAttribute> = {}): PlayerAttribute {
  return { name, strength: 'average', mentality: 'balanced', played: 0, linked_user_id: null, linked_display_name: null, ...overrides }
}

const roster = [
  player('Sam O', { played: 23 }),
  player('Sammy', { played: 4 }),
  player('John E'),
  player('Dave S', { played: 40, linked_user_id: 'other', linked_display_name: 'Dave Smith' }),
]

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
  global.fetch = fetchMock as unknown as typeof fetch
})

function renderCard(item: ReviewItem, extra: Partial<React.ComponentProps<typeof ReviewCard>> = {}) {
  const onDone = jest.fn()
  const onRosterStale = jest.fn()
  render(<ReviewCard leagueId="g1" item={item} roster={roster} onDone={onDone} onRosterStale={onRosterStale} {...extra} />)
  return { onDone, onRosterStale }
}

function lastBody() {
  return JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string)
}

describe('ReviewCard', () => {
  it('opens on their pick with the game count', () => {
    renderCard(request({ player_name: 'Sam O', played_before: true }))
    expect(screen.getByText('Sam O')).toBeInTheDocument()
    expect(screen.getByText('· 23 games')).toBeInTheDocument()
    expect(screen.getByText('Their pick')).toBeInTheDocument()
  })

  it('opens on a new player named after their profile when new', () => {
    renderCard(request())
    expect(screen.getByLabelText('New player name')).toHaveValue('John Easton')
    expect(screen.getByText(/They said they're new/)).toBeInTheDocument()
  })

  it('opens on the squad list when they could not find their name', () => {
    renderCard(request({ played_before: true }))
    expect(screen.getByText("They've played before but couldn't find their name.")).toBeInTheDocument()
    expect(screen.getByLabelText('Search the squad')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('Change opens the squad list and picking a row selects them', () => {
    renderCard(request({ player_name: 'Sam O', played_before: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    fireEvent.change(screen.getByLabelText('Search the squad'), { target: { value: 'sam' } })
    expect(screen.queryByRole('button', { name: /John E/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Sammy/ }))
    expect(screen.getByText('· 4 games')).toBeInTheDocument()
    expect(screen.queryByText('Their pick')).not.toBeInTheDocument()
  })

  it('disables squad players linked to someone else', () => {
    renderCard(request({ played_before: true }))
    expect(screen.getByRole('button', { name: /Dave S/ })).toBeDisabled()
    expect(screen.getByText('Linked to Dave Smith')).toBeInTheDocument()
  })

  it('switches between new player and the squad list', () => {
    renderCard(request())
    fireEvent.click(screen.getByRole('button', { name: 'Already in the squad? Pick them' }))
    expect(screen.getByLabelText('Search the squad')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Not in the list? Add as a new player' }))
    expect(screen.getByLabelText('New player name')).toHaveValue('John Easton')
  })

  it('warns about a name clash and offers to link instead', () => {
    renderCard(request())
    fireEvent.change(screen.getByLabelText('New player name'), { target: { value: 'john e' } })
    expect(screen.getByText("There's already a John E in the squad.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Link to John E instead' }))
    expect(screen.getByText('John E')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  })

  it('warns when their pick is linked to someone else', () => {
    renderCard(request({ player_name: 'Dave S', played_before: true }))
    expect(screen.getByText('Dave S is already linked to Dave Smith.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  })

  it('approves a new player for a join request', async () => {
    const { onDone } = renderCard(request())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/league/g1/join-requests/r1/approve')
    expect(lastBody()).toEqual({ player_name: 'John Easton', create_player: true })
  })

  it('approves an existing player for a member claim', async () => {
    const { onDone } = renderCard(claim())
    expect(screen.getByText('Wants to link to a player')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/league/g1/player-claims/c1/approve')
    expect(lastBody()).toEqual({ player_name: 'Sam O', create_player: false })
  })

  it('declines a join request', async () => {
    const { onDone } = renderCard(request())
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/league/g1/join-requests/r1/review')
    expect(lastBody()).toEqual({ action: 'declined' })
  })

  it('rejects a member claim on decline', async () => {
    renderCard(claim())
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock.mock.calls[0][0]).toBe('/api/league/g1/player-claims/c1/review')
    expect(lastBody()).toEqual({ action: 'rejected' })
  })

  it('shows the server message on a 409 and asks for a fresh roster', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "There's already a John Easton in the squad." }) })
    const { onDone, onRosterStale } = renderCard(request())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText("There's already a John Easton in the squad.")).toBeInTheDocument()
    expect(onRosterStale).toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/__tests__/ReviewCard.test.tsx`
Expected: FAIL, cannot find module `@/components/ReviewCard`.

- [ ] **Step 3: Implement**

Create `components/ReviewCard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { cn, gamesLabel, getInitials, initialPlaysAs, reviewProblem, timeAgo } from '@/lib/utils'
import type { PlayerAttribute, PlaysAs, ReviewItem } from '@/lib/types'

interface ReviewCardProps {
  leagueId: string
  item: ReviewItem
  /** Squad from GET /api/league/[id]/players. */
  roster: PlayerAttribute[]
  /** Called once the item has been approved or declined. */
  onDone: () => void
  /** Called when the server rejects a choice the roster said was fine (409). */
  onRosterStale?: () => void
}

const LABEL = 'font-plex text-[9px] font-bold uppercase tracking-[.16em] text-[#6f88a8]'
const LINK = 'font-inter-body text-xs text-[#38bdf8] hover:text-[#7dd3fc] transition-colors'

/** One join request or member claim: who they are, who they'll play as, Decline / Approve. */
export function ReviewCard({ leagueId, item, roster, onDone, onRosterStale }: ReviewCardProps) {
  const [playsAs, setPlaysAs] = useState<PlaysAs>(() => initialPlaysAs(item))
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState<'approve' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noteOpen, setNoteOpen] = useState(false)

  const person = item.kind === 'join'
    ? {
        userId: item.request.user_id,
        name: item.request.display_name,
        email: item.request.email,
        createdAt: item.request.created_at,
        note: item.request.message,
        pick: item.request.player_name,
      }
    : {
        userId: item.claim.user_id,
        name: item.claim.display_name || item.claim.email || 'Member',
        email: item.claim.email ?? '',
        createdAt: item.claim.created_at,
        note: null,
        pick: item.claim.player_name,
      }
  const saidNew = item.kind === 'join' && item.request.played_before === false
  const couldNotFind = item.kind === 'join' && item.request.played_before === true && !item.request.player_name

  const problem = reviewProblem(playsAs, roster, person.userId)
  const warn = problem?.kind === 'clash' || problem?.kind === 'linked'
  const base = `/api/league/${leagueId}`

  async function send(kind: 'approve' | 'decline') {
    if (kind === 'approve' && (problem || playsAs.mode === 'list')) return
    setBusy(kind)
    setError(null)
    const [url, body] = kind === 'approve'
      ? [
          item.kind === 'join' ? `${base}/join-requests/${item.request.id}/approve` : `${base}/player-claims/${item.claim.id}/approve`,
          { player_name: playsAs.mode === 'list' ? '' : playsAs.name.trim(), create_player: playsAs.mode === 'new' },
        ]
      : [
          item.kind === 'join' ? `${base}/join-requests/${item.request.id}/review` : `${base}/player-claims/${item.claim.id}/review`,
          { action: item.kind === 'join' ? 'declined' : 'rejected' },
        ]
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'include',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong')
        if (res.status === 409) onRosterStale?.()
        return
      }
      onDone()
    } catch {
      setError('Something went wrong')
    } finally {
      setBusy(null)
    }
  }

  const query = search.trim().toLowerCase()
  const squad = query ? roster.filter((p) => p.name.toLowerCase().includes(query)) : roster

  return (
    <li className="px-4 py-4">
      {/* Who */}
      <div className="flex items-start gap-3">
        <div className="size-8 shrink-0 rounded-full bg-[#0c1728] border border-[#223a5c] flex items-center justify-center font-plex text-[10px] font-bold text-[#8ba4c4]">
          {getInitials(person.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-inter-body text-sm font-medium text-[#f4f9ff] truncate">{person.name}</p>
            <p className="ml-auto shrink-0 font-plex text-[10px] text-[#4f688a]">{timeAgo(person.createdAt)}</p>
          </div>
          {person.email && <p className="font-inter-body text-xs text-[#6f88a8] truncate">{person.email}</p>}
          {item.kind === 'claim' ? (
            <p className="mt-1 font-inter-body text-xs text-[#8ba4c4]">Wants to link to a player</p>
          ) : person.note ? (
            <button type="button" className="mt-1 w-full text-left" onClick={() => setNoteOpen((o) => !o)}>
              <p className={cn('font-inter-body text-xs italic text-[#8ba4c4]', !noteOpen && 'line-clamp-2')}>
                &ldquo;{person.note}&rdquo;
              </p>
            </button>
          ) : null}
        </div>
      </div>

      {/* Plays as */}
      <div className={cn('mt-3 ml-11 rounded-lg border bg-[#0c1728] px-3 py-2.5', warn ? 'border-[#fbbf24]/40' : 'border-[#1b2c46]')}>
        {playsAs.mode === 'existing' && (() => {
          const rosterPlayer = roster.find((p) => p.name === playsAs.name)
          return (
            <>
              <p className={LABEL}>Plays as</p>
              <div className="mt-1 flex items-baseline gap-2">
                <p className="font-inter-body text-sm">
                  <span className={cn('font-medium', warn ? 'text-[#fbbf24]' : 'text-[#f4f9ff]')}>{playsAs.name}</span>
                  {rosterPlayer && <span className="text-[#6f88a8]"> {`· ${gamesLabel(rosterPlayer.played ?? 0)}`}</span>}
                </p>
                {playsAs.name === person.pick && (
                  <span className="rounded border border-[#223a5c] px-1.5 font-plex text-[9px] uppercase tracking-[.12em] text-[#8ba4c4]">
                    Their pick
                  </span>
                )}
                <button type="button" onClick={() => { setSearch(''); setPlaysAs({ mode: 'list' }) }} className={cn(LINK, 'ml-auto')}>
                  Change
                </button>
              </div>
              {problem?.kind === 'linked' && (
                <p className="mt-1.5 font-inter-body text-xs text-[#fbbf24]">
                  {problem.player.name} is already linked to {problem.player.linked_display_name}.
                </p>
              )}
            </>
          )
        })()}

        {playsAs.mode === 'list' && (
          <>
            <p className={LABEL}>Plays as</p>
            {couldNotFind && (
              <p className="mt-1 font-inter-body text-[11px] text-[#8ba4c4]">
                They&apos;ve played before but couldn&apos;t find their name.
              </p>
            )}
            <input
              type="text"
              aria-label="Search the squad"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the squad…"
              className="mt-2 w-full px-3 py-2 rounded-xl bg-[#0a1421] border border-[#1b2c46] font-inter-body text-sm text-[#f4f9ff] placeholder:text-[#4f688a] outline-none focus:border-[#2c4a72]"
            />
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-[#1b2c46] divide-y divide-[#17263c]">
              {squad.length === 0 ? (
                <p className="px-3 py-2 font-inter-body text-xs text-[#6f88a8]">No players match that search.</p>
              ) : (
                squad.map((p) => {
                  const linkedElsewhere = !!p.linked_user_id && p.linked_user_id !== person.userId
                  return (
                    <button
                      key={p.name}
                      type="button"
                      disabled={linkedElsewhere}
                      onClick={() => setPlaysAs({ mode: 'existing', name: p.name })}
                      className="flex w-full items-baseline gap-2 px-3 py-2 text-left font-inter-body text-sm text-[#cfe0f4] hover:bg-[#0a1421] disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                    >
                      {p.name}
                      <span className="text-xs text-[#6f88a8]">
                        {linkedElsewhere ? `Linked to ${p.linked_display_name}` : gamesLabel(p.played ?? 0)}
                      </span>
                    </button>
                  )
                })
              )}
            </div>
            <button
              type="button"
              onClick={() => setPlaysAs({ mode: 'new', name: search.trim() || person.name })}
              className={cn(LINK, 'mt-2.5 inline-flex items-center gap-1')}
            >
              <Plus className="size-3" aria-hidden />
              Not in the list? Add as a new player
            </button>
          </>
        )}

        {playsAs.mode === 'new' && (
          <>
            <label htmlFor={`new-player-${person.userId}`} className={LABEL}>Plays as · new player</label>
            <input
              id={`new-player-${person.userId}`}
              type="text"
              aria-label="New player name"
              value={playsAs.name}
              onChange={(e) => setPlaysAs({ mode: 'new', name: e.target.value })}
              className={cn(
                'mt-1.5 w-full px-3 py-1.5 rounded bg-[#0a1421] border font-inter-body text-sm text-[#f4f9ff] outline-none',
                warn ? 'border-[#fbbf24]' : 'border-[#223a5c] focus:border-[#38bdf8]',
              )}
            />
            {problem?.kind === 'clash' ? (
              <>
                <p className="mt-2 font-inter-body text-xs text-[#fbbf24]">
                  There&apos;s already a {problem.player.name} in the squad.
                </p>
                {(!problem.player.linked_user_id || problem.player.linked_user_id === person.userId) && (
                  <button
                    type="button"
                    onClick={() => setPlaysAs({ mode: 'existing', name: problem.player.name })}
                    className={cn(LINK, 'mt-1.5')}
                  >
                    Link to {problem.player.name} instead
                  </button>
                )}
              </>
            ) : (
              <p className="mt-1.5 font-inter-body text-[11px] text-[#4f688a]">
                {saidNew ? "They said they're new. Added to the squad when you approve." : 'Added to the squad when you approve.'}
              </p>
            )}
            <button type="button" onClick={() => { setSearch(''); setPlaysAs({ mode: 'list' }) }} className={cn(LINK, 'mt-1.5 block')}>
              Already in the squad? Pick them
            </button>
          </>
        )}
      </div>

      {/* Decision */}
      <div className="mt-3 ml-11 flex items-center">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => send('decline')}
          className="text-xs font-medium text-[#6f88a8] hover:text-[#e2686f] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy === 'decline' ? '…' : 'Decline'}
        </button>
        <button
          type="button"
          disabled={busy !== null || problem !== null}
          onClick={() => send('approve')}
          className="ml-auto rounded bg-[#38bdf8] px-3 py-1.5 text-xs font-bold text-[#05101d] hover:bg-[#7dd3fc] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {busy === 'approve' ? '…' : 'Approve'}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 ml-11 font-inter-body text-xs text-[#e2686f]">{error}</p>}
    </li>
  )
}
```

Note: the busy label `'…'` replaces the button text, so the "Approve" accessible name disappears while a request is in flight. The tests wait on `onDone` or the error, so this is fine.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- components/__tests__/ReviewCard.test.tsx`
Expected: PASS. If `getByText('Sam O')` finds more than one element, scope it with `within(...)` rather than changing copy.

- [ ] **Step 5: Commit**

```bash
git add components/ReviewCard.tsx components/__tests__/ReviewCard.test.tsx
git commit -m "Add single-decision review card"
```

---

### Task 7: PendingReviewList

**Files:**
- Create: `components/PendingReviewList.tsx`
- Test: `components/__tests__/PendingReviewList.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `components/__tests__/PendingReviewList.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PendingReviewList } from '@/components/PendingReviewList'
import type { PendingJoinRequest, PlayerClaim } from '@/lib/types'

const now = new Date().toISOString()

const requests: PendingJoinRequest[] = [
  { id: 'r1', user_id: 'u1', email: 'john@example.com', display_name: 'John Easton', message: null, status: 'pending', created_at: now, player_name: null, played_before: false },
]

const claims: PlayerClaim[] = [
  { id: 'c1', game_id: 'g1', user_id: 'u9', player_name: 'Sam O', admin_override_name: null, status: 'pending', reviewed_by: null, created_at: now, updated_at: now, display_name: 'Sam Okafor', email: 'sam@example.com' },
  { id: 'c2', game_id: 'g1', user_id: 'u1', player_name: 'John E', admin_override_name: null, status: 'pending', reviewed_by: null, created_at: now, updated_at: now, display_name: 'John Easton', email: 'john@example.com' },
]

const fetchMock = jest.fn()
beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) })
  global.fetch = fetchMock as unknown as typeof fetch
})

describe('PendingReviewList', () => {
  it('shows join requests and member claims under one count', () => {
    render(<PendingReviewList leagueId="g1" requests={requests} claims={claims} roster={[]} />)
    expect(screen.getByText('Waiting for you')).toBeInTheDocument()
    expect(screen.getByText('(2)')).toBeInTheDocument()
    expect(screen.getByText('John Easton')).toBeInTheDocument()
    expect(screen.getByText('Sam Okafor')).toBeInTheDocument()
  })

  it('shows an empty state', () => {
    render(<PendingReviewList leagueId="g1" requests={[]} claims={[]} roster={[]} />)
    expect(screen.getByText('No pending requests.')).toBeInTheDocument()
  })

  it('hides a card once reviewed and tells the page', async () => {
    const onChanged = jest.fn()
    render(<PendingReviewList leagueId="g1" requests={requests} claims={[]} roster={[]} onChanged={onChanged} />)
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(screen.queryByText('John Easton')).not.toBeInTheDocument()
    expect(screen.getByText('No pending requests.')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- components/__tests__/PendingReviewList.test.tsx`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement**

Create `components/PendingReviewList.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { ReviewCard } from '@/components/ReviewCard'
import { buildReviewItems } from '@/lib/utils'
import type { PendingJoinRequest, PlayerAttribute, PlayerClaim, ReviewItem } from '@/lib/types'

interface PendingReviewListProps {
  leagueId: string
  requests: PendingJoinRequest[]
  /** Pending player claims. Ones from people with a pending request are left out. */
  claims: PlayerClaim[]
  roster: PlayerAttribute[]
  /** Called after any item is approved or declined. */
  onChanged?: () => void
  /** Called when the server says the roster has moved on (409). */
  onRosterStale?: () => void
}

function itemKey(item: ReviewItem): string {
  return item.kind === 'join' ? `join:${item.request.id}` : `claim:${item.claim.id}`
}

/** Settings → Members: everything waiting for an admin, one card each. */
export function PendingReviewList({ leagueId, requests, claims, roster, onChanged, onRosterStale }: PendingReviewListProps) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const items = buildReviewItems(requests, claims).filter((i) => !done.has(itemKey(i)))

  if (items.length === 0) {
    return <p className="font-inter-body text-[13px] text-[#6f88a8]">No pending requests.</p>
  }

  return (
    <div className="rounded-xl border border-[#1b2c46] bg-[#0a1421] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1b2c46] bg-[#0c1728]">
        <p className="text-sm font-medium text-[#f4f9ff]">
          Waiting for you <span className="text-[#6f88a8] font-normal">({items.length})</span>
        </p>
      </div>
      <ul className="divide-y divide-[#17263c]">
        {items.map((item) => {
          const key = itemKey(item)
          return (
            <ReviewCard
              key={key}
              leagueId={leagueId}
              item={item}
              roster={roster}
              onRosterStale={onRosterStale}
              onDone={() => {
                setDone((prev) => new Set(prev).add(key))
                onChanged?.()
              }}
            />
          )
        })}
      </ul>
    </div>
  )
}
```

The heading text is split across a text node and a `<span>`, so `getByText('Waiting for you')` matches the `<p>`'s own text only if Testing Library's default normaliser sees "Waiting for you" as the full text of an element. If the test fails on that line, wrap the words in their own `<span>` rather than changing the test.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- components/__tests__/PendingReviewList.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add components/PendingReviewList.tsx components/__tests__/PendingReviewList.test.tsx
git commit -m "Add Waiting for you review list"
```

---

### Task 8: Wire into Settings and remove the old tables

**Files:**
- Modify: `app/[slug]/settings/page.tsx`
- Delete: `components/PendingRequestsTable.tsx`, `components/PlayerClaimsTable.tsx`

- [ ] **Step 1: Swap imports**

In `app/[slug]/settings/page.tsx`:
- Remove `import { PlayerClaimsTable } from '@/components/PlayerClaimsTable'` and `import { PendingRequestsTable } from '@/components/PendingRequestsTable'`.
- Add `import { PendingReviewList } from '@/components/PendingReviewList'`.
- Change `import { cn } from '@/lib/utils'` to `import { buildReviewItems, cn } from '@/lib/utils'`.

- [ ] **Step 2: Load the roster for Members too**

Change `loadPlayers` so only the first load shows a skeleton (it now reloads after every review):

```ts
  const loadPlayers = useCallback(async () => {
    try {
      const res = await fetch(`/api/league/${leagueId}/players`, { credentials: 'include' })
      const data = await res.json()
      setPlayers(Array.isArray(data) ? data : [])
    } finally {
      setPlayersLoading(false)
    }
  }, [leagueId])
```

In the section effect, change the members branch to:

```ts
    if (section === 'members') {
      loadMembers()
      loadPlayers()
      // Auto-create both invite links on members tab mount
      fetchInviteLink('member')
      fetchInviteLink('admin')
    }
```

Change `handlePendingChanged` to also reload the roster (a review can create a player or a link):

```ts
  const handlePendingChanged = useCallback(() => {
    loadPending()
    loadMembers()
    loadPlayers()
    router.refresh()
  }, [loadPending, loadMembers, loadPlayers, router])
```

`handlePendingChanged` is declared before `loadPlayers` in the file today. Move the `loadPlayers` `useCallback` block up so it sits directly above `handlePendingChanged`, otherwise TypeScript reports it is used before declaration.

- [ ] **Step 3: Count with the shared helper**

Replace:

```ts
  // A claim made alongside a pending join request is reviewed on that request.
  const pendingRequestUserIds = new Set(pendingRequests.map((r) => r.user_id))
  const standaloneClaims = pendingClaims.filter((c) => !pendingRequestUserIds.has(c.user_id))
  const pendingCount = pendingRequests.length + standaloneClaims.length
```

with:

```ts
  const pendingCount = buildReviewItems(pendingRequests, pendingClaims).length
```

- [ ] **Step 4: Render the list**

Replace the `{/* Pending join requests */}` block and the `{/* Player identity claims … */}` block (everything between the Invite Links card and `{/* Member list */}`) with:

```tsx
          {/* Join requests and member claims, one card each */}
          {pendingLoading || (playersLoading && players.length === 0) ? (
            <PanelSkeleton cards={[2]} />
          ) : (
            <PendingReviewList
              key={pendingVersion}
              leagueId={leagueId}
              requests={pendingRequests}
              claims={pendingClaims}
              roster={players}
              onChanged={handlePendingChanged}
              onRosterStale={loadPlayers}
            />
          )}
```

- [ ] **Step 5: Delete the old tables**

```bash
git rm components/PendingRequestsTable.tsx components/PlayerClaimsTable.tsx
```

Then check nothing else imports them:

Run: `grep -rn "PendingRequestsTable\|PlayerClaimsTable" app components lib __tests__`
Expected: no output.

- [ ] **Step 6: Typecheck, lint and run the full suite**

Run: `npx tsc --noEmit && npm run lint && npm test`
Expected: all pass. Fix any `PendingJoinRequest` fixtures in other tests (e.g. `lib/__tests__/fetchers.test.ts`) that now miss `player_name` / `played_before` by adding `player_name: null, played_before: null`.

- [ ] **Step 7: Commit**

```bash
git add -A "app/[slug]/settings/page.tsx" components lib __tests__
git commit -m "Review join requests and claims with one card on Settings"
```

---

### Task 9: Check it in the app

**Files:** none

Local dev uses the **production** Supabase project. Browse only; do not click Approve or Decline on a real request. Until the migration (Task 1) is applied, `get_join_requests` won't return `player_name` / `played_before`, which the UI handles (both `undefined` → treated as new).

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 2: Look at Settings → Members**

Run `npm run dev`, sign in as an admin, open `http://localhost:3000/craft-football/settings?tab=members`. If there are pending items, check the cards render as in mockup A1. If there are none, "No pending requests." shows. Take a screenshot to `.context/join-requests/settings-members.png`.

- [ ] **Step 3: Look at the join dialog**

Sign out (or use a private window) on a league you're not in, click Join, pick Yes, and check the "Can't find your name? Send without it" link and the "Pick my name" way back. Don't send the request.

---

### Task 10: Apply the migration (user, by hand)

**Files:** none

- [ ] **Step 1:** Ask the user to paste `supabase/migrations/20261020000001_single_step_join_review.sql` into the Supabase SQL Editor and run it.
- [ ] **Step 2:** Ask them to run this check and share the result:

```sql
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE proname IN ('submit_join_request', 'get_join_requests', 'approve_join_request',
                  'approve_player_claim', 'link_reviewed_player', 'review_join_request')
ORDER BY proname;
```

Expected: one row each, with `submit_join_request` taking `(p_game_id uuid, p_message text, p_player_name text, p_played_before boolean)`.

- [ ] **Step 3:** Deploy order: apply the migration **before** the app change is deployed. The new app calls `submit_join_request` with four arguments and the approve RPCs, which don't exist until the migration runs.
