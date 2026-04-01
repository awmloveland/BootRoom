# League Join Flow — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins the ability to review, approve, and decline join requests — via a Pending Requests section in Settings → Members and a notification badge on the settings gear icon.

**Architecture:** Two new Supabase RPCs handle the review actions. A new `PendingRequestsTable` client component handles the approve/decline UI with optimistic updates. The pending count is fetched server-side in `results/page.tsx` and passed to `LeaguePageHeader` to render the badge. The settings page fetches pending requests on the Members tab.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL), TypeScript strict, Tailwind CSS, Radix UI, `cn()` from `lib/utils`

**Prerequisite:** Phase 1 must be merged before starting this plan.

---

> **IMPORTANT — UI Review Gate:** Before writing any code, present mockups/sketches for: (1) the Pending Requests section in Settings → Members, and (2) the notification badge on the settings gear icon. Get explicit user approval before proceeding to Task 1.

---

## File Map

| Action | File |
|---|---|
| Create | `supabase/migrations/20260401000001_add_join_request_review_rpcs.sql` |
| Create | `app/api/league/[id]/join-requests/[requestId]/review/route.ts` |
| Modify | `lib/fetchers.ts` |
| Modify | `lib/types.ts` |
| Create | `components/PendingRequestsTable.tsx` |
| Modify | `app/[leagueId]/settings/page.tsx` |
| Modify | `components/LeaguePageHeader.tsx` |
| Modify | `app/[leagueId]/results/page.tsx` |

---

## Task 1: Database Migration — Review RPCs

**Files:**
- Create: `supabase/migrations/20260401000001_add_join_request_review_rpcs.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- RPC: review a join request (admin/creator only)
CREATE OR REPLACE FUNCTION public.review_join_request(
  p_request_id UUID,
  p_action     TEXT  -- 'approved' or 'declined'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request  game_join_requests%ROWTYPE;
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_action NOT IN ('approved', 'declined') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- Fetch the request
  SELECT * INTO v_request FROM game_join_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  -- Verify caller is admin or creator of this league
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = v_request.game_id
      AND user_id = v_admin_id
      AND role IN ('creator', 'admin')
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Update the request status
  UPDATE game_join_requests
  SET status      = p_action,
      reviewed_by = v_admin_id,
      updated_at  = now()
  WHERE id = p_request_id;

  -- If approved, insert into game_members (idempotent)
  IF p_action = 'approved' THEN
    INSERT INTO game_members (game_id, user_id, role)
    VALUES (v_request.game_id, v_request.user_id, 'member')
    ON CONFLICT (game_id, user_id) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_join_request(UUID, TEXT) TO authenticated;

-- RPC: get pending join requests for a league (admin/creator only)
CREATE OR REPLACE FUNCTION public.get_join_requests(p_game_id UUID)
RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  email        text,
  display_name text,
  message      text,
  status       text,
  created_at   timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify caller is admin or creator
  IF NOT EXISTS (
    SELECT 1 FROM game_members
    WHERE game_id = p_game_id
      AND user_id = auth.uid()
      AND role IN ('creator', 'admin')
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
    gjr.created_at
  FROM game_join_requests gjr
  WHERE gjr.game_id = p_game_id
    AND gjr.status = 'pending'
  ORDER BY gjr.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_join_requests(UUID) TO authenticated;
```

- [ ] **Step 2: Run the migration**

Paste into the Supabase SQL Editor and execute. Verify both functions appear in the Database → Functions panel.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260401000001_add_join_request_review_rpcs.sql
git commit -m "feat: add review_join_request and get_join_requests RPCs"
```

---

## Task 2: API Route — Review a Join Request

**Files:**
- Create: `app/api/league/[id]/join-requests/[requestId]/review/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const { requestId } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const action: string = body.action

  if (action !== 'approved' && action !== 'declined') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { error } = await supabase.rpc('review_join_request', {
    p_request_id: requestId,
    p_action: action,
  })

  if (error) {
    if (error.message.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (error.message.includes('Request not found')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    console.error('[join-requests review POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/join-requests/[requestId]/review/route.ts
git commit -m "feat: add POST /api/league/[id]/join-requests/[requestId]/review route"
```

---

## Task 3: Fetchers — getPendingJoinRequests and getPendingJoinCount

**Files:**
- Modify: `lib/fetchers.ts`
- Modify: `lib/types.ts`

- [ ] **Step 1: Add PendingJoinRequest type to `lib/types.ts`**

Add after `JoinRequest`:

```ts
export interface PendingJoinRequest {
  id: string
  user_id: string
  email: string
  display_name: string
  message: string | null
  status: JoinRequestStatus
  created_at: string
}
```

- [ ] **Step 2: Add fetchers to `lib/fetchers.ts`**

Add the following two functions at the bottom of the file:

```ts
export const getPendingJoinRequests = cache(async (leagueId: string): Promise<PendingJoinRequest[]> => {
  const authSupabase = await createClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user) return []

  const { data, error } = await authSupabase.rpc('get_join_requests', {
    p_game_id: leagueId,
  })

  if (error) return []
  return (data ?? []) as PendingJoinRequest[]
})

export const getPendingJoinCount = cache(async (leagueId: string): Promise<number> => {
  const requests = await getPendingJoinRequests(leagueId)
  return requests.length
})
```

Also add `PendingJoinRequest` to the import in `lib/fetchers.ts`:

```ts
import type { GameRole, LeagueFeature, FeatureKey, JoinRequestStatus, PendingJoinRequest } from '@/lib/types'
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/fetchers.ts
git commit -m "feat: add getPendingJoinRequests and getPendingJoinCount fetchers"
```

---

## Task 4: PendingRequestsTable Component

**Files:**
- Create: `components/PendingRequestsTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { PendingJoinRequest } from '@/lib/types'

interface PendingRequestsTableProps {
  leagueId: string
  initialRequests: PendingJoinRequest[]
}

export function PendingRequestsTable({
  leagueId,
  initialRequests,
}: PendingRequestsTableProps) {
  const [requests, setRequests] = useState<PendingJoinRequest[]>(initialRequests)
  const [processing, setProcessing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleReview = async (requestId: string, action: 'approved' | 'declined') => {
    setProcessing(requestId)
    setError(null)
    try {
      const res = await fetch(
        `/api/league/${leagueId}/join-requests/${requestId}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong')
        return
      }
      // Optimistic removal
      setRequests((prev) => prev.filter((r) => r.id !== requestId))
    } catch {
      setError('Something went wrong')
    } finally {
      setProcessing(null)
    }
  }

  if (requests.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <h3 className="text-sm font-medium text-slate-300">
          Pending requests{' '}
          <span className="text-slate-500 font-normal">({requests.length})</span>
        </h3>
      </div>
      <ul className="divide-y divide-slate-700">
        {requests.map((req) => (
          <li key={req.id} className="px-4 py-3 flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-100 truncate">{req.display_name}</p>
              <p className="text-xs text-slate-400 truncate">{req.email}</p>
              {req.message && (
                <p className={cn(
                  'text-xs text-slate-500 mt-1 line-clamp-2',
                  'italic'
                )}>
                  "{req.message}"
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-400 hover:text-red-400 text-xs h-7 px-2"
                disabled={processing === req.id}
                onClick={() => handleReview(req.id, 'declined')}
              >
                Decline
              </Button>
              <Button
                size="sm"
                className="text-xs h-7 px-3"
                disabled={processing === req.id}
                onClick={() => handleReview(req.id, 'approved')}
              >
                {processing === req.id ? '…' : 'Approve'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p className="px-4 py-2 text-sm text-red-400 border-t border-slate-700">{error}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/PendingRequestsTable.tsx
git commit -m "feat: add PendingRequestsTable component"
```

---

## Task 5: Settings Page — Pending Requests Section

**Files:**
- Modify: `app/[leagueId]/settings/page.tsx`

Read the full settings page before editing. The Members tab section is around lines 261–328. The page is a client component (`'use client'`).

- [ ] **Step 1: Add state and fetch for pending requests**

Find where `members` state is declared (around line 30–50) and add alongside it:

```ts
const [pendingRequests, setPendingRequests] = useState<PendingJoinRequest[]>([])
const [pendingLoading, setPendingLoading] = useState(false)
```

Add the import at the top:

```ts
import type { PendingJoinRequest } from '@/lib/types'
import { PendingRequestsTable } from '@/components/PendingRequestsTable'
```

- [ ] **Step 2: Fetch pending requests when Members tab loads**

Find where `members` is fetched (the function that calls `GET /api/league/{id}/members`). Add a parallel fetch for pending requests in the same block:

```ts
// Fetch pending join requests alongside members
setPendingLoading(true)
fetch(`/api/league/${leagueId}/join-requests`)
  .then((res) => res.json())
  .then((data) => setPendingRequests(data ?? []))
  .catch(() => setPendingRequests([]))
  .finally(() => setPendingLoading(false))
```

- [ ] **Step 3: Add GET handler to the join-requests API route**

Open `app/api/league/[id]/join-requests/route.ts` and add a GET handler:

```ts
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('get_join_requests', {
    p_game_id: gameId,
  })

  if (error) {
    if (error.message.includes('Access denied')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 4: Add PendingRequestsTable above the member list**

Find the Members tab section (around line 314) where `AdminMemberTable` is rendered. Add `PendingRequestsTable` above it:

```tsx
{/* Pending join requests — only shown when there are pending requests */}
{pendingRequests.length > 0 && (
  <PendingRequestsTable
    leagueId={leagueId as string}
    initialRequests={pendingRequests}
  />
)}

{/* Existing member list */}
<AdminMemberTable ... />
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Manual test**

1. Submit a join request as a non-member (from Phase 1)
2. Sign in as an admin for that league
3. Navigate to Settings → Members
4. Confirm "Pending requests (1)" section appears above the member list
5. Test Approve — confirm the user disappears from pending list and appears in the member list
6. Submit another request, test Decline — confirm the user disappears from pending list

- [ ] **Step 7: Commit**

```bash
git add app/[leagueId]/settings/page.tsx app/api/league/[id]/join-requests/route.ts
git commit -m "feat: add pending requests section to Settings Members tab"
```

---

## Task 6: Notification Badge on Settings Gear Icon

**Files:**
- Modify: `components/LeaguePageHeader.tsx`
- Modify: `app/[leagueId]/results/page.tsx`

- [ ] **Step 1: Add pendingRequestCount prop to LeaguePageHeader**

Open `components/LeaguePageHeader.tsx`. Find the props interface and add:

```ts
pendingRequestCount?: number
```

- [ ] **Step 2: Update the settings icon to show the badge**

Find the settings icon block (currently `{isAdmin && (...)}`) and update it to wrap the gear in a relative container with a badge:

```tsx
{isAdmin && (
  <div className="relative">
    <Button asChild variant="ghost" size="icon" className="text-slate-500 hover:text-slate-400">
      <Link href={`/${leagueId}/settings`} aria-label="League settings">
        <Settings className="size-4" />
      </Link>
    </Button>
    {pendingRequestCount != null && pendingRequestCount > 0 && (
      <span
        aria-label={`${pendingRequestCount} pending request${pendingRequestCount === 1 ? '' : 's'}`}
        className="absolute top-1 right-1 size-2 rounded-full bg-red-500 pointer-events-none"
      />
    )}
  </div>
)}
```

- [ ] **Step 3: Fetch pending count server-side in results/page.tsx**

Open `app/[leagueId]/results/page.tsx`. Import `getPendingJoinCount`:

```ts
import {
  getAuthAndRole,
  getGame,
  getFeatures,
  getPlayerStats,
  getWeeks,
  getJoinRequestStatus,
  getPendingJoinCount,
} from '@/lib/fetchers'
```

Add it to the `Promise.all` block:

```ts
const [
  { userRole, isAuthenticated, user },
  game,
  features,
  players,
  rawWeeks,
  joinStatus,
  pendingRequestCount,
] = await Promise.all([
  getAuthAndRole(leagueId),
  getGame(leagueId),
  getFeatures(leagueId),
  getPlayerStats(leagueId),
  getWeeks(leagueId),
  getJoinRequestStatus(leagueId),
  isAdmin ? getPendingJoinCount(leagueId) : Promise.resolve(0),
])
```

Note: `isAdmin` is derived from `userRole` — but `userRole` comes from the first element of the `Promise.all`. Since the promises run in parallel, `isAdmin` isn't known when the array is defined. Resolve this by keeping all fetches parallel and letting `getPendingJoinCount` return 0 for non-admins (it calls `get_join_requests` which will throw "Access denied" for non-admins — the fetcher already handles this by returning `[]`).

Simplest approach — always fetch and let the RPC guard access:

```ts
const [
  { userRole, isAuthenticated, user },
  game,
  features,
  players,
  rawWeeks,
  joinStatus,
  pendingRequestCount,
] = await Promise.all([
  getAuthAndRole(leagueId),
  getGame(leagueId),
  getFeatures(leagueId),
  getPlayerStats(leagueId),
  getWeeks(leagueId),
  getJoinRequestStatus(leagueId),
  getPendingJoinCount(leagueId),   // returns 0 for non-admins (RPC denies access, fetcher returns [])
])
```

- [ ] **Step 4: Pass pendingRequestCount to LeaguePageHeader**

Find all `<LeaguePageHeader` usages in `results/page.tsx` and add the prop:

```tsx
<LeaguePageHeader
  // ...existing props...
  pendingRequestCount={pendingRequestCount}
/>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Manual test**

1. Submit a join request as a non-member
2. Sign in as an admin for that league
3. Navigate to the public league results page
4. Confirm the settings gear icon shows a red dot
5. Click it, navigate to Settings → Members, approve the request
6. Navigate back to the results page — red dot should be gone

- [ ] **Step 7: Commit**

```bash
git add components/LeaguePageHeader.tsx app/[leagueId]/results/page.tsx
git commit -m "feat: add pending request notification badge to settings icon"
```

---

## Final Phase 2 Check

- [ ] Run `npx tsc --noEmit` — no errors
- [ ] Run `npm run build` — builds successfully
- [ ] End-to-end test: non-member requests → admin sees badge → admin approves → user becomes member
- [ ] End-to-end test: non-member requests → admin declines → user's button resets to "Join" on next load
