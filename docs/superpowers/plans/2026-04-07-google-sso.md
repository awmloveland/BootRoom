# Google SSO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google OAuth as an alternative to email OTP — sign-in for existing members and sign-up for new members completing an invite, with a name-review step after Google sign-up.

**Architecture:** `AuthDialog` gains a "Continue with Google" button in both sign-in and sign-up modes. Clicking it calls `signInWithOAuth`, which redirects through the existing `/auth/callback` route (already calls `claim_profile`). Sign-up mode threads `mode=signup` through the callback URL so the callback routes new users to a `/welcome` page for name review before landing on their destination.

**Tech Stack:** Next.js 15 App Router, Supabase Auth (`signInWithOAuth`), TypeScript, Tailwind CSS

---

## Pre-requisites (outside codebase — must be done before any task works end-to-end)

1. **Google Cloud Console** — create an OAuth 2.0 Web client. Add `https://[supabase-project].supabase.co/auth/v1/callback` as an Authorised Redirect URI. Copy the Client ID and Client Secret.
2. **Supabase Dashboard** — Authentication → Providers → Google → paste credentials → Save. Authentication → Settings → enable **"Link accounts by email"**.

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `app/auth/callback/route.ts` | Read `mode` param; if `signup`, route to `/welcome` instead of destination |
| Create | `app/api/auth/profile/route.ts` | `PATCH` handler — update `profiles.display_name` for authenticated user |
| Create | `app/welcome/page.tsx` | Client component — pre-fills names from Google metadata, submits display_name update, redirects |
| Modify | `middleware.ts` | Add `/welcome` to `AUTH_REQUIRED` |
| Modify | `components/AuthDialog.tsx` | Add `handleGoogleSignIn`, Google button in `SignInForm` and `SignUpForm` |

---

## Task 1: Update `/auth/callback` to route sign-up through `/welcome`

**Files:**
- Modify: `app/auth/callback/route.ts`

The route already handles `exchangeCodeForSession` → `claim_profile` → redirect. The only change: read `mode` and, when it is `signup`, send the user to `/welcome?redirect=<destination>` instead of directly to the destination.

- [ ] **Step 1: Open the file and read it**

```
app/auth/callback/route.ts
```

Current content for reference:
```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await supabase.rpc('claim_profile')
      return NextResponse.redirect(`${origin}${redirect}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback`)
}
```

- [ ] **Step 2: Apply the change**

Replace the file content with:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const redirect = searchParams.get('redirect') || '/'
  const mode = searchParams.get('mode')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      await supabase.rpc('claim_profile')
      if (mode === 'signup') {
        return NextResponse.redirect(
          `${origin}/welcome?redirect=${encodeURIComponent(redirect)}`
        )
      }
      return NextResponse.redirect(`${origin}${redirect}`)
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback`)
}
```

- [ ] **Step 3: Commit**

```bash
git add app/auth/callback/route.ts
git commit -m "feat: route google sign-up through /welcome after oauth callback"
```

---

## Task 2: Create `PATCH /api/auth/profile` route

**Files:**
- Create: `app/api/auth/profile/route.ts`

Accepts `{ first_name, last_name }`, constructs `display_name`, updates `profiles` for the authenticated user. The `profiles` table has `id` and `display_name` columns — there are no separate `first_name`/`last_name` columns, so only `display_name` is written.

- [ ] **Step 1: Create the file**

```ts
// app/api/auth/profile/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { first_name, last_name } = await request.json()
  const display_name = `${String(first_name ?? '').trim()} ${String(last_name ?? '').trim()}`.trim()

  if (!display_name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name })
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/auth/profile/route.ts
git commit -m "feat: add PATCH /api/auth/profile to update display name"
```

---

## Task 3: Create `/welcome` page

**Files:**
- Create: `app/welcome/page.tsx`

Client component. On mount, reads the Supabase session to get Google metadata (`given_name`, `family_name`). Pre-fills first and last name fields. On submit, calls `PATCH /api/auth/profile` then redirects to the `redirect` search param.

Google populates `user_metadata.given_name` and `user_metadata.family_name`. If those are absent (edge case — user denied name sharing), fields render empty for manual entry.

- [ ] **Step 1: Create the file**

```tsx
// app/welcome/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const inputClass =
  'w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent'

export default function WelcomePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const dest = searchParams.get('redirect') ?? '/'

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadMeta() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace('/sign-in'); return }
      const meta = user.user_metadata ?? {}
      setFirstName(meta.given_name ?? '')
      setLastName(meta.family_name ?? '')
      setLoading(false)
    }
    loadMeta()
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() && !lastName.trim()) {
      setError('Please enter your name.')
      return
    }
    setSubmitting(true)
    setError(null)
    const res = await fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ first_name: firstName, last_name: lastName }),
    })
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Something went wrong. Please try again.')
      setSubmitting(false)
      return
    }
    router.push(dest)
    router.refresh()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-xl p-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Confirm your name</h1>
          <p className="text-sm text-slate-400 mt-1">
            This is how you&apos;ll appear across your leagues.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="welcome-first" className="block text-sm text-slate-400 mb-1">
                First name
              </label>
              <input
                id="welcome-first"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                className={inputClass}
                placeholder="Alex"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="welcome-last" className="block text-sm text-slate-400 mb-1">
                Last name
              </label>
              <input
                id="welcome-last"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
                className={inputClass}
                placeholder="Smith"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? 'Saving…' : 'Confirm'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/welcome/page.tsx
git commit -m "feat: add /welcome page for google sign-up name review"
```

---

## Task 4: Add `/welcome` to middleware auth guard

**Files:**
- Modify: `middleware.ts`

`/welcome` must redirect unauthenticated visitors to sign-in. It is reached only via the OAuth callback, but a direct navigation by an unauthenticated user should be handled gracefully.

- [ ] **Step 1: Open `middleware.ts` and find `AUTH_REQUIRED`**

Current line (line 8):
```ts
const AUTH_REQUIRED = ['/settings']
```

- [ ] **Step 2: Add `/welcome`**

```ts
const AUTH_REQUIRED = ['/settings', '/welcome']
```

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: add /welcome to auth-required middleware guard"
```

---

## Task 5: Add Google button to `AuthDialog`

**Files:**
- Modify: `components/AuthDialog.tsx`

Add a `handleGoogleSignIn(mode, redirect)` function at the top of the file (outside components, since it has no state dependency). Add a Google SVG icon component. Add the Google button to both `SignInForm` and `SignUpForm` — placed between the "Send code" button and the "or" divider.

`handleGoogleSignIn` constructs the `redirectTo` URL and calls `supabase.auth.signInWithOAuth`. For `signup` mode it appends `&mode=signup` so the callback routes through `/welcome`.

- [ ] **Step 1: Add the Google icon and `handleGoogleSignIn` helper**

After the `inputClass` constant (around line 38), add:

```tsx
function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

async function handleGoogleSignIn(mode: AuthMode, redirect: string) {
  const supabase = createClient()
  const base = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`
  const redirectTo = mode === 'signup' ? `${base}&mode=signup` : base
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
}
```

- [ ] **Step 2: Add Google button to `SignInForm`**

`SignInForm` currently receives `{ onSent, onSwitchMode }`. It needs `redirect` to pass to `handleGoogleSignIn`. Update its props and add the button.

Replace the `SignInForm` function signature and add the button between the "Send code" button and the "or" divider:

```tsx
function SignInForm({
  onSent,
  onSwitchMode,
  redirect,
}: {
  onSent: (email: string) => void
  onSwitchMode: () => void
  redirect: string
}) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    })
    if (error) {
      setError(
        /user.not.found|no user|signups not allowed/i.test(error.message)
          ? "No account found for this email. Use 'Create account' to get started."
          : error.message
      )
      setLoading(false)
      return
    }
    setLoading(false)
    onSent(email.trim().toLowerCase())
  }

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
    </form>
  )
}
```

- [ ] **Step 3: Add Google button to `SignUpForm`**

`SignUpForm` similarly needs `redirect`. Update its props and add the button in the same position (after "Send code", before the "or" divider):

```tsx
function SignUpForm({
  onSent,
  onSwitchMode,
  leagueName,
  redirect,
}: {
  onSent: (email: string) => void
  onSwitchMode: () => void
  leagueName?: string
  redirect: string
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim()
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        shouldCreateUser: true,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          display_name: displayName,
        },
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setLoading(false)
    onSent(email.trim().toLowerCase())
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="signup-first" className="block text-sm text-slate-400 mb-1">
            First name
          </label>
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
        </div>
        <div>
          <label htmlFor="signup-last" className="block text-sm text-slate-400 mb-1">
            Last name
          </label>
          <input
            id="signup-last"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className={inputClass}
            placeholder="Smith"
          />
        </div>
      </div>
      <div>
        <label htmlFor="signup-email" className="block text-sm text-slate-400 mb-1">
          Email
        </label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className={inputClass}
          placeholder="you@example.com"
        />
      </div>
      {leagueName && (
        <p className="text-xs text-slate-500">
          You&apos;ll be able to request access to {leagueName} after creating your account.
        </p>
      )}
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
        onClick={() => handleGoogleSignIn('signup', redirect)}
        className="w-full py-2 px-4 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 font-medium hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
      >
        <GoogleIcon />
        Continue with Google
      </button>
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
        Sign in instead
      </button>
    </form>
  )
}
```

- [ ] **Step 4: Pass `redirect` prop down from `AuthDialog` to both forms**

In `AuthDialog`, `SignInForm` and `SignUpForm` are rendered in the `Dialog` block. Update both usages to pass `redirect`:

```tsx
) : mode === 'signin' ? (
  <SignInForm onSent={handleCodeSent} onSwitchMode={handleSwitchMode} redirect={redirect} />
) : (
  <SignUpForm
    onSent={handleCodeSent}
    onSwitchMode={handleSwitchMode}
    leagueName={leagueName}
    redirect={redirect}
  />
)}
```

- [ ] **Step 5: Verify the build compiles**

```bash
npm run build
```

Expected: no TypeScript errors. If there are type errors, fix them before committing.

- [ ] **Step 6: Commit**

```bash
git add components/AuthDialog.tsx
git commit -m "feat: add google sso button to authdialog sign-in and sign-up forms"
```

---

## Manual Testing Checklist

Complete the pre-requisite Supabase + Google Cloud config first, then:

- [ ] **Sign-in with Google (existing OTP member):** Open `AuthDialog` in sign-in mode → "Continue with Google" → authenticate with Google account matching an existing member email → lands on destination without hitting `/welcome`
- [ ] **Sign-up with Google (new user via invite):** Open `AuthDialog` in sign-up mode (e.g. from an invite link) → "Continue with Google" → authenticate → lands on `/welcome` with first/last name pre-filled from Google → confirm → lands on invite page → can proceed to join request
- [ ] **Name editing on `/welcome`:** Change the pre-filled name before confirming → verify the updated `display_name` appears in the member table in Settings
- [ ] **Missing metadata edge case:** In Supabase dashboard, manually clear `given_name`/`family_name` from a test user's metadata → sign in via Google → `/welcome` renders empty fields → user fills them in manually → confirm works
- [ ] **OTP unaffected:** Sign in and sign up via OTP email code still works end-to-end
- [ ] **Unauthenticated `/welcome`:** Navigate to `/welcome` without a session → redirected to `/sign-in`
- [ ] **Existing OTP user links Google:** Member with OTP account signs in with Google using the same email → same account (no duplicate user), Supabase "link by email" is working
