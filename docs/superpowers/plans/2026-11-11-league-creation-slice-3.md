# League creation, slice 3: inline Account step — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-out visitor on `/new` creates an account or signs in with an email code, inline in the wizard shell, and continues into the league setup signed in.

**Architecture:** The proxy stops guarding the pre-creation URLs; the page renders a client `AccountStep` when there is no session. The Supabase OTP calls move into `lib/supabase/otp.ts`, shared with the existing dialog forms. A session cookie set before the post-verify reload tells the server pages to count Account as step 1 of 7.

**Tech Stack:** Next.js 16, React 19, Supabase Auth (email OTP), Tailwind v4, Jest with jsdom for the component test.

**Spec:** `docs/superpowers/specs/2026-11-11-league-creation-slice-3-design.md`. **Branch:** `awmloveland/league-creation-account`, stacked on `awmloveland/league-creation-roster` (PR #195).

---

## File map

| File | Responsibility |
|---|---|
| `lib/supabase/otp.ts` | The four OTP calls |
| `components/AuthForms.tsx` | Calls the helpers instead of the client directly |
| `proxy.ts`, `__tests__/proxy-sign-in-redirect.test.ts` | Guard only `/new/[slug]/…` |
| `components/new-league/StepShell.tsx` | `NEW_VISITOR_COOKIE`, `StepEyebrow` offset |
| `components/new-league/AccountStep.tsx` | The three-stage account screen |
| `__tests__/account-step.test.tsx` | Its test |
| `app/new/[[...step]]/page.tsx` | Session check, cookie read, offset |
| `components/new-league/NewLeagueWizard.tsx`, `RosterScreen.tsx`, `RosterWizard.tsx`, the six step files | `stepOffset` prop |

---

### Task 1: OTP helpers and the dialog forms

**Files:**
- Create: `lib/supabase/otp.ts`
- Modify: `components/AuthForms.tsx`

- [ ] **Step 1: Helpers**

```ts
// lib/supabase/otp.ts
// The Supabase Auth calls behind email codes, shared by the sign-in dialog
// (components/AuthForms.tsx) and the league setup Account step. Each returns
// an error message for the screen, or null on success. Callers pass emails
// already trimmed and lower-cased.
import { createClient } from '@/lib/supabase/client'

/** Supabase's wording when a sign-in is attempted for an email with no account. */
export const NO_ACCOUNT = /user.not.found|no user|signups not allowed/i

export async function sendSignInCode(email: string): Promise<string | null> {
  const { error } = await createClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  return error?.message ?? null
}

export async function sendSignUpCode(firstName: string, lastName: string, email: string): Promise<string | null> {
  const { error } = await createClient().auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      data: { first_name: firstName, last_name: lastName, display_name: `${firstName} ${lastName}`.trim() },
    },
  })
  return error?.message ?? null
}

/** A second code for the same email, whichever way the first was requested. */
export async function resendCode(email: string): Promise<string | null> {
  const { error } = await createClient().auth.signInWithOtp({ email })
  return error?.message ?? null
}

/** Verifies the code and creates the profile row for a new account. */
export async function verifyCode(email: string, code: string): Promise<string | null> {
  const supabase = createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) return 'Invalid or expired code. Try sending a new one.'
  const { error: claimErr } = await supabase.rpc('claim_profile')
  return claimErr ? `Profile setup failed: ${claimErr.message}` : null
}
```

- [ ] **Step 2: Point the dialog forms at them**

In `components/AuthForms.tsx`:
- Replace `import { createClient } from '@/lib/supabase/client'` with `import { NO_ACCOUNT, resendCode, sendSignInCode, sendSignUpCode, verifyCode } from '@/lib/supabase/otp'`.
- `VerifyStep.handleVerify`: replace everything from `const supabase = createClient()` to the `claimErr` block with
  ```ts
    const err = await verifyCode(email, code)
    if (err) {
      setMessage({ type: 'error', text: err })
      setLoading(false)
      return
    }
  ```
- `VerifyStep.handleResend`: replace the `createClient` and `signInWithOtp` lines with `const error = await resendCode(email)` and change the following `if (error)` body to `setMessage({ type: 'error', text: error })`.
- `SignInForm.handleSubmit`: replace the `createClient` and `signInWithOtp` call with `const error = await sendSignInCode(email.trim().toLowerCase())`; change the test `/user.not.found|no user|signups not allowed/i.test(error.message)` to `NO_ACCOUNT.test(error)` and the final `: error.message` to `: error`.
- `SignUpForm.handleSubmit`: replace the `createClient`, `displayName` and `signInWithOtp` block with `const error = await sendSignUpCode(firstName.trim(), lastName.trim(), email.trim().toLowerCase())` and change `setError(error.message)` to `setError(error)`.

The module comment at the top of `AuthForms.tsx` ("the Supabase browser client they need…") stays true because the helper imports it.

- [ ] **Step 3: Check**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -4`
Expected: tsc clean; every suite passes (any dialog test mocking `@/lib/supabase/client` still works because the helper imports the same module).

- [ ] **Step 4: Commit**

```bash
git add lib/supabase/otp.ts components/AuthForms.tsx
git commit -m "Move the email code calls into lib/supabase/otp

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Proxy guards only the post-creation steps

**Files:**
- Modify: `proxy.ts`
- Modify: `__tests__/proxy-sign-in-redirect.test.ts`

- [ ] **Step 1: Update the tests**

Replace the case `'sends signed-out visitors on /new to /sign-in'` with these two:

```ts
  it('leaves the pre-creation league setup steps to the page, which signs the visitor up', async () => {
    for (const path of ['/new', '/new/name', '/new/when']) {
      const res = await proxy(new NextRequest(`https://craft-football.com${path}`))
      expect(res.headers.get('location')).toBeNull()
    }
  })

  it('sends signed-out visitors on a league setup step after creation to /sign-in', async () => {
    const res = await proxy(new NextRequest('https://craft-football.com/new/hackney-thursdays/players'))
    const location = new URL(res.headers.get('location')!)
    expect(location.pathname).toBe('/sign-in')
    expect([...location.searchParams]).toEqual([['redirect', '/new/hackney-thursdays/players']])
  })
```

- [ ] **Step 2: Run to confirm the first fails**

Run: `npm test -- __tests__/proxy-sign-in-redirect.test.ts`
Expected: the pre-creation case FAILS (location is `/sign-in`), the rest pass.

- [ ] **Step 3: Change the guard**

In `proxy.ts` replace

```ts
  const isNewLeague = pathname === '/new' || pathname.startsWith('/new/')
```

with

```ts
  // Only the steps after a league exists (/new/[slug]/players…live); the
  // pre-creation steps sign a visitor up inline.
  const isNewLeague = /^\/new\/[^/]+\/[^/]+/.test(pathname)
```

In the doc comment above `proxy`, change "the league setup flow at /new" to "the league setup steps after creation under /new/[slug]".

- [ ] **Step 4: Run the tests**

Run: `npm test -- __tests__/proxy-sign-in-redirect.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add proxy.ts __tests__/proxy-sign-in-redirect.test.ts
git commit -m "Let signed-out visitors reach the league setup start

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Step offset plumbing

**Files:**
- Modify: `components/new-league/StepShell.tsx`
- Modify: `components/new-league/NewLeagueWizard.tsx`, `NameStep.tsx`, `WhereStep.tsx`, `WhenStep.tsx`
- Modify: `components/new-league/RosterScreen.tsx`, `RosterWizard.tsx`, `PlayersStep.tsx`, `MentalityStep.tsx`, `StrengthStep.tsx`
- Modify: `app/new/[[...step]]/page.tsx`

- [ ] **Step 1: StepShell**

Add after `STEP_COUNT`:

```ts
/** Set by the Account step before its reload, so the rest of the flow counts it as step 1. Session cookie, path /new. */
export const NEW_VISITOR_COOKIE = 'new-visitor'
```

Change `StepEyebrow` to:

```tsx
/** `STEP 2/6`, or `STEP 3/7` for a visitor who came through the Account step. */
export function StepEyebrow({ n, offset = 0 }: { n: number; offset?: number }) {
  return (
    <p className="inline-flex items-center gap-2 font-plex text-[9.5px] font-bold uppercase tracking-[.18em] text-[#bef264]">
      <span className="h-0.5 w-[18px] bg-[#bef264]" />
      Step {n + offset}/{STEP_COUNT + offset}
    </p>
  )
}
```

- [ ] **Step 2: Thread `stepOffset` through the wizards and steps**

- `NewLeagueWizard`: add `interface Props { stepOffset: number }`, signature `export function NewLeagueWizard({ stepOffset }: Props)`, and pass `stepOffset={stepOffset}` to `NameStep`, `WhereStep` and `WhenStep`.
- `RosterWizard`: add `stepOffset: number` to `Props`, destructure it, and pass `stepOffset={stepOffset}` to `PlayersStep`, `MentalityStep` and `StrengthStep`.
- Each of the six step files: add `stepOffset: number` to its `Props`, destructure it, and change its eyebrow to `<StepEyebrow n={…} offset={stepOffset} />` (keeping its existing `n`).
- `RosterScreen`: import `cookies` is already there; add `import { NEW_VISITOR_COOKIE } from './StepShell'` and pass `stepOffset={(await cookies()).get(NEW_VISITOR_COOKIE) ? 1 : 0}` to `RosterWizard`.
- `app/new/[[...step]]/page.tsx`: add `import { cookies } from 'next/headers'` and `import { NEW_VISITOR_COOKIE } from '@/components/new-league/StepShell'`; in `NewLeaguePage` change the last line to
  ```tsx
  const stepOffset = (await cookies()).get(NEW_VISITOR_COOKIE) ? 1 : 0
  return <NewLeagueWizard stepOffset={stepOffset} />
  ```

- [ ] **Step 3: Check and commit**

Run: `npx tsc --noEmit && npx eslint components/new-league app/new`
Expected: clean.

```bash
git add components/new-league app/new
git commit -m "Count the Account step in the eyebrow for visitors who came through it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: AccountStep

**Files:**
- Create: `components/new-league/AccountStep.tsx`
- Create: `__tests__/account-step.test.tsx`
- Modify: `app/new/[[...step]]/page.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AccountStep } from '@/components/new-league/AccountStep'
import { sendSignUpCode } from '@/lib/supabase/otp'

jest.mock('@/lib/supabase/otp', () => ({
  NO_ACCOUNT: /no user/i,
  sendSignInCode: jest.fn(),
  sendSignUpCode: jest.fn(),
  resendCode: jest.fn(),
  verifyCode: jest.fn(),
}))

beforeEach(() => jest.resetAllMocks())

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('AccountStep', () => {
  it('enables Send code only with both names and an email containing @', () => {
    render(<AccountStep />)
    const send = screen.getByRole('button', { name: 'Send code' })
    expect(send).toBeDisabled()
    fill('First name', 'Ada')
    fill('Last name', 'Lovelace')
    fill('Email', 'ada')
    expect(send).toBeDisabled()
    fill('Email', 'ada@example.com')
    expect(send).toBeEnabled()
  })

  it('switches to sign in and back', () => {
    render(<AccountStep />)
    fireEvent.click(screen.getByRole('button', { name: 'I already have an account' }))
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(screen.queryByLabelText('First name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create an account instead' }))
    expect(screen.getByRole('heading', { name: 'First, who are you?' })).toBeInTheDocument()
  })

  it('shows the code stage for the email after a successful send', async () => {
    ;(sendSignUpCode as jest.Mock).mockResolvedValue(null)
    render(<AccountStep />)
    fill('First name', 'Ada')
    fill('Last name', 'Lovelace')
    fill('Email', ' Ada@Example.com ')
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument())
    expect(sendSignUpCode).toHaveBeenCalledWith('Ada', 'Lovelace', 'ada@example.com')
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })
})
```

If `toBeDisabled` or `toBeInTheDocument` are not available, check `jest.setup.js` for `@testing-library/jest-dom`; the other `.test.tsx` files in `__tests__/` show what is set up. Follow them.

- [ ] **Step 2: Run to confirm it fails**

Run: `npm test -- __tests__/account-step.test.tsx`
Expected: FAIL, cannot find `AccountStep`.

- [ ] **Step 3: Write the component**

```tsx
// components/new-league/AccountStep.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { NO_ACCOUNT, resendCode, sendSignInCode, sendSignUpCode, verifyCode } from '@/lib/supabase/otp'
import { FIELD, NEW_VISITOR_COOKIE, OUTLINE_BUTTON, PRIMARY_BUTTON, SECONDARY_LINK, StepEyebrow, StepShell } from './StepShell'

type Stage = 'signup' | 'signin' | 'code'

/**
 * Step 1 for a signed-out visitor: create an account or sign in with an
 * email code. A verified code reloads the page at /new/name, signed in.
 */
export function AccountStep() {
  const [stage, setStage] = useState<Stage>('signup')
  // Where the code was sent from, so Change email returns there.
  const [from, setFrom] = useState<Exclude<Stage, 'code'>>('signup')
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)

  const cleanEmail = email.trim().toLowerCase()
  const canSend = cleanEmail.includes('@') && (stage === 'signin' || (first.trim() !== '' && last.trim() !== ''))

  function switchTo(next: Exclude<Stage, 'code'>) {
    setStage(next)
    setMessage(null)
  }

  async function send(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend || busy) return
    setBusy(true)
    setMessage(null)
    const err = stage === 'signin'
      ? await sendSignInCode(cleanEmail)
      : await sendSignUpCode(first.trim(), last.trim(), cleanEmail)
    setBusy(false)
    if (err) {
      setMessage({ error: true, text: NO_ACCOUNT.test(err) ? 'No account found for this email. Create one instead.' : err })
      return
    }
    setFrom(stage === 'signin' ? 'signin' : 'signup')
    setCode('')
    setStage('code')
  }

  async function resend() {
    setBusy(true)
    setMessage(null)
    const err = await resendCode(cleanEmail)
    setBusy(false)
    setMessage(err ? { error: true, text: err } : { error: false, text: 'Code resent. Check your email.' })
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 6 || busy) return
    setBusy(true)
    setMessage(null)
    const err = await verifyCode(cleanEmail, code)
    if (err) {
      setMessage({ error: true, text: err })
      setBusy(false)
      return
    }
    // The server pages read this to count Account as step 1 of 7 for the rest
    // of the flow. Busy stays true until the browser unloads the page.
    document.cookie = `${NEW_VISITOR_COOKIE}=1; path=/new; SameSite=Lax`
    window.location.href = '/new/name'
  }

  const feedback = message && (
    <p role={message.error ? 'alert' : 'status'} className={cn('mt-3 text-center font-inter-body text-[13px]', message.error ? 'text-[#e2686f]' : 'text-[#38bdf8]')}>
      {message.text}
    </p>
  )

  if (stage === 'code') {
    return (
      <form onSubmit={verify}>
        <StepShell
          eyebrow={<StepEyebrow n={0} offset={1} />}
          title="Check your email"
          sub={<>Enter the 6-digit code we sent to <span className="text-[#dff1ff]">{cleanEmail}</span></>}
          action={
            <>
              <button type="submit" className={PRIMARY_BUTTON} disabled={code.length !== 6 || busy}>
                {busy ? 'Checking…' : 'Continue'}
              </button>
              {feedback}
            </>
          }
          secondary={
            <span className="inline-flex items-center gap-3">
              <button type="button" className={SECONDARY_LINK} disabled={busy} onClick={resend}>Resend code</button>
              <span className="text-[#4f688a]">·</span>
              <button type="button" className={SECONDARY_LINK} disabled={busy} onClick={() => switchTo(from)}>Change email</button>
            </span>
          }
        >
          <input
            aria-label="6-digit code"
            className="h-16 w-full rounded-lg border border-[#38bdf8] bg-[#0a1421] text-center font-plex text-[26px] font-bold tracking-[.5em] text-[#f4f9ff] placeholder:text-[#4f688a] focus:outline-none"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="------"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            autoFocus
          />
        </StepShell>
      </form>
    )
  }

  const signin = stage === 'signin'
  return (
    <form onSubmit={send}>
      <StepShell
        eyebrow={<StepEyebrow n={0} offset={1} />}
        title={signin ? 'Welcome back' : 'First, who are you?'}
        sub={signin
          ? 'Sign in and we will pick up where you left off.'
          : 'You will be the admin of this league. Use the name your teammates know you by; it becomes your player.'}
        action={
          <>
            <button type="submit" className={PRIMARY_BUTTON} disabled={!canSend || busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
            {feedback}
            <div className="mt-[18px] flex items-center gap-3">
              <span className="h-px flex-1 bg-[#1b2c46]" />
              <span className="font-inter-body text-[12.5px] text-[#6f88a8]">or</span>
              <span className="h-px flex-1 bg-[#1b2c46]" />
            </div>
            <button type="button" className={cn(OUTLINE_BUTTON, 'mt-[18px]')} onClick={() => switchTo(signin ? 'signup' : 'signin')}>
              {signin ? 'Create an account instead' : 'I already have an account'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {!signin && (
            <div className="grid gap-3 sm:grid-cols-2">
              <input aria-label="First name" className={FIELD} placeholder="First name" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} autoFocus />
              <input aria-label="Last name" className={FIELD} placeholder="Last name" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} />
            </div>
          )}
          <input aria-label="Email" type="email" className={FIELD} placeholder="Email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={signin} />
          <p className="text-center font-inter-body text-[12.5px] text-[#6f88a8]">No password. We email you a 6-digit code.</p>
        </div>
      </StepShell>
    </form>
  )
}
```

- [ ] **Step 4: Render it from the page**

In `app/new/[[...step]]/page.tsx` add `import { getUser } from '@/lib/fetchers'` and `import { AccountStep } from '@/components/new-league/AccountStep'`, and change the end of `NewLeaguePage` to:

```tsx
  if (!(await getUser())) return <AccountStep />
  const stepOffset = (await cookies()).get(NEW_VISITOR_COOKIE) ? 1 : 0
  return <NewLeagueWizard stepOffset={stepOffset} />
```

Update the page's doc comment: "The proxy requires a session for the steps after creation; the pre-creation steps show the Account step to a signed-out visitor."

- [ ] **Step 5: Run the test, type-check, lint**

Run: `npm test -- __tests__/account-step.test.tsx && npx tsc --noEmit && npx eslint components/new-league app/new`
Expected: 3 tests pass; both clean.

- [ ] **Step 6: Check in the dev server, signed out**

With `npm run dev` running and no session: `curl -s http://localhost:3000/new | grep -o "First, who are you?"` prints the heading (the page now renders, no redirect), and `curl -sI http://localhost:3000/new/x/players | head -2` is still a 307 to sign-in.

- [ ] **Step 7: Commit**

```bash
git add components/new-league/AccountStep.tsx __tests__/account-step.test.tsx app/new
git commit -m "Add the inline Account step for signed-out visitors on /new

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Verify and open the PR

- [ ] **Step 1:** `npm test`, `npx tsc --noEmit`, `npm run build && npm run bundle-report` (the `/new` route grows by the auth client; note the number).
- [ ] **Step 2:** Manual (Will): private window, `/new`, create an account with a fresh email, enter the code, see "Step 2/7" on Name, finish to Strength "Step 7/7"; then in another private window sign in via "I already have an account"; delete any test league and, if wanted, the test account from Supabase Auth.
- [ ] **Step 3:** Push and open the PR against the slice 2 branch:

```bash
git push -u origin HEAD
gh pr create --base awmloveland/league-creation-roster --title "League creation 3/5: inline Account step" --body "$(cat <<'EOF'
## Summary
Stacked on #195. A signed-out visitor on `/new` now creates an account or signs in with an email code inline (handoff screen 1), then continues into the wizard signed in.

- The proxy guards only `/new/[slug]/…`; the pre-creation page renders `AccountStep` without a session
- Supabase OTP calls move to `lib/supabase/otp.ts`, shared with the sign-in dialog
- Visitors who came through Account see 7 steps (session cookie `new-visitor` sets the eyebrow offset); signed-in users still see 6
- No backend changes

Spec: docs/superpowers/specs/2026-11-11-league-creation-slice-3-design.md

## Test plan
- [ ] `npm test`, `npx tsc --noEmit`, `npm run build`
- [ ] Private window: create an account from `/new`, verify the code, complete the flow with 7-step numbering; sign in with an existing account via the second mode

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
