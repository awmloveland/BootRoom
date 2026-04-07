# Players Tab — Link Member Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow admins to link a player to a member account directly from the Players tab in league settings, mirroring the existing link-player flow on the Members tab.

**Architecture:** Extend `PlayerAttribute` with optional linked-member fields; modify the players API to join `game_members` via the existing `get_league_members` RPC to populate those fields; add a `MemberLinkPicker` component (mirrors `PlayerClaimPicker`); update `PlayerRosterPanel` to show a linked badge or inline picker per row.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, Supabase, Jest + ts-jest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/types.ts` | Modify | Add `linked_user_id` and `linked_display_name` to `PlayerAttribute` |
| `app/api/league/[id]/players/route.ts` | Modify | Join `get_league_members` RPC data to return linked member info per player |
| `components/MemberLinkPicker.tsx` | Create | Inline picker showing unlinked members — mirrors `PlayerClaimPicker` |
| `components/PlayerRosterPanel.tsx` | Modify | Linked badge + `+ Link member` button + inline `MemberLinkPicker` per row |
| `__tests__/player-roster.test.ts` | Modify | Cover new optional fields on `PlayerAttribute` |

---

## Task 1: Extend `PlayerAttribute` type and update its test

**Files:**
- Modify: `lib/types.ts`
- Modify: `__tests__/player-roster.test.ts`

- [ ] **Step 1: Add the new optional fields to `PlayerAttribute` in `lib/types.ts`**

Find the existing `PlayerAttribute` interface (around line 24) and replace it:

```ts
export interface PlayerAttribute {
  name: string;
  rating: number;   // 1–3
  mentality: Mentality;
  linked_user_id?: string | null;
  linked_display_name?: string | null;
}
```

- [ ] **Step 2: Add a test for the new optional fields in `__tests__/player-roster.test.ts`**

Append inside the existing `describe('PlayerAttribute type', ...)` block:

```ts
it('accepts optional linked member fields', () => {
  const linked: PlayerAttribute = {
    name: 'Bob',
    rating: 1,
    mentality: 'defensive',
    linked_user_id: 'uuid-123',
    linked_display_name: 'Bob Smith',
  }
  expect(linked.linked_user_id).toBe('uuid-123')
  expect(linked.linked_display_name).toBe('Bob Smith')
})

it('accepts null linked member fields', () => {
  const unlinked: PlayerAttribute = {
    name: 'Carol',
    rating: 2,
    mentality: 'balanced',
    linked_user_id: null,
    linked_display_name: null,
  }
  expect(unlinked.linked_user_id).toBeNull()
  expect(unlinked.linked_display_name).toBeNull()
})

it('accepts missing linked member fields (undefined)', () => {
  const p: PlayerAttribute = { name: 'Dave', rating: 3, mentality: 'attacking' }
  expect(p.linked_user_id).toBeUndefined()
  expect(p.linked_display_name).toBeUndefined()
})
```

- [ ] **Step 3: Run the test to verify it passes**

```bash
npx jest __tests__/player-roster.test.ts --no-coverage
```

Expected: all tests PASS (the new tests are type-only assertions — they will pass as long as TypeScript accepts the fields).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts __tests__/player-roster.test.ts
git commit -m "feat: extend PlayerAttribute with optional linked member fields"
```

---

## Task 2: Extend the players API to return linked member info

**Files:**
- Modify: `app/api/league/[id]/players/route.ts`

- [ ] **Step 1: Replace the GET handler body**

The strategy: run the existing `player_attributes` query, then call `get_league_members` RPC (already used elsewhere) to get each member's `linked_player_name`. Build a lookup map and merge the two results.

Replace the entire file content:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/** GET — returns all players in a league with linked member info. Admin only. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [playersResult, membersResult] = await Promise.all([
    supabase
      .from('player_attributes')
      .select('name, rating, mentality')
      .eq('game_id', id)
      .order('name', { ascending: true }),
    supabase.rpc('get_league_members', { p_game_id: id }),
  ])

  if (playersResult.error) {
    return NextResponse.json({ error: playersResult.error.message }, { status: 500 })
  }

  // Build map: player_name -> { linked_user_id, linked_display_name }
  type LinkInfo = { linked_user_id: string; linked_display_name: string }
  const linkMap = new Map<string, LinkInfo>()
  for (const m of membersResult.data ?? []) {
    if (m.linked_player_name) {
      linkMap.set(m.linked_player_name, {
        linked_user_id: m.user_id,
        linked_display_name: m.display_name || m.email,
      })
    }
  }

  const result = (playersResult.data ?? []).map((p) => ({
    ...p,
    ...(linkMap.get(p.name) ?? { linked_user_id: null, linked_display_name: null }),
  }))

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/players/route.ts
git commit -m "feat: players API returns linked member info per player"
```

---

## Task 3: Create `MemberLinkPicker` component

**Files:**
- Create: `components/MemberLinkPicker.tsx`

This component mirrors `PlayerClaimPicker`. It fetches all members, filters to those without a linked player, and calls `onLink(userId, displayName)` immediately on selection.

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { LeagueMember } from '@/lib/types'

interface Props {
  leagueId: string
  onLink: (userId: string, displayName: string) => void
  onCancel: () => void
  submitting?: boolean
}

export default function MemberLinkPicker({ leagueId, onLink, onCancel, submitting = false }: Props) {
  const [members, setMembers] = useState<LeagueMember[]>([])
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch(`/api/league/${leagueId}/members`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load')
        return r.json()
      })
      .then((data: LeagueMember[]) => {
        // Only show members not already linked to a player
        setMembers(data.filter((m) => !m.linked_player_name))
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [leagueId])

  const filtered = search
    ? members.filter((m) => {
        const label = m.display_name || m.email
        return label.toLowerCase().includes(search.toLowerCase())
      })
    : members

  return (
    <div className="border-t border-slate-700 p-4 bg-slate-900/40">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search members…"
        className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm placeholder:text-slate-500 outline-none focus:border-slate-500 mb-3"
      />

      {loading ? (
        <p className="text-sm text-slate-500 mb-3">Loading…</p>
      ) : loadError ? (
        <p className="text-sm text-red-400 mb-3">Failed to load members.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500 mb-3">
          {search ? 'No members match that search.' : 'No unlinked members found.'}
        </p>
      ) : (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-700 mb-3">
          {filtered.map((m) => {
            const label = m.display_name || m.email
            return (
              <button
                key={m.user_id}
                type="button"
                disabled={submitting}
                onClick={() => onLink(m.user_id, label)}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm border-b border-slate-800 last:border-0 transition-colors',
                  'text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 text-sm hover:border-slate-600 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Only members without a linked player are shown.
      </p>
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
git add components/MemberLinkPicker.tsx
git commit -m "feat: add MemberLinkPicker component for players tab"
```

---

## Task 4: Update `PlayerRosterPanel` to show link badge and picker

**Files:**
- Modify: `components/PlayerRosterPanel.tsx`

- [ ] **Step 1: Add imports and new state**

At the top of the file, add the import for `MemberLinkPicker`:

```ts
import MemberLinkPicker from '@/components/MemberLinkPicker'
```

Inside `PlayerRosterPanel`, after the existing `const [errorName, setErrorName] = useState<string | null>(null)` line, add:

```ts
const [linkingPlayerName, setLinkingPlayerName] = useState<string | null>(null)
const [linkError, setLinkError] = useState<string | null>(null)
const [linkSubmitting, setLinkSubmitting] = useState(false)
```

- [ ] **Step 2: Add the `assignMember` function**

After the `patch` callback definition, add:

```ts
async function assignMember(playerName: string, userId: string, displayName: string) {
  setLinkSubmitting(true)
  setLinkError(null)
  try {
    const res = await fetch(`/api/league/${leagueId}/player-claims/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ user_id: userId, player_name: playerName }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? 'Failed to link member')
    setPlayers((prev) =>
      prev.map((p) =>
        p.name === playerName
          ? { ...p, linked_user_id: userId, linked_display_name: displayName }
          : p
      )
    )
    setLinkingPlayerName(null)
  } catch (err) {
    setLinkError(err instanceof Error ? err.message : 'Something went wrong')
  } finally {
    setLinkSubmitting(false)
  }
}
```

- [ ] **Step 3: Add linked badge / link button to the desktop row**

In the desktop controls section (inside `<div className="hidden sm:flex items-center gap-3">`), add the badge/button **before** the rating dots div:

```tsx
{/* Linked member badge or link button */}
{player.linked_display_name ? (
  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border bg-emerald-900/40 text-emerald-300 border-emerald-700/50">
    <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
    Linked: {player.linked_display_name}
  </span>
) : (
  <button
    type="button"
    onClick={() => setLinkingPlayerName(linkingPlayerName === player.name ? null : player.name)}
    className="text-xs text-slate-500 border border-dashed border-slate-600 px-2 py-0.5 rounded hover:border-slate-400 hover:text-slate-300 transition-colors"
  >
    + Link member
  </button>
)}
```

- [ ] **Step 4: Add linked badge / link button to the mobile expanded section**

Inside the mobile expanded section (`{isExpanded && (...)}`) after the mentality div, add:

```tsx
<div>
  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Member Link</p>
  {player.linked_display_name ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs border bg-emerald-900/40 text-emerald-300 border-emerald-700/50">
      <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
      Linked: {player.linked_display_name}
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setLinkingPlayerName(linkingPlayerName === player.name ? null : player.name)}
      className="text-xs text-slate-500 border border-dashed border-slate-600 px-2 py-0.5 rounded hover:border-slate-400 hover:text-slate-300 transition-colors"
    >
      + Link member
    </button>
  )}
</div>
```

- [ ] **Step 5: Render the inline picker and error below each row**

After the closing tag of the mobile expanded section (`{isExpanded && (...)}`) and before the error state div, add:

```tsx
{/* Inline member link picker */}
{linkingPlayerName === player.name && (
  <>
    <MemberLinkPicker
      leagueId={leagueId}
      submitting={linkSubmitting}
      onLink={(userId, displayName) => assignMember(player.name, userId, displayName)}
      onCancel={() => { setLinkingPlayerName(null); setLinkError(null) }}
    />
    {linkError && (
      <p className="px-3 pb-3 text-xs text-red-400">{linkError}</p>
    )}
  </>
)}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Run all tests**

```bash
npx jest --no-coverage
```

Expected: all existing tests PASS.

- [ ] **Step 8: Commit**

```bash
git add components/PlayerRosterPanel.tsx
git commit -m "feat: players tab — show linked member badge and inline member picker"
```
