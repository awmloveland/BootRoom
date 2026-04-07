# Google SSO Onboarding Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three bugs in the Google SSO signup flow: blank name fields on the welcome page, missing join request dialog after OAuth redirect, and join request never reaching the admin.

**Architecture:** Extract name-parsing to a testable utility, update the welcome page to use it, and update `LeagueJoinArea` to (a) pass the current league URL + `?open_join=1` as the OAuth redirect and (b) detect that param on mount to auto-open `JoinRequestDialog`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase Auth, Jest

---

### Task 1: Extract and test `parseGoogleName` utility

**Files:**
- Modify: `lib/utils.ts`
- Create: `lib/__tests__/utils.googleName.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/utils.googleName.test.ts`:

```ts
import { parseGoogleName } from '../utils'

describe('parseGoogleName', () => {
  it('uses given_name and family_name when present', () => {
    expect(parseGoogleName({ given_name: 'Lucia', family_name: 'Hormel' })).toEqual({
      firstName: 'Lucia',
      lastName: 'Hormel',
    })
  })

  it('falls back to splitting full_name when given_name/family_name absent', () => {
    expect(parseGoogleName({ full_name: 'Lucia Hormel' })).toEqual({
      firstName: 'Lucia',
      lastName: 'Hormel',
    })
  })

  it('falls back to splitting name when full_name also absent', () => {
    expect(parseGoogleName({ name: 'Lucia Hormel' })).toEqual({
      firstName: 'Lucia',
      lastName: 'Hormel',
    })
  })

  it('handles single-word name (no last name)', () => {
    expect(parseGoogleName({ name: 'Lucia' })).toEqual({
      firstName: 'Lucia',
      lastName: '',
    })
  })

  it('handles multi-word last name', () => {
    expect(parseGoogleName({ name: 'Mary Jo Smith' })).toEqual({
      firstName: 'Mary',
      lastName: 'Jo Smith',
    })
  })

  it('returns empty strings when no metadata present', () => {
    expect(parseGoogleName({})).toEqual({ firstName: '', lastName: '' })
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npx jest lib/__tests__/utils.googleName.test.ts --no-coverage
```

Expected: FAIL — `parseGoogleName is not exported from '../utils'`

- [ ] **Step 3: Add `parseGoogleName` to `lib/utils.ts`**

Add this function anywhere in `lib/utils.ts` (after the existing exports):

```ts
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

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npx jest lib/__tests__/utils.googleName.test.ts --no-coverage
```

Expected: PASS — 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.googleName.test.ts
git commit -m "feat: add parseGoogleName utility with fallback name parsing"
```

---

### Task 2: Use `parseGoogleName` in the welcome page

**Files:**
- Modify: `app/welcome/page.tsx`

- [ ] **Step 1: Update the `loadMeta` effect in `WelcomeForm`**

In `app/welcome/page.tsx`, update the import at the top to include `parseGoogleName`:

```ts
import { parseGoogleName } from '@/lib/utils'
```

Then replace the existing `loadMeta` async function (lines 22–32) with:

```ts
useEffect(() => {
  async function loadMeta() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/sign-in'); return }
    const { firstName, lastName } = parseGoogleName(user.user_metadata ?? {})
    setFirstName(firstName)
    setLastName(lastName)
    setLoading(false)
  }
  loadMeta()
}, [router])
```

- [ ] **Step 2: Run the full test suite to confirm nothing broke**

```bash
npx jest --no-coverage
```

Expected: All existing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add app/welcome/page.tsx
git commit -m "fix: pre-populate name fields from Google SSO metadata on welcome page"
```

---

### Task 3: Fix `LeagueJoinArea` — correct redirect and auto-open join dialog

**Files:**
- Modify: `components/LeagueJoinArea.tsx`

This task has two sub-goals:
- Pass `${pathname}?open_join=1` as `redirect` to `AuthDialog` so the user lands back on the league page after Google OAuth
- Detect `open_join=1` on mount and auto-open `JoinRequestDialog`

- [ ] **Step 1: Update imports**

Replace the existing import block at the top of `components/LeagueJoinArea.tsx`:

```ts
'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { SlidersHorizontal, Link as LinkIcon, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JoinRequestDialog } from '@/components/JoinRequestDialog'
import { AuthDialog } from '@/components/AuthDialog'
import type { JoinRequestStatus } from '@/lib/types'
```

- [ ] **Step 2: Add `SearchParamsReader` sub-component**

Add this component before the `LeagueJoinArea` function definition:

```tsx
function SearchParamsReader({
  joinStatus,
  onAutoOpen,
}: {
  joinStatus: JoinRequestStatus | 'member' | 'not-member' | null
  onAutoOpen: () => void
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (searchParams.get('open_join') !== '1') return
    // Only auto-open if the user is not already a member or pending
    const isJoinable =
      joinStatus === null ||
      joinStatus === 'none' ||
      joinStatus === 'declined' ||
      joinStatus === 'not-member'
    if (isJoinable) {
      onAutoOpen()
    }
    // Clean the URL regardless (remove the param)
    router.replace(pathname)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
```

- [ ] **Step 3: Update `LeagueJoinArea` to use `pathname` and pass the correct redirect**

Replace the `LeagueJoinArea` function signature and body. The full updated component:

```tsx
export function LeagueJoinArea({ leagueId, leagueName, joinStatus, isAdmin, pendingRequestCount = 0 }: LeagueJoinAreaProps) {
  const [showToast, setShowToast] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [authDialogOpen, setAuthDialogOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    if (showToast) {
      const id = setTimeout(() => setShowToast(false), 2000)
      return () => clearTimeout(id)
    }
  }, [showToast])

  function handleShareClick() {
    navigator.clipboard.writeText(window.location.href).catch(() => {})
    setShowToast(true)
  }

  function handleJoinClick() {
    if (joinStatus === null) {
      setAuthDialogOpen(true)
    } else {
      setDialogOpen(true)
    }
  }

  const showJoin = joinStatus === null || joinStatus === 'not-member' || joinStatus === 'none' || joinStatus === 'declined'
  const showPending = joinStatus === 'pending'
  const showShare = isMemberStatus(joinStatus)

  // Redirect destination after Google OAuth: return to this league page and auto-open join dialog
  const joinRedirect = `${pathname}?open_join=1`

  return (
    <>
      <div className="flex items-center gap-2">
        {showJoin && (
          <Button
            size="xs"
            className="h-7 bg-sky-600 text-white hover:bg-sky-500"
            onClick={handleJoinClick}
          >
            <UserPlus className="mr-1.5 size-3.5" />
            Join League
          </Button>
        )}
        {showPending && (
          <Button
            size="xs"
            variant="ghost"
            disabled
            className="h-7 cursor-default text-slate-400"
          >
            Request pending
          </Button>
        )}
        {showShare && (
          <Button
            size="xs"
            variant="ghost"
            className="h-7 border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-300"
            onClick={handleShareClick}
          >
            <LinkIcon className="mr-1.5 size-3.5" />
            Share
          </Button>
        )}
        {isAdmin && (
          <div className="relative">
            <Button
              asChild
              size="xs"
              variant="ghost"
              className="w-7 p-0 border border-slate-700 text-slate-500 hover:bg-slate-800 hover:text-slate-400"
            >
              <Link href={`/${leagueId}/settings`} aria-label="League settings">
                <SlidersHorizontal className="size-4" />
              </Link>
            </Button>
            {pendingRequestCount > 0 && (
              <span
                aria-label={`${pendingRequestCount} pending request${pendingRequestCount === 1 ? '' : 's'}`}
                className="pointer-events-none absolute right-0.5 top-0.5 size-2 rounded-full bg-red-500 ring-1 ring-slate-900"
              />
            )}
          </div>
        )}
      </div>

      {/* Detect ?open_join=1 after Google OAuth signup and auto-open the join dialog */}
      <Suspense fallback={null}>
        <SearchParamsReader
          joinStatus={joinStatus}
          onAutoOpen={() => setDialogOpen(true)}
        />
      </Suspense>

      <AuthDialog
        open={authDialogOpen}
        onOpenChange={setAuthDialogOpen}
        redirect={joinRedirect}
        initialMode="signup"
        leagueName={leagueName}
        onSignedUp={() => {
          setAuthDialogOpen(false)
          setDialogOpen(true)
        }}
      />

      <JoinRequestDialog
        leagueId={leagueId}
        leagueName={leagueName}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setDialogOpen(false)}
      />

      {showToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-slate-100 shadow-lg">
          <span className="size-2 rounded-full bg-sky-500" />
          Link copied
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 4: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: All tests pass.

- [ ] **Step 5: Build check**

```bash
npx tsc --noEmit
```

Expected: No TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add components/LeagueJoinArea.tsx
git commit -m "fix: pass correct redirect for Google SSO signup and auto-open join dialog on return"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test the OTP signup path (regression check)**

1. Open a league page as an unauthenticated user
2. Click "Join League"
3. Choose "Create account" (email/OTP path)
4. Enter name, email, verify OTP code
5. Confirm: `JoinRequestDialog` opens automatically after OTP verification
6. Submit the request — confirm it appears in Settings → Members for the admin

- [ ] **Step 3: Test the Google SSO signup path (main fix)**

1. Open a league page as an unauthenticated user
2. Click "Join League"
3. Click "Sign up with Google"
4. Complete Google OAuth
5. Confirm: `/welcome` page shows the name pre-populated from Google (first + last)
6. Submit the welcome form
7. Confirm: redirected back to the league page (not `/`)
8. Confirm: `JoinRequestDialog` opens automatically
9. Confirm: the player-link step is visible in the dialog
10. Submit the request — confirm it appears in Settings → Members for the admin

- [ ] **Step 4: Test edge case — existing user signs in via Google**

1. Sign in via Google with an account that is **not** a member of the league
2. Navigate to the league page manually
3. Confirm: `JoinRequestDialog` does NOT auto-open (no `open_join` param in URL)

- [ ] **Step 5: Test edge case — user with pending request returns to league page**

1. User has `joinStatus === 'pending'` and somehow lands on `/?open_join=1`
2. Confirm: dialog does NOT auto-open (param is cleaned from URL silently)
