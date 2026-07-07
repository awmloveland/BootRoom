# Remove Google SSO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove "Sign in / Sign up with Google" from the app while leaving email OTP login fully intact and impacting no existing user.

**Architecture:** Google auth is Supabase's built-in OAuth provider. The Google buttons in `AuthDialog.tsx` are the only UI entry points. Once removed, `/welcome` and `parseGoogleName` become dead code (they were reached only via the Google signup path), while `/auth/callback` must stay because email magic-link clicks use it. The provider itself is disabled by the user in the Supabase Dashboard (manual, outside this plan).

**Tech Stack:** Next.js 14 (App Router), TypeScript, Supabase Auth, Jest.

**Spec:** `docs/superpowers/specs/2026-07-07-remove-google-sso-design.md`

**Note on ordering:** Delete the `/welcome` page and `parseGoogleName` (which it imports) in the same task to avoid a transient broken import. Run `npm run build` only at the end.

---

### Task 1: Strip Google from `AuthDialog.tsx`

**Files:**
- Modify: `components/AuthDialog.tsx`

- [ ] **Step 1: Remove the `GoogleIcon` component**

Delete this entire block (currently lines ~41-50):

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
```

- [ ] **Step 2: Remove the `handleGoogleSignIn` helper**

Delete this entire block (currently lines ~52-58):

```tsx
async function handleGoogleSignIn(mode: AuthMode, redirect: string): Promise<string | null> {
  const supabase = createClient()
  const base = `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`
  const redirectTo = mode === 'signup' ? `${base}&mode=signup` : base
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  return error ? error.message : null
}
```

- [ ] **Step 3: Remove the Google button + its divider from `SignInForm`**

In `SignInForm` (the `return`), delete the "or" divider and the Google button so the block goes from this:

```tsx
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending…' : 'Send code'}
      </button>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-700" />
        <span className="text-xs text-slate-500">or</span>
        <div className="flex-1 h-px bg-slate-700" />
      </div>
      <button
        type="button"
        onClick={async () => {
          const err = await handleGoogleSignIn('signin', redirect)
          if (err) setError(err)
        }}
        className="w-full py-2 px-4 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 font-medium hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
      >
        <GoogleIcon />
        Sign in with Google
      </button>
      {signinOnly ? (
```

to this:

```tsx
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending…' : 'Send code'}
      </button>
      {signinOnly ? (
```

- [ ] **Step 4: Remove the Google button + divider from `SignUpForm`, and the `googleError` state**

In `SignUpForm`, delete the `googleError` state declaration:

```tsx
  const [googleError, setGoogleError] = useState<string | null>(null)
```

Then in the `SignUpForm` return, delete the divider, the `googleError` message line, and the Google button so this:

```tsx
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending…' : 'Send code'}
      </button>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-slate-700" />
        <span className="text-xs text-slate-500">or</span>
        <div className="flex-1 h-px bg-slate-700" />
      </div>
      {googleError && <p className="text-sm text-red-400">{googleError}</p>}
      <button
        type="button"
        onClick={async () => {
          setGoogleError(null)
          const err = await handleGoogleSignIn('signup', redirect)
          if (err) setGoogleError(err)
        }}
        className="w-full py-2 px-4 rounded-lg bg-slate-700 border border-slate-600 text-slate-100 font-medium hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
      >
        <GoogleIcon />
        Sign up with Google
      </button>
      <p className="text-xs text-slate-500 text-center pt-1">
```

becomes this:

```tsx
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Sending…' : 'Send code'}
      </button>
      <p className="text-xs text-slate-500 text-center pt-1">
```

- [ ] **Step 5: Check for a now-unused `redirect` prop**

`SignInForm` and `SignUpForm` receive a `redirect` prop that was used only by the Google helper. After Steps 3-4, check whether `redirect` is still referenced in each component body.

Run: `grep -n "redirect" components/AuthDialog.tsx`

Expected: `redirect` still appears in `VerifyStep` (used by `window.location.href = redirect`) and in the `AuthDialog` wiring. If `SignInForm`/`SignUpForm` no longer reference `redirect` in their bodies, ESLint's `no-unused-vars` will flag the prop. Leave the prop in place for now — Step 6 (lint) will confirm whether removal is needed. If lint flags it, remove `redirect` from that component's props interface, its destructured params, and the `<SignInForm .../>` / `<SignUpForm .../>` call sites in `AuthDialog`.

- [ ] **Step 6: Verify no Google references remain and lint passes**

Run: `grep -nE "google|Google|signInWithOAuth" components/AuthDialog.tsx`
Expected: no matches.

Run: `npx eslint components/AuthDialog.tsx`
Expected: no errors. (If it flags an unused `redirect` prop, apply the removal described in Step 5 and re-run until clean.)

- [ ] **Step 7: Commit**

```bash
git add components/AuthDialog.tsx
git commit -m "refactor(auth): remove Google sign-in buttons from AuthDialog"
```

---

### Task 2: Simplify `/auth/callback` (keep it for magic links)

**Files:**
- Modify: `app/auth/callback/route.ts`

- [ ] **Step 1: Remove the dead `mode === 'signup'` → `/welcome` branch**

Replace the whole file with:

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

- [ ] **Step 2: Verify no `mode`/`welcome` references remain in the route**

Run: `grep -nE "mode|welcome" app/auth/callback/route.ts`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add app/auth/callback/route.ts
git commit -m "refactor(auth): drop dead signup/welcome branch from auth callback"
```

---

### Task 3: Delete `/welcome` page and `parseGoogleName`

**Files:**
- Delete: `app/welcome/page.tsx`
- Delete: `lib/__tests__/utils.googleName.test.ts`
- Modify: `lib/utils.ts` (remove `parseGoogleName`, lines ~636-659)
- Modify: `proxy.ts` (remove `/welcome` from `AUTH_REQUIRED`)

- [ ] **Step 1: Delete the welcome page and the parseGoogleName test**

```bash
git rm app/welcome/page.tsx lib/__tests__/utils.googleName.test.ts
```

Also remove the now-empty `app/welcome/` directory if git left it:

```bash
rmdir app/welcome 2>/dev/null || true
```

- [ ] **Step 2: Remove `parseGoogleName` from `lib/utils.ts`**

Delete the JSDoc comment and function (currently lines ~636-659), i.e. this block:

```ts
/**
 * Parses first and last name from Supabase Google OAuth user_metadata.
 * Priority: given_name/family_name fields → split full_name → split name → empty strings.
 */
export function parseGoogleName(meta: Record<string, unknown>): { firstName: string; lastName: string } {
  const givenName = typeof meta.given_name === 'string' ? meta.given_name : null
  const familyName = typeof meta.family_name === 'string' ? meta.family_name : null

  if (givenName !== null || familyName !== null) {
    return { firstName: givenName ?? '', lastName: familyName ?? '' }
  }

  const fullStr = typeof meta.full_name === 'string'
    ? meta.full_name
    : typeof meta.name === 'string'
      ? meta.name
      : ''

  const parts = fullStr.trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  }
}
```

Leave the surrounding functions (`formatWeekDate` helper above, `MILESTONE_SET` below) intact.

- [ ] **Step 3: Remove `/welcome` from `AUTH_REQUIRED` in `proxy.ts`**

Change (line 7):

```ts
const AUTH_REQUIRED = ['/settings', '/welcome']
```

to:

```ts
const AUTH_REQUIRED = ['/settings']
```

- [ ] **Step 4: Verify no references to removed symbols remain anywhere**

Run: `grep -rnE "parseGoogleName|/welcome|welcome/page" --include="*.ts" --include="*.tsx" . | grep -v node_modules`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(auth): remove dead welcome page and parseGoogleName after Google SSO removal"
```

---

### Task 4: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Type-check / build**

Run: `npm run build`
Expected: build succeeds with no type errors and no "module not found" for the deleted files.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Test suite**

Run: `npm test`
Expected: all tests pass. The removed `utils.googleName.test.ts` no longer runs; no other test referenced it.

- [ ] **Step 4: Final grep sweep**

Run: `grep -rnE "signInWithOAuth|GoogleIcon|handleGoogleSignIn|parseGoogleName" --include="*.ts" --include="*.tsx" . | grep -v node_modules`
Expected: no matches.

---

## Manual step (user, not part of code changes)

In the Supabase Dashboard: **Auth → Providers → disable Google.** This stops the OAuth flow server-side. Optionally verify post-deploy by signing into a real Google-created account via the emailed 6-digit code and confirming it lands on the same existing profile, and by clicking an emailed magic **link** to confirm `/auth/callback` still works.
