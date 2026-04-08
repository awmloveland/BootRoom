# Account Page Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the account settings page to include first name, last name, display name, member since, and a delete account action — backed by a DB migration that adds `first_name`/`last_name` columns to `profiles`.

**Architecture:** Add two nullable columns to `profiles` and backfill from `display_name`. Update the profile PATCH API to write all three name fields independently. Add a new DELETE account API using the service-role client. Redesign `app/settings/page.tsx` with two cards (Account info + Profile) and a Danger zone section. Width changes from `max-w-md` to `max-w-xl` throughout.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (PostgreSQL + Auth), Tailwind CSS, Jest (for API logic tests)

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260408000001_add_first_last_name.sql` | Create | Add `first_name`/`last_name` to `profiles`, backfill |
| `app/api/auth/profile/route.ts` | Modify | Accept `first_name`, `last_name`, `display_name` independently |
| `app/api/auth/account/route.ts` | Create | DELETE endpoint — deletes profile + auth user |
| `app/welcome/page.tsx` | Verify only | No code change needed — Task 2 API auto-derives `display_name` |
| `app/settings/page.tsx` | Modify | Full page redesign per spec |

---

## Task 1: DB migration — add first_name and last_name to profiles

**Files:**
- Create: `supabase/migrations/20260408000001_add_first_last_name.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260408000001_add_first_last_name.sql

ALTER TABLE profiles
  ADD COLUMN first_name text,
  ADD COLUMN last_name  text;

-- Backfill: split existing display_name on the first space.
-- Users with no space get first_name = full display_name, last_name = null.
UPDATE profiles
SET
  first_name = split_part(display_name, ' ', 1),
  last_name  = nullif(
    trim(substring(display_name FROM position(' ' IN display_name) + 1)),
    ''
  )
WHERE display_name IS NOT NULL AND display_name != '';
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Open your Supabase project → SQL Editor → paste and run the migration. Verify:

```sql
SELECT id, display_name, first_name, last_name FROM profiles LIMIT 5;
```

Expected: rows with `display_name = 'Will Loveland'` show `first_name = 'Will'`, `last_name = 'Loveland'`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260408000001_add_first_last_name.sql
git commit -m "feat: add first_name and last_name columns to profiles"
```

---

## Task 2: Update PATCH /api/auth/profile

**Files:**
- Modify: `app/api/auth/profile/route.ts`

The current route accepts `first_name` + `last_name` and concatenates them into `display_name`. After this change it accepts all three independently and writes each to its own column.

- [ ] **Step 1: Rewrite the route**

Replace the entire contents of `app/api/auth/profile/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { first_name, last_name, display_name } = body

  // At least one field must be present
  if (first_name === undefined && last_name === undefined && display_name === undefined) {
    return NextResponse.json({ error: 'No fields provided' }, { status: 400 })
  }

  // Validate: if a field is present, it must not be empty after trimming
  const trimmed: Record<string, string> = {}
  for (const [key, val] of Object.entries({ first_name, last_name, display_name })) {
    if (val === undefined) continue
    const t = String(val).trim()
    if (!t) return NextResponse.json({ error: `${key} cannot be empty` }, { status: 400 })
    trimmed[key] = t
  }

  // When welcome flow sends first_name + last_name without display_name,
  // derive display_name so it is also populated
  if (trimmed.first_name !== undefined && trimmed.last_name !== undefined && trimmed.display_name === undefined) {
    trimmed.display_name = `${trimmed.first_name} ${trimmed.last_name}`.trim()
  }

  const { error } = await supabase
    .from('profiles')
    .update(trimmed)
    .eq('id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Manually verify the welcome flow still works**

Sign out, accept a fresh invite link, complete the welcome form. Confirm:
- The `profiles` row has `first_name`, `last_name`, and `display_name` all populated
- The user is redirected to the expected destination

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/profile/route.ts
git commit -m "feat: update profile PATCH to write first_name, last_name, display_name independently"
```

---

## Task 3: Create DELETE /api/auth/account

**Files:**
- Create: `app/api/auth/account/route.ts`

This route deletes the user's own account. It uses the service-role client (which bypasses RLS) to call `auth.admin.deleteUser`. The `profiles` row is deleted first — FK cascades handle `game_members`, `player_claims`, etc.

- [ ] **Step 1: Create the route file**

```ts
// app/api/auth/account/route.ts
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Delete profile row — cascades to game_members, player_claims, etc.
  const { error: profileErr } = await supabase
    .from('profiles')
    .delete()
    .eq('id', user.id)

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 })
  }

  // Delete the auth user using the service-role client
  const service = createServiceClient()
  const { error: authErr } = await service.auth.admin.deleteUser(user.id)

  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Manually test the delete route**

Use a test account. From the browser console on the settings page (or via curl with a valid session cookie):

```bash
curl -X DELETE http://localhost:3000/api/auth/account \
  -H "Cookie: <your-session-cookie>"
```

Expected response: `{"ok":true}`. Verify in Supabase dashboard that the auth user and profiles row are gone.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/account/route.ts
git commit -m "feat: add DELETE /api/auth/account endpoint"
```

---

## Task 4: Update welcome page to also write display_name

**Files:**
- Modify: `app/welcome/page.tsx`

The welcome page currently sends `{ first_name, last_name }` to PATCH /api/auth/profile. The updated route now derives `display_name` automatically when both first/last are provided (Task 2 handles this). No change is needed to the request body.

- [ ] **Step 1: Verify no change needed**

Open `app/welcome/page.tsx` and confirm the `handleSubmit` body is:

```ts
body: JSON.stringify({ first_name: firstName, last_name: lastName }),
```

The Task 2 route now writes `display_name = first + ' ' + last` automatically when both are provided and `display_name` is absent from the body. No code change required in the welcome page.

- [ ] **Step 2: Smoke-test the welcome flow**

Sign out with a test account that has no profile. Accept an invite link, reach `/welcome`, fill in first + last name, submit. Check the `profiles` row:

```sql
SELECT display_name, first_name, last_name FROM profiles WHERE email = 'your-test@example.com';
```

Expected: all three columns populated.

---

## Task 5: Redesign app/settings/page.tsx

**Files:**
- Modify: `app/settings/page.tsx`

This is the main UI change. Replace the current single-form layout with the two-card design (Account info + Profile) plus Danger zone. Add `firstName`, `lastName`, `createdAt` state. Add inline two-step delete confirmation.

- [ ] **Step 1: Add new state fields and load them**

In `app/settings/page.tsx`, add state for the new fields and update the `load()` function inside `useEffect`:

```tsx
// Add alongside existing state declarations (after line ~21):
const [firstName, setFirstName] = useState('')
const [lastName, setLastName] = useState('')
const [createdAt, setCreatedAt] = useState<string | null>(null)
const [confirmDelete, setConfirmDelete] = useState(false)
const [deleting, setDeleting] = useState(false)
```

Update the `profileRes` select and the state-setting code inside `load()`:

```tsx
// Change the profiles select to include new columns:
supabase.from('profiles').select('display_name, first_name, last_name, created_at').eq('id', user.id).maybeSingle(),

// After profileRes, add:
setFirstName(profileRes.data?.first_name ?? '')
setLastName(profileRes.data?.last_name ?? '')
setCreatedAt(profileRes.data?.created_at ?? null)
```

- [ ] **Step 2: Update saveDisplayName to save all three name fields**

Replace the existing `saveDisplayName` function with `saveProfile`:

```tsx
async function saveProfile(e: React.FormEvent) {
  e.preventDefault()
  setSaving(true)
  setError(null)
  try {
    const supabase = createClient()
    const res = await fetch('/api/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        display_name: displayName.trim(),
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Failed to save')
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to save')
  } finally {
    setSaving(false)
  }
}
```

Note: remove the unused `createClient` import from the function if it's already imported at the top of the file. The fetch call doesn't need it directly.

- [ ] **Step 3: Add the handleDeleteAccount function**

```tsx
async function handleDeleteAccount() {
  setDeleting(true)
  try {
    const res = await fetch('/api/auth/account', { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? 'Failed to delete account')
    }
    // Redirect to sign-in after deletion
    window.location.href = '/sign-in'
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Failed to delete account')
    setDeleting(false)
    setConfirmDelete(false)
  }
}
```

- [ ] **Step 4: Add the formatDate helper**

Add this helper near the top of the component (above the `useEffect`):

```tsx
function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${d.getFullYear()}`
}
```

- [ ] **Step 5: Replace the JSX return**

Replace the entire `return (...)` block with:

```tsx
return (
  <main className="max-w-xl mx-auto px-4 sm:px-6 py-8">
    <h1 className="text-xl font-semibold text-slate-100 mb-6">Account</h1>

    {/* ── Account info card (read-only) ──────────────────────────────── */}
    <div className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-slate-700/60">
        <p className="text-sm font-medium text-slate-200">Account info</p>
      </div>
      <div className="divide-y divide-slate-700/40">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-slate-500">Email</p>
            <p className="text-sm text-slate-300">{email}</p>
          </div>
          <p className="text-xs text-slate-600">To change your email, contact your league admin.</p>
        </div>
        {createdAt && (
          <div className="px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">Member since</p>
            <p className="text-sm text-slate-300">{formatDate(createdAt)}</p>
          </div>
        )}
      </div>
    </div>

    {/* ── Profile card (editable) ─────────────────────────────────────── */}
    <div className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-slate-700/60">
        <p className="text-sm font-medium text-slate-200">Profile</p>
      </div>
      <form onSubmit={saveProfile} className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className="block text-xs text-slate-400 mb-1.5">
              First name
            </label>
            <input
              id="firstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Alex"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="lastName" className="block text-xs text-slate-400 mb-1.5">
              Last name
            </label>
            <input
              id="lastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Smith"
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
            />
          </div>
        </div>
        <div>
          <label htmlFor="displayName" className="block text-xs text-slate-400 mb-1.5">
            Display name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
          <p className="text-xs text-slate-500 mt-1.5">How you appear in lineups and player lists</p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end pt-1">
          <button
            type="submit"
            disabled={saving}
            className={cn(
              'px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50',
              saved ? 'bg-slate-700 text-sky-300' : 'bg-sky-600 hover:bg-sky-500 text-white'
            )}
          >
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>

    {/* ── League identity section ──────────────────────────────────────── */}
    {leagues.length > 0 && (
      <>
        <h2 className="text-xl font-semibold text-slate-100 mb-4">League identity</h2>
        <div className="space-y-3 mb-12">
          {leagues.map((league) => {
            const claim = claims[league.id]
            const status = claim?.status ?? null
            const isExpanded = expandedLeague === league.id
            const isSubmitting = claimSubmitting === league.id
            const isCancelling = cancellingLeague === league.id
            const effectiveName = claim?.admin_override_name ?? claim?.player_name

            return (
              <div
                key={league.id}
                className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-100 mb-1">{league.name}</p>
                    {status === null && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                        <span className="text-xs text-slate-400">No player profile linked</span>
                      </div>
                    )}
                    {status === 'pending' && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-xs text-slate-400">
                          Pending — claimed as{' '}
                          <span className="text-slate-300">{claim.player_name}</span>
                        </span>
                      </div>
                    )}
                    {status === 'approved' && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                        <span className="text-xs text-slate-400">
                          Linked as{' '}
                          <span className="text-slate-300">{effectiveName}</span>
                        </span>
                      </div>
                    )}
                    {status === 'rejected' && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                        <span className="text-xs text-slate-400">Claim not approved</span>
                      </div>
                    )}
                  </div>
                  {status === null && !isExpanded && (
                    <button
                      type="button"
                      onClick={() => setExpandedLeague(league.id)}
                      className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shrink-0"
                    >
                      Claim profile
                    </button>
                  )}
                  {status === null && isExpanded && (
                    <button
                      type="button"
                      onClick={() => setExpandedLeague(null)}
                      className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 text-xs hover:border-slate-500 transition-colors shrink-0"
                    >
                      Cancel
                    </button>
                  )}
                  {status === 'pending' && (
                    <button
                      type="button"
                      disabled={isCancelling}
                      onClick={() => handleCancelClaim(league.id)}
                      className="px-3 py-1.5 rounded-lg border border-red-900/60 text-red-400 text-xs hover:border-red-800 disabled:opacity-50 transition-colors shrink-0"
                    >
                      {isCancelling ? 'Cancelling…' : 'Cancel claim'}
                    </button>
                  )}
                </div>
                {(isExpanded || (status === 'rejected' && !dismissedRejected.has(league.id))) && (
                  <>
                    {claimErrors[league.id] && (
                      <p className="px-4 pb-2 text-xs text-red-400">{claimErrors[league.id]}</p>
                    )}
                    <PlayerClaimPicker
                      leagueId={league.id}
                      submitting={isSubmitting}
                      onClaim={(name) => handleClaim(league.id, name)}
                      onCancel={() => {
                        setExpandedLeague(null)
                        if (status === 'rejected') {
                          setDismissedRejected((prev) => new Set([...prev, league.id]))
                        }
                        setClaimErrors((prev) => ({ ...prev, [league.id]: '' }))
                      }}
                    />
                  </>
                )}
              </div>
            )
          })}
        </div>
      </>
    )}

    {/* ── Danger zone ──────────────────────────────────────────────────── */}
    <div className="rounded-lg border border-red-900/40 overflow-hidden mb-8">
      <div className="px-4 py-3 border-b border-red-900/30">
        <p className="text-sm font-medium text-red-400">Danger zone</p>
      </div>
      <div className="px-4 py-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-300">Delete account</p>
          <p className="text-xs text-slate-500 mt-0.5">
            Permanently removes your account and all associated data. This cannot be undone.
          </p>
        </div>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="px-3 py-1.5 rounded-lg border border-red-900/60 text-red-400 text-xs font-medium hover:bg-red-950/40 transition-colors shrink-0"
          >
            Delete account
          </button>
        ) : (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="px-3 py-1.5 rounded-lg border border-slate-600 text-slate-400 text-xs hover:border-slate-500 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="px-3 py-1.5 rounded-lg bg-red-900/60 hover:bg-red-900/80 text-red-300 text-xs font-medium disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  </main>
)
```

- [ ] **Step 6: Remove unused `saveDisplayName` reference**

The old form called `onSubmit={saveDisplayName}`. That is now replaced by `onSubmit={saveProfile}` in Step 5. Confirm there are no remaining references to `saveDisplayName` in the file:

```bash
grep -n "saveDisplayName" app/settings/page.tsx
```

Expected: no output.

- [ ] **Step 7: Run the dev server and verify the page**

```bash
npm run dev
```

Navigate to `http://localhost:3000/settings`. Verify:
- Page is wider (`max-w-xl`)
- Account info card shows email + hint + member since date
- Profile card shows first name, last name, display name inputs pre-filled from DB
- Saving the profile form updates all three fields (check in Supabase dashboard)
- Delete account shows confirmation inline on click, then "Yes, delete" / "Cancel"

- [ ] **Step 8: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: redesign account settings page with profile fields and danger zone"
```

---

## Task 6: Final check and PR

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: no errors. Fix any TypeScript or ESLint errors before continuing.

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all existing tests pass. The migration and route changes don't break any existing test logic.

- [ ] **Step 3: End-to-end smoke test**

With `npm run dev` running, walk through the full user journey:

1. Sign in as an existing user → go to `/settings` → confirm first/last name fields are pre-filled from backfill data
2. Change first name, last name, and display name → Save → confirm all three update in Supabase dashboard
3. Sign out → accept an invite link → complete `/welcome` → confirm `profiles` row has all three name columns populated
4. (With a throwaway test account) Go to `/settings` → click "Delete account" → confirm inline confirmation appears → click "Yes, delete" → confirm redirect to `/sign-in` → confirm user is gone from Supabase dashboard

- [ ] **Step 4: Push and open PR**

```bash
git push -u origin awmloveland/account-page-fields
```

Then open a PR from `awmloveland/account-page-fields` → `main`.
