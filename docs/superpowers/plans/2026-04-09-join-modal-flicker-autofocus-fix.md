# Join Modal Flicker + Mobile Autofocus Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two bugs in the league join flow — a 3-phase join dialog flicker after OTP verification, and the mobile keyboard firing when auth/join dialogs open.

**Architecture:** Three surgical edits across three existing files. No new files, no new abstractions. The flicker fix removes one redundant line; the autofocus fixes add one prop and remove one prop.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Radix UI (`@radix-ui/react-dialog`), Tailwind CSS

---

## File Map

| File | Change |
|---|---|
| `components/LeagueJoinArea.tsx` | Remove `setDialogOpen(true)` from `onSignedUp` callback |
| `components/ui/dialog.tsx` | Add `onOpenAutoFocus={(e) => e.preventDefault()}` to `DialogPrimitive.Content` |
| `components/AuthDialog.tsx` | Remove `autoFocus` prop from OTP input in `VerifyStep` |

---

## Task 1: Fix the OTP flicker

**Files:**
- Modify: `components/LeagueJoinArea.tsx` (around line 157–160)

**Context:** After a user verifies their OTP, `VerifyStep.handleVerify` calls `onSignedUp()` then immediately navigates via `window.location.href = redirect`. The `onSignedUp` callback currently calls `setDialogOpen(true)`, which causes `JoinRequestDialog` to flash open before the navigation tears the page down. The join dialog is correctly opened on the redirected page by `SearchParamsReader`, so this `setDialogOpen(true)` call is entirely redundant.

- [ ] **Step 1: Edit `LeagueJoinArea.tsx`**

Find the `AuthDialog` usage starting around line 151. Change `onSignedUp` from:

```tsx
onSignedUp={() => {
  setAuthDialogOpen(false)
  setDialogOpen(true)
}}
```

to:

```tsx
onSignedUp={() => {
  setAuthDialogOpen(false)
}}
```

- [ ] **Step 2: Verify the build is clean**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/LeagueJoinArea.tsx
git commit -m "fix: remove premature join dialog open before OTP redirect"
```

---

## Task 2: Suppress Radix Dialog auto-focus globally

**Files:**
- Modify: `components/ui/dialog.tsx` (around line 35–48)

**Context:** Radix UI's `Dialog` calls `onOpenAutoFocus` when the dialog opens and, by default, moves focus to the first focusable element. On mobile this triggers the software keyboard, which shifts the viewport and clips dialog content. Adding `onOpenAutoFocus={(e) => e.preventDefault()}` to the `DialogPrimitive.Content` wrapper suppresses this for every dialog in the app. Desktop users are unaffected — they can still click/tab into inputs normally.

- [ ] **Step 1: Edit `components/ui/dialog.tsx`**

Find `DialogPrimitive.Content` (around line 35). Add `onOpenAutoFocus` before `className`:

```tsx
const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      onOpenAutoFocus={(e) => e.preventDefault()}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-[calc(100%-16px)] sm:max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-700 bg-slate-900 p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:pointer-events-none">
        <X className="h-4 w-4 text-slate-400" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
```

- [ ] **Step 2: Verify the build is clean**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ui/dialog.tsx
git commit -m "fix: suppress Radix dialog auto-focus to prevent mobile keyboard on open"
```

---

## Task 3: Remove explicit `autoFocus` from OTP input

**Files:**
- Modify: `components/AuthDialog.tsx` (around line 126–138, inside `VerifyStep`)

**Context:** The OTP input in `VerifyStep` has an explicit `autoFocus` prop. With Radix's auto-focus now suppressed (Task 2), this prop is redundant and would cause the same mobile keyboard problem if left in place (the HTML `autoFocus` attribute fires independently of Radix's JS focus management).

- [ ] **Step 1: Edit `components/AuthDialog.tsx`**

Inside `VerifyStep`, find the OTP `<input>` element (around line 126). Remove the `autoFocus` prop:

```tsx
<input
  id="otp-code"
  type="text"
  inputMode="numeric"
  autoComplete="one-time-code"
  maxLength={6}
  value={code}
  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
  required
  className={cn(inputClass, 'tracking-[0.5em] text-center text-lg font-mono')}
  placeholder="------"
/>
```

- [ ] **Step 2: Verify the build is clean**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AuthDialog.tsx
git commit -m "fix: remove autoFocus from OTP input to prevent mobile keyboard"
```

---

## Manual Verification Checklist

Once all three tasks are committed, test on a mobile device (or browser DevTools mobile emulation):

- [ ] Open the "Join League" flow → sign-up mode → enter email → tap "Send code". Verify the keyboard does **not** auto-appear when the verify step renders.
- [ ] Enter the OTP code and submit. Verify the join dialog does **not** flash briefly before the page navigates.
- [ ] After page reloads, verify the join dialog ("Have you played in this league before?") opens cleanly with no flicker.
- [ ] Verify the keyboard does **not** auto-appear when the join dialog opens.
- [ ] On desktop, verify that clicking into an input inside any dialog still works normally (focus is not broken).
