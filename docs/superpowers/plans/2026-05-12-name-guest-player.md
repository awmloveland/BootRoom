# Name Guest Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin convert a recorded guest entry (e.g. "Lloyd +1") on a specific match into a real named player, scoped to that single week, so the new player is credited with that match in stats.

**Architecture:** Add a `UserPlus` icon next to guest names in `TeamList` (admin-only). Clicking it opens a new `NameGuestModal` that mirrors `AddPlayerModal`'s new-player form. Submit posts to a new `POST /api/league/[id]/guests/name` endpoint that calls a new Postgres function `admin_name_guest`, which atomically: replaces the guest name in the targeted `weeks` row only, inserts a new `player_attributes` row, and cleans up the old `player_attributes` row only if no other week still references it.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RPC), Tailwind, Jest + ts-jest, Radix UI primitives.

---

## File Structure

**Create:**
- `supabase/migrations/20260512000001_admin_name_guest.sql` — RPC function
- `app/api/league/[id]/guests/name/route.ts` — API endpoint
- `components/NameGuestModal.tsx` — modal component
- `lib/guestName.ts` — `isGuestName(name)` + `strengthHintToRating(hint)` + `validateNameGuestInput(name, existing)` helpers
- `lib/__tests__/guestName.test.ts` — unit tests for the helpers (pure-logic; matches repo convention of `testEnvironment: 'node'` with no React Testing Library)

**Modify:**
- `components/TeamList.tsx` — accept `onNameGuest?: (name: string) => void`, render `UserPlus` button next to guest rows
- `components/MatchCard.tsx` — accept `onNameGuest?: (week: Week, guestName: string) => void`, forward to `TeamList` instances
- `components/WeekList.tsx` — own modal state, pass callback through to `MatchCard`, render modal
- `app/[slug]/results/page.tsx` — (no logical change; refresh path uses existing `onResultSaved` pattern via `router.refresh()`)

---

## Task 1: Add guest-name helpers and unit tests

**Files:**
- Create: `lib/guestName.ts`
- Create: `lib/__tests__/guestName.test.ts`

- [ ] **Step 1: Write the failing tests**

`lib/__tests__/guestName.test.ts`:
```ts
import { isGuestName, strengthHintToRating, validateNameGuestInput } from '@/lib/guestName'

describe('isGuestName', () => {
  it('returns true for "Lloyd +1"', () => {
    expect(isGuestName('Lloyd +1')).toBe(true)
  })
  it('returns true for "Mary Jane +2"', () => {
    expect(isGuestName('Mary Jane +2')).toBe(true)
  })
  it('returns false for a normal name', () => {
    expect(isGuestName('Lloyd')).toBe(false)
  })
  it('returns false when "+" has no space before it', () => {
    expect(isGuestName('Lloyd+1')).toBe(false)
  })
  it('returns false for "+1" alone', () => {
    expect(isGuestName('+1')).toBe(false)
  })
})

describe('strengthHintToRating', () => {
  it('maps below to 1', () => {
    expect(strengthHintToRating('below')).toBe(1)
  })
  it('maps average to 2', () => {
    expect(strengthHintToRating('average')).toBe(2)
  })
  it('maps above to 3', () => {
    expect(strengthHintToRating('above')).toBe(3)
  })
})

describe('validateNameGuestInput', () => {
  const existing = ['Lloyd', 'Mary', 'Lloyd +1']

  it('returns "Name is required." for empty input', () => {
    expect(validateNameGuestInput('', existing)).toBe('Name is required.')
  })
  it('returns "Name is required." for whitespace-only input', () => {
    expect(validateNameGuestInput('   ', existing)).toBe('Name is required.')
  })
  it('returns collision error when name matches existing (case-insensitive)', () => {
    expect(validateNameGuestInput('lloyd', existing)).toBe('A player with this name already exists.')
  })
  it('returns collision error when name matches existing after trimming', () => {
    expect(validateNameGuestInput('  Lloyd  ', existing)).toBe('A player with this name already exists.')
  })
  it('returns null for a fresh name', () => {
    expect(validateNameGuestInput('Steve', existing)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- lib/__tests__/guestName.test.ts`
Expected: FAIL — `Cannot find module '@/lib/guestName'`.

- [ ] **Step 3: Implement the helpers**

`lib/guestName.ts`:
```ts
import type { StrengthHint } from '@/lib/types'

const GUEST_PATTERN = /^.+\s\+\d+$/

export function isGuestName(name: string): boolean {
  return GUEST_PATTERN.test(name)
}

export function strengthHintToRating(hint: StrengthHint): number {
  switch (hint) {
    case 'below': return 1
    case 'average': return 2
    case 'above': return 3
  }
}

export function validateNameGuestInput(name: string, existingPlayers: string[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'Name is required.'
  const lower = trimmed.toLowerCase()
  if (existingPlayers.some((p) => p.toLowerCase() === lower)) {
    return 'A player with this name already exists.'
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- lib/__tests__/guestName.test.ts`
Expected: PASS — 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/guestName.ts lib/__tests__/guestName.test.ts
git commit -m "feat(guest-name): add isGuestName and strengthHintToRating helpers"
```

---

## Task 2: Add the `admin_name_guest` Postgres function

**Files:**
- Create: `supabase/migrations/20260512000001_admin_name_guest.sql`

- [ ] **Step 1: Write the migration**

`supabase/migrations/20260512000001_admin_name_guest.sql`:
```sql
-- supabase/migrations/20260512000001_admin_name_guest.sql
--
-- admin_name_guest: convert a guest entry on a single week into a named player.
-- Scoped to one week: only rewrites the specified weeks row, not the league as a whole.
-- Inserts a new player_attributes row for the new name with the given mentality + rating.
-- Deletes the old player_attributes row only if no other week in the league still references it.
-- Raises 'name_already_exists' if p_new_name already exists in player_attributes or active claims.
-- Raises 'guest_not_found' if the old name is not on the specified week.
--

CREATE OR REPLACE FUNCTION public.admin_name_guest(
  p_game_id    uuid,
  p_week_id    uuid,
  p_old_name   text,
  p_new_name   text,
  p_mentality  text,
  p_rating     int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_in_team_a boolean;
  v_in_team_b boolean;
  v_old_still_used boolean;
BEGIN
  -- Admin gate
  IF NOT is_game_admin(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Validate inputs
  IF p_new_name IS NULL OR length(trim(p_new_name)) = 0 THEN
    RAISE EXCEPTION 'invalid_new_name';
  END IF;
  IF p_mentality NOT IN ('balanced', 'attacking', 'defensive', 'goalkeeper') THEN
    RAISE EXCEPTION 'invalid_mentality';
  END IF;
  IF p_rating NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'invalid_rating';
  END IF;

  -- Conflict check: new name must not already exist in player_attributes or active claims
  IF EXISTS (
    SELECT 1 FROM player_attributes
    WHERE game_id = p_game_id AND name = p_new_name
  ) OR EXISTS (
    SELECT 1 FROM player_claims
    WHERE game_id = p_game_id
      AND (player_name = p_new_name OR admin_override_name = p_new_name)
      AND status IN ('pending', 'approved')
  ) THEN
    RAISE EXCEPTION 'name_already_exists';
  END IF;

  -- Locate the guest in the specified week
  SELECT
    team_a @> to_jsonb(p_old_name),
    team_b @> to_jsonb(p_old_name)
  INTO v_in_team_a, v_in_team_b
  FROM weeks
  WHERE id = p_week_id AND game_id = p_game_id;

  IF NOT FOUND OR (v_in_team_a IS NOT TRUE AND v_in_team_b IS NOT TRUE) THEN
    RAISE EXCEPTION 'guest_not_found';
  END IF;

  -- Rewrite the targeted week's team JSONB (only the side that contains the guest)
  IF v_in_team_a THEN
    UPDATE weeks
    SET team_a = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_a) AS val
    )
    WHERE id = p_week_id;
  END IF;

  IF v_in_team_b THEN
    UPDATE weeks
    SET team_b = (
      SELECT jsonb_agg(CASE WHEN val = p_old_name THEN p_new_name ELSE val END)
      FROM jsonb_array_elements_text(team_b) AS val
    )
    WHERE id = p_week_id;
  END IF;

  -- Insert the new player_attributes row
  INSERT INTO player_attributes (game_id, name, mentality, rating)
  VALUES (p_game_id, p_new_name, p_mentality, p_rating);

  -- If the old name is no longer referenced by any week in this league, delete its row
  SELECT EXISTS (
    SELECT 1 FROM weeks
    WHERE game_id = p_game_id
      AND (team_a @> to_jsonb(p_old_name) OR team_b @> to_jsonb(p_old_name))
  ) INTO v_old_still_used;

  IF NOT v_old_still_used THEN
    DELETE FROM player_attributes
    WHERE game_id = p_game_id AND name = p_old_name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_name_guest(uuid, uuid, text, text, text, int) TO authenticated;
```

- [ ] **Step 2: Verify migration syntax against the existing rename migration**

Run: `diff -u supabase/migrations/20260409000001_admin_rename_player.sql supabase/migrations/20260512000001_admin_name_guest.sql | head -60`
Expected: Diff shows similar structure (SECURITY DEFINER, search_path = public, GRANT to authenticated). No syntax surprises.

- [ ] **Step 3: Apply the migration locally**

Apply via the Supabase SQL Editor (or `supabase db push` if the local CLI is set up — check `package.json` for an existing script first). The team's standard is "run in order via Supabase SQL Editor" per CLAUDE.md.
Expected: Migration applies without error. `\df admin_name_guest` shows the function.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260512000001_admin_name_guest.sql
git commit -m "feat(db): add admin_name_guest function for naming a guest on one week"
```

---

## Task 3: Add the `POST /api/league/[id]/guests/name` endpoint

**Files:**
- Create: `app/api/league/[id]/guests/name/route.ts`

- [ ] **Step 1: Write the route handler**

`app/api/league/[id]/guests/name/route.ts`:
```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { strengthHintToRating } from '@/lib/guestName'
import type { Mentality, StrengthHint } from '@/lib/types'

interface Body {
  weekId?: string
  oldName?: string
  newName?: string
  mentality?: Mentality
  strengthHint?: StrengthHint
}

const VALID_MENTALITIES: Mentality[] = ['balanced', 'attacking', 'defensive', 'goalkeeper']
const VALID_STRENGTHS: StrengthHint[] = ['below', 'average', 'above']

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await request.json().catch(() => null)) as Body | null
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const weekId = typeof body.weekId === 'string' ? body.weekId : ''
  const oldName = typeof body.oldName === 'string' ? body.oldName : ''
  const newName = typeof body.newName === 'string' ? body.newName.trim() : ''
  const mentality = body.mentality
  const strengthHint = body.strengthHint

  if (!weekId || !oldName || !newName) {
    return NextResponse.json({ error: 'weekId, oldName and newName are required' }, { status: 400 })
  }
  if (!mentality || !VALID_MENTALITIES.includes(mentality)) {
    return NextResponse.json({ error: 'invalid_mentality' }, { status: 400 })
  }
  if (!strengthHint || !VALID_STRENGTHS.includes(strengthHint)) {
    return NextResponse.json({ error: 'invalid_strength_hint' }, { status: 400 })
  }

  const rating = strengthHintToRating(strengthHint)

  const { error } = await supabase.rpc('admin_name_guest', {
    p_game_id: id,
    p_week_id: weekId,
    p_old_name: oldName,
    p_new_name: newName,
    p_mentality: mentality,
    p_rating: rating,
  })

  if (error) {
    if (error.message.includes('name_already_exists')) {
      return NextResponse.json({ error: 'name_taken' }, { status: 409 })
    }
    if (error.message.includes('guest_not_found')) {
      return NextResponse.json({ error: 'guest_not_found' }, { status: 404 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, new_name: newName })
}
```

- [ ] **Step 2: Type-check the route**

Run: `npx tsc --noEmit`
Expected: No type errors introduced.

- [ ] **Step 3: Commit**

```bash
git add app/api/league/\[id\]/guests/name/route.ts
git commit -m "feat(api): add POST /api/league/[id]/guests/name endpoint"
```

---

## Task 4: Add `NameGuestModal` component

**Files:**
- Create: `components/NameGuestModal.tsx`

Component-render tests are not used: this repo's Jest config is `testEnvironment: 'node'` with no `@testing-library/react`. The interesting logic (validation) is covered as a pure function in Task 1; the modal itself is verified by the manual smoke test in Task 8.

- [ ] **Step 1: Implement the modal**

`components/NameGuestModal.tsx`:
```tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { validateNameGuestInput } from '@/lib/guestName'
import type { Mentality, StrengthHint } from '@/lib/types'

interface Props {
  guestName: string
  existingPlayers: string[]
  onSubmit: (entry: { newName: string; mentality: Mentality; strengthHint: StrengthHint }) => Promise<void>
  onClose: () => void
}

const MENTALITY_OPTIONS: { value: Mentality; label: string }[] = [
  { value: 'goalkeeper', label: 'GK' },
  { value: 'defensive', label: 'DEF' },
  { value: 'balanced', label: 'BAL' },
  { value: 'attacking', label: 'ATT' },
]

const STRENGTH_OPTIONS: { value: StrengthHint; label: string }[] = [
  { value: 'below', label: 'Below average' },
  { value: 'average', label: 'Average' },
  { value: 'above', label: 'Above average' },
]

export function NameGuestModal({ guestName, existingPlayers, onSubmit, onClose }: Props) {
  const [name, setName] = useState('')
  const [mentality, setMentality] = useState<Mentality>('balanced')
  const [strengthHint, setStrengthHint] = useState<StrengthHint>('average')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const validationError = validateNameGuestInput(name, existingPlayers)
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({ newName: name.trim(), mentality, strengthHint })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-slate-700 bg-slate-800 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-100">Name {guestName}</h2>
        <p className="mt-1 text-xs text-slate-400">
          Replace this guest entry with a real player for this match.
        </p>

        <div className="mt-4">
          <label htmlFor="name-guest-name" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Name
          </label>
          <input
            id="name-guest-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-slate-100 focus:border-blue-700 focus:outline-none"
            autoFocus
          />
        </div>

        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mentality</p>
          <div className="mt-1 flex overflow-hidden rounded border border-slate-700">
            {MENTALITY_OPTIONS.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMentality(opt.value)}
                className={cn(
                  'flex-1 px-2 py-1.5 text-xs font-semibold',
                  i < MENTALITY_OPTIONS.length - 1 && 'border-r border-slate-700',
                  mentality === opt.value
                    ? 'bg-blue-950 text-blue-300'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Strength hint</p>
          <div className="mt-1 flex overflow-hidden rounded border border-slate-700">
            {STRENGTH_OPTIONS.map((opt, i) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStrengthHint(opt.value)}
                className={cn(
                  'flex-1 px-2 py-1.5 text-xs font-semibold',
                  i < STRENGTH_OPTIONS.length - 1 && 'border-r border-slate-700',
                  strengthHint === opt.value
                    ? 'bg-blue-950 text-blue-300'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            Add player
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add components/NameGuestModal.tsx
git commit -m "feat(ui): add NameGuestModal component"
```

---

## Task 5: Wire `onNameGuest` through `TeamList`

**Files:**
- Modify: `components/TeamList.tsx`

- [ ] **Step 1: Update `TeamList` to render the `UserPlus` button for guests**

Replace the contents of `components/TeamList.tsx` with:
```tsx
import { UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isGuestName } from '@/lib/guestName'

interface TeamListProps {
  label: string
  players: string[]
  team: 'A' | 'B'
  rating?: number | null
  goalkeepers?: string[]
  onNameGuest?: (guestName: string) => void
}

export function TeamList({ label, players, team, rating, goalkeepers, onNameGuest }: TeamListProps) {
  const isA = team === 'A'

  return (
    <div>
      {/* Team heading + score chip */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-100">{label}</p>
        {rating != null && (
          <span className={cn(
            'px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums border',
            isA
              ? 'bg-sky-900/60 border-sky-700 text-sky-300'
              : 'bg-violet-900/60 border-violet-700 text-violet-300'
          )}>
            {rating.toFixed(3)}
          </span>
        )}
      </div>

      {/* Player rows */}
      <ul className="space-y-1">
        {players.map((player) => {
          const showNameGuest = !!onNameGuest && isGuestName(player)
          return (
            <li
              key={player}
              className={cn(
                'text-xs font-medium px-2.5 py-1.5 rounded border flex items-center justify-between gap-2',
                isA
                  ? 'bg-sky-950/40 border-sky-900/60 text-sky-100'
                  : 'bg-violet-950/40 border-violet-900/60 text-violet-100'
              )}
            >
              <span>{player}{goalkeepers?.includes(player) ? ' 🧤' : ''}</span>
              {showNameGuest && (
                <button
                  type="button"
                  onClick={() => onNameGuest!(player)}
                  aria-label={`Name ${player}`}
                  className="shrink-0 text-slate-300 hover:text-slate-100"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors introduced.

- [ ] **Step 3: Run existing tests to confirm no regression**

Run: `npm run test`
Expected: All existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add components/TeamList.tsx
git commit -m "feat(team-list): render name-guest button for guest entries"
```

---

## Task 6: Forward `onNameGuest` through `MatchCard`

**Files:**
- Modify: `components/MatchCard.tsx`

- [ ] **Step 1: Add `onNameGuest` prop to `MatchCardProps`**

In `components/MatchCard.tsx`, update the `MatchCardProps` interface and the destructuring in the `MatchCard` function signature.

Find:
```ts
interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
  leagueName?: string
  leagueSlug?: string
  weeks?: Week[]
}
```

Replace with:
```ts
interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
  isAdmin?: boolean
  gameId?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
  leagueName?: string
  leagueSlug?: string
  weeks?: Week[]
  onNameGuest?: (week: Week, guestName: string) => void
}
```

Find:
```ts
export function MatchCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin = false,
  gameId = '',
  allPlayers = [],
  onResultSaved = () => {},
  leagueName,
  leagueSlug,
  weeks,
}: MatchCardProps)
```

Replace with:
```ts
export function MatchCard({
  week,
  isOpen,
  onToggle,
  goalkeepers,
  isAdmin = false,
  gameId = '',
  allPlayers = [],
  onResultSaved = () => {},
  leagueName,
  leagueSlug,
  weeks,
  onNameGuest,
}: MatchCardProps)
```

- [ ] **Step 2: Compute `nameGuestHandler` once per render**

Just below the destructuring block (top of the function body), add:
```ts
const nameGuestHandler =
  isAdmin && week.id && onNameGuest
    ? (guestName: string) => onNameGuest(week, guestName)
    : undefined
```

- [ ] **Step 3: Pass `onNameGuest={nameGuestHandler}` to each `<TeamList />` instance**

There are three pairs of `<TeamList>` usages in `MatchCard.tsx` (near lines 283, 410, 564). For each `<TeamList>` element, add the prop:
```tsx
<TeamList
  label="Team A"
  players={week.teamA}
  team="A"
  rating={week.team_a_rating ?? null}
  goalkeepers={goalkeepers}
  onNameGuest={nameGuestHandler}
/>
```

Apply the same addition to every `<TeamList>` (both Team A and Team B) in the file. Use `grep -n '<TeamList' components/MatchCard.tsx` to find all sites.

- [ ] **Step 4: Type-check and run tests**

Run: `npx tsc --noEmit && npm run test`
Expected: No type errors; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "feat(match-card): forward onNameGuest callback to TeamList"
```

---

## Task 7: Own the modal in `WeekList` and wire the API call

**Files:**
- Modify: `components/WeekList.tsx`

- [ ] **Step 1: Update `WeekList`**

Replace the contents of `components/WeekList.tsx` with:
```tsx
'use client'

import { Fragment, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { YearDivider } from '@/components/YearDivider'
import { NameGuestModal } from '@/components/NameGuestModal'
import { getMonthKey, formatMonthYear, sortWeeks } from '@/lib/utils'
import type { Mentality, Player, StrengthHint, Week } from '@/lib/types'

interface Props {
  weeks: Week[]
  goalkeepers?: string[]
  openWeek?: number | null
  onOpenWeekChange?: (week: number | null) => void
  isAdmin?: boolean
  gameId?: string
  leagueSlug?: string
  allPlayers?: Player[]
  onResultSaved?: () => void
  leagueName?: string
}

interface NameGuestTarget {
  week: Week
  guestName: string
}

export function WeekList({
  weeks,
  goalkeepers,
  openWeek: controlledOpenWeek,
  onOpenWeekChange,
  isAdmin = false,
  gameId = '',
  leagueSlug,
  allPlayers = [],
  onResultSaved = () => {},
  leagueName,
}: Props) {
  const router = useRouter()
  const recentEligible = sortWeeks(weeks.filter((w) => w.status === 'played' || w.status === 'dnf'))
  const mostRecent = recentEligible[0] ?? null
  const [internalOpenWeek, setInternalOpenWeek] = useState<number | null>(mostRecent?.week ?? null)
  const [nameGuestTarget, setNameGuestTarget] = useState<NameGuestTarget | null>(null)

  const isControlled = controlledOpenWeek !== undefined
  const openWeek = isControlled ? controlledOpenWeek : internalOpenWeek

  function handleToggle(weekNum: number) {
    const next = openWeek === weekNum ? null : weekNum
    if (isControlled) {
      onOpenWeekChange?.(next)
    } else {
      setInternalOpenWeek(next)
    }
  }

  function handleNameGuestRequest(week: Week, guestName: string) {
    if (!week.id) return
    setNameGuestTarget({ week, guestName })
  }

  async function handleNameGuestSubmit(entry: {
    newName: string
    mentality: Mentality
    strengthHint: StrengthHint
  }) {
    if (!nameGuestTarget || !nameGuestTarget.week.id) return
    const res = await fetch(`/api/league/${gameId}/guests/name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        weekId: nameGuestTarget.week.id,
        oldName: nameGuestTarget.guestName,
        newName: entry.newName,
        mentality: entry.mentality,
        strengthHint: entry.strengthHint,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      if (res.status === 409) throw new Error('A player with this name already exists.')
      if (res.status === 404) throw new Error('This guest entry is no longer on the match.')
      throw new Error(body?.error ?? 'Failed to add player.')
    }
    setNameGuestTarget(null)
    onResultSaved()
    router.refresh()
  }

  const existingPlayers = allPlayers.map((p) => p.name)

  if (weeks.length === 0) {
    return <p className="text-slate-400 text-sm">No results yet.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      {weeks.map((week, index) => {
        const yearChanged = index > 0 && week.season !== weeks[index - 1].season
        const monthChanged =
          index > 0 && getMonthKey(week.date) !== getMonthKey(weeks[index - 1].date)
        return (
          <Fragment key={week.id ?? `${week.season}-${week.week}`}>
            {yearChanged && <YearDivider year={week.season} />}
            {monthChanged && !yearChanged && <MonthDivider label={formatMonthYear(week.date)} />}
            <MatchCard
              week={week}
              isOpen={openWeek === week.week}
              onToggle={() => handleToggle(week.week)}
              goalkeepers={goalkeepers}
              isAdmin={isAdmin}
              gameId={gameId}
              allPlayers={allPlayers}
              onResultSaved={onResultSaved}
              leagueName={week.week === mostRecent?.week ? leagueName : undefined}
              leagueSlug={week.week === mostRecent?.week ? leagueSlug : undefined}
              weeks={week.week === mostRecent?.week ? weeks : undefined}
              onNameGuest={handleNameGuestRequest}
            />
          </Fragment>
        )
      })}

      {nameGuestTarget && (
        <NameGuestModal
          guestName={nameGuestTarget.guestName}
          existingPlayers={existingPlayers}
          onSubmit={handleNameGuestSubmit}
          onClose={() => setNameGuestTarget(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/WeekList.tsx
git commit -m "feat(week-list): own NameGuestModal and wire API call"
```

---

## Task 8: Manual smoke test

**Files:** none (manual)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: Server starts on the usual port.

- [ ] **Step 2: Seed test conditions**

In Supabase SQL Editor, find a recorded match in a league where you are an admin that contains a guest entry. If none exists, run a quick lineup with a "+1" guest and record a result.

- [ ] **Step 3: Verify the button shows for admins only**

Open the league results page (`/{slug}/results`) signed in as the admin. Expand the relevant match card. Confirm the `UserPlus` icon appears to the right of "Lloyd +1" (or whatever the guest's name is). Sign out and reload — confirm the button is gone for public visitors.

- [ ] **Step 4: Name the guest**

Sign back in as admin. Click the icon. Modal opens with "Name Lloyd +1". Enter "Steve", pick DEF, pick "Above average", click "Add player". Modal closes.

- [ ] **Step 5: Verify the rename is scoped and stats are credited**

- The match card team list now shows "Steve" in place of "Lloyd +1".
- `/{slug}/players` shows "Steve" with mentality DEF, with 1 match played and the correct W/L/D for that match.
- Settings → Players tab shows "Steve" with rating 3 ("above") and mentality DEF.
- If you had other matches containing "Lloyd +1", they are unchanged.

- [ ] **Step 6: Verify collision error**

Open another guest's modal, type the name of an existing player, click "Add player". Confirm the inline error "A player with this name already exists." appears.

- [ ] **Step 7: Final commit if any tweaks were made**

If no code changed during smoke, skip. Otherwise commit and re-run `npm run test`.

---

## Acceptance

- A guest entry on a recorded match can be converted to a named player from the match card by an admin.
- The rename is scoped to the targeted week only; other weeks that reference the same guest-name string are unchanged.
- The new player appears in `player_attributes` with the chosen mentality and rating.
- The new player shows the targeted match in stats with the correct result.
- The old guest-name `player_attributes` row is deleted iff no other week in the league still references it.
- Non-admins never see the button. Non-admins calling the API directly receive 403.
- Name collisions return 409 and surface inline. Race-deleted guests return 404 with a clear message.
