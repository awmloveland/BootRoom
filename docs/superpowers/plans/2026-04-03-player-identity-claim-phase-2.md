# Player Identity Claim — Phase 2: Member Settings UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the League identity section to `/settings` so members can view and manage their player claim for each league they belong to. Phase 1 must be merged first.

**Architecture:** A shared `PlayerClaimPicker` component handles the searchable player list and is reused across phases 2, 3, and 4. The settings page fetches all leagues (already done) and all the user's claims in one request (`GET /api/player-claims`), then joins them client-side to build per-league rows.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, `cn()` from `@/lib/utils`, `lucide-react` icons. No new libraries.

**Prerequisite:** Phase 1 merged. All API routes and RPCs exist.

---

## File Map

| Action | File |
|---|---|
| Create | `components/PlayerClaimPicker.tsx` |
| Modify | `app/settings/page.tsx` |

---

### Task 1: PlayerClaimPicker component

This is a reusable inline picker used in settings (Phase 2), admin member list (Phase 3), and the join dialog (Phase 4). Keep it focused: fetch unclaimed names, render search + list, call a callback when a name is submitted.

**Files:**
- Create: `components/PlayerClaimPicker.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/PlayerClaimPicker.tsx
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface PlayerClaimPickerProps {
  leagueId: string
  onSubmit: (playerName: string) => Promise<void>
  onCancel: () => void
  submitLabel?: string
}

export function PlayerClaimPicker({
  leagueId,
  onSubmit,
  onCancel,
  submitLabel = 'Submit claim',
}: PlayerClaimPickerProps) {
  const [players, setPlayers] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await fetch(`/api/league/${leagueId}/player-claims/unclaimed`, {
          credentials: 'include',
        })
        if (!res.ok) throw new Error('Failed to load players')
        const data: string[] = await res.json()
        setPlayers(data)
      } catch {
        setError('Could not load player list.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [leagueId])

  const filtered = players.filter((p) =>
    p.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSubmit() {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(selected)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">
        Select your name to link your match history to your account.
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">Loading players…</p>
      ) : (
        <>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search players…"
            className={cn(
              'w-full px-3 py-2 rounded-lg text-sm',
              'bg-slate-900 border border-slate-700',
              'text-slate-100 placeholder-slate-500',
              'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent'
            )}
          />

          {filtered.length === 0 ? (
            <p className="text-sm text-slate-500 italic">No matching players.</p>
          ) : (
            <ul className="max-h-40 overflow-y-auto rounded-lg border border-slate-700 divide-y divide-slate-700/50">
              {filtered.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => setSelected(name)}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      selected === name
                        ? 'bg-sky-700/40 text-sky-200'
                        : 'text-slate-300 hover:bg-slate-700/50'
                    )}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <p className="text-xs text-slate-600">
        Can&apos;t find your name? You may have played before records began — mention it to the admin.
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1.5 rounded border border-slate-600 text-slate-400 text-sm hover:border-slate-500 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selected || submitting}
          className={cn(
            'px-3 py-1.5 rounded text-sm font-medium transition-colors',
            'bg-sky-600 hover:bg-sky-500 text-white',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          {submitting ? 'Submitting…' : submitLabel}
        </button>
      </div>
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
git add components/PlayerClaimPicker.tsx
git commit -m "feat: add PlayerClaimPicker reusable component"
```

---

### Task 2: League identity section in /settings

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Read the current file before editing**

Read `app/settings/page.tsx` in full. Note the existing state variables, the `useEffect` that loads `email` and `display_name`, and where the form renders. The new section goes below the save form.

- [ ] **Step 2: Add claim state and fetch logic**

In the `AccountSettingsPage` component, add after the existing state declarations:

```tsx
const [claims, setClaims] = useState<import('@/lib/types').PlayerClaim[]>([])
const [games, setGames] = useState<import('@/lib/types').Game[]>([])
const [claimsLoading, setClaimsLoading] = useState(true)
const [expandedLeagueId, setExpandedLeagueId] = useState<string | null>(null)
const [cancellingClaimId, setCancellingClaimId] = useState<string | null>(null)
const [claimError, setClaimError] = useState<string | null>(null)
```

Add the import at the top of the file:
```tsx
import type { PlayerClaim, Game } from '@/lib/types'
import { fetchGames } from '@/lib/data'
import { PlayerClaimPicker } from '@/components/PlayerClaimPicker'
```

In the existing `useEffect` that loads user data, after `setLoading(false)`, add a second parallel fetch for games and claims:

```tsx
// Fetch leagues and claims in parallel
const [gamesData, claimsRes] = await Promise.all([
  fetchGames(),
  fetch('/api/player-claims', { credentials: 'include' }),
])
setGames(gamesData)
if (claimsRes.ok) {
  const claimsData = await claimsRes.json()
  setClaims(Array.isArray(claimsData) ? claimsData : [])
}
setClaimsLoading(false)
```

- [ ] **Step 3: Add action handlers**

Add these functions inside the component (after the existing `saveDisplayName` function):

```tsx
async function submitClaim(leagueId: string, playerName: string) {
  const res = await fetch(`/api/league/${leagueId}/player-claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_name: playerName }),
    credentials: 'include',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Failed to submit claim')
  // Refetch claims
  const updated = await fetch('/api/player-claims', { credentials: 'include' })
  if (updated.ok) setClaims(await updated.json())
  setExpandedLeagueId(null)
}

async function cancelClaim(claimId: string) {
  setCancellingClaimId(claimId)
  setClaimError(null)
  try {
    const res = await fetch(
      `/api/league/${claims.find((c) => c.id === claimId)?.game_id}/player-claims/${claimId}`,
      { method: 'DELETE', credentials: 'include' }
    )
    if (!res.ok && res.status !== 204) {
      const data = await res.json().catch(() => ({}))
      setClaimError(data.error ?? 'Failed to cancel claim')
      return
    }
    setClaims((prev) => prev.filter((c) => c.id !== claimId))
  } catch {
    setClaimError('Something went wrong.')
  } finally {
    setCancellingClaimId(null)
  }
}
```

- [ ] **Step 4: Add the League identity section to the JSX**

After the closing `</form>` tag (or the existing save button section), add the League identity section. Find the return statement and add this section after the account form card:

```tsx
{/* League identity section */}
<div className="rounded-xl border border-slate-700 bg-slate-800 p-5 space-y-1">
  <h2 className="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">
    League identity
  </h2>
  <p className="text-xs text-slate-500 mb-4">
    Link your account to your player profile in each league. Your stats and match history
    will be tied to your account once approved.
  </p>

  {claimsLoading ? (
    <p className="text-sm text-slate-500">Loading…</p>
  ) : games.length === 0 ? (
    <p className="text-sm text-slate-500">You haven&apos;t joined any leagues yet.</p>
  ) : (
    <div className="divide-y divide-slate-700/50">
      {games.map((game) => {
        const claim = claims.find((c) => c.game_id === game.id) ?? null
        const isExpanded = expandedLeagueId === game.id
        const effectiveName = claim?.admin_override_name ?? claim?.player_name ?? null

        return (
          <div key={game.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p className="text-sm font-medium text-slate-200">{game.name}</p>
                {!claim && !isExpanded && (
                  <p className="text-xs text-slate-500 mt-0.5">No player profile linked</p>
                )}
                {claim?.status === 'pending' && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="size-1.5 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-xs text-amber-400">
                      Pending — claimed as{' '}
                      <span className="text-slate-300">{claim.player_name}</span>
                    </p>
                  </div>
                )}
                {claim?.status === 'approved' && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <p className="text-xs text-emerald-400">
                      Linked as <span className="font-medium">{effectiveName}</span>
                    </p>
                  </div>
                )}
                {claim?.status === 'rejected' && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="size-1.5 rounded-full bg-red-400 shrink-0" />
                    <p className="text-xs text-red-400">
                      Claim for <span className="text-slate-300">{claim.player_name}</span> was not approved
                    </p>
                  </div>
                )}
              </div>

              <div className="shrink-0">
                {!claim && !isExpanded && (
                  <button
                    type="button"
                    onClick={() => setExpandedLeagueId(game.id)}
                    className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors"
                  >
                    Claim profile
                  </button>
                )}
                {claim?.status === 'pending' && (
                  <button
                    type="button"
                    onClick={() => cancelClaim(claim.id)}
                    disabled={cancellingClaimId === claim.id}
                    className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-50 transition-colors"
                  >
                    {cancellingClaimId === claim.id ? '…' : 'Cancel claim'}
                  </button>
                )}
              </div>
            </div>

            {/* Expanded picker — shown for no-claim or rejected states */}
            {(isExpanded || claim?.status === 'rejected') && (
              <div className="mt-3 p-3 rounded-lg bg-slate-900 border border-slate-700">
                <PlayerClaimPicker
                  leagueId={game.id}
                  onSubmit={(name) => submitClaim(game.id, name)}
                  onCancel={() => setExpandedLeagueId(null)}
                  submitLabel={claim?.status === 'rejected' ? 'Resubmit claim' : 'Submit claim'}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )}

  {claimError && <p className="text-sm text-red-400 pt-2">{claimError}</p>}
</div>
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Smoke-test in the browser**

Navigate to `/settings`. Confirm:
- The League identity section appears below the account form
- Each league shows the correct state (no claim → "Claim profile" link)
- Clicking "Claim profile" expands the picker inline
- Selecting a player and submitting transitions to pending state (amber dot)
- Clicking "Cancel claim" removes the pending row and reverts to no-claim state
- Approving via Supabase SQL directly and reloading shows green "Linked as [name]"

- [ ] **Step 7: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: add League identity section to /settings page"
```
