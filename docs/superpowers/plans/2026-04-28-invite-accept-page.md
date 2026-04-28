# Invite Accept Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the missing `/invite` page that consumes share-link tokens, so users who click an invite link are added to the correct league with the correct role.

**Architecture:** A client component at `app/invite/page.tsx` reads the `?token=` URL param, calls a new SECURITY DEFINER `preview_invite` RPC for league context, then either auto-calls the existing `accept_game_invite` RPC (signed-in users) or shows the `AuthDialog` with the invite URL as the post-auth redirect target (unauthenticated users). After auth, the existing `redirect` chain (sign-in → `/welcome` → `redirect`) returns the user to `/invite?token=...`, where the now-authenticated path runs.

**Tech Stack:** Next.js 14 App Router (client component), Supabase JS client, Radix Dialog (via existing `AuthDialog`), Tailwind CSS, Postgres SECURITY DEFINER function.

**Spec:** `docs/superpowers/specs/2026-04-28-invite-accept-page-design.md`

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260428000001_preview_invite.sql` | Create | New `preview_invite(token)` RPC |
| `app/invite/page.tsx` | Create | Client page: token validation, preview, accept, error states |
| `CLAUDE.md` | Modify | Fix wrong path `app/app/invite/` → `app/invite/` |

No other code touched. `AuthDialog`, `accept_game_invite`, `claim_profile`, the auth callback, and `/welcome` are all already wired up.

---

## Task 1: Create the `preview_invite` migration file

**Files:**
- Create: `supabase/migrations/20260428000001_preview_invite.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/20260428000001_preview_invite.sql`:

```sql
-- preview_invite: returns minimal context about an invite token so that
-- unauthenticated visitors landing on /invite?token=... can see the league
-- name and role before signing in. SECURITY DEFINER bypasses the
-- game_invites RLS policy that requires existing membership to read.
--
-- Returns zero rows when the token is unknown, expired, or malformed.
-- target_email is null for open invites (email = '*'), populated for
-- targeted invites so the client can detect mismatch before calling
-- accept_game_invite (the RPC also enforces this server-side).

CREATE OR REPLACE FUNCTION public.preview_invite(invite_token text)
RETURNS TABLE (
  league_name text,
  league_slug text,
  role text,
  target_email text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT g.name, g.slug, gi.role,
         CASE WHEN gi.email = '*' THEN NULL ELSE gi.email END
  FROM game_invites gi
  JOIN games g ON g.id = gi.game_id
  WHERE gi.token = invite_token
    AND gi.expires_at > now()
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.preview_invite(text) TO anon, authenticated;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260428000001_preview_invite.sql
git commit -m "feat(db): add preview_invite RPC for /invite page context"
```

---

## Task 2: Apply the migration in Supabase and verify

This is a manual step against the live Supabase project (no local Supabase CLI in this repo — migrations are applied via the dashboard SQL Editor, same pattern as every other migration in `supabase/migrations/`).

- [ ] **Step 1: Open the Supabase SQL Editor**

Go to https://supabase.com/dashboard/project/okkmnluglygrbtcawljr/sql/new (or run `npm run supabase:setup` and navigate to SQL Editor from the project).

- [ ] **Step 2: Paste and run the migration body**

Copy the contents of `supabase/migrations/20260428000001_preview_invite.sql` (the `CREATE OR REPLACE FUNCTION` and `GRANT` statements) into the SQL Editor and click "Run".

Expected: "Success. No rows returned."

- [ ] **Step 3: Verify with a real token**

Run this against one of the open Craft Football share invites (token from `game_invites` where `email = '*'`):

```sql
-- Pick any open invite token to verify
select * from preview_invite(
  (select token from game_invites where email = '*' limit 1)
);
```

Expected: one row, `league_name = 'Craft Football'`, `league_slug` populated, `role` is `member` or `admin`, `target_email = null`.

- [ ] **Step 4: Verify rejection of a bad token**

```sql
select * from preview_invite('not-a-real-token');
```

Expected: zero rows (no error).

---

## Task 3: Create the `/invite` page skeleton with token validation

**Files:**
- Create: `app/invite/page.tsx`

- [ ] **Step 1: Create the file with minimum viable structure**

Create `app/invite/page.tsx`:

```tsx
'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

function InviteCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        {children}
      </div>
    </div>
  )
}

function InviteFlow() {
  const params = useSearchParams()
  const token = params.get('token')?.trim() ?? ''

  if (!token) {
    return (
      <InviteCard>
        <h1 className="text-lg font-semibold text-slate-100">This invite link is no longer valid</h1>
        <p className="text-sm text-slate-400">
          It may have expired or been revoked. Ask the league admin for a fresh link.
        </p>
        <a
          href="/"
          className="inline-block w-full text-center py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
        >
          Back to home
        </a>
      </InviteCard>
    )
  }

  return (
    <InviteCard>
      <p className="text-slate-400 text-sm">Loading invite…</p>
    </InviteCard>
  )
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <InviteCard><p className="text-slate-400 text-sm">Loading…</p></InviteCard>
    }>
      <InviteFlow />
    </Suspense>
  )
}
```

- [ ] **Step 2: Run dev server and manually verify both states**

```bash
npm run dev
```

Visit `http://localhost:3000/invite` (no token) — expected: "This invite link is no longer valid" card.

Visit `http://localhost:3000/invite?token=abc` — expected: "Loading invite…" card (will spin forever because we haven't wired the RPC yet).

- [ ] **Step 3: Commit**

```bash
git add app/invite/page.tsx
git commit -m "feat(invite): add /invite page skeleton with missing-token error"
```

---

## Task 4: Wire the `preview_invite` RPC and invalid-token error

**Files:**
- Modify: `app/invite/page.tsx`

- [ ] **Step 1: Replace the file with the preview-wired version**

Overwrite `app/invite/page.tsx`:

```tsx
'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Preview = {
  league_name: string
  league_slug: string
  role: string
  target_email: string | null
}

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'preview'; preview: Preview }

function InviteCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        {children}
      </div>
    </div>
  )
}

function InvalidInviteCard() {
  return (
    <InviteCard>
      <h1 className="text-lg font-semibold text-slate-100">This invite link is no longer valid</h1>
      <p className="text-sm text-slate-400">
        It may have expired or been revoked. Ask the league admin for a fresh link.
      </p>
      <a
        href="/"
        className="inline-block w-full text-center py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
      >
        Back to home
      </a>
    </InviteCard>
  )
}

function InviteFlow() {
  const params = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' })
      return
    }
    let cancelled = false
    async function run() {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('preview_invite', { invite_token: token })
      if (cancelled) return
      const row = Array.isArray(data) ? data[0] : null
      if (error || !row) {
        setState({ kind: 'invalid' })
        return
      }
      setState({ kind: 'preview', preview: row as Preview })
    }
    run()
    return () => { cancelled = true }
  }, [token])

  if (state.kind === 'loading') {
    return <InviteCard><p className="text-slate-400 text-sm">Loading invite…</p></InviteCard>
  }
  if (state.kind === 'invalid') {
    return <InvalidInviteCard />
  }

  // state.kind === 'preview' — for now just dump the preview so we can verify
  // the RPC works end-to-end. Later tasks replace this with the real UI.
  return (
    <InviteCard>
      <p className="text-slate-400 text-sm">
        Preview loaded: {state.preview.league_name} ({state.preview.role})
      </p>
    </InviteCard>
  )
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <InviteCard><p className="text-slate-400 text-sm">Loading…</p></InviteCard>
    }>
      <InviteFlow />
    </Suspense>
  )
}
```

- [ ] **Step 2: Manually verify against real tokens**

Make sure dev server is running (`npm run dev`). Get an open invite token from the database:

```sql
-- Run in Supabase SQL Editor
select token from game_invites where email = '*' limit 1;
```

Visit `http://localhost:3000/invite?token=<paste-token>` — expected: "Preview loaded: Craft Football (member)" or similar.

Visit `http://localhost:3000/invite?token=garbage` — expected: "This invite link is no longer valid" card.

- [ ] **Step 3: Commit**

```bash
git add app/invite/page.tsx
git commit -m "feat(invite): fetch preview_invite and show invalid-token error"
```

---

## Task 5: Add the signed-in auto-accept flow

**Files:**
- Modify: `app/invite/page.tsx`

- [ ] **Step 1: Update the page to auto-accept when authenticated**

Overwrite `app/invite/page.tsx`:

```tsx
'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Preview = {
  league_name: string
  league_slug: string
  role: string
  target_email: string | null
}

type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'preview'; preview: Preview }
  | { kind: 'joining'; preview: Preview }
  | { kind: 'error'; message: string }

function InviteCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-4">
        {children}
      </div>
    </div>
  )
}

function InvalidInviteCard() {
  return (
    <InviteCard>
      <h1 className="text-lg font-semibold text-slate-100">This invite link is no longer valid</h1>
      <p className="text-sm text-slate-400">
        It may have expired or been revoked. Ask the league admin for a fresh link.
      </p>
      <a
        href="/"
        className="inline-block w-full text-center py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
      >
        Back to home
      </a>
    </InviteCard>
  )
}

function GenericErrorCard({ message }: { message: string }) {
  return (
    <InviteCard>
      <h1 className="text-lg font-semibold text-slate-100">Couldn&apos;t accept this invite</h1>
      <p className="text-sm text-slate-400">{message}</p>
      <a
        href="/"
        className="inline-block w-full text-center py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors"
      >
        Back to home
      </a>
    </InviteCard>
  )
}

function InviteFlow() {
  const params = useSearchParams()
  const token = params.get('token')?.trim() ?? ''
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    if (!token) {
      setState({ kind: 'invalid' })
      return
    }
    let cancelled = false
    async function run() {
      const supabase = createClient()

      const { data: previewData, error: previewErr } = await supabase.rpc(
        'preview_invite',
        { invite_token: token }
      )
      if (cancelled) return
      const preview = (Array.isArray(previewData) ? previewData[0] : null) as Preview | null
      if (previewErr || !preview) {
        setState({ kind: 'invalid' })
        return
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled) return

      if (!user) {
        setState({ kind: 'preview', preview })
        return
      }

      setState({ kind: 'joining', preview })

      const { error: acceptErr } = await supabase.rpc('accept_game_invite', {
        invite_token: token,
      })
      if (cancelled) return
      if (acceptErr) {
        setState({ kind: 'error', message: acceptErr.message })
        return
      }

      // Full-page navigation so middleware re-runs and the new
      // game_members row is visible to the league pages.
      window.location.href = `/${preview.league_slug}/results`
    }
    run()
    return () => { cancelled = true }
  }, [token])

  if (state.kind === 'loading') {
    return <InviteCard><p className="text-slate-400 text-sm">Loading invite…</p></InviteCard>
  }
  if (state.kind === 'invalid') {
    return <InvalidInviteCard />
  }
  if (state.kind === 'joining') {
    return <InviteCard><p className="text-slate-400 text-sm">Joining {state.preview.league_name}…</p></InviteCard>
  }
  if (state.kind === 'error') {
    return <GenericErrorCard message={state.message} />
  }

  // state.kind === 'preview' — unauthenticated path, wired up in next task
  return (
    <InviteCard>
      <p className="text-slate-400 text-sm">
        Preview loaded: {state.preview.league_name} ({state.preview.role}) — sign-in UI lands in next task.
      </p>
    </InviteCard>
  )
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <InviteCard><p className="text-slate-400 text-sm">Loading…</p></InviteCard>
    }>
      <InviteFlow />
    </Suspense>
  )
}
```

- [ ] **Step 2: Manually verify the signed-in path**

Make sure you're signed in to your local dev environment as a league admin.

Visit `http://localhost:3000/invite?token=<open-invite-token>` — expected: "Joining Craft Football…" briefly, then redirect to `/<slug>/results`.

Verify in Supabase that the `game_members` row exists (or was already there — the RPC's `ON CONFLICT DO NOTHING` makes this safe to retry):

```sql
select * from game_members where user_id = auth.uid();
```

Visit the same URL again as the same user — expected: silent re-accept (no duplicate row), redirect to results.

- [ ] **Step 3: Verify the unauthenticated path doesn't crash**

Open an incognito window. Visit `http://localhost:3000/invite?token=<open-invite-token>` — expected: "Preview loaded: Craft Football (member) — sign-in UI lands in next task." (placeholder text from the page; no crash, no redirect).

- [ ] **Step 4: Commit**

```bash
git add app/invite/page.tsx
git commit -m "feat(invite): auto-accept invite for signed-in users"
```

---

## Task 6: Add the unauthenticated preview state with `AuthDialog`

**Files:**
- Modify: `app/invite/page.tsx`

- [ ] **Step 1: Replace the placeholder preview state with the real UI**

In `app/invite/page.tsx`, add this import at the top with the others:

```tsx
import { AuthDialog } from '@/components/AuthDialog'
```

Then replace the entire `// state.kind === 'preview'` block (the unauthenticated placeholder near the bottom of `InviteFlow`) with:

```tsx
  // state.kind === 'preview' — unauthenticated visitor
  return (
    <>
      <InviteCard>
        <h1 className="text-lg font-semibold text-slate-100">
          You&apos;ve been invited to join {state.preview.league_name}
        </h1>
        <p className="text-sm text-slate-400">
          Sign in or create an account to join as a <span className="text-slate-200">{state.preview.role}</span>.
        </p>
      </InviteCard>
      <AuthDialog
        open
        onOpenChange={() => { /* dialog stays open — this page exists to capture the sign-in */ }}
        redirect={`/invite?token=${encodeURIComponent(token)}`}
        leagueName={state.preview.league_name}
        initialMode="signup"
      />
    </>
  )
```

The `onOpenChange` no-op keeps the dialog open if the user tries to close it — the page is purpose-built to capture this sign-in, and dismissing the dialog would leave them stranded again.

- [ ] **Step 2: Manually verify the unauthenticated flow end-to-end**

In an incognito window, visit `http://localhost:3000/invite?token=<open-invite-token>` — expected: context card behind the AuthDialog modal, signup form pre-selected, "Create an account to request access to Craft Football" copy in the dialog (the existing leagueName-aware description).

Sign up with a fresh email via OTP (or Google). After completing OTP verification, the AuthDialog runs `window.location.href = redirect` (already in `AuthDialog.tsx`), which sends you back to `/invite?token=...`. Now authenticated, the page should auto-accept and redirect to `/<slug>/results`.

Verify a `game_members` row was created for the new user:

```sql
select gm.* from game_members gm
join auth.users u on u.id = gm.user_id
where u.email = '<the email you just signed up with>';
```

For the Google OAuth path: the callback redirects through `/welcome?redirect=/invite?token=...` (because `mode=signup`), then `/welcome` forwards to `/invite?token=...` after name confirmation, which then auto-accepts. Verify the same way.

- [ ] **Step 3: Commit**

```bash
git add app/invite/page.tsx
git commit -m "feat(invite): show AuthDialog with league context for unauthenticated visitors"
```

---

## Task 7: Handle the email-mismatch error case

**Files:**
- Modify: `app/invite/page.tsx`

- [ ] **Step 1: Add the mismatch detection and the dedicated error card**

Above the `GenericErrorCard` definition in `app/invite/page.tsx`, add:

```tsx
function MismatchCard({ token, targetEmail, currentEmail }: {
  token: string
  targetEmail: string
  currentEmail: string
}) {
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = `/invite?token=${encodeURIComponent(token)}`
  }

  return (
    <InviteCard>
      <h1 className="text-lg font-semibold text-slate-100">This invite is for a different email</h1>
      <p className="text-sm text-slate-400">
        It was sent to <span className="text-slate-200">{targetEmail}</span> but you&apos;re signed in as{' '}
        <span className="text-slate-200">{currentEmail}</span>.
      </p>
      <button
        type="button"
        disabled={signingOut}
        onClick={handleSignOut}
        className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {signingOut ? 'Signing out…' : 'Sign out and try again'}
      </button>
    </InviteCard>
  )
}
```

Then add a new state variant. Find the `State` type definition and replace it with:

```tsx
type State =
  | { kind: 'loading' }
  | { kind: 'invalid' }
  | { kind: 'preview'; preview: Preview }
  | { kind: 'joining'; preview: Preview }
  | { kind: 'mismatch'; targetEmail: string; currentEmail: string }
  | { kind: 'error'; message: string }
```

In the `useEffect`, after fetching the user, before setting `joining`, add the mismatch check. Replace this block:

```tsx
      if (!user) {
        setState({ kind: 'preview', preview })
        return
      }

      setState({ kind: 'joining', preview })
```

with:

```tsx
      if (!user) {
        setState({ kind: 'preview', preview })
        return
      }

      if (preview.target_email && user.email && preview.target_email.toLowerCase() !== user.email.toLowerCase()) {
        setState({
          kind: 'mismatch',
          targetEmail: preview.target_email,
          currentEmail: user.email,
        })
        return
      }

      setState({ kind: 'joining', preview })
```

Add the render branch above the `state.kind === 'error'` check:

```tsx
  if (state.kind === 'mismatch') {
    return (
      <MismatchCard
        token={token}
        targetEmail={state.targetEmail}
        currentEmail={state.currentEmail}
      />
    )
  }
```

Finally, also handle the "Not authenticated" race condition (session lost between the `getUser` check and the `accept_game_invite` call). In the `useEffect`, find this block:

```tsx
      if (acceptErr) {
        setState({ kind: 'error', message: acceptErr.message })
        return
      }
```

Replace it with:

```tsx
      if (acceptErr) {
        if (/not authenticated/i.test(acceptErr.message)) {
          // Session was lost between getUser() and the RPC. Fall back to
          // the unauthenticated path so the user can sign in again.
          setState({ kind: 'preview', preview })
          return
        }
        setState({ kind: 'error', message: acceptErr.message })
        return
      }
```

- [ ] **Step 2: Manually verify the mismatch flow**

Create a targeted invite by calling the existing API as a league admin. From a browser tab where you're signed in as that admin, run in the DevTools console:

```js
await fetch('/api/invites', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    gameId: '<game-id-of-craft-football>',
    email: 'someone-not-you@example.com',
    role: 'member',
  }),
}).then(r => r.json())
```

Copy the `link` from the response. Visit it in the same browser session (where you're signed in with a *different* email than `someone-not-you@example.com`).

Expected: "This invite is for a different email" card with both emails shown and a "Sign out and try again" button. Clicking the button signs you out and reloads `/invite?token=...`, which falls into the unauthenticated path with the AuthDialog.

Clean up the test invite afterwards:

```sql
delete from game_invites where email = 'someone-not-you@example.com';
```

- [ ] **Step 3: Commit**

```bash
git add app/invite/page.tsx
git commit -m "feat(invite): handle email-mismatch with sign-out-and-retry button"
```

---

## Task 8: Fix the wrong path in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the repo-structure block**

In `CLAUDE.md`, find this section:

```
│   ├── app/                  # Authenticated member routes
│   │   ├── layout.tsx        # App shell (navbar)
│   │   ├── page.tsx          # / — league list
│   │   ├── league/[id]/      # League home, players, settings
│   │   ├── settings/         # User settings + invite admin
│   │   ├── invite/           # Invite accept flow
│   │   └── add-game/         # Create a new league
```

Move the `invite/` line out of `app/app/` and into the top-level `app/` block, since the route is `/invite` not `/app/invite`. The replacement should put `invite/` alongside other top-level pages like `welcome/`, `settings/`, `auth/`, etc. If the existing repo-structure block doesn't accurately reflect those top-level pages either, this is a documentation drift issue — fix only the `invite/` placement to keep this PR scoped.

Concretely, delete the `│   │   ├── invite/           # Invite accept flow` line from inside `app/app/` and add an entry at the same indent level as `app/app/` itself:

```
│   ├── invite/               # Invite accept page (consumes ?token=)
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: correct invite route path in CLAUDE.md"
```

---

## Task 9: Manually fix Fowwaz's missing membership

This is a one-off DB write, not a code change. Do it any time after Task 1 is committed (it does not depend on Task 2 or anything else here).

- [ ] **Step 1: Open the Supabase SQL Editor**

Same URL as Task 2: https://supabase.com/dashboard/project/okkmnluglygrbtcawljr/sql/new

- [ ] **Step 2: Run the insert**

```sql
INSERT INTO game_members (game_id, user_id, role)
SELECT g.id, '007f7b0e-c703-4c25-b3ec-1dcb5eda2190', 'member'
FROM games g
WHERE g.name = 'Craft Football'
ON CONFLICT (game_id, user_id) DO NOTHING;
```

Expected: "Success. 1 row affected."

- [ ] **Step 3: Verify**

```sql
select gm.role, g.name
from game_members gm
join games g on g.id = gm.game_id
where gm.user_id = '007f7b0e-c703-4c25-b3ec-1dcb5eda2190';
```

Expected: one row, `role = 'member'`, `name = 'Craft Football'`.

---

## Final verification (after all tasks)

Run through the spec's testing scenarios end-to-end on the dev server, then on a Vercel preview deploy:

1. Open share link in incognito → AuthDialog with league name → sign up via OTP → `/welcome` → auto-redirected to `/invite?token=...` → "Joining…" → land on `/<slug>/results`. `game_members` row created.
2. Open share link signed in as existing member → "Joining…" → redirect to `/<slug>/results`. No duplicate row.
3. `?token=garbage` → "This invite link is no longer valid" card.
4. Targeted invite to fake email, click from real account → mismatch card → sign out and retry → AuthDialog appears.
5. Confirm the two original Craft Football share links still work end-to-end after deploy.
6. Confirm Fowwaz appears in the league members list with role `member`.
