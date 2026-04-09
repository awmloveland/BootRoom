# Fix: Join Modal Flicker + Mobile Autofocus

**Date:** 2026-04-09
**Status:** Approved

---

## Problem

Two bugs in the league join flow:

1. **Flicker (email OTP path):** After a user verifies their OTP code, the `JoinRequestDialog` ("Have you played before?") briefly appears, disappears, then reappears a few seconds later. Observed only on the email OTP path; Google OAuth untested.

2. **Autofocus / keyboard (mobile):** When any dialog in the join/auth flow opens, the first focusable field auto-focuses, triggering the mobile software keyboard. This shifts the viewport and clips modal content.

---

## Root Causes

### Flicker

In `LeagueJoinArea`, the `onSignedUp` callback passed to `AuthDialog` does:

```js
onSignedUp={() => {
  setAuthDialogOpen(false)
  setDialogOpen(true)   // premature — causes the flash
}}
```

`VerifyStep.handleVerify` always executes `window.location.href = redirect` immediately after calling `onSignedUp`. The `redirect` value is `${pathname}?open_join=1`. So the sequence is:

1. `onSignedUp()` fires → `setDialogOpen(true)` → `JoinRequestDialog` renders briefly (SHOW)
2. `window.location.href = redirect` starts a full-page navigation → React tears down (DISAPPEAR)
3. New page loads at `?open_join=1` → `SearchParamsReader.useEffect` calls `onAutoOpen()` → `setDialogOpen(true)` → dialog opens correctly (REAPPEAR)

The `setDialogOpen(true)` in `onSignedUp` is entirely redundant — `SearchParamsReader` already handles opening the dialog after the redirect. Removing it eliminates all three phases of the flicker.

### Autofocus / keyboard

Radix UI's `Dialog` (`@radix-ui/react-dialog`) automatically moves focus to the first focusable element inside the content panel when the dialog opens. On mobile this triggers the software keyboard, which shifts the viewport and obscures modal content.

Additionally, the OTP input in `VerifyStep` has an explicit `autoFocus` prop, which fires on top of Radix's own focus management.

---

## Design

Three changes, each in a different file.

### 1. `components/LeagueJoinArea.tsx`

Remove `setDialogOpen(true)` from the `onSignedUp` callback:

```js
// before
onSignedUp={() => {
  setAuthDialogOpen(false)
  setDialogOpen(true)
}}

// after
onSignedUp={() => {
  setAuthDialogOpen(false)
}}
```

No other changes. `SearchParamsReader` continues to handle opening the join dialog on the redirected page.

### 2. `components/ui/dialog.tsx`

Add `onOpenAutoFocus={(e) => e.preventDefault()}` to `DialogPrimitive.Content`:

```tsx
<DialogPrimitive.Content
  ref={ref}
  onOpenAutoFocus={(e) => e.preventDefault()}
  className={cn(...)}
  {...props}
>
```

This prevents Radix from programmatically focusing the first element when any dialog opens, stopping the mobile keyboard from firing. Desktop behaviour is unchanged — users can still click/tab into inputs normally.

### 3. `components/AuthDialog.tsx`

Remove the `autoFocus` prop from the OTP input in `VerifyStep`:

```tsx
// before
<input
  id="otp-code"
  ...
  autoFocus
/>

// after
<input
  id="otp-code"
  ...
/>
```

On desktop, users click to enter the OTP code — the loss of auto-focus is acceptable. The change is consistent with the global suppression in `dialog.tsx`.

---

## Files Changed

| File | Change |
|---|---|
| `components/LeagueJoinArea.tsx` | Remove `setDialogOpen(true)` from `onSignedUp` |
| `components/ui/dialog.tsx` | Add `onOpenAutoFocus` suppression to `DialogPrimitive.Content` |
| `components/AuthDialog.tsx` | Remove `autoFocus` from OTP input in `VerifyStep` |

---

## Out of Scope

- Google OAuth path — not yet observed to flicker; no change needed
- `app/welcome/page.tsx` has `autoFocus` on its first name input but this is a full page, not a dialog — mobile keyboard behaviour there is expected and not reported as a bug
