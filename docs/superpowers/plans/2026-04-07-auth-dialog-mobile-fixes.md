# Auth Dialog Mobile Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the auth dialog on mobile web to have 8px side gaps and suppress auto-keyboard on open.

**Architecture:** Two isolated changes — a Tailwind class swap in the shared `DialogContent` component, and removal of `autoFocus` from two form inputs in `AuthDialog`. No logic changes, no new components.

**Tech Stack:** Next.js 14, Tailwind CSS v3, Radix UI Dialog primitive.

---

## File Map

| File | Change |
|---|---|
| `components/ui/dialog.tsx` | Replace `max-w-md` with `max-w-[calc(100%-16px)] sm:max-w-md` in `DialogContent` class string |
| `components/AuthDialog.tsx` | Remove `autoFocus` from `SignInForm` email input and `SignUpForm` first name input |

---

### Task 1: Fix dialog width on mobile

**Files:**
- Modify: `components/ui/dialog.tsx` (line 38)

The `DialogContent` component currently uses `w-full max-w-md`. On narrow mobile screens `max-w-md` (448px) is wider than the viewport, so `w-full` wins and the dialog touches the screen edges. Replace `max-w-md` with `max-w-[calc(100%-16px)] sm:max-w-md` to give 8px breathing room on each side on mobile while keeping the 448px cap on `sm`+ screens.

- [ ] **Step 1: Open `components/ui/dialog.tsx` and locate `DialogContent`**

The class string is on line 38. Find this exact substring in the long class string:

```
w-full max-w-md translate-x-[-50%]
```

- [ ] **Step 2: Replace the class**

Change:
```
w-full max-w-md translate-x-[-50%]
```
To:
```
w-full max-w-[calc(100%-16px)] sm:max-w-md translate-x-[-50%]
```

The full updated `DialogContent` className should read:
```
fixed left-[50%] top-[50%] z-50 grid w-full max-w-[calc(100%-16px)] sm:max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border border-slate-700 bg-slate-900 p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/dialog.tsx
git commit -m "fix: add 8px side margins to dialog on mobile"
```

---

### Task 2: Remove autofocus from sign-in and sign-up forms

**Files:**
- Modify: `components/AuthDialog.tsx` (lines 231, 340)

Both `SignInForm` and `SignUpForm` have `autoFocus` on their first input. On mobile this immediately triggers the soft keyboard, which scrolls the viewport and pushes the Google SSO button out of view. The `VerifyStep` OTP input intentionally keeps `autoFocus` — it has no Google button and autofocus there aids UX.

- [ ] **Step 1: Remove `autoFocus` from `SignInForm` email input**

In `components/AuthDialog.tsx`, find the `SignInForm` function. Locate the email input (around line 222–231):

```tsx
<input
  id="signin-email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  required
  className={inputClass}
  placeholder="you@example.com"
  autoFocus
/>
```

Remove the `autoFocus` line so it reads:

```tsx
<input
  id="signin-email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  required
  className={inputClass}
  placeholder="you@example.com"
/>
```

- [ ] **Step 2: Remove `autoFocus` from `SignUpForm` first name input**

In `components/AuthDialog.tsx`, find the `SignUpForm` function. Locate the first name input (around line 332–341):

```tsx
<input
  id="signup-first"
  type="text"
  value={firstName}
  onChange={(e) => setFirstName(e.target.value)}
  required
  className={inputClass}
  placeholder="Alex"
  autoFocus
/>
```

Remove the `autoFocus` line so it reads:

```tsx
<input
  id="signup-first"
  type="text"
  value={firstName}
  onChange={(e) => setFirstName(e.target.value)}
  required
  className={inputClass}
  placeholder="Alex"
/>
```

- [ ] **Step 3: Confirm `VerifyStep` OTP input still has `autoFocus`**

In `components/AuthDialog.tsx`, find the `VerifyStep` function. The OTP input (around line 129–141) should still include `autoFocus`:

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
  autoFocus
/>
```

Do not touch this input.

- [ ] **Step 4: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/AuthDialog.tsx
git commit -m "fix: remove autofocus from sign-in and sign-up forms on mobile"
```
