# Remove Self-Service Sign-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surgically remove all self-service sign-up functionality, leaving sign-in and forgot-password flows intact.

**Architecture:** Five targeted file edits — strip the signup branch from AuthDialog, delete the sign-up API route, and remove "Join" buttons from the two public-facing header components. No new files, no structural changes.

**Tech Stack:** Next.js 14 App Router, TypeScript, React, Tailwind CSS, Supabase Auth

---

### Task 1: Strip signup mode from AuthDialog

**Files:**
- Modify: `components/AuthDialog.tsx`

The `AuthMode` type currently has three values: `'signin' | 'signup' | 'forgot'`. We're removing `signup`. This touches: the type, the `username` state variable, the signup branch in `handleSubmit`, the username form field, the password field's signup-specific props, the submit button label ternary, the "Don't have an account?" toggle link, the `TITLES` map, the `DialogDescription` ternary, and the "Join" button in the default trigger.

- [ ] **Step 1: Update `AuthMode` type and remove username state**

In `components/AuthDialog.tsx`, replace:
```ts
type AuthMode = 'signin' | 'signup' | 'forgot'
```
with:
```ts
type AuthMode = 'signin' | 'forgot'
```

And remove the `username` state line and its setter:
```ts
// remove this line:
const [username, setUsername] = useState('')
```

- [ ] **Step 2: Remove the signup branch from handleSubmit**

Replace the entire `handleSubmit` function body with the sign-in-only version:

```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault()
  setLoading(true)
  setMessage(null)

  const supabase = createClient()

  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      let msg = error.message
      if (/invalid|credentials/i.test(msg)) {
        msg = 'Invalid email or password. Use "Forgot password?" to set a new one.'
      } else if (/email not confirmed/i.test(msg)) {
        msg = 'Check your email and click the confirmation link first.'
      }
      throw new Error(msg)
    }
    const { error: claimErr } = await supabase.rpc('claim_profile')
    if (claimErr) {
      setMessage({ type: 'error', text: `Profile setup failed: ${claimErr.message}` })
      return
    }
    onSuccess()
    router.push(redirect)
    router.refresh()
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    const isNetwork = /fetch|network|connection|failed/i.test(msg)
    setMessage({
      type: 'error',
      text: isNetwork
        ? 'Network error. The API may be unreachable—check deployment or try again.'
        : msg,
    })
  } finally {
    setLoading(false)
  }
}
```

- [ ] **Step 3: Remove signup-specific form elements**

Inside the returned form JSX, remove:
1. The entire username conditional block:
```tsx
// remove this block entirely:
{mode === 'signup' && (
  <div>
    <label htmlFor="auth-username" ...>Username</label>
    <input id="auth-username" ... />
  </div>
)}
```

2. Change the password input to remove signup-specific props:
```tsx
// before:
minLength={mode === 'signup' ? 6 : undefined}
placeholder={mode === 'signup' ? 'At least 6 characters' : undefined}

// after: remove both lines entirely
```

3. Change the submit button label:
```tsx
// before:
{loading ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}

// after:
{loading ? 'Please wait…' : 'Sign in'}
```

4. Remove the "Don't have an account?" toggle button entirely:
```tsx
// remove this button:
<button
  type="button"
  onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(null) }}
  className="block text-sm text-slate-400 hover:text-slate-300"
>
  {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
</button>
```

- [ ] **Step 4: Update TITLES map and DialogDescription**

Replace `TITLES`:
```ts
// before:
const TITLES: Record<AuthMode, string> = {
  signin: 'Sign in',
  signup: 'Create account',
  forgot: 'Reset password',
}

// after:
const TITLES: Record<AuthMode, string> = {
  signin: 'Sign in',
  forgot: 'Reset password',
}
```

Replace `DialogDescription`:
```tsx
// before:
<DialogDescription>
  {mode === 'signup'
    ? 'Create a new account to join a league.'
    : mode === 'forgot'
      ? 'We'll send you a reset link.'
      : 'Sign in to access your leagues.'}
</DialogDescription>

// after:
<DialogDescription>
  {mode === 'forgot'
    ? 'We\u2019ll send you a reset link.'
    : 'Sign in to access your leagues.'}
</DialogDescription>
```

- [ ] **Step 5: Remove the "Join" button from the default trigger**

Replace the default trigger block:
```tsx
// before:
<div className="flex items-center gap-2">
  <Button size={size} onClick={() => openAs('signin')}>
    Log in
  </Button>
  <Button size={size} variant="secondary" onClick={() => openAs('signup')}>
    Join
  </Button>
</div>

// after:
<Button size={size} onClick={() => openAs('signin')}>
  Log in
</Button>
```

- [ ] **Step 6: Verify the file compiles**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors related to `AuthDialog.tsx`

- [ ] **Step 7: Commit**

```bash
git add components/AuthDialog.tsx
git commit -m "feat: remove signup mode from AuthDialog"
```

---

### Task 2: Delete the sign-up API route

**Files:**
- Delete: `app/api/auth/sign-up/route.ts`

- [ ] **Step 1: Delete the file**

```bash
rm app/api/auth/sign-up/route.ts
```

- [ ] **Step 2: Verify no remaining imports or references**

```bash
grep -r "api/auth/sign-up" . --include="*.ts" --include="*.tsx"
```
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: delete sign-up API route"
```

---

### Task 3: Remove "Join" from WebsiteHeader

**Files:**
- Modify: `components/WebsiteHeader.tsx`

- [ ] **Step 1: Remove the Join button and its import dependency**

Replace the `<nav>` block:
```tsx
// before:
<nav className="flex items-center gap-2">
  <Button size="xs" asChild>
    <Link href="/sign-in">Log in</Link>
  </Button>
  <Button size="xs" variant="secondary" asChild>
    <Link href="/sign-in?mode=signup">Join</Link>
  </Button>
</nav>

// after:
<nav className="flex items-center gap-2">
  <Button size="xs" asChild>
    <Link href="/sign-in">Log in</Link>
  </Button>
</nav>
```

- [ ] **Step 2: Commit**

```bash
git add components/WebsiteHeader.tsx
git commit -m "feat: remove Join button from WebsiteHeader"
```

---

### Task 4: Remove "Join" from PublicHeader

**Files:**
- Modify: `components/PublicHeader.tsx`

- [ ] **Step 1: Remove signUpHref and the Join button**

Remove the `signUpHref` variable:
```ts
// remove this line:
const signUpHref = `/sign-in?mode=signup&redirect=${redirectParam}`
```

Replace the unauthenticated auth block:
```tsx
// before:
<div className="flex items-center gap-2">
  <Button size="xs" asChild>
    <a href={signInHref}>Log in</a>
  </Button>
  <Button size="xs" variant="secondary" asChild>
    <a href={signUpHref}>Join</a>
  </Button>
</div>

// after:
<Button size="xs" asChild>
  <a href={signInHref}>Log in</a>
</Button>
```

- [ ] **Step 2: Commit**

```bash
git add components/PublicHeader.tsx
git commit -m "feat: remove Join button from PublicHeader"
```

---

### Task 5: Remove dead signup prop from Navbar interface

**Files:**
- Modify: `components/ui/navbar.tsx`

The `NavbarProps.auth` interface declares a `signup?` field that is never rendered. Remove it.

- [ ] **Step 1: Remove the dead signup field**

```ts
// before:
auth?: {
  login?: { text: string; url: string }
  signup?: { text: string; url: string }
  signOut?: { text: string; onSignOut: () => void }
}

// after:
auth?: {
  login?: { text: string; url: string }
  signOut?: { text: string; onSignOut: () => void }
}
```

- [ ] **Step 2: Run final type check**

```bash
npx tsc --noEmit
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/ui/navbar.tsx
git commit -m "chore: remove dead signup prop from Navbar interface"
```
