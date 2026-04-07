# Google SSO — Design Spec

**Date:** 2026-04-07
**Status:** Approved

## Overview

Add Google OAuth as an alternative authentication method alongside the existing email OTP flow. Existing members can sign in with Google instead of OTP. New members completing an invite can sign up with Google and review their pre-filled name before landing on the invite page.

## Goals

- Reduce sign-in friction for members who prefer OAuth over email codes
- Support Google sign-up within the existing invite-only flow
- Keep the auth surface unified in `AuthDialog`
- No new auth infrastructure — reuse the existing `/auth/callback` route and `claim_profile` RPC

## Out of Scope

- Apple, Facebook, or any other OAuth provider
- Removing or deprecating email OTP (both methods coexist)
- Any changes to RLS policies or the `claim_profile` RPC
- Any changes to the invite flow itself

---

## Auth Flows

### Sign-in (existing member)

1. `AuthDialog` sign-in mode → "Continue with Google" button
2. `signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback?redirect=<destination>' } })`
3. Google → `/auth/callback` → `exchangeCodeForSession` → `claim_profile` (no-op) → redirect to destination

### Sign-up (new member via invite)

1. `AuthDialog` sign-up mode → "Continue with Google" button
2. `signInWithOAuth({ provider: 'google', options: { redirectTo: '/auth/callback?redirect=<destination>&mode=signup' } })`
3. Google → `/auth/callback` → `exchangeCodeForSession` → `claim_profile` (creates profile from Google metadata) → redirect to `/welcome?redirect=<destination>`
4. `/welcome` — pre-filled first/last name from `user_metadata` → user reviews/edits → PATCH `profiles` if changed → redirect to destination

The `mode=signup` param threads through the OAuth redirect to signal the welcome step. The original destination (e.g. `/invite/[token]`) survives the full round trip.

---

## Files Changed

### Modified

**`components/AuthDialog.tsx`**
- Add "Continue with Google" button to both `SignInForm` and `SignUpForm`, placed above the existing "or" divider
- Add shared `handleGoogleSignIn(mode: AuthMode)` helper that builds the `redirectTo` URL and calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`
- Sign-up mode: `redirectTo` includes `mode=signup`; sign-in mode: does not
- No new state — clicking Google navigates away immediately

**`app/auth/callback/route.ts`**
- Read `mode` search param in addition to existing `redirect`
- If `mode === 'signup'`: redirect to `/welcome?redirect=<destination>` after successful session exchange
- Otherwise: existing behaviour unchanged (redirect directly to destination)

### New

**`app/welcome/page.tsx`**
- Server component; auth-gated (middleware already handles unauthenticated redirects for all non-public routes once added to `AUTH_REQUIRED`)
- Reads `user_metadata.given_name` and `user_metadata.family_name` from the Supabase session to pre-fill fields
- Renders first name + last name inputs; "Confirm" button submits
- On submit, calls `PATCH /api/auth/profile` with updated names, then client-redirects to `redirect` param (defaults to `/`)
- If metadata fields are absent (edge case), fields render empty for manual entry

**`app/api/auth/profile/route.ts`**
- `PATCH` handler; requires authenticated session
- Accepts `{ first_name, last_name }` body
- Updates `profiles` row for `auth.users.id`: sets `first_name`, `last_name`, `display_name` (`${first_name} ${last_name}`.trim())
- Returns 200 on success, 401 if unauthenticated

### Middleware

Add `/welcome` to `AUTH_REQUIRED` in `middleware.ts` so unauthenticated direct navigation redirects to sign-in.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| `exchangeCodeForSession` fails | Redirect to `/sign-in?error=auth_callback` (existing behaviour) |
| Google user has no `given_name` / `family_name` in metadata | Welcome page fields render empty; user fills in manually |
| Existing OTP user signs in with Google (same email) | Supabase links accounts by email; `claim_profile` is idempotent — no duplicate profile |
| User navigates directly to `/welcome` when already set up | Sees current names; confirming without changes is harmless; redirected to `/` |
| `PATCH /api/auth/profile` fails | Show inline error on welcome page; user can retry |

---

## External Configuration (outside codebase)

Both must be completed before the feature works in any environment:

1. **Google Cloud Console**
   - Create OAuth 2.0 client (Web application)
   - Add authorised redirect URI: `https://[supabase-project].supabase.co/auth/v1/callback`
   - Copy Client ID and Client Secret

2. **Supabase Dashboard**
   - Authentication → Providers → Google → paste Client ID + Secret → enable
   - Authentication → Settings → enable **"Link accounts by email"**

No database migrations required.

---

## Impact on Existing Flows

- **OTP sign-in / sign-up**: Unchanged. Google button is additive.
- **Invite flow**: Zero changes to invite acceptance logic. Google-authed users land on the invite page already authenticated, same as OTP users.
- **Player linking & join requests**: Zero impact. Session-based, agnostic to auth method.
- **`claim_profile` RPC**: No changes. Already reads from `auth.users` metadata — works correctly for Google-created users.
