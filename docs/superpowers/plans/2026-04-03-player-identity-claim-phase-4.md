# Player Identity Claim — Phase 4: Join Flow Integration + Onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the claim step inside the join request dialog, show attached claims in the admin pending requests review, and add a first-visit onboarding banner for newly-approved members. Phases 1, 2, and 3 must be merged first.

**Architecture:** `JoinRequestDialog` gets an optional Yes/No card section with an inline `PlayerClaimPicker`. The join-requests POST API is extended to atomically create a claim row alongside the join request. `PendingRequestsTable` gains an inline claim chip per request. The results page shows a one-time blue banner for members without a linked profile. The settings badge count is extended to include pending claims.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, `cn()`, `lucide-react`, `localStorage` for banner dismiss state. No new libraries.

**Prerequisite:** Phases 1, 2, and 3 merged. `PlayerClaimPicker` exists. All claim API routes exist.

---

## File Map

| Action | File |
|---|---|
| Modify | `components/JoinRequestDialog.tsx` |
| Modify | `app/api/league/[id]/join-requests/route.ts` |
| Modify | `components/PendingRequestsTable.tsx` |
| Modify | `app/[leagueId]/results/page.tsx` |
| Modify | `components/LeaguePageHeader.tsx` |

---

### Task 1: JoinRequestDialog — Yes/No claim step

Add an optional "Have you played in this league before?" section below the note textarea. Two side-by-side cards (Yes / No). Selecting Yes expands `PlayerClaimPicker` inline. The selected player name is passed to the API on submit.

**Files:**
- Modify: `components/JoinRequestDialog.tsx`

- [ ] **Step 1: Read the current file**

Read `components/JoinRequestDialog.tsx` in full. Note the existing state (`message`, `loading`, `error`, `submitted`), the `handleSubmit` function, and the form structure.

- [ ] **Step 2: Add claim state**

Add to the existing state declarations inside `JoinRequestDialog`:

```tsx
import { PlayerClaimPicker } from '@/components/PlayerClaimPicker'

// State additions:
const [claimAnswer, setClaimAnswer] = useState<'yes' | 'no' | null>(null)
const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
```

Also update `handleOpenChange` to reset the new state when the dialog closes:

```tsx
function handleOpenChange(nextOpen: boolean) {
  onOpenChange(nextOpen)
  if (!nextOpen) {
    setMessage('')
    setLoading(false)
    setError(null)
    setSubmitted(false)
    setClaimAnswer(null)      // add
    setSelectedPlayer(null)   // add
  }
}
```

- [ ] **Step 3: Update handleSubmit to pass player_name**

Replace the `body` in the `fetch` call inside `handleSubmit`:

```tsx
body: JSON.stringify({
  message: message.trim() || null,
  player_name: claimAnswer === 'yes' ? selectedPlayer : null,
}),
```

- [ ] **Step 4: Add the Yes/No section to the form JSX**

In the form, after the closing `</div>` of the note textarea section (and before the error paragraph), add:

```tsx
{/* Player claim — optional */}
<div className="space-y-3">
  <p className="text-sm text-slate-300">
    Have you played in this league before?
  </p>
  <div className="grid grid-cols-2 gap-2">
    <button
      type="button"
      onClick={() => {
        setClaimAnswer('yes')
        setSelectedPlayer(null)
      }}
      className={cn(
        'rounded-lg border px-4 py-3 text-left transition-colors',
        claimAnswer === 'yes'
          ? 'border-sky-500 bg-sky-900/30'
          : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
      )}
    >
      <p className={cn('text-sm font-medium', claimAnswer === 'yes' ? 'text-sky-300' : 'text-slate-200')}>
        Yes
      </p>
      <p className="text-xs text-slate-500 mt-0.5">Link my player profile</p>
    </button>
    <button
      type="button"
      onClick={() => {
        setClaimAnswer('no')
        setSelectedPlayer(null)
      }}
      className={cn(
        'rounded-lg border px-4 py-3 text-left transition-colors',
        claimAnswer === 'no'
          ? 'border-slate-500 bg-slate-700/30'
          : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
      )}
    >
      <p className={cn('text-sm font-medium', claimAnswer === 'no' ? 'text-slate-200' : 'text-slate-300')}>
        No
      </p>
      <p className="text-xs text-slate-500 mt-0.5">I&apos;m new to this league</p>
    </button>
  </div>

  {claimAnswer === 'yes' && (
    <div className="p-3 rounded-lg bg-slate-900 border border-slate-700">
      <PlayerClaimPicker
        leagueId={leagueId}
        onSubmit={async (name) => { setSelectedPlayer(name) }}
        onCancel={() => { setClaimAnswer(null); setSelectedPlayer(null) }}
        submitLabel="Select"
      />
      {selectedPlayer && (
        <p className="text-xs text-sky-400 mt-2">
          Selected: <span className="font-medium">{selectedPlayer}</span>{' '}
          <button
            type="button"
            onClick={() => setSelectedPlayer(null)}
            className="text-slate-500 hover:text-slate-300 underline"
          >
            change
          </button>
        </p>
      )}
    </div>
  )}
</div>
```

Note: `PlayerClaimPicker` normally calls `onSubmit` and then the parent handles the API call. Here we're using it as a selection UI only — `onSubmit` just stores the selected name locally; the actual API call happens in `handleSubmit`. The `submitLabel` is "Select" to reflect this.

Because `PlayerClaimPicker.onSubmit` is typed as `async (playerName: string) => Promise<void>`, the inline usage `async (name) => { setSelectedPlayer(name) }` satisfies that signature.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Smoke-test in the browser**

Open the JoinRequestDialog (click Join on a public league page as a non-member). Confirm:
- Yes/No cards render below the note textarea
- Selecting Yes expands the picker
- Selecting a player shows the selected name with a "change" link
- Selecting No hides the picker
- Submitting with a player selected sends `player_name` in the request body (check network tab)
- Submitting with No or no answer sends `player_name: null`

- [ ] **Step 7: Commit**

```bash
git add components/JoinRequestDialog.tsx
git commit -m "feat: add player claim step to JoinRequestDialog"
```

---

### Task 2: Extend join-requests POST to create a claim atomically

When `player_name` is present in the body, create a `player_claims` row immediately after inserting the join request.

**Files:**
- Modify: `app/api/league/[id]/join-requests/route.ts`

- [ ] **Step 1: Read the current file**

Read `app/api/league/[id]/join-requests/route.ts`. The POST handler calls `submit_join_request` and returns 201. We extend it to optionally call `submit_player_claim` after.

- [ ] **Step 2: Update the POST handler**

Replace the POST handler with:

```ts
/** POST — submit a join request, optionally with a player claim. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const message = typeof body?.message === 'string' ? body.message : null
  const playerName = typeof body?.player_name === 'string' ? body.player_name.trim() || null : null

  const { error } = await supabase.rpc('submit_join_request', {
    p_game_id: id,
    p_message: message,
  })

  if (error) {
    if (
      error.message?.includes('Request already pending') ||
      error.message?.includes('Already a member') ||
      error.message?.includes('duplicate_request')
    ) {
      return NextResponse.json(
        { error: 'Request already exists or you are already a member' },
        { status: 409 }
      )
    }
    console.error('[join-requests POST]', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  // Optionally create a player claim alongside the join request.
  // A claim failure is non-blocking — the join request still succeeds.
  let claimWarning: string | null = null
  if (playerName) {
    const { error: claimError } = await supabase.rpc('submit_player_claim', {
      p_game_id: id,
      p_player_name: playerName,
    })
    if (claimError) {
      console.warn('[join-requests POST] claim failed:', claimError.message)
      claimWarning = claimError.message
    }
  }

  return NextResponse.json(
    { ok: true, claim_warning: claimWarning },
    { status: 201 }
  )
}
```

- [ ] **Step 3: Verify existing join flow still works**

Submit a join request without a player name. Confirm `201` is returned and no errors.

Submit with `{ "message": "hi", "player_name": "Alice Smith" }` — confirm both a `game_join_requests` row and a `player_claims` row are created in Supabase.

- [ ] **Step 4: Commit**

```bash
git add "app/api/league/[id]/join-requests/route.ts"
git commit -m "feat: extend join-requests POST to atomically create player claim"
```

---

### Task 3: PendingRequestsTable — inline claim chip

When a join request has a pending claim attached, show a blue chip below the note with Reject / Link to different player / Approve actions. These are independent of the join approve/decline buttons.

**Files:**
- Modify: `components/PendingRequestsTable.tsx`

- [ ] **Step 1: Read the current file**

Read `components/PendingRequestsTable.tsx` in full. Note the `PendingJoinRequest` type and the row structure.

- [ ] **Step 2: Update PendingJoinRequest type to include optional claim**

In `lib/types.ts`, extend `PendingJoinRequest`:

```ts
export interface PendingJoinRequest {
  id: string
  user_id: string
  email: string
  display_name: string
  message: string | null
  status: JoinRequestStatus
  created_at: string
  // Populated when the request has an attached pending player claim
  claim?: {
    id: string
    player_name: string
  } | null
}
```

- [ ] **Step 3: Update get_join_requests RPC to include claim data**

Add a new migration that modifies `get_join_requests` to LEFT JOIN the pending claim for each request:

Create `supabase/migrations/20260403000002_join_requests_with_claim.sql`:

```sql
-- supabase/migrations/20260403000002_join_requests_with_claim.sql
--
-- Extends get_join_requests to include the pending player claim (if any)
-- attached to each join request. Used by PendingRequestsTable to show the
-- claim chip inline for admin review.
--

CREATE OR REPLACE FUNCTION public.get_join_requests(p_game_id uuid)
RETURNS TABLE (
  id           uuid,
  user_id      uuid,
  email        text,
  display_name text,
  message      text,
  status       text,
  created_at   timestamptz,
  claim_id     uuid,
  claim_player_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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
    gjr.created_at,
    pc.id           AS claim_id,
    pc.player_name  AS claim_player_name
  FROM game_join_requests gjr
  LEFT JOIN player_claims pc
    ON pc.game_id = p_game_id
   AND pc.user_id = gjr.user_id
   AND pc.status  = 'pending'
  WHERE gjr.game_id = p_game_id
    AND gjr.status  = 'pending'
  ORDER BY gjr.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_join_requests(uuid) TO authenticated;
```

Apply this migration in the Supabase SQL Editor.

- [ ] **Step 4: Update the GET join-requests API to map the new fields**

Read `app/api/league/[id]/join-requests/route.ts`. The GET handler maps RPC results to the response. Update the mapping to include claim fields:

```ts
// The RPC now returns claim_id and claim_player_name columns.
// Map them into the response so PendingRequestsTable can use them.
return NextResponse.json(
  (data ?? []).map((row: {
    id: string; user_id: string; email: string; display_name: string;
    message: string | null; status: string; created_at: string;
    claim_id: string | null; claim_player_name: string | null;
  }) => ({
    id: row.id,
    user_id: row.user_id,
    email: row.email,
    display_name: row.display_name,
    message: row.message,
    status: row.status,
    created_at: row.created_at,
    claim: row.claim_id
      ? { id: row.claim_id, player_name: row.claim_player_name! }
      : null,
  }))
)
```

- [ ] **Step 5: Add claim chip UI to PendingRequestsTable**

Import `PlayerClaimPicker` and add claim state at the top of `PendingRequestsTable`:

```tsx
import { PlayerClaimPicker } from '@/components/PlayerClaimPicker'

// Inside component:
const [processingClaim, setProcessingClaim] = useState<string | null>(null)
const [amendingClaimId, setAmendingClaimId] = useState<string | null>(null)
```

Add a `reviewClaim` function:

```tsx
async function reviewClaim(claimId: string, action: 'approved' | 'rejected', overrideName?: string) {
  setProcessingClaim(claimId)
  try {
    await fetch(`/api/league/${leagueId}/player-claims/${claimId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, override_name: overrideName ?? null }),
      credentials: 'include',
    })
    // Refresh request list to clear the claim chip
    setRequests((prev) => prev.map((r) =>
      r.claim?.id === claimId ? { ...r, claim: null } : r
    ))
  } finally {
    setProcessingClaim(null)
    setAmendingClaimId(null)
  }
}
```

Inside the `<li>` for each request, after the message block and before the approve/decline buttons, add:

```tsx
{req.claim && (
  <div className="mt-2 p-2.5 rounded-lg bg-sky-950/50 border border-sky-900">
    <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
      <div className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
        <p className="text-xs text-sky-300">
          Claims to be:{' '}
          <span className="font-medium text-slate-200">{req.claim.player_name}</span>
        </p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={!!processingClaim}
          onClick={() => reviewClaim(req.claim!.id, 'rejected')}
          className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-40 transition-colors"
        >
          Reject claim
        </button>
        <button
          type="button"
          disabled={!!processingClaim}
          onClick={() => setAmendingClaimId(amendingClaimId === req.claim!.id ? null : req.claim!.id)}
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors"
        >
          Link to different player {amendingClaimId === req.claim!.id ? '▲' : '›'}
        </button>
        <button
          type="button"
          disabled={!!processingClaim}
          onClick={() => reviewClaim(req.claim!.id, 'approved')}
          className="text-xs font-medium text-sky-400 hover:text-sky-300 disabled:opacity-40 transition-colors"
        >
          {processingClaim === req.claim.id ? '…' : 'Approve claim'}
        </button>
      </div>
    </div>
    {amendingClaimId === req.claim.id && (
      <div className="mt-2 p-2 rounded bg-slate-900 border border-slate-700">
        <PlayerClaimPicker
          leagueId={leagueId}
          onSubmit={async (name) => reviewClaim(req.claim!.id, 'approved', name)}
          onCancel={() => setAmendingClaimId(null)}
          submitLabel="Approve with this player"
        />
      </div>
    )}
  </div>
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Smoke-test**

Submit a join request with a player claim (Yes card + pick a player). As admin, check Settings → Members → Pending requests. The request card should show the blue claim chip. Test Reject claim, Approve claim, and Link to different player.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260403000002_join_requests_with_claim.sql
git add "app/api/league/[id]/join-requests/route.ts"
git add components/PendingRequestsTable.tsx
git add lib/types.ts
git commit -m "feat: add inline claim chip to PendingRequestsTable"
```

---

### Task 4: Onboarding banner on league results page

Show a blue banner on first visit after join approval if the member has no claim. Dismiss stores to localStorage. Banner links to /settings.

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

- [ ] **Step 1: Read the current file**

Read `app/[leagueId]/results/page.tsx`. Find where the page data is fetched (server component likely) and how it renders. Note whether it's a server or client component. The banner needs claim status — either fetch it server-side or client-side.

- [ ] **Step 2: Add a ClaimBanner client component inline**

Because the banner needs localStorage (client-only), add it as a small self-contained client component. Add this at the top of the results page file (above the default export), or in a new file `components/ClaimBanner.tsx`:

```tsx
// components/ClaimBanner.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

interface ClaimBannerProps {
  leagueId: string
}

export function ClaimBanner({ leagueId }: ClaimBannerProps) {
  const [visible, setVisible] = useState(false)
  const router = useRouter()
  const storageKey = `dismissed-claim-banner-${leagueId}`

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (localStorage.getItem(storageKey)) return

    // Check if the user already has a claim for this league
    fetch(`/api/league/${leagueId}/player-claims`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => {
        // data is null (member's own claim) or an array (admin) or a single object
        // Member GET returns null if no claim, or a single claim object
        const hasClaim = data !== null && !Array.isArray(data)
        if (!hasClaim) setVisible(true)
      })
      .catch(() => {}) // Fail silently — banner is non-critical
  }, [leagueId, storageKey])

  function dismiss() {
    localStorage.setItem(storageKey, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div className="rounded-lg border border-sky-800 bg-sky-950/50 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <p className="text-sm font-medium text-sky-300">
          Have you played in this league before?
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Link your account to your player profile to see your stats and match history.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => router.push('/settings')}
          className="text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white px-3 py-1.5 rounded transition-colors"
        >
          Claim my profile
        </button>
        <button type="button" onClick={dismiss} className="text-slate-600 hover:text-slate-400">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Render ClaimBanner in the results page**

In `app/[leagueId]/results/page.tsx`, import and render the banner. It should appear near the top of the page content (above the match list), but only for members (not admins, not public). Pass the leagueId.

Find the section where member-specific UI is conditionally shown and add:

```tsx
import { ClaimBanner } from '@/components/ClaimBanner'

// Inside the JSX, near the top of the main content area, conditionally for members:
{role === 'member' && <ClaimBanner leagueId={leagueId} />}
```

The `role` variable should already be available from the page's auth/role fetch. Check the existing code to confirm the prop/variable name — it may be `gameRole`, `userRole`, or similar.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Smoke-test**

As a newly-approved member (no claim), navigate to the league results page. The blue banner should appear. Clicking "Claim my profile" navigates to /settings. Clicking Dismiss hides the banner and reloading does not show it again (localStorage key set). Banner does not appear for admins or members who already have a claim.

- [ ] **Step 6: Commit**

```bash
git add components/ClaimBanner.tsx
git add "app/[leagueId]/results/page.tsx"
git commit -m "feat: add first-visit player claim onboarding banner"
```

---

### Task 5: Extend notification badge to include pending claims

The settings gear icon already shows a red dot when there are pending join requests. Extend the count to also include pending player claims.

**Files:**
- Modify: `components/LeaguePageHeader.tsx`

- [ ] **Step 1: Read the current file**

Read `components/LeaguePageHeader.tsx`. Find where the pending request count is fetched or passed in and where the badge dot is rendered.

- [ ] **Step 2: Extend the badge count**

The pending count is likely passed as a prop (e.g., `pendingCount`) or fetched server-side in the page. Find the data source.

If it's fetched server-side in the results page, update that fetch to also count pending claims:

In the server component/page that populates the badge, fetch pending claims alongside requests:

```ts
// Fetch pending join requests + pending claims in parallel
const [pendingRequests, pendingClaims] = await Promise.all([
  supabase.rpc('get_join_requests', { p_game_id: leagueId }),
  supabase.rpc('get_player_claims', { p_game_id: leagueId }),
])

const pendingCount =
  (pendingRequests.data?.length ?? 0) +
  (pendingClaims.data?.filter((c: { status: string }) => c.status === 'pending').length ?? 0)
```

Pass the combined `pendingCount` to `LeaguePageHeader`. If the header already receives a `pendingRequestCount` prop, rename or combine appropriately.

If `get_player_claims` raises "Access denied" for non-admins, wrap in a try/catch and fall back to 0 — the badge is admin-only anyway.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Smoke-test**

As admin on a league with a pending player claim (submitted via /settings), the red badge dot should appear on the settings gear icon. Approve or reject the claim — dot should disappear if no other pending items remain.

- [ ] **Step 5: Commit**

```bash
git add components/LeaguePageHeader.tsx
# Also add any page files that pass the badge count
git commit -m "feat: extend settings notification badge to include pending player claims"
```

---

### Final check

- [ ] Run `npx tsc --noEmit` — no errors
- [ ] Walk through all four entry points manually:
  1. Join dialog → Yes → pick player → submit → admin sees claim chip on request card → approve
  2. Banner on league page → "Claim my profile" → /settings → pick player → pending
  3. /settings League identity → Claim profile → pick player → pending → admin approves
  4. Admin member list → "+ Link player" → picks name → immediate green badge
- [ ] Confirm dismissed banner does not reappear after refresh
- [ ] Confirm rejected claim shows resubmit picker in /settings
