# Player Identity Claim — Phase 3: Admin UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin claim review to the league settings Members tab, and add linked-player status + direct-assign action to the member list. Phases 1 and 2 must be merged first.

**Architecture:** A new `PlayerClaimsTable` component handles the standalone claims review section. `AdminMemberTable` gains a linked-player badge and a "+ Link player" inline picker per row. Both reuse `PlayerClaimPicker` from Phase 2. The league settings page wires it all together.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, `cn()` from `@/lib/utils`, `lucide-react`. No new libraries.

**Prerequisite:** Phases 1 and 2 merged. `PlayerClaimPicker` exists at `components/PlayerClaimPicker.tsx`.

---

## File Map

| Action | File |
|---|---|
| Create | `components/PlayerClaimsTable.tsx` |
| Modify | `components/AdminMemberTable.tsx` |
| Modify | `app/[leagueId]/settings/page.tsx` |

---

### Task 1: PlayerClaimsTable component

Renders pending player claims for admin review. Shows member name, claimed player name, and Reject / Link to different player / Approve actions. "Link to different player" expands an inline `PlayerClaimPicker`.

**Files:**
- Create: `components/PlayerClaimsTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/PlayerClaimsTable.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PlayerClaimPicker } from '@/components/PlayerClaimPicker'
import type { PlayerClaim } from '@/lib/types'

interface PlayerClaimsTableProps {
  leagueId: string
  initialClaims: PlayerClaim[]
  onChanged: () => void
}

export function PlayerClaimsTable({ leagueId, initialClaims, onChanged }: PlayerClaimsTableProps) {
  const [claims, setClaims] = useState<PlayerClaim[]>(
    initialClaims.filter((c) => c.status === 'pending')
  )
  const [processing, setProcessing] = useState<string | null>(null)
  const [amendingId, setAmendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function review(claimId: string, action: 'approved' | 'rejected', overrideName?: string) {
    setProcessing(claimId)
    setError(null)
    try {
      const res = await fetch(
        `/api/league/${leagueId}/player-claims/${claimId}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, override_name: overrideName ?? null }),
          credentials: 'include',
        }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Something went wrong')
        return
      }
      setClaims((prev) => prev.filter((c) => c.id !== claimId))
      onChanged()
    } catch {
      setError('Something went wrong')
    } finally {
      setProcessing(null)
      setAmendingId(null)
    }
  }

  if (claims.length === 0) return null

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800/50">
        <p className="text-sm font-medium text-slate-200">
          Player identity claims{' '}
          <span className="text-slate-500 font-normal">({claims.length})</span>
        </p>
      </div>

      <ul className="divide-y divide-slate-700/40">
        {claims.map((claim) => {
          const memberName = claim.display_name || claim.email || 'Unknown member'
          const isAmending = amendingId === claim.id

          return (
            <li key={claim.id} className="px-4 py-3 space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm text-slate-100 truncate">{memberName}</p>
                  <p className="text-xs text-slate-500 truncate">{claim.email}</p>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-xs text-amber-300">
                      Claims to be:{' '}
                      <span className="font-medium text-slate-200">{claim.player_name}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    type="button"
                    disabled={!!processing}
                    onClick={() => review(claim.id, 'rejected')}
                    className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-40 transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={!!processing}
                    onClick={() => setAmendingId(isAmending ? null : claim.id)}
                    className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-colors"
                  >
                    Link to different player {isAmending ? '▲' : '›'}
                  </button>
                  <button
                    type="button"
                    disabled={!!processing}
                    onClick={() => review(claim.id, 'approved')}
                    className={cn(
                      'text-xs font-medium text-sky-400 hover:text-sky-300',
                      'disabled:opacity-40 disabled:cursor-not-allowed transition-colors'
                    )}
                  >
                    {processing === claim.id ? '…' : 'Approve'}
                  </button>
                </div>
              </div>

              {isAmending && (
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-700">
                  <p className="text-xs text-slate-400 mb-2">
                    Select the correct player — this overrides their claim before approving.
                  </p>
                  <PlayerClaimPicker
                    leagueId={leagueId}
                    onSubmit={async (name) => review(claim.id, 'approved', name)}
                    onCancel={() => setAmendingId(null)}
                    submitLabel="Approve with this player"
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {error && (
        <p className="px-4 py-2 text-xs text-red-400 border-t border-slate-700">{error}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/PlayerClaimsTable.tsx
git commit -m "feat: add PlayerClaimsTable admin review component"
```

---

### Task 2: AdminMemberTable — linked badge + assign action

Add a green "Linked: [name]" badge for approved claims and a dashed "+ Link player" button for members with no approved claim. The assign action uses `POST /api/league/[id]/player-claims/assign`.

**Files:**
- Modify: `components/AdminMemberTable.tsx`

- [ ] **Step 1: Read the current file**

Read `components/AdminMemberTable.tsx` in full before editing. Understand the existing props: `leagueId`, `members`, `onChanged`. Note the row structure inside `members.map()`.

- [ ] **Step 2: Update props to include claims**

Update the `AdminMemberTableProps` interface to accept claims:

```tsx
import { PlayerClaimPicker } from '@/components/PlayerClaimPicker'
import type { LeagueMember, GameRole, PlayerClaim } from '@/lib/types'

interface AdminMemberTableProps {
  leagueId: string
  members: LeagueMember[]
  claims: PlayerClaim[]         // add this
  onChanged: () => void
}
```

Add state for the assign picker inside the component:

```tsx
const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
const [assignError, setAssignError] = useState<string | null>(null)
```

Add the assign handler:

```tsx
async function assignPlayer(userId: string, playerName: string) {
  setAssignError(null)
  const res = await fetch(`/api/league/${leagueId}/player-claims/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, player_name: playerName }),
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Failed to assign player')
  setAssigningUserId(null)
  onChanged()
}
```

- [ ] **Step 3: Add claim status to each member row**

Inside `members.map()`, after reading `member`, look up the claim:

```tsx
const approvedClaim = claims.find(
  (c) => c.user_id === member.user_id && c.status === 'approved'
)
const effectiveName = approvedClaim?.admin_override_name ?? approvedClaim?.player_name ?? null
const isAssigning = assigningUserId === member.user_id
```

In the row's right-side `<div className="flex items-center gap-2 shrink-0">`, add before the role buttons:

```tsx
{effectiveName ? (
  <span className={cn(
    'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border',
    'bg-emerald-900/40 text-emerald-300 border-emerald-800'
  )}>
    <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
    {effectiveName}
  </span>
) : (
  <button
    type="button"
    onClick={() => setAssigningUserId(isAssigning ? null : member.user_id)}
    disabled={!!busy}
    className={cn(
      'text-xs text-slate-500 hover:text-slate-300 border border-dashed border-slate-600',
      'hover:border-slate-500 rounded px-2 py-0.5 transition-colors disabled:opacity-40'
    )}
  >
    + Link player
  </button>
)}
```

After the closing `</div>` of the row (but inside the `<div key={member.user_id}>` wrapper), add the inline assign picker:

```tsx
{isAssigning && (
  <div className="px-4 pb-3 pt-1">
    <div className="p-3 rounded-lg bg-slate-900 border border-slate-700">
      <PlayerClaimPicker
        leagueId={leagueId}
        onSubmit={(name) => assignPlayer(member.user_id, name)}
        onCancel={() => setAssigningUserId(null)}
        submitLabel="Link player"
      />
      {assignError && <p className="text-xs text-red-400 mt-2">{assignError}</p>}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/AdminMemberTable.tsx
git commit -m "feat: add linked badge and assign picker to AdminMemberTable"
```

---

### Task 3: Wire PlayerClaimsTable into the league settings page

Fetch claims on the Members tab, pass them to `PlayerClaimsTable` and the updated `AdminMemberTable`.

**Files:**
- Modify: `app/[leagueId]/settings/page.tsx`

- [ ] **Step 1: Read the current file**

Read `app/[leagueId]/settings/page.tsx` in full. Note:
- The `Section` type and `section` state
- `membersLoading`, `members`, `loadMembers` pattern
- How `pendingRequests` and `PendingRequestsTable` are fetched and rendered on the Members tab
- The `useEffect` that triggers loads on tab change

- [ ] **Step 2: Add claims state**

After the existing `pendingRequests` / `pendingLoading` state declarations, add:

```tsx
import { PlayerClaimsTable } from '@/components/PlayerClaimsTable'
import type { PlayerClaim } from '@/lib/types'

// Inside the component:
const [pendingClaims, setPendingClaims] = useState<PlayerClaim[]>([])
const [claimsLoading, setClaimsLoading] = useState(false)
```

- [ ] **Step 3: Add loadClaims function**

After the existing `loadMembers` function, add:

```tsx
const loadClaims = useCallback(async () => {
  setClaimsLoading(true)
  try {
    const res = await fetch(`/api/league/${leagueId}/player-claims`, {
      credentials: 'include',
    })
    if (res.ok) {
      const data = await res.json()
      setPendingClaims(Array.isArray(data) ? data.filter((c: PlayerClaim) => c.status === 'pending') : [])
    }
  } finally {
    setClaimsLoading(false)
  }
}, [leagueId])
```

- [ ] **Step 4: Trigger loadClaims on the members tab**

In the `useEffect` that checks `section` and calls loaders, add `loadClaims()` alongside `loadMembers()`:

```tsx
if (section === 'members') {
  loadMembers()
  loadClaims()
  fetchInviteLink('member')
  fetchInviteLink('admin')
}
```

- [ ] **Step 5: Render PlayerClaimsTable in the Members tab JSX**

Find where `PendingRequestsTable` is rendered in the Members section. Add `PlayerClaimsTable` directly after it (between pending requests and the member list):

```tsx
{/* Standalone player identity claims — existing members who claimed from settings */}
{!claimsLoading && pendingClaims.length > 0 && (
  <PlayerClaimsTable
    leagueId={leagueId}
    initialClaims={pendingClaims}
    onChanged={() => { loadClaims(); loadMembers() }}
  />
)}
```

- [ ] **Step 6: Pass claims to AdminMemberTable**

Find the `<AdminMemberTable>` JSX and add the `claims` prop:

```tsx
<AdminMemberTable
  leagueId={leagueId}
  members={members}
  claims={pendingClaims.concat(  // include all claims, not just pending
    // The full claims list for member rows — refetch all statuses
    // For simplicity in this phase, pass pendingClaims; Phase 4 can extend
    []
  )}
  onChanged={loadMembers}
/>
```

Wait — `AdminMemberTable` needs approved claims to show the linked badge, not just pending ones. Update `loadClaims` to store all claims (not just pending) and filter at the display level:

```tsx
// Updated state
const [allClaims, setAllClaims] = useState<PlayerClaim[]>([])

// In loadClaims:
const data = await res.json()
const claims = Array.isArray(data) ? data : []
setAllClaims(claims)
setPendingClaims(claims.filter((c: PlayerClaim) => c.status === 'pending'))

// AdminMemberTable receives allClaims:
<AdminMemberTable
  leagueId={leagueId}
  members={members}
  claims={allClaims}
  onChanged={() => { loadMembers(); loadClaims() }}
/>
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 8: Smoke-test in the browser**

As admin, go to league settings → Members tab. Confirm:
- "Player identity claims" section appears when pending claims exist (submit one via /settings as a member first)
- Approve/reject actions remove the claim from the list
- "Link to different player" expands the picker inline and submits with the override name
- Members list shows green linked badge for approved claims
- "+ Link player" button appears for unlinked members and opens the picker

- [ ] **Step 9: Commit**

```bash
git add "app/[leagueId]/settings/page.tsx"
git commit -m "feat: add PlayerClaimsTable and member linked state to league settings"
```
