# League Join Flow — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a smart Join/Share button to league pages that lets visitors sign up and request membership, with an optional message to the admin.

**Architecture:** A server-fetched `joinStatus` value is passed down to a new `JoinButton` client component that handles four states (Join-unauthenticated, Join-authenticated, Request pending, Share). Sign-up is re-added to `AuthDialog` as a new mode. A new `JoinRequestDialog` handles the request submission. A new Supabase table and RPC store requests.

**Tech Stack:** Next.js 14 App Router, Supabase (PostgreSQL + RLS), TypeScript strict, Tailwind CSS, Radix UI, `cn()` from `lib/utils`

---

> **IMPORTANT — UI Review Gate:** Before writing any code, present mockups/sketches for: (1) the four button states in the header, (2) the AuthDialog signup form, and (3) the JoinRequestDialog. Get explicit user approval before proceeding to Task 1.

---

## File Map

| Action | File |
|---|---|
| Create | `supabase/migrations/20260401000000_create_game_join_requests.sql` |
| Modify | `lib/types.ts` |
| Modify | `lib/fetchers.ts` |
| Create | `app/api/league/[id]/join-requests/route.ts` |
| Create | `components/JoinRequestDialog.tsx` |
| Modify | `components/AuthDialog.tsx` |
| Create | `components/JoinButton.tsx` |
| Modify | `components/LeaguePageHeader.tsx` |
| Modify | `app/[leagueId]/results/page.tsx` |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260401000000_create_game_join_requests.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Create game_join_requests table
CREATE TABLE public.game_join_requests (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id      uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
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

-- RPC: submit a join request (authenticated users only)
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
  v_user_id    UUID;
  v_email      TEXT;
  v_display_name TEXT;
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

  -- Read profile details
  SELECT email, display_name INTO v_email, v_display_name
  FROM profiles
  WHERE id = v_user_id;

  -- Insert (UNIQUE constraint raises on duplicate pending request)
  INSERT INTO game_join_requests (game_id, user_id, email, display_name, message)
  VALUES (p_game_id, v_user_id, v_email, COALESCE(v_display_name, v_email), p_message);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_join_request(UUID, TEXT) TO authenticated;
```

- [ ] **Step 2: Run the migration**

Paste the SQL above into the Supabase SQL Editor for the project and execute. Verify in the Table Editor that `game_join_requests` exists with the correct columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260401000000_create_game_join_requests.sql
git commit -m "feat: add game_join_requests table and submit_join_request RPC"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add JoinRequestStatus and JoinRequest types to `lib/types.ts`**

Add after the `GameRole` type (currently around line 10):

```ts
export type JoinRequestStatus = 'none' | 'pending' | 'approved' | 'declined'

export interface JoinRequest {
  id: string
  game_id: string
  user_id: string
  email: string
  display_name: string
  message: string | null
  status: JoinRequestStatus
  reviewed_by: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add JoinRequestStatus and JoinRequest types"
```

---

## Task 3: getJoinRequestStatus Fetcher

**Files:**
- Modify: `lib/fetchers.ts`

- [ ] **Step 1: Import JoinRequestStatus at the top of `lib/fetchers.ts`**

Find the existing import from `@/lib/types` and add `JoinRequestStatus`:

```ts
import type { GameRole, LeagueFeature, FeatureKey, JoinRequestStatus } from '@/lib/types'
```

- [ ] **Step 2: Add the fetcher at the bottom of `lib/fetchers.ts`**

```ts
export const getJoinRequestStatus = cache(async (leagueId: string): Promise<JoinRequestStatus> => {
  const authSupabase = await createClient()
  const { data: { user } } = await authSupabase.auth.getUser()
  if (!user) return 'none'

  const service = createServiceClient()
  const { data } = await service
    .from('game_join_requests')
    .select('status')
    .eq('game_id', leagueId)
    .eq('user_id', user.id)
    .maybeSingle()

  return (data?.status as JoinRequestStatus) ?? 'none'
})
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/fetchers.ts
git commit -m "feat: add getJoinRequestStatus fetcher"
```

---

## Task 4: API Route — POST /api/league/[id]/join-requests

**Files:**
- Create: `app/api/league/[id]/join-requests/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: gameId } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const message: string | null = body.message ?? null

  const { error } = await supabase.rpc('submit_join_request', {
    p_game_id: gameId,
    p_message: message,
  })

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

  return NextResponse.json({ success: true }, { status: 201 })
}
```

- [ ] **Step 2: Manual verification**

With the dev server running (`npm run dev`), submit a test request using curl or a REST client:

```bash
# Requires a valid Supabase session cookie — easiest to test via the UI in Task 8
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/api/league/[id]/join-requests/route.ts
git commit -m "feat: add POST /api/league/[id]/join-requests route"
```

---

## Task 5: JoinRequestDialog Component

**Files:**
- Create: `components/JoinRequestDialog.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface JoinRequestDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  leagueId: string
  leagueName: string
  onSuccess?: () => void
}

export function JoinRequestDialog({
  open,
  onOpenChange,
  leagueId,
  leagueName,
  onSuccess,
}: JoinRequestDialogProps) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/join-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong. Please try again.')
        return
      }
      setSubmitted(true)
      onSuccess?.()
      setTimeout(() => onOpenChange(false), 1500)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Reset state when dialog closes
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setMessage('')
      setError(null)
      setSubmitted(false)
    }
    onOpenChange(next)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-slate-800 border border-slate-700 rounded-lg p-6 shadow-xl">
          <div className="flex items-start justify-between mb-4">
            <Dialog.Title className="text-slate-100 font-semibold text-base leading-tight pr-4">
              Request to join {leagueName}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </Dialog.Close>
          </div>

          {submitted ? (
            <p className="text-slate-400 text-sm">
              Request sent. The admin will review your request.
            </p>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Add a note (optional) — e.g. I play on Tuesdays with the 5-a-side crew"
                rows={3}
                className={cn(
                  'w-full resize-none rounded-md bg-slate-900 border border-slate-700',
                  'text-sm text-slate-100 placeholder:text-slate-500',
                  'px-3 py-2 mb-4 focus:outline-none focus:border-slate-500',
                  'transition-colors'
                )}
              />
              {error && (
                <p className="text-red-400 text-sm mb-3">{error}</p>
              )}
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? 'Sending…' : 'Send request'}
              </Button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/JoinRequestDialog.tsx
git commit -m "feat: add JoinRequestDialog component"
```

---

## Task 6: AuthDialog — Add Signup Mode

**Files:**
- Modify: `components/AuthDialog.tsx`

Read the full file before editing. The current structure is:
- `AuthForm` internal component with `mode: 'signin' | 'forgot'` state
- `AuthDialog` exported component with `trigger`, `redirect`, `size` props
- Sign-in calls `supabase.auth.signInWithPassword()` then `supabase.rpc('claim_profile')`

- [ ] **Step 1: Update the `AuthForm` props and mode union**

Find the `AuthForm` component definition. It currently accepts internal props including `redirect`. Add `initialMode` and `onSignUpSuccess` to the parent `AuthDialog` props, and thread them through.

Add these props to the `AuthDialog` component interface (at the top of the exported component):

```ts
interface AuthDialogProps {
  redirect?: string
  size?: 'xs' | 'sm' | 'default'
  trigger?: (openDialog: () => void) => React.ReactNode
  initialMode?: 'signin' | 'signup'
  onSignUpSuccess?: () => void
}
```

- [ ] **Step 2: Pass initialMode to AuthForm state initialization**

In `AuthForm` (or wherever `mode` state lives), change the initial value:

```ts
// Before:
const [mode, setMode] = useState<'signin' | 'forgot'>('signin')

// After:
const [mode, setMode] = useState<'signin' | 'forgot' | 'signup'>(initialMode ?? 'signin')
```

Pass `initialMode` and `onSignUpSuccess` from `AuthDialog` down to `AuthForm` as props.

- [ ] **Step 3: Add signup form state fields**

Inside `AuthForm`, add first name, last name, and confirm password state (alongside existing `email`, `password`):

```ts
const [firstName, setFirstName] = useState('')
const [lastName, setLastName] = useState('')
```

- [ ] **Step 4: Add handleSignUp handler**

Inside `AuthForm`, add this handler:

```ts
const handleSignUp = async (e: React.FormEvent) => {
  e.preventDefault()
  setLoading(true)
  setError(null)

  const supabase = createBrowserClient()
  const displayName = `${firstName.trim()} ${lastName.trim()}`

  const { error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
    },
  })

  if (signUpError) {
    setError(signUpError.message)
    setLoading(false)
    return
  }

  // Claim profile (creates profiles row from auth metadata)
  await supabase.rpc('claim_profile')

  setLoading(false)

  if (onSignUpSuccess) {
    setOpen(false)
    onSignUpSuccess()
  } else {
    router.push(redirect ?? '/')
    router.refresh()
  }
}
```

Note: `setOpen` needs to be accessible here. Check how `AuthDialog` controls the dialog open state — it likely uses a `useState` in the outer component. Pass a `closeDialog` callback to `AuthForm` if needed, or use the existing pattern.

- [ ] **Step 5: Add the signup form JSX**

In the `AuthForm` render, add a `mode === 'signup'` branch. Place it alongside the existing `mode === 'signin'` branch:

```tsx
{mode === 'signup' && (
  <form onSubmit={handleSignUp} className="flex flex-col gap-3">
    <div className="flex gap-3">
      <div className="flex-1">
        <label className="block text-xs text-slate-400 mb-1">First name</label>
        <input
          type="text"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          className={cn(
            'w-full rounded-md bg-slate-900 border border-slate-700',
            'text-sm text-slate-100 placeholder:text-slate-500',
            'px-3 py-2 focus:outline-none focus:border-slate-500'
          )}
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs text-slate-400 mb-1">Last name</label>
        <input
          type="text"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          className={cn(
            'w-full rounded-md bg-slate-900 border border-slate-700',
            'text-sm text-slate-100 placeholder:text-slate-500',
            'px-3 py-2 focus:outline-none focus:border-slate-500'
          )}
        />
      </div>
    </div>
    <div>
      <label className="block text-xs text-slate-400 mb-1">Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className={cn(
          'w-full rounded-md bg-slate-900 border border-slate-700',
          'text-sm text-slate-100 placeholder:text-slate-500',
          'px-3 py-2 focus:outline-none focus:border-slate-500'
        )}
      />
    </div>
    <div>
      <label className="block text-xs text-slate-400 mb-1">Password</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
        className={cn(
          'w-full rounded-md bg-slate-900 border border-slate-700',
          'text-sm text-slate-100 placeholder:text-slate-500',
          'px-3 py-2 focus:outline-none focus:border-slate-500'
        )}
      />
    </div>
    {error && <p className="text-red-400 text-sm">{error}</p>}
    <Button type="submit" className="w-full" disabled={loading}>
      {loading ? 'Creating account…' : 'Create account'}
    </Button>
    <p className="text-center text-sm text-slate-500">
      Already have an account?{' '}
      <button
        type="button"
        onClick={() => setMode('signin')}
        className="text-slate-300 hover:text-slate-100 underline"
      >
        Sign in
      </button>
    </p>
  </form>
)}
```

Also add a toggle at the bottom of the `signin` form to switch to signup:

```tsx
<p className="text-center text-sm text-slate-500">
  Don't have an account?{' '}
  <button
    type="button"
    onClick={() => setMode('signup')}
    className="text-slate-300 hover:text-slate-100 underline"
  >
    Sign up
  </button>
</p>
```

- [ ] **Step 6: Update the dialog title to reflect the active mode**

Find where the Dialog title is rendered and update it:

```tsx
<Dialog.Title className="...">
  {mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Reset password' : 'Sign in'}
</Dialog.Title>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Manual smoke test**

Start the dev server (`npm run dev`). Navigate to any public league page. Click the Join button (added in Task 7 — if not yet done, open AuthDialog from the sign-in page). Verify:
- Signup form renders with first name, last name, email, password fields
- Toggling between sign in / sign up works
- Submit with valid credentials creates a session (check Supabase Auth dashboard)

- [ ] **Step 9: Commit**

```bash
git add components/AuthDialog.tsx
git commit -m "feat: add signup mode to AuthDialog"
```

---

## Task 7: JoinButton Client Component

**Files:**
- Create: `components/JoinButton.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AuthDialog } from '@/components/AuthDialog'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'
import type { JoinRequestStatus } from '@/lib/types'

interface JoinButtonProps {
  leagueId: string
  leagueName: string
  isAdmin: boolean
  isMember: boolean
  isAuthenticated: boolean
  joinStatus: JoinRequestStatus
}

export function JoinButton({
  leagueId,
  leagueName,
  isAdmin,
  isMember,
  isAuthenticated,
  joinStatus,
}: JoinButtonProps) {
  const [showJoinDialog, setShowJoinDialog] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    await navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Admins and existing members see Share
  if (isAdmin || isMember) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={handleShare}
        className="text-slate-400 hover:text-slate-300 gap-1.5"
      >
        <Share2 className="size-3.5" />
        {copied ? 'Copied!' : 'Share'}
      </Button>
    )
  }

  // Pending request — non-interactive
  if (joinStatus === 'pending') {
    return (
      <Button variant="ghost" size="sm" disabled className="text-slate-500 cursor-default">
        Request pending
      </Button>
    )
  }

  // Not authenticated — open AuthDialog in signup mode; on success open JoinRequestDialog
  if (!isAuthenticated) {
    return (
      <>
        <AuthDialog
          initialMode="signup"
          onSignUpSuccess={() => setShowJoinDialog(true)}
          trigger={(open) => (
            <Button size="sm" onClick={open}>
              Join
            </Button>
          )}
        />
        <JoinRequestDialog
          open={showJoinDialog}
          onOpenChange={setShowJoinDialog}
          leagueId={leagueId}
          leagueName={leagueName}
        />
      </>
    )
  }

  // Authenticated, not a member, no pending request
  return (
    <>
      <Button size="sm" onClick={() => setShowJoinDialog(true)}>
        Join
      </Button>
      <JoinRequestDialog
        open={showJoinDialog}
        onOpenChange={setShowJoinDialog}
        leagueId={leagueId}
        leagueName={leagueName}
      />
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/JoinButton.tsx
git commit -m "feat: add JoinButton component with four states"
```

---

## Task 8: Wire Up LeaguePageHeader and Results Page

**Files:**
- Modify: `components/LeaguePageHeader.tsx`
- Modify: `app/[leagueId]/results/page.tsx`

- [ ] **Step 1: Read both files in full before editing**

```bash
# In your editor, read:
# components/LeaguePageHeader.tsx
# app/[leagueId]/results/page.tsx
```

- [ ] **Step 2: Update LeaguePageHeader props interface**

Find the props interface in `components/LeaguePageHeader.tsx`. Add these four props:

```ts
// Add to the existing interface:
isMember: boolean
isAuthenticated: boolean
joinStatus: JoinRequestStatus
```

Also add the import at the top:

```ts
import type { JoinRequestStatus } from '@/lib/types'
import { JoinButton } from '@/components/JoinButton'
```

- [ ] **Step 3: Add JoinButton to the header layout**

Find the section that renders the settings icon (currently around lines 38–44):

```tsx
{isAdmin && (
  <Button asChild variant="ghost" size="icon" className="text-slate-500 hover:text-slate-400">
    <Link href={`/${leagueId}/settings`} aria-label="League settings">
      <Settings className="size-4" />
    </Link>
  </Button>
)}
```

Wrap it with a flex container and add `JoinButton` alongside it:

```tsx
<div className="flex items-center gap-2">
  <JoinButton
    leagueId={leagueId}
    leagueName={leagueName}
    isAdmin={isAdmin}
    isMember={isMember}
    isAuthenticated={isAuthenticated}
    joinStatus={joinStatus}
  />
  {isAdmin && (
    <Button asChild variant="ghost" size="icon" className="text-slate-500 hover:text-slate-400">
      <Link href={`/${leagueId}/settings`} aria-label="League settings">
        <Settings className="size-4" />
      </Link>
    </Button>
  )}
</div>
```

- [ ] **Step 4: Update results/page.tsx — add parallel fetch**

Find the `Promise.all` block in `app/[leagueId]/results/page.tsx` (around line 29) and add `getJoinRequestStatus`:

```ts
// Add import at the top of the file:
import { getAuthAndRole, getGame, getFeatures, getPlayerStats, getWeeks, getJoinRequestStatus } from '@/lib/fetchers'

// Update the destructured Promise.all:
const [
  { userRole, isAuthenticated, user },
  game,
  features,
  players,
  rawWeeks,
  joinStatus,
] = await Promise.all([
  getAuthAndRole(leagueId),
  getGame(leagueId),
  getFeatures(leagueId),
  getPlayerStats(leagueId),
  getWeeks(leagueId),
  getJoinRequestStatus(leagueId),
])
```

- [ ] **Step 5: Derive isMember and pass props**

After the destructure, add:

```ts
const isMember = userRole !== null
```

- [ ] **Step 6: Pass new props to LeaguePageHeader**

Find all usages of `<LeaguePageHeader` in `results/page.tsx` (there are two — one for public view, one for member/admin view). Add the new props to both:

```tsx
<LeaguePageHeader
  // ...existing props...
  isMember={isMember}
  isAuthenticated={isAuthenticated}
  joinStatus={joinStatus}
/>
```

- [ ] **Step 7: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Start dev server and manually test all four button states**

```bash
npm run dev
```

Test the following scenarios on a public league page:

1. **Not signed in** → button shows "Join" → clicking opens AuthDialog in signup mode → "Don't have an account? Sign up" visible → fill in first name, last name, email, password → submit → JoinRequestDialog opens → submit → "Request sent" confirmation appears → button should now show "Request pending" on next page load

2. **Signed in as non-member with no request** → button shows "Join" → clicking opens JoinRequestDialog directly → submit → "Request sent"

3. **Signed in with a pending request** → button shows "Request pending" (disabled, non-clickable)

4. **Signed in as member or admin** → button shows "Share" → clicking copies URL to clipboard → label briefly changes to "Copied!"

- [ ] **Step 9: Commit**

```bash
git add components/LeaguePageHeader.tsx app/[leagueId]/results/page.tsx
git commit -m "feat: wire up Join/Share button in LeaguePageHeader"
```

---

## Final Phase 1 Check

- [ ] Run `npx tsc --noEmit` — no errors
- [ ] Run `npm run build` — builds successfully
- [ ] Manually verify all four button states work end-to-end
- [ ] Confirm join request rows appear in Supabase `game_join_requests` table after submission
