# OTP Authentication — Design Spec

**Date:** 2026-04-07
**Status:** Approved

## Overview

Replace email + password authentication with email OTP (6-digit code). Eliminates password storage, password reset flows, and the associated maintenance burden. Supabase already supports this natively via `signInWithOtp` / `verifyOtp`.

## Goals

- Remove passwords and all password-reset infrastructure
- Simplify the auth surface (fewer routes, fewer UI states)
- Improve security (no stored password hashes to worry about)
- Reduce friction for members (no passwords to forget)

## Approach

**Dual OTP flow** — sign-in and create-account are distinct modes, both using OTP as the verification mechanism. Sign-in is the primary action; "Create account" appears below an "or" divider as a prominent secondary button.

Hard cutover: password sign-in is removed immediately. Existing users' password hashes remain in Supabase but are never checked. No migration step required.

## Dialog Design

`AuthDialog` keeps `signin` and `signup` modes. The `forgot` mode is removed entirely. Each mode has two steps tracked as local state (`step: 'details' | 'verify'`) alongside a persisted `email` value.

### Sign-in flow

**Step 1 — Details**
- Email field
- "Send code" primary button → calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })`
- "or" divider + "Create account" filled secondary button (switches to signup mode)

**Step 2 — Verify**
- "Check your email" heading with email address shown
- 6 individual digit boxes for code entry
- "Verify" primary button → calls `supabase.auth.verifyOtp({ email, token, type: 'email' })` → `claim_profile` RPC → redirect
- "Resend code" link (re-calls `signInWithOtp`) · "← Back" link (returns to step 1)

### Create account flow

**Step 1 — Details**
- First name + last name (grid) + email fields
- "Send code" primary button → calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, data: { first_name, last_name, display_name } } })`
- "or" divider + "Sign in instead" filled secondary button (switches to signin mode)

**Step 2 — Verify**
- Identical to sign-in step 2
- After verify: `claim_profile` RPC creates profile using name from user metadata, then `onSignedUp?.()` callback fires

## Files Changed

### Deleted
- `app/api/auth/reset-password/route.ts`
- `app/api/auth/update-password/route.ts`
- `app/api/auth/verify-reset/route.ts`
- `app/api/auth/sign-in/route.ts` (unused by dialog; Supabase called directly)

### Modified
- `components/AuthDialog.tsx` — rewritten to use OTP two-step flow; `forgot` mode removed; `AuthMode` type updated to `'signin' | 'signup'`
- `middleware.ts` — remove `/reset-password` from the profile-check skip list

### Unchanged
- `app/auth/callback/route.ts` — still needed for Supabase callback handling
- `app/api/auth/sign-out/route.ts`, `session/route.ts`, `me/route.ts`
- All league, player-claim, and join-request API routes
- RLS policies and `claim_profile` RPC
- `middleware.ts` auth/session logic (beyond the reset-password skip removal)

## Error Handling

| Scenario | Behaviour |
|---|---|
| Unknown email at sign-in | `signInWithOtp` error → "No account found. Use 'Create account' to get started." |
| Wrong or expired code | `verifyOtp` error → "Invalid or expired code." + "Resend code" button |
| Existing user tries to create account | `signInWithOtp` with `shouldCreateUser: true` just sends a code; signs them in normally. `claim_profile` is idempotent. No special handling. |
| Rate limiting | Surface Supabase error message directly |

## Impact on Other Flows

**Player linking & join requests:** Zero impact. These flows only require a valid session cookie — they are agnostic to how the session was established.

**Admin request review:** Zero impact. `PendingRequestsTable`, player-claim API routes, and the review flow are all session-based and unchanged.

**Invite flow:** Zero impact. Invite acceptance opens `AuthDialog` → sign-up mode, which now uses OTP instead of password.

## Out of Scope

- Removing existing password hashes from Supabase (unnecessary; they are never checked)
- Adding any other auth provider (magic link, OAuth, etc.)
- Changes to the invite flow itself
