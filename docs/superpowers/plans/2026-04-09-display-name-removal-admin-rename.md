# Display Name Removal + Admin Player Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the user-editable display name field from account settings and replace it with an admin-only player rename tool in the player roster panel that cascades atomically through all match history.

**Architecture:** The rename cascade runs as a single Supabase RPC (`admin_rename_player`) that updates `player_attributes`, `player_claims`, and all `weeks.team_a`/`team_b` JSONB arrays in one transaction. A new API route wraps the RPC. The `PlayerRosterPanel` gains inline rename UI (pencil icon → expand below row). Avatar initials switch from `display_name` to `first_name + last_name` via the existing `getInitials` utility.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (PostgreSQL + RLS), Tailwind CSS, `lucide-react`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `supabase/migrations/20260409000001_admin_rename_player.sql` | RPC that atomically renames a player across all tables |
| Create | `app/api/league/[id]/players/[name]/rename/route.ts` | PATCH endpoint — validates body, calls RPC, maps errors |
| Modify | `lib/playerUtils.ts` | Add `parseRenameName` validation utility |
| Create | `__tests__/player-rename.test.ts` | Unit tests for `parseRenameName` |
| Modify | `app/api/auth/me/route.ts` | Return `first_name`/`last_name` instead of `display_name` |
| Modify | `app/api/auth/profile/route.ts` | Remove `display_name` from accepted PATCH fields |
| Modify | `app/settings/page.tsx` | Remove display name input and state |
| Modify | `components/ui/navbar.tsx` | Derive avatar name from `first_name + last_name` |
| Modify | `components/PlayerRosterPanel.tsx` | Add pencil icon + inline rename panel per player row |

---

## Task 1: SQL migration — admin_rename_player RPC

**Files:**
- Create: `supabase/migrations/20260409000001_admin_rename_player.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260409000001_admin_rename_player.sql
--
-- admin_rename_player: atomically renames a player across all league data.
-- Updates player_attributes, player_claims, and weeks.team_a / team_b.
-- Raises 'name_already_exists' if p_new_name is already taken in the league.
--

CREATE OR REPLACE FUNCTION public.admin_rename_player(
  p_game_id  uuid,
  p_old_name text,
  p_new_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin gate
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- No-op if names are identical
  IF p_old_name = p_new_name THEN
    RETURN;
  END IF;

  -- Conflict check: new name must not already exist in player_attributes
  IF EXISTS (
    SELECT 1 FROM player_attributes
    WHERE game_id = p_game_id AND name = p_new_name
  ) THEN
    RAISE EXCEPTION 'name_already_exists';
  END IF;

  -- Update player_attributes
  UPDATE player_attributes
  SET name = p_new_name
  WHERE game_id = p_game_id AND name = p_old_name;

  -- Update player_claims.player_name
  UPDATE player_claims
  SET player_name = p_new_name
  WHERE game_id = p_game_id AND player_name = p_old_name;

  -- Update player_claims.admin_override_name
  UPDATE player_claims
  SET admin_override_name = p_new_name
  WHERE game_id = p_game_id AND admin_override_name = p_old_name;

  -- Update weeks.team_a and team_b JSONB arrays
  UPDATE weeks
  SET
    team_a = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_a) AS val
    ),
    team_b = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_b) AS val
    )
  WHERE game_id = p_game_id
    AND (team_a @> to_jsonb(p_old_name) OR team_b @> to_jsonb(p_old_name));

END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_rename_player(uuid, text, text) TO authenticated;
```

- [ ] **Step 2: Run the migration**

Open the Supabase SQL Editor for the project and paste + run the migration file contents. Confirm no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260409000001_admin_rename_player.sql
git commit -m "feat: add admin_rename_player RPC"
```

---

## Task 2: Rename validation utility + tests

**Files:**
- Modify: `lib/playerUtils.ts`
- Create: `__tests__/player-rename.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/player-rename.test.ts`:

```ts
import { parseRenameName } from '@/lib/playerUtils'

describe('parseRenameName', () => {
  it('returns trimmed string for a valid name', () => {
    expect(parseRenameName('  William  ')).toBe('William')
  })

  it('returns the name unchanged when no whitespace', () => {
    expect(parseRenameName('James')).toBe('James')
  })

  it('returns null for an empty string', () => {
    expect(parseRenameName('')).toBeNull()
  })

  it('returns null for a whitespace-only string', () => {
    expect(parseRenameName('   ')).toBeNull()
  })

  it('returns null for a non-string value', () => {
    expect(parseRenameName(null)).toBeNull()
    expect(parseRenameName(42)).toBeNull()
    expect(parseRenameName(undefined)).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- --testPathPattern="player-rename" --no-coverage
```

Expected: FAIL — `parseRenameName is not a function`

- [ ] **Step 3: Add `parseRenameName` to `lib/playerUtils.ts`**

Append to the existing file (after the closing brace of `parsePlayerPatch`):

```ts
/**
 * Validates and trims a player rename input.
 * Returns the trimmed name, or null if the value is not a non-empty string.
 */
export function parseRenameName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="player-rename" --no-coverage
```

Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add lib/playerUtils.ts __tests__/player-rename.test.ts
git commit -m "feat: add parseRenameName utility"
```

---

## Task 3: Rename API route

**Files:**
- Create: `app/api/league/[id]/players/[name]/rename/route.ts`

- [ ] **Step 1: Create the route file**

```ts
// app/api/league/[id]/players/[name]/rename/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { parseRenameName } from '@/lib/playerUtils'

/** PATCH — rename a player and cascade through all league data. Admin only. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name: oldName } = await params

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const newName = parseRenameName(body?.new_name)
  if (!newName) return NextResponse.json({ error: 'new_name is required' }, { status: 400 })

  const { error } = await supabase.rpc('admin_rename_player', {
    p_game_id: id,
    p_old_name: decodeURIComponent(oldName),
    p_new_name: newName,
  })

  if (error) {
    if (error.message.includes('name_already_exists')) {
      return NextResponse.json({ error: 'Name already exists in this league' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, new_name: newName })
}
```

- [ ] **Step 2: Verify full test suite still passes**

```bash
npm test --no-coverage
```

Expected: All existing tests pass + the 5 player-rename tests from Task 2.

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/players/[name]/rename/route.ts
git commit -m "feat: add player rename API route"
```

---

## Task 4: Remove display_name from the profile API

**Files:**
- Modify: `app/api/auth/profile/route.ts`

- [ ] **Step 1: Update the PATCH handler**

Replace the entire file content with:

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
  const { first_name, last_name } = body

  if (first_name === undefined && last_name === undefined) {
    return NextResponse.json({ error: 'No fields provided' }, { status: 400 })
  }

  const trimmed: Record<string, string> = {}
  for (const [key, val] of Object.entries({ first_name, last_name })) {
    if (val === undefined) continue
    const t = String(val).trim()
    if (!t) return NextResponse.json({ error: `${key} cannot be empty` }, { status: 400 })
    trimmed[key] = t
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

- [ ] **Step 2: Run tests**

```bash
npm test --no-coverage
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/profile/route.ts
git commit -m "feat: remove display_name from profile PATCH"
```

---

## Task 5: Update /api/auth/me and navbar

**Files:**
- Modify: `app/api/auth/me/route.ts`
- Modify: `components/ui/navbar.tsx`

- [ ] **Step 1: Update `/api/auth/me` to return first_name + last_name**

Replace the entire file content of `app/api/auth/me/route.ts`:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ user: null, profile: null })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle()
  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile: profile
      ? { id: profile.id, first_name: profile.first_name, last_name: profile.last_name }
      : null,
  })
}
```

- [ ] **Step 2: Update `fetchUserData` in navbar to derive name from first_name + last_name**

In `components/ui/navbar.tsx`, find the `fetchUserData` function and update the return line. The current line is:

```ts
    return { user: data?.user ?? null, displayName: data?.profile?.display_name ?? data?.user?.email ?? null, role }
```

Replace it with:

```ts
    const first = data?.profile?.first_name ?? ''
    const last = data?.profile?.last_name ?? ''
    const derivedName = `${first} ${last}`.trim() || data?.user?.email || null
    return { user: data?.user ?? null, displayName: derivedName, role }
```

- [ ] **Step 3: Run tests**

```bash
npm test --no-coverage
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/me/route.ts components/ui/navbar.tsx
git commit -m "feat: derive avatar name from first_name + last_name"
```

---

## Task 6: Remove display_name field from account settings

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Remove display_name state and form field**

In `app/settings/page.tsx`, make the following changes:

**Remove** these state declarations (lines near the top of the component):
```ts
const [displayName, setDisplayName] = useState('')
```

**Remove** this line in the `load()` function:
```ts
setDisplayName(profileRes.data?.display_name ?? '')
```

**Remove** `display_name` from the `saveProfile` PATCH body — change:
```ts
body: JSON.stringify({
  first_name: firstName.trim(),
  last_name: lastName.trim(),
  display_name: displayName.trim(),
}),
```
to:
```ts
body: JSON.stringify({
  first_name: firstName.trim(),
  last_name: lastName.trim(),
}),
```

**Remove** the entire display name form group (the `<div>` containing the `displayName` label, input, and helper text):
```tsx
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
```

- [ ] **Step 2: Run tests**

```bash
npm test --no-coverage
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/settings/page.tsx
git commit -m "feat: remove display_name field from account settings"
```

---

## Task 7: Add rename UI to PlayerRosterPanel

**Files:**
- Modify: `components/PlayerRosterPanel.tsx`

- [ ] **Step 1: Add rename state and the `renamePlayer` function**

At the top of the file, add `Pencil` to the lucide-react import:
```ts
import { ChevronDown, Pencil } from 'lucide-react'
```

Inside `PlayerRosterPanel`, add these four state variables alongside the existing state:
```ts
  const [renamingPlayer, setRenamingPlayer] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renameSubmitting, setRenameSubmitting] = useState(false)
```

Add the `renamePlayer` function after the `assignMember` function:
```ts
  async function renamePlayer(oldName: string) {
    const trimmed = renameValue.trim()
    if (!trimmed) return
    setRenameSubmitting(true)
    setRenameError(null)
    try {
      const res = await fetch(
        `/api/league/${leagueId}/players/${encodeURIComponent(oldName)}/rename`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ new_name: trimmed }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to rename')
      setPlayers((prev) =>
        prev.map((p) => (p.name === oldName ? { ...p, name: trimmed } : p))
      )
      setRenamingPlayer(null)
      setRenameValue('')
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : 'Failed to rename')
    } finally {
      setRenameSubmitting(false)
    }
  }
```

- [ ] **Step 2: Add the pencil icon and rename panel to the desktop player row**

Inside the `players.map()` loop, find the desktop player name span:
```tsx
              <span className="flex-1 min-w-0 text-sm font-semibold text-slate-100 truncate">
                {player.name}
              </span>
```

Replace it with:
```tsx
              <span className="flex items-center gap-1.5 flex-1 min-w-0">
                <span className="text-sm font-semibold text-slate-100 truncate">{player.name}</span>
                {renamingPlayer !== player.name && (
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingPlayer(player.name)
                      setRenameValue(player.name)
                      setRenameError(null)
                    }}
                    className="text-slate-600 hover:text-slate-400 transition-colors shrink-0"
                    aria-label={`Rename ${player.name}`}
                  >
                    <Pencil className="size-3" />
                  </button>
                )}
              </span>
```

Find the outer `<div>` that wraps the entire player row + expanded sections (the one with `key={player.name}`). After the closing tag of the mobile expanded controls section (`{isExpanded && ...}`), add the rename panel and error state:

```tsx
            {/* ── Rename panel ── */}
            {renamingPlayer === player.name && (
              <div className="border-t border-sky-900/30 bg-sky-950/10 px-3 py-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Rename player</p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') renamePlayer(player.name)
                      if (e.key === 'Escape') { setRenamingPlayer(null); setRenameValue('') }
                    }}
                    autoFocus
                    className="w-36 px-2.5 py-1.5 rounded-md bg-slate-900 border border-sky-700 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => renamePlayer(player.name)}
                    disabled={renameSubmitting || !renameValue.trim()}
                    className="px-3 py-1.5 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-50 transition-colors"
                  >
                    {renameSubmitting ? '…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRenamingPlayer(null); setRenameValue(''); setRenameError(null) }}
                    className="px-3 py-1.5 rounded-md border border-slate-600 text-slate-400 text-xs hover:border-slate-500 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
                {renameError && (
                  <p className="mt-2 text-xs text-red-400">{renameError}</p>
                )}
              </div>
            )}
```

- [ ] **Step 3: Dim the row while rename is open**

Find the outer card `<div>` for each player (the one with `className={cn('rounded-lg bg-slate-800 border overflow-hidden', ...)}`). Update it to also dim when rename is active:

```tsx
          <div
            key={player.name}
            className={cn(
              'rounded-lg bg-slate-800 border overflow-hidden',
              hasError ? 'border-red-800' : isExpanded || renamingPlayer === player.name ? 'border-slate-600' : 'border-slate-700'
            )}
          >
            <div className={cn('flex items-center gap-3 px-3 py-2.5', renamingPlayer === player.name && 'opacity-60')}>
```

- [ ] **Step 4: Run full test suite**

```bash
npm test --no-coverage
```

Expected: All tests pass.

- [ ] **Step 5: Manual verification**

1. Open a league as admin → Settings → Players tab
2. Confirm pencil icon appears next to each player name
3. Click pencil on a player — rename panel should expand below the row, row dims
4. Type a new unique name → Save → player name updates in the list
5. Try renaming to an existing player name → inline error "Name already exists in this league" should appear
6. Press Escape in the input → panel closes
7. Navigate to Results tab — match lineups should show the updated name
8. Navigate to Players tab — stats table should show the updated name

- [ ] **Step 6: Commit**

```bash
git add components/PlayerRosterPanel.tsx
git commit -m "feat: add admin inline player rename to roster panel"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm test --no-coverage
```

Expected: All tests pass.

- [ ] **Step 2: Manual smoke test — display name removal**

1. Go to `/settings`
2. Confirm the "Display name" field and its helper text are gone
3. First name + last name fields still present and save correctly
4. Open the avatar dropdown — initials should reflect first + last name (e.g. "Will Loveland" → "WL")
5. If first/last name not set, avatar should fall back to email

- [ ] **Step 3: Final commit if any loose changes remain**

```bash
git status
# If clean, nothing to do. If any uncommitted changes:
git add -p
git commit -m "chore: cleanup after display name removal"
```
