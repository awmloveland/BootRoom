# Auth Header & Logout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the navbar failing to reflect login state after signing in on the same page, and make logout stay on the current page instead of always redirecting to `/sign-in`.

**Architecture:** Add a `supabase.auth.onAuthStateChange` subscription in the navbar to reactively update auth state on `SIGNED_IN`/`SIGNED_OUT` events; extract the user-fetch logic into a stable `useCallback`; replace the hard `window.location.href = '/sign-in'` logout with `router.refresh()` so middleware handles the redirect for protected routes and public pages remain accessible logged-out.

**Tech Stack:** Next.js 15 App Router, React 19, `@supabase/ssr`, `next/navigation` router

---

## Files

- **Modify:** `components/ui/navbar.tsx`
  - Add `useCallback`, `useRouter` imports
  - Import `createClient` from `@/lib/supabase/client` at top level
  - Extract user-fetch into a stable `fetchUser` callback
  - Add `onAuthStateChange` subscription effect
  - Replace `window.location.href = '/sign-in'` with `router.refresh()`

---

### Task 1: Extract user-fetch into a stable `useCallback`

Refactor the inline fetch logic inside the pathname `useEffect` into a standalone `fetchUser` function using `useCallback`. This gives us a stable reference we can call from both the pathname effect and the new auth-state effect without duplicating code.

**Files:**
- Modify: `components/ui/navbar.tsx`

- [ ] **Step 1: Add `useCallback` to the React import and add `useRouter` to the next/navigation import and add `createClient` top-level import**

Open `components/ui/navbar.tsx`. Change the first two imports to:

```ts
import { useCallback, useEffect, useState } from 'react'
```

```ts
import { usePathname, useParams, useRouter } from 'next/navigation'
```

Add after the existing imports (before the interface declarations):

```ts
import { createClient } from '@/lib/supabase/client'
```

- [ ] **Step 2: Add `router` to the component body and extract `fetchUser` as a `useCallback`**

Inside the `Navbar` function, directly after the existing state declarations (after `const [sheetOpen, setSheetOpen] = useState(false)`), add:

```ts
const router = useRouter()

const fetchUser = useCallback(async () => {
  const res = await fetch('/api/auth/me', { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  setUser(data?.user ?? null)
  setDisplayName(data?.profile?.display_name ?? data?.user?.email ?? null)
  if (data?.user?.id) {
    const supabase = createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle()
    setProfileRole(profile?.role ?? null)
  }
}, [])
```

- [ ] **Step 3: Replace the inline pathname effect with a call to `fetchUser`**

Replace the existing pathname-based `useEffect` (lines ~140–158, the one that calls `fetch('/api/auth/me', ...)` inline) with:

```ts
useEffect(() => {
  if (pathname === '/sign-in' || pathname === '/reset-password') return
  fetchUser()
}, [pathname, fetchUser])
```

- [ ] **Step 4: Verify the app still works**

Run `npm run dev` and open a league results page while already logged in. Confirm:
- Navbar shows the user dropdown (not Login/Join buttons)
- No console errors
- Refreshing the page still shows the logged-in state

- [ ] **Step 5: Commit**

```bash
git add components/ui/navbar.tsx
git commit -m "refactor: extract navbar fetchUser into stable useCallback"
```

---

### Task 2: Add `onAuthStateChange` subscription to fix login header update

Add a one-time effect that subscribes to Supabase auth state events. On `SIGNED_IN`, call `fetchUser` to populate the navbar. On `SIGNED_OUT`, clear all user state immediately without a network call.

**Files:**
- Modify: `components/ui/navbar.tsx`

- [ ] **Step 1: Add the `onAuthStateChange` effect**

Directly after the `fetchUser` pathname effect (after the `}, [pathname, fetchUser])` line), add:

```ts
useEffect(() => {
  const supabase = createClient()
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      fetchUser()
    } else if (event === 'SIGNED_OUT') {
      setUser(null)
      setDisplayName(null)
      setProfileRole(null)
    }
  })
  return () => subscription.unsubscribe()
}, [fetchUser])
```

- [ ] **Step 2: Manually test login header update**

Run `npm run dev`. Navigate to a public league results page (e.g. `/:leagueId/results`). Click "Log in", enter valid credentials, submit.

Expected: The navbar updates immediately to show the user dropdown with the correct display name — **without** requiring a page refresh or navigation.

Previously: The navbar would still show Login/Join buttons until you navigated away.

- [ ] **Step 3: Commit**

```bash
git add components/ui/navbar.tsx
git commit -m "fix: update navbar auth state reactively via onAuthStateChange"
```

---

### Task 3: Replace hard logout redirect with `router.refresh()`

Replace `window.location.href = '/sign-in'` in `handleSignOut` with `router.refresh()`. After the session is cleared server-side, `router.refresh()` triggers a re-render of all server components using the now-empty session. Middleware will redirect auth-protected pages (e.g. `/settings`) to `/sign-in` automatically. Public pages (e.g. `/:leagueId/results`) will stay put and render in their logged-out state.

The `onAuthStateChange` subscription added in Task 2 will fire `SIGNED_OUT` when the Supabase client detects the session was cleared, which clears the navbar state — no additional work needed.

**Files:**
- Modify: `components/ui/navbar.tsx`

- [ ] **Step 1: Update `handleSignOut`**

Replace the existing `handleSignOut` function:

```ts
async function handleSignOut() {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
  window.location.href = '/sign-in'
}
```

With:

```ts
async function handleSignOut() {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
  router.refresh()
}
```

- [ ] **Step 2: Manually test logout from a public page**

Run `npm run dev`. Log in. Navigate to `/:leagueId/results`. Click "Log out".

Expected:
- Navbar immediately updates to show Login/Join buttons
- Page stays on `/:leagueId/results` — no redirect to sign-in
- Page continues to show results in its public/logged-out state
- No "you don't have access" error flash

- [ ] **Step 3: Manually test logout from a protected page**

While logged in, navigate to `/settings`. Click "Log out".

Expected:
- Middleware detects no session and redirects to `/sign-in?redirect=/settings`
- No error page flash

- [ ] **Step 4: Commit**

```bash
git add components/ui/navbar.tsx
git commit -m "fix: replace hard logout redirect with router.refresh() for graceful logout"
```
