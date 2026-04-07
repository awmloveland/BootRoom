# Header Logout State Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the navbar not updating its auth state after the user logs out.

**Architecture:** Add a client-side `supabase.auth.signOut()` call inside `handleSignOut` in `components/ui/navbar.tsx`. This fires the `SIGNED_OUT` event on the client Supabase instance, which the existing `onAuthStateChange` listener handles by clearing user state. The server-side API route already clears the cookie session; this change plugs the gap on the client side.

**Tech Stack:** Next.js 14 App Router, Supabase JS client (`@supabase/supabase-js`), TypeScript

---

### Task 1: Fix `handleSignOut` to invalidate the client session

**Files:**
- Modify: `components/ui/navbar.tsx:194-197`

- [ ] **Step 1: Update `handleSignOut`**

Replace the existing function at line 194:

```ts
async function handleSignOut() {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
  router.refresh()
}
```

With:

```ts
async function handleSignOut() {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
  const supabase = createClient()
  await supabase.auth.signOut()
  router.refresh()
}
```

`createClient` is already imported at the top of the file (`import { createClient } from '@/lib/supabase/client'`), so no import change is needed.

- [ ] **Step 2: Manually verify the fix**

1. Run `npm run dev` (or use the existing dev server)
2. Sign in to any account
3. Click the user button in the header → click "Log out"
4. Confirm the header immediately switches from the account button to the login/join (`AuthDialog`) button — no page reload required

- [ ] **Step 3: Verify on mobile (sheet menu)**

1. Resize the browser to a mobile viewport (< 640px)
2. Sign in, open the sheet menu, click "Log out"
3. Confirm the header switches to the login/join button immediately

- [ ] **Step 4: Commit**

```bash
git add components/ui/navbar.tsx
git commit -m "fix: invalidate client session on sign-out so header updates immediately"
```
