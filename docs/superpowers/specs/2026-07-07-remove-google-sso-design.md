# Remove Google SSO — Design

**Date:** 2026-07-07
**Status:** Approved (pending spec review)

## Background

Google sign-in is implemented via Supabase's built-in Google OAuth provider. The
Google OAuth client ID/secret live in the Supabase Dashboard, not in this repo.
The trigger for removal is a Google Cloud email warning that the (free-trial)
project will be deleted in ~30 days unless upgraded. If that project is deleted,
the OAuth client disappears and Google login breaks with no warning, so we are
removing Google SSO proactively and relying on the existing email OTP flow.

Note: strictly, a lapsed Cloud *billing* trial does not by itself disable OAuth
client credentials — but project deletion would. Removing proactively is the safe
call regardless.

## Goal

Remove "Sign in / Sign up with Google" from the app with **zero impact** on users
who originally registered via Google, and no database migration.

## Why existing Google users are safe

- Supabase keys `auth.users` by email. A user created via Google has that email
  on their user row.
- The app already offers email OTP (`signInWithOtp` → 6-digit code → `verifyOtp`).
- Requesting a code for that same email (`shouldCreateUser: false`) finds the
  existing user and logs them into the **same account** — same profile, same data.
- No `auth.identities` cleanup or DB migration is required. The orphaned Google
  identity row is harmless.

## Two auth code paths (important)

Email and Google are **separate** paths:

- **Email OTP:** `AuthDialog` `SignInForm`/`SignUpForm` → `verifyOtp` client-side →
  `window.location.href = redirect`. Never touches `/auth/callback` or `/welcome`.
- **Email magic-link click:** The OTP email also contains a clickable link. Clicking
  it lands on `/?code=`, which `proxy.ts` rewrites to `/auth/callback`
  (`exchangeCodeForSession`). **This is why `/auth/callback` must be kept.**
- **Google OAuth:** `signInWithOAuth({ provider: 'google' })` → `/auth/callback`
  (with `&mode=signup` on signup) → on signup, redirect to `/welcome`.

Consequence: `/welcome` and `parseGoogleName` are reached **only** via the Google
signup path and become dead code once Google is removed. `/auth/callback` stays.

## Changes

### Code

1. **`components/AuthDialog.tsx`**
   - Remove `GoogleIcon` component.
   - Remove `handleGoogleSignIn` helper.
   - Remove both Google buttons (`SignInForm` and `SignUpForm`) and the extra
     "or" dividers that surround them.
   - Remove the now-unused `googleError` state in `SignUpForm`.
   - Leave the entire email OTP flow (`SignInForm`, `SignUpForm`, `VerifyStep`)
     untouched.

2. **`app/auth/callback/route.ts`** — **keep** (magic-link clicks depend on it).
   - Remove the dead `mode === 'signup'` → `/welcome` branch.
   - Always redirect to `${origin}${redirect}` on success.

3. **`app/welcome/page.tsx`** — delete (unreachable after Google removal).

4. **`lib/utils.ts`** — remove `parseGoogleName`.

5. **`lib/__tests__/utils.googleName.test.ts`** — delete (tests removed function).

6. **`proxy.ts`** — remove `/welcome` from `AUTH_REQUIRED`.

### Manual (Supabase Dashboard — done by user)

- Auth → Providers → **disable Google**. This is what actually stops the OAuth
  flow server-side; the code changes remove the UI entry points.

## Verification

- Type-check / lint pass; test suite passes (with the Google-name test removed).
- Grep confirms no remaining references to `parseGoogleName`, `/welcome`,
  `handleGoogleSignIn`, `GoogleIcon`, or `signInWithOAuth`.
- Manual smoke test (recommended, post-deploy): sign in with a **real
  Google-created account's email** via the 6-digit code and confirm it lands on
  the same existing profile.
- Manual smoke test: click the magic **link** in an OTP email and confirm
  `/auth/callback` still logs the user in.

## Out of scope

- No database / `auth.identities` migration.
- No in-app notice to users (silent — email login already works).
- No changes to invite, profile, or league-join flows.
