# Google SSO Onboarding Fix — Design

**Date:** 2026-04-07
**Branch:** awmloveland/google-sso-onboarding-fix

## Problem

Three bugs observed when a new user (Lucia Hormel) signed up via Google SSO from the public league page:

1. **Name fields blank on the welcome page** — `given_name`/`family_name` may not be present in Supabase's Google OAuth `user_metadata`; the welcome form showed empty fields.
2. **No prompt to link existing player** — The `JoinRequestDialog` (which contains the player-claim step) never opened after Google OAuth because the full-page navigation destroys in-memory React state.
3. **Join request not submitted / invisible to admin** — Direct consequence of #2: the dialog never opened so no request was ever sent.

## Root Cause

All three issues trace to the same broken flow:

1. User clicks "Join League" → `AuthDialog` opens (signup mode) in `LeagueJoinArea`.
2. User clicks "Sign up with Google" → full-page OAuth redirect begins.
3. **`AuthDialog` has no `redirect` prop here, so it defaults to `'/'`.** The callback URL becomes `/auth/callback?redirect=%2F&mode=signup`.
4. After auth, `/welcome?redirect=%2F` is shown.
5. After name confirmation, user is sent to `/` (homepage) — never back to the league page.
6. The `onSignedUp` callback (which would have opened `JoinRequestDialog`) only fires in the OTP path, not the OAuth path.

## Design

### Fix 1 — Name pre-population (`welcome/page.tsx`)

Improve the `loadMeta` effect to fall back from Google's `full_name`/`name` field when `given_name`/`family_name` are absent:

```ts
const fullName = (meta.full_name ?? meta.name ?? '') as string
const parts = fullName.trim().split(/\s+/)
setFirstName(meta.given_name ?? parts[0] ?? '')
setLastName(meta.family_name ?? parts.slice(1).join(' ') ?? '')
```

### Fix 2 — Correct redirect + intent detection (`LeagueJoinArea.tsx`)

**Part A — Pass the correct redirect URL:**
- Use `usePathname()` to get the current league URL (e.g. `/abc-uuid/results`).
- Pass `${pathname}?open_join=1` as the `redirect` prop to `AuthDialog` when it is opened for the join flow.
- This ensures after Google OAuth → welcome page, the user lands back on the league page with the intent marker.

**Part B — Detect intent on mount:**
- Add a `SearchParamsReader` sub-component (pattern established in `settings/page.tsx` as `TabInitialiser`) wrapped in `<Suspense fallback={null}>`.
- It reads `open_join` from `useSearchParams()`.
- If `open_join=1` is present and `joinStatus` is joinable (`null`, `'none'`, `'declined'`), it:
  1. Calls `router.replace(pathname)` to clean the URL.
  2. Opens `JoinRequestDialog` by setting `dialogOpen = true`.
- The existing `onSignedUp` callback continues to handle the OTP (in-page) path unchanged.

## Files Changed

| File | Change |
|---|---|
| `app/welcome/page.tsx` | Smarter name parsing with fallback from `full_name`/`name` |
| `components/LeagueJoinArea.tsx` | Correct redirect, `SearchParamsReader` sub-component |

## No Database Changes

No migrations needed. This is purely a frontend fix.

## Edge Cases

- **User already has a pending request**: If they somehow re-trigger this flow, the `JoinRequestDialog` submits and gets a 409 — already handled with "You've already sent a request."
- **User is already a member**: `joinStatus` will be `'member'`, so `SearchParamsReader` won't open the dialog.
- **OTP signup path**: Unchanged — `onSignedUp` fires in-page and opens the dialog directly.
