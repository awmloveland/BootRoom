# Sign-In Only Header + League-Contextual Join Prompts

**Date:** 2026-04-07
**Status:** Approved

## Goal

The header "Log in" button should only serve returning users. It must not offer a "Create account" path, because a new user created outside a league context has no way to be associated with a league. The only valid account creation paths are:

1. Via a league join flow (e.g. `LeagueJoinArea`, or a feature-page prompt when a league is known)
2. In future: creating a new league as a creator

This spec covers making the header sign-in only, and updating `LineupLabLoginPrompt` and `HonoursLoginPrompt` to present two explicit CTAs — "Log in" and "Join league" — rather than a single ambiguous auth entry point.

---

## Changes

### 1. `AuthDialog` — add `signinOnly` prop

Add an optional `signinOnly?: boolean` prop to `AuthDialogProps`.

When `signinOnly={true}`:
- `SignInForm` does not render the "Create account" button, the or-divider, or call `onSwitchMode`
- The dialog is locked to sign-in mode — `SignUpForm` is unreachable
- OTP sign-in, Google sign-in ("Continue with Google"), and the verify step are all unaffected
- A small muted note is shown at the bottom of `SignInForm`: *"Don't have an account? Ask your admin for an invite or hit 'Join League' to request access."* (`text-xs text-slate-500`)

When `signinOnly` is absent or `false` (default): behaviour is unchanged.

### 2. `navbar.tsx` — pass `signinOnly`

Both the desktop and mobile `AuthDialog` usages in `navbar.tsx` receive `signinOnly={true}`. No other changes.

### 3. `LineupLabLoginPrompt` — two-button layout

Add a `leagueName: string` prop (alongside existing `leagueId`).

Replace the single "Sign in" button with two side-by-side buttons:

- **"Log in"** — opens `AuthDialog` with `signinOnly={true}`, `redirect` unchanged
- **"Join league"** — opens `AuthDialog` with `initialMode="signup"`, `leagueName` passed through, and `onSignedUp` callback that closes the auth dialog and opens a `JoinRequestDialog` for the league

This mirrors the pattern in `LeagueJoinArea`.

Parent pages that render `LineupLabLoginPrompt` must pass `leagueName`.

### 4. `HonoursLoginPrompt` — same two-button layout

Identical treatment to `LineupLabLoginPrompt`. Add `leagueName: string` prop, render "Log in" + "Join league" buttons with the same wiring.

Parent pages that render `HonoursLoginPrompt` must pass `leagueName`.

---

## What is not changing

- `LeagueJoinArea` — already correct, no changes needed
- `AuthDialog` sign-up mode — still works when `signinOnly` is absent (used by `LeagueJoinArea`)
- Google sign-in in `SignInForm` — remains, calls `handleGoogleSignIn('signin', redirect)`. A brand-new Google user arriving via the sign-in path will have a profile created by `claim_profile`, which is acceptable — the app handles the no-leagues state gracefully.
- All OTP, callback, and welcome-page logic — untouched
- `JoinRequestDialog` — imported and used as-is, same as `LeagueJoinArea`

---

## Out of scope

- Restricting Google OAuth from creating new users on the sign-in path (no API equivalent of `shouldCreateUser: false` for OAuth)
- Any changes to invite flow or league creation
