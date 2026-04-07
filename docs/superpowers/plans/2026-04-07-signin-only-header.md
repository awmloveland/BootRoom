# Sign-In Only Header + League-Contextual Join Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the "Create account" path from the header log-in button, and give `LineupLabLoginPrompt` and `HonoursLoginPrompt` a two-button layout ("Log in" + "Join league") with the correct auth flows wired up.

**Architecture:** Add a `signinOnly` boolean prop to `AuthDialog` that locks it to sign-in mode and shows an info note. The navbar passes this prop. The two feature-page prompts are rewritten to render two separate `AuthDialog` instances — one sign-in-only, one sign-up — with a `JoinRequestDialog` triggered after sign-up.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase client, Radix UI Dialog

---

## File Map

| File | Change |
|---|---|
| `components/AuthDialog.tsx` | Add `signinOnly` prop; update `SignInForm` to hide "Create account" section and show info note when `signinOnly` |
| `components/ui/navbar.tsx` | Pass `signinOnly={true}` to both `AuthDialog` usages |
| `components/LineupLabLoginPrompt.tsx` | Full rewrite: add `leagueName` prop, two-button layout, `JoinRequestDialog` |
| `components/HonoursLoginPrompt.tsx` | Full rewrite: identical treatment to `LineupLabLoginPrompt` |
| `app/[leagueId]/lineup-lab/page.tsx` | Pass `leagueName={game!.name}` to `LineupLabLoginPrompt` |
| `app/[leagueId]/honours/page.tsx` | Pass `leagueName={game!.name}` to `HonoursLoginPrompt` |

---

## Task 1: Add `signinOnly` prop to `AuthDialog`

**Files:**
- Modify: `components/AuthDialog.tsx`

- [ ] **Step 1: Add `signinOnly` to `AuthDialogProps` and thread it to `SignInForm`**

In `AuthDialogProps`, add the optional prop:

```ts
interface AuthDialogProps {
  redirect?: string
  size?: 'xs' | 'sm' | 'default'
  trigger?: (openSignIn: () => void) => React.ReactNode
  leagueName?: string
  initialMode?: AuthMode
  onSignedUp?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  signinOnly?: boolean   // ← add this
}
```

Add `signinOnly?: boolean` to `SignInForm`'s props:

```ts
function SignInForm({
  onSent,
  onSwitchMode,
  redirect,
  signinOnly,
}: {
  onSent: (email: string) => void
  onSwitchMode: () => void
  redirect: string
  signinOnly?: boolean
}) {
```

- [ ] **Step 2: Update `SignInForm` render — conditionally hide "Create account" section and show info note**

Replace the section of `SignInForm`'s return that renders the or-divider and "Create account" button. The full return becomes:

```tsx
  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div>
        <label htmlFor="signin-email" className="block text-sm text-slate-400 mb-1">
          Email
        </label>
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
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending…' : 'Send code'}
      </button>
      <button
        type="button"
        onClick={() => handleGoogleSignIn('signin', redirect)}
        className="w-full py-2 px-4 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 font-medium hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
      >
        <GoogleIcon />
        Continue with Google
      </button>
      {!signinOnly && (
        <>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">or</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>
          <button
            type="button"
            onClick={onSwitchMode}
            className="w-full py-2 px-4 rounded-lg bg-slate-700 border border-slate-600 text-slate-200 font-medium hover:bg-slate-600 transition-colors"
          >
            Create account
          </button>
        </>
      )}
      {signinOnly && (
        <p className="text-xs text-slate-500 text-center">
          Don&apos;t have an account? Ask your admin for an invite or hit &apos;Join League&apos; to request access.
        </p>
      )}
    </form>
  )
```

- [ ] **Step 3: Thread `signinOnly` from `AuthDialog` down to `SignInForm`**

In `AuthDialog`'s destructured props, add `signinOnly`:

```ts
export function AuthDialog({
  redirect = '/',
  size = 'xs',
  trigger,
  leagueName,
  initialMode = 'signin',
  onSignedUp,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  signinOnly,
}: AuthDialogProps) {
```

Pass it to `SignInForm` in the render:

```tsx
          ) : mode === 'signin' ? (
            <SignInForm onSent={handleCodeSent} onSwitchMode={handleSwitchMode} redirect={redirect} signinOnly={signinOnly} />
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/AuthDialog.tsx
git commit -m "feat: add signinOnly prop to AuthDialog"
```

---

## Task 2: Update `navbar.tsx` to use `signinOnly`

**Files:**
- Modify: `components/ui/navbar.tsx`

- [ ] **Step 1: Add `signinOnly={true}` to the desktop `AuthDialog`**

Find the desktop auth section (around line 238). Change:

```tsx
            <AuthDialog redirect={leagueId ? `/${leagueId}/results` : '/'} size="xs" />
```

To:

```tsx
            <AuthDialog redirect={leagueId ? `/${leagueId}/results` : '/'} size="xs" signinOnly />
```

- [ ] **Step 2: Add `signinOnly={true}` to the mobile `AuthDialog`**

Find the mobile auth section (around line 290). Change:

```tsx
            <AuthDialog redirect={leagueId ? `/${leagueId}/results` : '/'} size="xs" />
```

To:

```tsx
            <AuthDialog redirect={leagueId ? `/${leagueId}/results` : '/'} size="xs" signinOnly />
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/ui/navbar.tsx
git commit -m "feat: lock navbar login button to sign-in only"
```

---

## Task 3: Rewrite `LineupLabLoginPrompt` + update its page

**Files:**
- Modify: `components/LineupLabLoginPrompt.tsx`
- Modify: `app/[leagueId]/lineup-lab/page.tsx`

- [ ] **Step 1: Rewrite `LineupLabLoginPrompt`**

Replace the entire file with:

```tsx
'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { AuthDialog } from '@/components/AuthDialog'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'

interface LineupLabLoginPromptProps {
  leagueId: string
  leagueName: string
}

export function LineupLabLoginPrompt({ leagueId, leagueName }: LineupLabLoginPromptProps) {
  const [signInOpen, setSignInOpen] = useState(false)
  const [signUpOpen, setSignUpOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
        <Lock size={22} className="text-slate-500" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-slate-100 font-semibold text-base">Sign in to use Lineup Lab</p>
        <p className="text-slate-500 text-sm max-w-xs">
          Build and save lineups for your league matches.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSignInOpen(true)}
          className="bg-slate-700 border border-slate-600 hover:bg-slate-600 text-slate-100 text-sm font-medium px-5 py-2 rounded-md transition-colors"
        >
          Log in
        </button>
        <button
          onClick={() => setSignUpOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded-md transition-colors"
        >
          Join league
        </button>
      </div>

      <AuthDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        redirect={`/${leagueId}/lineup-lab`}
        signinOnly
      />

      <AuthDialog
        open={signUpOpen}
        onOpenChange={setSignUpOpen}
        redirect={`/${leagueId}/lineup-lab`}
        initialMode="signup"
        leagueName={leagueName}
        onSignedUp={() => {
          setSignUpOpen(false)
          setJoinOpen(true)
        }}
      />

      <JoinRequestDialog
        leagueId={leagueId}
        leagueName={leagueName}
        open={joinOpen}
        onOpenChange={setJoinOpen}
        onSuccess={() => setJoinOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Pass `leagueName` in `app/[leagueId]/lineup-lab/page.tsx`**

Find line 77:

```tsx
            : <LineupLabLoginPrompt leagueId={leagueId} />
```

Change to:

```tsx
            : <LineupLabLoginPrompt leagueId={leagueId} leagueName={game!.name} />
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/LineupLabLoginPrompt.tsx app/\[leagueId\]/lineup-lab/page.tsx
git commit -m "feat: add Log in + Join league buttons to LineupLabLoginPrompt"
```

---

## Task 4: Rewrite `HonoursLoginPrompt` + update its page

**Files:**
- Modify: `components/HonoursLoginPrompt.tsx`
- Modify: `app/[leagueId]/honours/page.tsx`

- [ ] **Step 1: Rewrite `HonoursLoginPrompt`**

Replace the entire file with:

```tsx
'use client'

import { useState } from 'react'
import { Lock } from 'lucide-react'
import { AuthDialog } from '@/components/AuthDialog'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'

interface HonoursLoginPromptProps {
  leagueId: string
  leagueName: string
}

export function HonoursLoginPrompt({ leagueId, leagueName }: HonoursLoginPromptProps) {
  const [signInOpen, setSignInOpen] = useState(false)
  const [signUpOpen, setSignUpOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
        <Lock size={22} className="text-slate-500" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-slate-100 font-semibold text-base">Sign in to view Honours</p>
        <p className="text-slate-500 text-sm max-w-xs">
          See quarterly champions and standings for your league.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSignInOpen(true)}
          className="bg-slate-700 border border-slate-600 hover:bg-slate-600 text-slate-100 text-sm font-medium px-5 py-2 rounded-md transition-colors"
        >
          Log in
        </button>
        <button
          onClick={() => setSignUpOpen(true)}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded-md transition-colors"
        >
          Join league
        </button>
      </div>

      <AuthDialog
        open={signInOpen}
        onOpenChange={setSignInOpen}
        redirect={`/${leagueId}/honours`}
        signinOnly
      />

      <AuthDialog
        open={signUpOpen}
        onOpenChange={setSignUpOpen}
        redirect={`/${leagueId}/honours`}
        initialMode="signup"
        leagueName={leagueName}
        onSignedUp={() => {
          setSignUpOpen(false)
          setJoinOpen(true)
        }}
      />

      <JoinRequestDialog
        leagueId={leagueId}
        leagueName={leagueName}
        open={joinOpen}
        onOpenChange={setJoinOpen}
        onSuccess={() => setJoinOpen(false)}
      />
    </div>
  )
}
```

- [ ] **Step 2: Pass `leagueName` in `app/[leagueId]/honours/page.tsx`**

Find line 84:

```tsx
            <HonoursLoginPrompt leagueId={leagueId} />
```

Change to:

```tsx
            <HonoursLoginPrompt leagueId={leagueId} leagueName={game!.name} />
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/HonoursLoginPrompt.tsx app/\[leagueId\]/honours/page.tsx
git commit -m "feat: add Log in + Join league buttons to HonoursLoginPrompt"
```

---

## Manual verification

After all tasks are complete, with `npm run dev` running:

1. **Navbar sign-in only** — click "Log in" in the header. Confirm no "Create account" button or or-divider is visible. Confirm the info note *"Don't have an account? Ask your admin for an invite or hit 'Join League' to request access."* appears below the Google button. Confirm OTP sign-in and Google sign-in both work.

2. **Lineup Lab prompt** — navigate to `/{leagueId}/lineup-lab` while signed out. Confirm two buttons: "Log in" (grey) and "Join league" (blue). Clicking "Log in" opens a sign-in-only dialog with the info note. Clicking "Join league" opens the sign-up dialog (with name fields and league context), and after completing sign-up, the `JoinRequestDialog` opens.

3. **Honours prompt** — same as above at `/{leagueId}/honours`.

4. **`LeagueJoinArea` unchanged** — on the results page, the "Join League" button still opens the sign-up flow correctly (no regression).
