# Header Logout State Fix

**Date:** 2026-03-31

## Problem

When the user clicks "Log out", the navbar header does not update — it continues showing the account/user button instead of switching to the login/join buttons.

**Root cause:** `handleSignOut` calls `POST /api/auth/sign-out`, which signs out using the server-side Supabase client (clears the cookie session). It then calls `router.refresh()`, which does not change `pathname`. The `onAuthStateChange` listener in the navbar uses the client-side Supabase instance and never receives a `SIGNED_OUT` event because the client session is never explicitly invalidated. The `fetchUser` effect only re-runs on `pathname` change, so `user` state is never cleared.

## Fix

In `handleSignOut` in `components/ui/navbar.tsx`, after the server API call, also call `supabase.auth.signOut()` on the client-side Supabase instance. This fires the `SIGNED_OUT` event, which the existing `onAuthStateChange` handler already handles by setting `user`, `displayName`, and `profileRole` to null.

```ts
async function handleSignOut() {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' })
  const supabase = createClient()
  await supabase.auth.signOut()
  router.refresh()
}
```

## Scope

- **File changed:** `components/ui/navbar.tsx` only
- **No schema or API changes required**
