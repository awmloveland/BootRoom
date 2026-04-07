# Auth Dialog Mobile Fixes — Design

**Date:** 2026-04-07

## Problem

Two issues affect the sign-in and sign-up dialogs on mobile web:

1. The dialog fills the full screen width with no gap to the screen edges.
2. The first input field auto-focuses on open, triggering the mobile keyboard immediately and obscuring the Google SSO button below.

## Changes

### 1. Mobile width — `components/ui/dialog.tsx`

In `DialogContent`, replace `max-w-md` with `max-w-[calc(100%-16px)] sm:max-w-md`.

- **Mobile**: caps dialog width at viewport width minus 16px total, giving 8px on each side.
- **sm+ (≥640px)**: reverts to `max-w-md` (448px), preserving existing desktop behaviour.
- Applies to all dialogs across the app (all benefit from the breathing room).

### 2. Remove autofocus — `components/AuthDialog.tsx`

Remove the `autoFocus` attribute from:
- `SignInForm` email input (`id="signin-email"`)
- `SignUpForm` first name input (`id="signup-first"`)

The `VerifyStep` OTP input keeps `autoFocus` — there is no Google SSO button on that step and autofocus aids usability when entering the 6-digit code.

## Scope

3 attribute/class changes across 2 files. No logic changes, no new components.

## Files Changed

| File | Change |
|---|---|
| `components/ui/dialog.tsx` | `max-w-md` → `max-w-[calc(100%-16px)] sm:max-w-md` in `DialogContent` |
| `components/AuthDialog.tsx` | Remove `autoFocus` from `SignInForm` email input |
| `components/AuthDialog.tsx` | Remove `autoFocus` from `SignUpForm` first name input |
