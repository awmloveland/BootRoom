# Strength Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the parallel `strengthHint` (`'below' | 'average' | 'above'`) and eye-test `rating` (`1 | 2 | 3` int) concepts into a single canonical `Strength` enum across the TypeScript codebase, while keeping the DB column `player_attributes.rating int` unchanged. Convert at fetcher/API boundaries. Hide the strength control entirely in the roster panel for players with 10+ games (the prior's weight has decayed to zero by then).

**Architecture:** All TS code uses `type Strength = 'below' | 'average' | 'above'`. A new `lib/strength.ts` module owns the two conversion functions (`strengthToRating`, `ratingToStrength`). A shared `<StrengthPills>` component is used in PlayerRosterPanel, AddPlayerModal, NameGuestModal, and ResultModal. The latent bug where `AddPlayerModal` hardcoded `rating: 2` is fixed by routing the chosen strength through `strengthToRating` in `ResultModal.handleSave` before calling `promote_roster`. Single PR, single deploy.

**Tech Stack:** Next.js 14 (App Router), TypeScript strict, Tailwind v3, Radix UI primitives, Supabase, Jest with `experimental-vm-modules`.

**Spec:** `docs/superpowers/specs/2026-05-12-strength-consolidation-design.md`

---

## File Inventory

**Create:**
- `lib/strength.ts` — `Strength` type alias re-export + `strengthToRating` + `ratingToStrength`
- `lib/__tests__/strength.test.ts` — unit tests for the converters
- `components/ui/StrengthPills.tsx` — shared presentational pill control
- `__tests__/strength-pills.test.tsx` — component tests

**Modify:**
- `lib/types.ts` — add `Strength`; rewrite `PlayerAttribute`, `Player`, `GuestEntry`, `NewPlayerEntry`; remove `StrengthHint`
- `lib/guestName.ts` — remove `strengthHintToRating` (moved to `lib/strength.ts`)
- `lib/__tests__/guestName.test.ts` — drop the moved test block
- `lib/data.ts` — convert `rating` to `strength` on hydration
- `lib/fetchers.ts` — convert in `getPlayerStats`; accept either `strength`/`strength_hint` key in `mapWeekRow`
- `lib/utils.ts` — rewrite component-3 of `wprScore`; change `hintToWpr` parameter type
- `lib/playerUtils.ts` — `parsePlayerPatch` accepts `strength` (with `rating` fallback)
- `components/PlayerRosterPanel.tsx` — replace dots with `<StrengthPills>`, hide when `played >= 10`, copy update
- `components/AddPlayerModal.tsx` — use `<StrengthPills>`; drop hardcoded `rating: 2`
- `components/NameGuestModal.tsx` — use `<StrengthPills>`; payload uses `strength`
- `components/ResultModal.tsx` — review states use `strength`; replace `<EyeTestSlider>` with `<StrengthPills>`; `promote_roster` entries pass `strengthToRating(p.strength)`
- `components/NextMatchCard.tsx` — reads accept either key; writes emit `strength` only; remove `rating` field from emitted entries; `hintToWpr` call uses `g.strength` / `p.strength`
- `components/WeekList.tsx` — `StrengthHint` → `Strength`
- `app/api/league/[id]/players/route.ts` — include `played` count by JOINing with stats RPC
- `app/api/league/[id]/players/[name]/route.ts` — already uses `parsePlayerPatch`; works via that helper change
- `app/api/league/[id]/guests/name/route.ts` — accept `body.strength` with `body.strengthHint` fallback
- `app/[slug]/settings/page.tsx` — state type update if needed
- `__tests__/player-roster.test.ts` — update fixtures from `rating` to `strength`

**Delete:**
- `components/EyeTestSlider.tsx` — no callers after ResultModal migrates

---

## Task 1: Create `lib/strength.ts` with conversion helpers (TDD)

**Files:**
- Create: `lib/strength.ts`
- Create: `lib/__tests__/strength.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/strength.test.ts`:

```ts
import { strengthToRating, ratingToStrength } from '@/lib/strength'

describe('strengthToRating', () => {
  it('maps below to 1', () => {
    expect(strengthToRating('below')).toBe(1)
  })
  it('maps average to 2', () => {
    expect(strengthToRating('average')).toBe(2)
  })
  it('maps above to 3', () => {
    expect(strengthToRating('above')).toBe(3)
  })
})

describe('ratingToStrength', () => {
  it('maps 1 to below', () => {
    expect(ratingToStrength(1)).toBe('below')
  })
  it('maps 2 to average', () => {
    expect(ratingToStrength(2)).toBe('average')
  })
  it('maps 3 to above', () => {
    expect(ratingToStrength(3)).toBe('above')
  })
  it('maps 0 (unset) to null', () => {
    expect(ratingToStrength(0)).toBeNull()
  })
  it('maps out-of-range values to null', () => {
    expect(ratingToStrength(99)).toBeNull()
  })
})
```

This test references `lib/strength.ts` which does not yet exist. We also need `Strength` defined in `lib/types.ts` — for this step assume it exists; if `tsc` fails later, Task 3 will add the type. To keep this task self-contained, the implementation in Step 3 declares `Strength` locally in `lib/strength.ts` and re-exports it; Task 3 will replace that with a re-export from `lib/types.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/__tests__/strength.test.ts`
Expected: FAIL with module-not-found for `@/lib/strength`.

- [ ] **Step 3: Implement the converters**

Create `lib/strength.ts`:

```ts
export type Strength = 'below' | 'average' | 'above'

export function strengthToRating(strength: Strength): number {
  switch (strength) {
    case 'below':   return 1
    case 'average': return 2
    case 'above':   return 3
  }
}

export function ratingToStrength(rating: number): Strength | null {
  if (rating === 1) return 'below'
  if (rating === 2) return 'average'
  if (rating === 3) return 'above'
  return null
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- lib/__tests__/strength.test.ts`
Expected: PASS, 8 tests passing.

- [ ] **Step 5: Commit**

```bash
git add lib/strength.ts lib/__tests__/strength.test.ts
git commit -m "feat(strength): add Strength enum and converter module

Introduces lib/strength.ts with strengthToRating and ratingToStrength
helpers. Foundation for unifying strengthHint and eye-test rating into
a single canonical Strength type across the app."
```

---

## Task 2: Build the shared `<StrengthPills>` component (TDD)

**Files:**
- Create: `components/ui/StrengthPills.tsx`
- Create: `__tests__/strength-pills.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `__tests__/strength-pills.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { StrengthPills } from '@/components/ui/StrengthPills'

describe('StrengthPills', () => {
  it('renders three labelled pills', () => {
    render(<StrengthPills value={null} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Below average' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Average' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Above average' })).toBeInTheDocument()
  })

  it('marks none selected when value is null', () => {
    render(<StrengthPills value={null} onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Below average' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Average' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Above average' })).toHaveAttribute('aria-checked', 'false')
  })

  it('marks the matching pill selected when value is set', () => {
    render(<StrengthPills value="above" onChange={() => {}} />)
    expect(screen.getByRole('radio', { name: 'Above average' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Average' })).toHaveAttribute('aria-checked', 'false')
  })

  it('fires onChange with the clicked value', () => {
    const onChange = jest.fn()
    render(<StrengthPills value={null} onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Below average' }))
    expect(onChange).toHaveBeenCalledWith('below')
  })

  it('does not fire onChange when disabled', () => {
    const onChange = jest.fn()
    render(<StrengthPills value={null} onChange={onChange} disabled />)
    fireEvent.click(screen.getByRole('radio', { name: 'Average' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/strength-pills.test.tsx`
Expected: FAIL with module-not-found for `@/components/ui/StrengthPills`.

- [ ] **Step 3: Implement the component**

Create `components/ui/StrengthPills.tsx`:

```tsx
'use client'

import { cn } from '@/lib/utils'
import type { Strength } from '@/lib/strength'

interface Props {
  value: Strength | null
  onChange: (next: Strength) => void
  disabled?: boolean
  size?: 'sm' | 'md'
  ariaLabel?: string
}

const OPTIONS: { value: Strength; label: string }[] = [
  { value: 'below', label: 'Below average' },
  { value: 'average', label: 'Average' },
  { value: 'above', label: 'Above average' },
]

export function StrengthPills({ value, onChange, disabled = false, size = 'md', ariaLabel = 'Strength' }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden font-semibold',
        size === 'sm' ? 'text-[10px]' : 'text-[11px]'
      )}
    >
      {OPTIONS.map((opt, i) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => { if (!disabled) onChange(opt.value) }}
            className={cn(
              'flex-1 transition-colors',
              size === 'sm' ? 'py-1.5' : 'py-2',
              i < OPTIONS.length - 1 && 'border-r',
              selected
                ? 'bg-blue-950 text-blue-300 border-blue-800'
                : 'text-slate-500 border-slate-700 hover:text-slate-300',
              disabled && 'opacity-50 cursor-not-allowed hover:text-slate-500'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test -- __tests__/strength-pills.test.tsx`
Expected: PASS, 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add components/ui/StrengthPills.tsx __tests__/strength-pills.test.tsx
git commit -m "feat(ui): add shared StrengthPills component

Three-pill segmented control rendering Below / Average / Above. Used by
PlayerRosterPanel, AddPlayerModal, NameGuestModal, and ResultModal. Supports
a null value (no pill highlighted — the 'needs admin input' state)."
```

---

## Task 3: Add `Strength` to `lib/types.ts`; remove `strengthHintToRating` from `lib/guestName.ts`

**Files:**
- Modify: `lib/types.ts:133` (StrengthHint definition)
- Modify: `lib/guestName.ts:9-15` (strengthHintToRating)
- Modify: `lib/__tests__/guestName.test.ts:21-31` (test block)
- Modify: `lib/strength.ts` (re-export Strength from types)

- [ ] **Step 1: Add `Strength` type to `lib/types.ts`**

Find `lib/types.ts:133`:

```ts
export type StrengthHint = 'below' | 'average' | 'above';
```

Replace with:

```ts
export type Strength = 'below' | 'average' | 'above';
```

Do NOT remove uses of `StrengthHint` in this task — Tasks 4 and 5 will migrate the field references. To keep the codebase compiling between tasks, also add (temporarily) below the `Strength` line:

```ts
/** @deprecated Use Strength. Removed in this PR after all callers are migrated. */
export type StrengthHint = Strength;
```

This alias makes `StrengthHint` interchangeable with `Strength`, so Tasks 4–11 can migrate callers one at a time without breaking intermediate builds. Task 12 removes the deprecation alias.

- [ ] **Step 2: Update `lib/strength.ts` to re-export `Strength` from `lib/types.ts`**

Edit `lib/strength.ts`. Replace its current first line:

```ts
export type Strength = 'below' | 'average' | 'above'
```

with:

```ts
import type { Strength } from '@/lib/types'
export type { Strength }
```

- [ ] **Step 3: Remove `strengthHintToRating` from `lib/guestName.ts`**

Find `lib/guestName.ts`:

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

Replace with:

```ts
const GUEST_PATTERN = /^.+\s\+\d+$/

export function isGuestName(name: string): boolean {
  return GUEST_PATTERN.test(name)
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

- [ ] **Step 4: Update `lib/__tests__/guestName.test.ts`**

Find and remove the import + entire `describe('strengthHintToRating', ...)` block (lines 1, 21-31).

After change, line 1 should be:

```ts
import { isGuestName, validateNameGuestInput } from '@/lib/guestName'
```

Lines 21-31 (the strengthHintToRating block) deleted entirely.

- [ ] **Step 5: Update the one caller of `strengthHintToRating` in `/api/league/[id]/guests/name/route.ts`**

Find `app/api/league/[id]/guests/name/route.ts:3`:

```ts
import { strengthHintToRating } from '@/lib/guestName'
```

Replace with:

```ts
import { strengthToRating } from '@/lib/strength'
```

Find line 49:

```ts
const rating = strengthHintToRating(strengthHint)
```

Replace with:

```ts
const rating = strengthToRating(strengthHint)
```

(`strengthHint` and `strength` types are aliased in this task, so the call still compiles. Task 13 will rename the local variable.)

- [ ] **Step 6: Run all tests and typecheck**

Run: `npm test`
Expected: PASS — the removed test block is gone, all other tests pass.

Run: `npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/strength.ts lib/guestName.ts lib/__tests__/guestName.test.ts app/api/league/[id]/guests/name/route.ts
git commit -m "refactor(types): add Strength alias; move converter to lib/strength

Introduces the canonical Strength type in lib/types.ts. Marks
StrengthHint as a deprecated alias for the duration of this PR.
Moves strengthHintToRating to lib/strength.ts (already there as
strengthToRating) and removes the duplicate from lib/guestName.ts."
```

---

## Task 4: Migrate `Player.rating` and `PlayerAttribute.rating` to `strength`

**Files:**
- Modify: `lib/types.ts:25-31` (PlayerAttribute), `lib/types.ts:43-60` (Player)
- Modify: `lib/data.ts:70, 91, 110` (Player hydration)
- Modify: `lib/fetchers.ts:105` (getPlayerStats)
- Modify: `lib/utils.ts:134-137` (wprScore component-3)
- Modify: `lib/playerUtils.ts:5-21` (parsePlayerPatch)
- Modify: `__tests__/player-roster.test.ts` (fixtures)

This is the largest single task in the plan because the type rename touches many files at once. Take it in order — every step compiles before moving to the next.

- [ ] **Step 1: Update `lib/types.ts` PlayerAttribute and Player interfaces**

Find `lib/types.ts:25-31`:

```ts
export interface PlayerAttribute {
  name: string;
  rating: number;   // 1–3
  mentality: Mentality;
  linked_user_id?: string | null;
  linked_display_name?: string | null;
}
```

Replace with:

```ts
export interface PlayerAttribute {
  name: string;
  strength: Strength | null;   // null = unrated (legacy rating === 0)
  mentality: Mentality;
  played?: number;             // optional roster-context field; required when fetched from /api/league/[id]/players
  linked_user_id?: string | null;
  linked_display_name?: string | null;
}
```

Find `lib/types.ts:43-60` (the `Player` interface). Replace the line `rating: number;` (line 56) with:

```ts
  strength: Strength | null;
```

- [ ] **Step 2: Update `lib/data.ts` to convert rating → strength at the read boundary**

Find `lib/data.ts:68-92`. Locate the two `rating: row.rating` / `rating: Number(row.rating ?? 0)` mappings.

Add at the top of the file (after existing imports):

```ts
import { ratingToStrength } from '@/lib/strength'
```

Find the first occurrence (around line 91):

```ts
      rating: row.rating,
```

Replace with:

```ts
      strength: ratingToStrength(row.rating ?? 0),
```

Find the second occurrence (around line 110):

```ts
    rating: Number(row.rating ?? 0),
```

Replace with:

```ts
    strength: ratingToStrength(Number(row.rating ?? 0)),
```

Also update the `RawRow` (or equivalent) type definition near `lib/data.ts:68-72` so it still describes the DB row shape (which keeps the `rating: number` field — that's the DB column type). That row type is internal to `data.ts` and stays describing DB shape, not the app's Player shape.

- [ ] **Step 3: Update `lib/fetchers.ts` to convert rating → strength**

Find `lib/fetchers.ts:7`:

```ts
import type { GameRole, LeagueFeature, FeatureKey, Player, Week, Mentality, JoinRequestStatus, PendingJoinRequest, PlayerClaimStatus } from '@/lib/types'
```

Add an import below it:

```ts
import { ratingToStrength } from '@/lib/strength'
```

Find `lib/fetchers.ts:105`:

```ts
    rating: Number(row.rating ?? 0),
```

Replace with:

```ts
    strength: ratingToStrength(Number(row.rating ?? 0)),
```

- [ ] **Step 4: Rewrite `wprScore` component-3 in `lib/utils.ts`**

Find `lib/utils.ts:134-137`:

```ts
  // Component 3: rating prior (1–3 → 0–100), fades as played increases
  const normRating = player.rating > 0 ? ((player.rating - 1) / 2) * 100 : 50
  const ratingWeight = Math.max(0, 1 - player.played / 10)
  const ratingScore = normRating * ratingWeight
```

Replace with:

```ts
  // Component 3: strength prior (Strength → 0–100), fades as played increases
  const normRating = player.strength === null
    ? 50
    : ((strengthToRating(player.strength) - 1) / 2) * 100
  const ratingWeight = Math.max(0, 1 - player.played / 10)
  const ratingScore = normRating * ratingWeight
```

Add `strengthToRating` to the imports at the top. Find `lib/utils.ts:3`:

```ts
import { LeagueDetails, Player, StrengthHint, Week, Winner, YearStats } from './types'
```

Replace with:

```ts
import { LeagueDetails, Player, Strength, Week, Winner, YearStats } from './types'
import { strengthToRating } from './strength'
```

Note: `StrengthHint` is still aliased to `Strength` in `lib/types.ts` (Task 3 added the deprecation alias), but this file no longer references `StrengthHint` by name. Update the `hintToWpr` parameter type on `lib/utils.ts:296`:

```ts
export function hintToWpr(
  hint: StrengthHint | undefined,
  percentiles: WprPercentiles,
): number {
```

Replace with:

```ts
export function hintToWpr(
  hint: Strength | null | undefined,
  percentiles: WprPercentiles,
): number {
```

The body is unchanged — the `'above'` / `'below'` branches and the fallthrough still work because `null` and `undefined` both hit the default `return avg` path.

- [ ] **Step 5: Update `lib/playerUtils.ts` to validate `strength`**

Find `lib/playerUtils.ts:1-31`:

```ts
import type { Mentality, PlayerAttribute } from '@/lib/types'

const VALID_MENTALITIES: Mentality[] = ['goalkeeper', 'defensive', 'balanced', 'attacking']

export type PlayerPatch = Partial<Pick<PlayerAttribute, 'rating' | 'mentality'>>

export function parsePlayerPatch(body: unknown): PlayerPatch | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null

  const b = body as Record<string, unknown>
  const patch: PlayerPatch = {}

  if ('rating' in b) {
    const r = b.rating
    if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 3) return null
    patch.rating = r
  }

  if ('mentality' in b) {
    const m = b.mentality
    if (typeof m !== 'string' || !VALID_MENTALITIES.includes(m as Mentality)) return null
    patch.mentality = m as Mentality
  }

  if (Object.keys(patch).length === 0) return null
  return patch
}
```

Replace with:

```ts
import type { Mentality, PlayerAttribute, Strength } from '@/lib/types'
import { ratingToStrength } from '@/lib/strength'

const VALID_MENTALITIES: Mentality[] = ['goalkeeper', 'defensive', 'balanced', 'attacking']
const VALID_STRENGTHS: Strength[] = ['below', 'average', 'above']

export type PlayerPatch = Partial<Pick<PlayerAttribute, 'strength' | 'mentality'>>

export function parsePlayerPatch(body: unknown): PlayerPatch | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null

  const b = body as Record<string, unknown>
  const patch: PlayerPatch = {}

  // New canonical key: strength
  if ('strength' in b) {
    const s = b.strength
    if (typeof s !== 'string' || !VALID_STRENGTHS.includes(s as Strength)) return null
    patch.strength = s as Strength
  }

  // Deprecated fallback: rating (1-3 int). Removed in a follow-up PR.
  else if ('rating' in b) {
    const r = b.rating
    if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > 3) return null
    patch.strength = ratingToStrength(r)
  }

  if ('mentality' in b) {
    const m = b.mentality
    if (typeof m !== 'string' || !VALID_MENTALITIES.includes(m as Mentality)) return null
    patch.mentality = m as Mentality
  }

  if (Object.keys(patch).length === 0) return null
  return patch
}

export function parseRenameName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
```

- [ ] **Step 6: Update the API route that writes the patch back to DB**

The PATCH route uses `parsePlayerPatch` and then writes to `player_attributes`. Find the route at `app/api/league/[id]/players/[name]/route.ts`. The patch object now has `strength: Strength | null` instead of `rating: number`. Find the `.update(...)` call (likely passing the patch directly) and convert before writing:

```ts
const dbPatch: { rating?: number; mentality?: string } = {}
if (patch.strength !== undefined) {
  dbPatch.rating = patch.strength === null ? 0 : strengthToRating(patch.strength)
}
if (patch.mentality !== undefined) {
  dbPatch.mentality = patch.mentality
}
```

Then `.update(dbPatch)`. Import `strengthToRating` from `@/lib/strength`.

(If the existing route currently does `.update(patch)`, replace that with `.update(dbPatch)`.)

- [ ] **Step 7: Update `__tests__/player-roster.test.ts` fixtures**

Find every occurrence of `rating:` in this test file (use a search). Replace `rating: 1` → `strength: 'below'`, `rating: 2` → `strength: 'average'`, `rating: 3` → `strength: 'above'`. Also update assertions where `parsePlayerPatch` was expected to produce `{ rating: N }` — they now produce `{ strength: 'below'|'average'|'above' }`.

The first describe block becomes:

```ts
describe('PlayerAttribute type', () => {
  it('accepts valid strength and mentality', () => {
    const p: PlayerAttribute = { name: 'Alice', strength: 'average', mentality: 'balanced' }
    expect(p.strength).toBe('average')
    expect(p.mentality).toBe('balanced')
  })
  // ... etc, similarly for the other cases
})
```

For `parsePlayerPatch`, add two new tests covering the canonical key and the deprecated-but-accepted rating fallback:

```ts
describe('parsePlayerPatch', () => {
  it('accepts the canonical strength key', () => {
    expect(parsePlayerPatch({ strength: 'above' })).toEqual({ strength: 'above' })
  })

  it('falls back to legacy rating key (deprecated)', () => {
    expect(parsePlayerPatch({ rating: 3 })).toEqual({ strength: 'above' })
    expect(parsePlayerPatch({ rating: 2 })).toEqual({ strength: 'average' })
    expect(parsePlayerPatch({ rating: 1 })).toEqual({ strength: 'below' })
  })

  it('rejects out-of-range rating', () => {
    expect(parsePlayerPatch({ rating: 4 })).toBeNull()
    expect(parsePlayerPatch({ rating: 0 })).toBeNull()
  })

  it('rejects invalid strength', () => {
    expect(parsePlayerPatch({ strength: 'huge' })).toBeNull()
  })
  // ... preserve any existing mentality and combination tests
})
```

- [ ] **Step 8: Run all tests and typecheck**

Run: `npm test`
Expected: PASS. If there are failures in OTHER test files referencing `player.rating` or `playerAttribute.rating`, fix them in place using the same `strength` field. Common locations to check:
- `__tests__/match-card-ratings.test.ts`
- `__tests__/sidebar-stats.test.ts`
- `__tests__/form-display.test.ts`
- `__tests__/margin-of-victory.test.ts`
- Any file under `lib/__tests__/` that constructs `Player` fixtures

Run: `npx tsc --noEmit`
Expected: PASS. Component-level type errors (`PlayerRosterPanel`, `ResultModal`, etc.) are EXPECTED at this point — they will be fixed in Tasks 8, 10, 11. To allow this task to land green, **temporarily** add a compatibility shim to `lib/types.ts` near the `Player` and `PlayerAttribute` definitions:

```ts
// TODO: Remove after Tasks 8/10/11 migrate components off legacy `.rating` access.
declare module './types' {}
```

That isn't enough — types are structural, so `.rating` access actually fails. The cleaner approach is to bundle the component updates into this same task. **Adjust Task 4's scope:** the wprScore + types changes also require that all read sites of `.rating` (in components) be updated in the SAME commit. Add these to the changes in this task:

- `components/MatchCard.tsx` — search for `player.rating` or `p.rating` access; replace with `player.strength` if it's a display concern
- Any other view component that reads `player.rating` for display

Run a search before committing:
```bash
grep -rn "\.rating" components/ app/ --include="*.tsx" --include="*.ts"
```

Replace direct `.rating` reads on `Player` / `PlayerAttribute` values with `.strength` (and a render helper if needed). Match results from teams/weeks (`team_a_rating`, `team_b_rating`) are unrelated and stay as-is.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/data.ts lib/fetchers.ts lib/utils.ts lib/playerUtils.ts \
        app/api/league/[id]/players/[name]/route.ts \
        __tests__/player-roster.test.ts
# plus any component or test files touched in step 8
git commit -m "refactor(types): rename rating to strength on Player and PlayerAttribute

Replaces numeric Player.rating / PlayerAttribute.rating fields with a
Strength enum across all app code. DB column player_attributes.rating
stays as int — conversion happens in lib/data.ts, lib/fetchers.ts, and
the PATCH route via lib/strength.ts helpers. wprScore math is unchanged;
component-3 now keys off strength === null for the neutral prior."
```

---

## Task 5: Migrate `GuestEntry`, `NewPlayerEntry`, `LineupMetadata` from `strengthHint`/`rating` to `strength`

**Files:**
- Modify: `lib/types.ts:135-155` (GuestEntry, NewPlayerEntry, LineupMetadata unchanged)
- Modify: `lib/fetchers.ts:144-164` (mapWeekRow lineup_metadata)
- Modify: `components/NextMatchCard.tsx:85-111, 308-326, 370-385, 495-502` (reads, writes, hintToWpr calls)
- Modify: `components/WeekList.tsx:10, 67-80`

- [ ] **Step 1: Update `lib/types.ts` GuestEntry and NewPlayerEntry**

Find `lib/types.ts:135-150`:

```ts
export interface GuestEntry {
  type: 'guest'
  name: string
  associatedPlayer: string
  rating: number
  goalkeeper?: boolean
  strengthHint: StrengthHint
}

export interface NewPlayerEntry {
  type: 'new_player'
  name: string
  rating: number
  mentality: Mentality
  strengthHint: StrengthHint
}
```

Replace with:

```ts
export interface GuestEntry {
  type: 'guest'            // runtime discriminant — not persisted to DB
  name: string             // e.g. "Alice +1"
  associatedPlayer: string // e.g. "Alice"
  goalkeeper?: boolean     // whether this guest is playing as goalkeeper
  strength: Strength       // drives wprOverride at resolution time
}

export interface NewPlayerEntry {
  type: 'new_player'       // runtime discriminant — not persisted to DB
  name: string
  mentality: Mentality     // balanced | attacking | defensive | goalkeeper
  strength: Strength       // drives wprOverride at resolution time; persisted to player_attributes.rating on promotion
}
```

Note: `rating: number` is dropped from both. `strengthHint: StrengthHint` becomes `strength: Strength` (no longer nullable for in-flight entries — modals always default to `'average'`).

- [ ] **Step 2: Update `lib/fetchers.ts` mapWeekRow to read either key, drop reading rating**

Find `lib/fetchers.ts:144-164`:

```ts
    lineupMetadata: row.lineup_metadata
      ? {
          guests: ((row.lineup_metadata.guests as any[]) ?? []).map((g: any) => ({
            type: 'guest' as const,
            name: g.name,
            associatedPlayer: g.associated_player,
            rating: g.rating,
            goalkeeper: g.goalkeeper ?? false,
            strengthHint: g.strength_hint ?? 'average',
          })),
          new_players: ((row.lineup_metadata.new_players as any[]) ?? []).map((p: any) => ({
            type: 'new_player' as const,
            name: p.name,
            rating: p.rating,
            mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
            strengthHint: p.strength_hint ?? 'average',
          })),
        }
      : null,
```

Replace with:

```ts
    lineupMetadata: row.lineup_metadata
      ? {
          guests: ((row.lineup_metadata.guests as any[]) ?? []).map((g: any) => ({
            type: 'guest' as const,
            name: g.name,
            associatedPlayer: g.associated_player,
            goalkeeper: g.goalkeeper ?? false,
            // Accept either `strength` (new) or `strength_hint` (legacy). Defaults to 'average'.
            strength: (g.strength ?? g.strength_hint ?? 'average') as Strength,
          })),
          new_players: ((row.lineup_metadata.new_players as any[]) ?? []).map((p: any) => ({
            type: 'new_player' as const,
            name: p.name,
            mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
            strength: (p.strength ?? p.strength_hint ?? 'average') as Strength,
          })),
        }
      : null,
```

Add `Strength` to the type imports at line 7:

```ts
import type { GameRole, LeagueFeature, FeatureKey, Player, Week, Mentality, Strength, JoinRequestStatus, PendingJoinRequest, PlayerClaimStatus } from '@/lib/types'
```

- [ ] **Step 3: Update `components/NextMatchCard.tsx` synthetic Player construction**

Find `components/NextMatchCard.tsx:85-111`:

```ts
      return {
        playerId: `guest|${name}`,
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        mentality: guest.goalkeeper ? 'goalkeeper' : 'balanced',
        rating: 2,
        recentForm: '',
        wprOverride: hintToWpr(guest.strengthHint, percentiles),
      }
    }

    const newPlayer = newPlayerLookup.get(name.toLowerCase())
    if (newPlayer) {
      return {
        playerId: `new|${name}`,
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        mentality: newPlayer.mentality,
        rating: 2,
        recentForm: '',
        wprOverride: hintToWpr(newPlayer.strengthHint, percentiles),
      }
    }
```

Replace with:

```ts
      return {
        playerId: `guest|${name}`,
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        mentality: guest.goalkeeper ? 'goalkeeper' : 'balanced',
        strength: guest.strength,
        recentForm: '',
        wprOverride: hintToWpr(guest.strength, percentiles),
      }
    }

    const newPlayer = newPlayerLookup.get(name.toLowerCase())
    if (newPlayer) {
      return {
        playerId: `new|${name}`,
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        mentality: newPlayer.mentality,
        strength: newPlayer.strength,
        recentForm: '',
        wprOverride: hintToWpr(newPlayer.strength, percentiles),
      }
    }
```

Find `components/NextMatchCard.tsx:113-121` (the fallback "unknown" branch):

```ts
    return {
      playerId: `unknown|${name}`,
      name,
      played: 0, won: 0, drew: 0, lost: 0,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0, qualified: false, points: 0,
      mentality: 'balanced' as const,
```

Just below this block (around line 120-122, the line ending `mentality: 'balanced' as const,`), there's a `rating: ...` line. Replace it with:

```ts
      strength: null,
```

(Unknown players have no strength signal — null is correct and matches the wprScore neutral-prior path.)

- [ ] **Step 4: Update LineupMetadata read in NextMatchCard's load() function**

Find `components/NextMatchCard.tsx:308-326`:

```ts
          lineupMetadata: data.lineup_metadata
            ? {
                guests: ((data.lineup_metadata as any).guests ?? []).map((g: any) => ({
                  type: 'guest' as const,
                  name: g.name,
                  associatedPlayer: g.associated_player,
                  rating: g.rating,
                  goalkeeper: g.goalkeeper ?? false,
                  strengthHint: (g.strength_hint ?? 'average') as StrengthHint,
                })),
                new_players: ((data.lineup_metadata as any).new_players ?? []).map((p: any) => ({
                  type: 'new_player' as const,
                  name: p.name,
                  rating: p.rating,
                  mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
                  strengthHint: (p.strength_hint ?? 'average') as StrengthHint,
                })),
              }
            : null,
```

Replace with:

```ts
          lineupMetadata: data.lineup_metadata
            ? {
                guests: ((data.lineup_metadata as any).guests ?? []).map((g: any) => ({
                  type: 'guest' as const,
                  name: g.name,
                  associatedPlayer: g.associated_player,
                  goalkeeper: g.goalkeeper ?? false,
                  strength: (g.strength ?? g.strength_hint ?? 'average') as Strength,
                })),
                new_players: ((data.lineup_metadata as any).new_players ?? []).map((p: any) => ({
                  type: 'new_player' as const,
                  name: p.name,
                  mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
                  strength: (p.strength ?? p.strength_hint ?? 'average') as Strength,
                })),
              }
            : null,
```

Update the file's top-level imports — find `import type { ... StrengthHint ... }` and replace `StrengthHint` with `Strength`.

- [ ] **Step 5: Update LineupMetadata writes (handleSaveLineup) to emit `strength` only**

Find `components/NextMatchCard.tsx:369-385`:

```ts
    const lineupMetadataForDB = {
      guests: guestEntries.map((g) => ({
        name: g.name,
        associated_player: g.associatedPlayer,
        rating: g.rating,
        goalkeeper: g.goalkeeper ?? false,
        strength_hint: g.strengthHint,
      })),
      new_players: newPlayerEntries.map((p) => ({
        name: p.name,
        rating: p.rating,
        mentality: p.mentality,
        goalkeeper: p.mentality === 'goalkeeper',
        strength_hint: p.strengthHint,
      })),
    }
```

Replace with:

```ts
    const lineupMetadataForDB = {
      guests: guestEntries.map((g) => ({
        name: g.name,
        associated_player: g.associatedPlayer,
        goalkeeper: g.goalkeeper ?? false,
        strength: g.strength,
      })),
      new_players: newPlayerEntries.map((p) => ({
        name: p.name,
        mentality: p.mentality,
        goalkeeper: p.mentality === 'goalkeeper',
        strength: p.strength,
      })),
    }
```

- [ ] **Step 6: Update `handleEditLineup` to use `strength` key**

Find `components/NextMatchCard.tsx:495-502`:

```ts
      setGuestEntries(metadata.guests.map((g) => ({
        ...g,
        strengthHint: g.strengthHint ?? 'average',
      })))
      setNewPlayerEntries(metadata.new_players.map((p) => ({
        ...p,
        strengthHint: p.strengthHint ?? 'average',
      })))
```

Replace with:

```ts
      setGuestEntries(metadata.guests.map((g) => ({
        ...g,
        strength: g.strength ?? 'average',
      })))
      setNewPlayerEntries(metadata.new_players.map((p) => ({
        ...p,
        strength: p.strength ?? 'average',
      })))
```

- [ ] **Step 6.5: Update `medianRating` in `NextMatchCard.tsx`**

Find `components/NextMatchCard.tsx:42-47`:

```ts
function medianRating(players: Player[]): number {
  if (players.length === 0) return 2
  const sorted = [...players].map((p) => p.rating).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
```

Replace with:

```ts
function medianRating(players: Player[]): number {
  if (players.length === 0) return 2
  const sorted = [...players]
    .map((p) => (p.strength === null ? 2 : strengthToRating(p.strength)))
    .sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}
```

Add `strengthToRating` to the existing imports in this file (top of file). If `@/lib/strength` isn't already imported, add:

```ts
import { strengthToRating } from '@/lib/strength'
```

(`null` is mapped to 2 — the neutral default — preserving today's behavior for unrated players.)

- [ ] **Step 7: Update `components/WeekList.tsx`**

Find `components/WeekList.tsx:10`:

```ts
import type { Mentality, Player, StrengthHint, Week } from '@/lib/types'
```

Replace with:

```ts
import type { Mentality, Player, Strength, Week } from '@/lib/types'
```

Find lines 67-80 referencing `strengthHint`. Update the field name to `strength` and the type to `Strength`:

```ts
    mentality: Mentality
    strength: Strength
  }) {
```

```ts
        mentality: entry.mentality,
        strength: entry.strength,
      }),
```

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test`
Expected: PASS, except for test failures in components that haven't been migrated yet (`AddPlayerModal`, `NameGuestModal`, `ResultModal`, `PlayerRosterPanel`). These are addressed in Tasks 6-11.

Run: `npx tsc --noEmit`
Expected: Some type errors in not-yet-migrated components — that's expected and will be fixed in subsequent tasks. **Crucially**, errors in `NextMatchCard`, `WeekList`, `lib/fetchers`, and `lib/types` should be ZERO.

- [ ] **Step 9: Commit**

```bash
git add lib/types.ts lib/fetchers.ts components/NextMatchCard.tsx components/WeekList.tsx
git commit -m "refactor(types): rename strengthHint to strength on entries and metadata

Drops the redundant rating: number field from GuestEntry and
NewPlayerEntry (was hardcoded to 2 at the modal anyway). Renames
strengthHint to strength. LineupMetadata reads accept either new
key (strength) or legacy (strength_hint); writes emit only the new
key. Fetcher + NextMatchCard + WeekList migrated to the new shape."
```

---

## Task 6: Migrate `AddPlayerModal` to `<StrengthPills>`; drop hardcoded `rating: 2`

**Files:**
- Modify: `components/AddPlayerModal.tsx`

- [ ] **Step 1: Update imports and state types**

Find `components/AddPlayerModal.tsx:6`:

```ts
import type { Player, GuestEntry, NewPlayerEntry, Mentality, StrengthHint } from '@/lib/types'
```

Replace with:

```ts
import type { Player, GuestEntry, NewPlayerEntry, Mentality, Strength } from '@/lib/types'
import { StrengthPills } from '@/components/ui/StrengthPills'
```

Delete lines 20-24 (the inline `STRENGTH_OPTIONS` array — no longer needed):

```ts
const STRENGTH_OPTIONS: { value: StrengthHint; label: string }[] = [
  { value: 'below', label: 'Below average' },
  { value: 'average', label: 'Average' },
  { value: 'above', label: 'Above average' },
]
```

- [ ] **Step 2: Update state declarations**

Find lines 31, 36:

```ts
  const [guestStrength, setGuestStrength] = useState<StrengthHint>('average')
```
```ts
  const [newStrength, setNewStrength] = useState<StrengthHint>('average')
```

Replace both with `Strength`:

```ts
  const [guestStrength, setGuestStrength] = useState<Strength>('average')
```
```ts
  const [newStrength, setNewStrength] = useState<Strength>('average')
```

- [ ] **Step 3: Drop hardcoded `rating: 2` from both `onAdd` payloads**

Find `handleAddGuest` (lines 49-61):

```ts
  function handleAddGuest() {
    if (!associatedPlayer) return
    const name = deriveGuestName(associatedPlayer)
    onAdd({
      type: 'guest',
      name,
      associatedPlayer,
      rating: 2,
      goalkeeper: guestIsGoalkeeper,
      strengthHint: guestStrength,
    })
    onClose()
  }
```

Replace with:

```ts
  function handleAddGuest() {
    if (!associatedPlayer) return
    const name = deriveGuestName(associatedPlayer)
    onAdd({
      type: 'guest',
      name,
      associatedPlayer,
      goalkeeper: guestIsGoalkeeper,
      strength: guestStrength,
    })
    onClose()
  }
```

Find `handleAddNewPlayer` (lines 63-81):

```ts
  function handleAddNewPlayer() {
    const trimmed = newName.trim()
    if (!trimmed) return
    const collision = allLeaguePlayers.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    )
    if (collision) {
      setNameError(`A player named "${trimmed}" already exists in this league.`)
      return
    }
    onAdd({
      type: 'new_player',
      name: trimmed,
      rating: 2,
      mentality: newMentality,
      strengthHint: newStrength,
    })
    onClose()
  }
```

Replace with:

```ts
  function handleAddNewPlayer() {
    const trimmed = newName.trim()
    if (!trimmed) return
    const collision = allLeaguePlayers.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    )
    if (collision) {
      setNameError(`A player named "${trimmed}" already exists in this league.`)
      return
    }
    onAdd({
      type: 'new_player',
      name: trimmed,
      mentality: newMentality,
      strength: newStrength,
    })
    onClose()
  }
```

- [ ] **Step 4: Replace the inline guest-strength pill UI with `<StrengthPills>`**

Find the guest-step strength block (lines 173-198):

```tsx
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Strength
                  </label>
                  <div className="flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[11px] font-semibold">
                    {STRENGTH_OPTIONS.map(({ value, label }, i) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setGuestStrength(value)}
                        className={cn(
                          'flex-1 py-2 transition-colors',
                          i < STRENGTH_OPTIONS.length - 1 && 'border-r',
                          value === guestStrength
                            ? 'bg-blue-950 text-blue-300 border-blue-800'
                            : 'text-slate-500 border-slate-700 hover:text-slate-300'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Defaults to Average — change only if you know this player.
                  </p>
                </div>
```

Replace with:

```tsx
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Strength
                  </label>
                  <StrengthPills value={guestStrength} onChange={setGuestStrength} />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Defaults to Average — change only if you know this player.
                  </p>
                </div>
```

- [ ] **Step 5: Replace the inline new-player-strength pill UI**

Find the new-player-step strength block (lines 256-281):

```tsx
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Strength
                  </label>
                  <div className="flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[11px] font-semibold">
                    {STRENGTH_OPTIONS.map(({ value, label }, i) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setNewStrength(value)}
                        className={cn(
                          'flex-1 py-2 transition-colors',
                          i < STRENGTH_OPTIONS.length - 1 && 'border-r',
                          value === newStrength
                            ? 'bg-blue-950 text-blue-300 border-blue-800'
                            : 'text-slate-500 border-slate-700 hover:text-slate-300'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Defaults to Average — change only if you know this player.
                  </p>
                </div>
```

Replace with:

```tsx
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Strength
                  </label>
                  <StrengthPills value={newStrength} onChange={setNewStrength} />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Defaults to Average — change only if you know this player.
                  </p>
                </div>
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test`
Run: `npx tsc --noEmit`
Both expected: PASS for the parts touched. ResultModal, NameGuestModal, PlayerRosterPanel may still have errors — those are next.

- [ ] **Step 7: Commit**

```bash
git add components/AddPlayerModal.tsx
git commit -m "feat(AddPlayerModal): use shared StrengthPills; drop hardcoded rating

Replaces the inline below/avg/above pills with the shared StrengthPills
component. Removes the rating: 2 hardcode from the onAdd payload — the
chosen strength is now what carries through to promote_roster (the bug
fix promised by the spec)."
```

---

## Task 7: Migrate `NameGuestModal` to `<StrengthPills>`

**Files:**
- Modify: `components/NameGuestModal.tsx`

- [ ] **Step 1: Update imports and state**

Find `components/NameGuestModal.tsx:7`:

```ts
import type { Mentality, StrengthHint } from '@/lib/types'
```

Replace with:

```ts
import type { Mentality, Strength } from '@/lib/types'
import { StrengthPills } from '@/components/ui/StrengthPills'
```

Find line 12:

```ts
  onSubmit: (entry: { newName: string; mentality: Mentality; strengthHint: StrengthHint }) => Promise<void>
```

Replace with:

```ts
  onSubmit: (entry: { newName: string; mentality: Mentality; strength: Strength }) => Promise<void>
```

Delete lines 23-27 (`STRENGTH_OPTIONS`):

```ts
const STRENGTH_OPTIONS: { value: StrengthHint; label: string }[] = [
  { value: 'below', label: 'Below average' },
  { value: 'average', label: 'Average' },
  { value: 'above', label: 'Above average' },
]
```

Find line 32:

```ts
  const [strengthHint, setStrengthHint] = useState<StrengthHint>('average')
```

Replace with:

```ts
  const [strength, setStrength] = useState<Strength>('average')
```

- [ ] **Step 2: Update `handleSubmit` payload key**

Find line 47:

```ts
      await onSubmit({ newName: name.trim(), mentality, strengthHint })
```

Replace with:

```ts
      await onSubmit({ newName: name.trim(), mentality, strength })
```

- [ ] **Step 3: Replace the strength pill UI**

Find lines 111-137 (the entire strength block):

```tsx
            <div className="mt-3">
              <p id="strength-label" className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Strength hint</p>
              <div
                role="radiogroup"
                aria-labelledby="strength-label"
                className="mt-1 flex overflow-hidden rounded border border-slate-700"
              >
                {STRENGTH_OPTIONS.map((opt, i) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={strengthHint === opt.value}
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
```

Replace with:

```tsx
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Strength</p>
              <div className="mt-1">
                <StrengthPills value={strength} onChange={setStrength} />
              </div>
            </div>
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`
Run: `npx tsc --noEmit`

NameGuestModal callers (the `/api/league/[id]/guests/name` POST body shape) will get a type error because the payload key changed from `strengthHint` → `strength`. The API route handles this in Task 13. To get this task green, also update the call site in the same commit — search for the consumer:

```bash
grep -rn "strengthHint" components/ app/ --include="*.tsx" --include="*.ts"
```

Look for the callsite (likely `components/MatchCard.tsx` or `components/WeekList.tsx` where NameGuestModal is rendered with `onSubmit={...}`). Update the body it POSTs:

Before:
```ts
body: JSON.stringify({ ..., strengthHint: entry.strengthHint })
```

After:
```ts
body: JSON.stringify({ ..., strength: entry.strength })
```

- [ ] **Step 5: Commit**

```bash
git add components/NameGuestModal.tsx
# plus any caller you updated in step 4
git commit -m "feat(NameGuestModal): use shared StrengthPills

Replaces the inline strength pill UI. Renames the onSubmit payload
key from strengthHint to strength to match the canonical Strength type.
Caller updates the body POSTed to /api/league/[id]/guests/name."
```

---

## Task 8: Migrate `ResultModal` to `<StrengthPills>` and use `strengthToRating` on promote

**Files:**
- Modify: `components/ResultModal.tsx`

- [ ] **Step 1: Update imports and local review-state types**

Open `components/ResultModal.tsx`.

Find the `EyeTestSlider` import (line 9):

```ts
import { EyeTestSlider } from '@/components/EyeTestSlider'
```

Replace with:

```ts
import { StrengthPills } from '@/components/ui/StrengthPills'
import { strengthToRating } from '@/lib/strength'
```

The file already imports `Mentality`, etc. from `@/lib/types`. If `Strength` is not already imported there, add it.

- [ ] **Step 2: Update local review state types**

Find the local `NewPlayerReviewState` and `GuestReviewState` interfaces (search for `rating:` near the top of the file). They currently include `rating: number`. Replace with `strength: Strength`.

Example: search for `interface NewPlayerReviewState` or `type NewPlayerReviewState`:

```ts
type NewPlayerReviewState = {
  name: string
  rating: number
  mentality: Mentality
}
```

Replace with:

```ts
type NewPlayerReviewState = {
  name: string
  strength: Strength
  mentality: Mentality
}
```

Similarly for `GuestReviewState`:

```ts
type GuestReviewState = {
  name: string
  rating: number
  goalkeeper: boolean
  addToRoster: boolean
  rosterName: string
  nameError: string | null
}
```

Replace `rating: number` with `strength: Strength`.

- [ ] **Step 3: Update state initialization to map from `NewPlayerEntry.strength` / `GuestEntry.strength`**

Find the `useState` initialization that maps from `newPlayers` and `guests` props. Near lines 95-110:

```ts
  const [guestStates, setGuestStates] = useState<GuestReviewState[]>(
    guests.map((g) => ({
      name: g.name,
      rating: g.rating,
      goalkeeper: g.goalkeeper ?? false,
      addToRoster: false,
      rosterName: '',
      nameError: null,
    }))
  )
  const [newPlayerStates, setNewPlayerStates] = useState<NewPlayerReviewState[]>(
    newPlayers.map((p) => ({
      name: p.name,
      rating: p.rating,
      mentality: p.mentality,
    }))
  )
```

Replace with:

```ts
  const [guestStates, setGuestStates] = useState<GuestReviewState[]>(
    guests.map((g) => ({
      name: g.name,
      strength: g.strength,
      goalkeeper: g.goalkeeper ?? false,
      addToRoster: false,
      rosterName: '',
      nameError: null,
    }))
  )
  const [newPlayerStates, setNewPlayerStates] = useState<NewPlayerReviewState[]>(
    newPlayers.map((p) => ({
      name: p.name,
      strength: p.strength,
      mentality: p.mentality,
    }))
  )
```

- [ ] **Step 4: Rename the updater functions**

Find lines 112-113:

```ts
  function updateGuestRating(i: number, rating: number) {
    setGuestStates((prev) => prev.map((g, idx) => idx === i ? { ...g, rating } : g))
  }
```

Replace with:

```ts
  function updateGuestStrength(i: number, strength: Strength) {
    setGuestStates((prev) => prev.map((g, idx) => idx === i ? { ...g, strength } : g))
  }
```

Find lines 121-123:

```ts
  function updateNewPlayerRating(i: number, rating: number) {
    setNewPlayerStates((prev) => prev.map((p, idx) => idx === i ? { ...p, rating } : p))
  }
```

Replace with:

```ts
  function updateNewPlayerStrength(i: number, strength: Strength) {
    setNewPlayerStates((prev) => prev.map((p, idx) => idx === i ? { ...p, strength } : p))
  }
```

- [ ] **Step 5: Replace the two `<EyeTestSlider>` instances with `<StrengthPills>`**

Find line 515:

```tsx
                    <EyeTestSlider value={p.rating} onChange={(v) => updateNewPlayerRating(i, v)} />
```

Replace with:

```tsx
                    <StrengthPills value={p.strength} onChange={(v) => updateNewPlayerStrength(i, v)} />
```

Find line 555:

```tsx
                    <EyeTestSlider value={g.rating} onChange={(v) => updateGuestRating(i, v)} />
```

Replace with:

```tsx
                    <StrengthPills value={g.strength} onChange={(v) => updateGuestStrength(i, v)} />
```

Also update the label text near each (search nearby for "The Eye Test"):

Find:
```tsx
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">The Eye Test</p>
```

Replace with:
```tsx
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Strength</p>
```

(Two occurrences — line ~514 and line ~554.)

- [ ] **Step 6: Update both `promote_roster` entries arrays in `handleSave`**

Find lines 207-216 (the DNF path):

```ts
          const entries = [
            ...newPlayerStates.map((p) => ({
              name: p.name,
              rating: p.rating,
              mentality: p.mentality,
              goalkeeper: p.mentality === 'goalkeeper',
            })),
            ...guestStates
              .filter((g) => g.addToRoster && g.rosterName.trim())
              .map((g) => ({ name: g.rosterName.trim(), rating: g.rating, goalkeeper: g.goalkeeper })),
          ]
```

Replace with:

```ts
          const entries = [
            ...newPlayerStates.map((p) => ({
              name: p.name,
              rating: strengthToRating(p.strength),
              mentality: p.mentality,
              goalkeeper: p.mentality === 'goalkeeper',
            })),
            ...guestStates
              .filter((g) => g.addToRoster && g.rosterName.trim())
              .map((g) => ({
                name: g.rosterName.trim(),
                rating: strengthToRating(g.strength),
                goalkeeper: g.goalkeeper,
              })),
          ]
```

Find lines 343-353 (the normal result path) and apply the same replacement.

- [ ] **Step 7: Update the synthetic `Player` construction in `resolveTeam`**

Find `components/ResultModal.tsx:251-270`:

```ts
      function resolveTeam(names: string[]): Player[] {
        return names.map((name) => {
          const known = allPlayers.find((p) => p.name === name)
          if (known) return known
          const src = guestMap.get(name) ?? newPlayerMap.get(name)
          const isGk = src
            ? ('mentality' in src ? src.mentality === 'goalkeeper' : Boolean(src.goalkeeper))
            : false
          return {
            playerId: `review|${name}`,
            name,
            played: 0, won: 0, drew: 0, lost: 0,
            timesTeamA: 0, timesTeamB: 0,
            winRate: 0, qualified: false, points: 0,
            recentForm: '',
            mentality: isGk ? 'goalkeeper' : 'balanced',
            rating: src?.rating ?? 2,
          }
        })
      }
```

Replace with:

```ts
      function resolveTeam(names: string[]): Player[] {
        return names.map((name) => {
          const known = allPlayers.find((p) => p.name === name)
          if (known) return known
          const src = guestMap.get(name) ?? newPlayerMap.get(name)
          const isGk = src
            ? ('mentality' in src ? src.mentality === 'goalkeeper' : Boolean(src.goalkeeper))
            : false
          return {
            playerId: `review|${name}`,
            name,
            played: 0, won: 0, drew: 0, lost: 0,
            timesTeamA: 0, timesTeamB: 0,
            winRate: 0, qualified: false, points: 0,
            recentForm: '',
            mentality: isGk ? 'goalkeeper' : 'balanced',
            strength: src?.strength ?? 'average',
          }
        })
      }
```

- [ ] **Step 7.5: Update the review-summary display strings**

Find `components/ResultModal.tsx:643-659`:

```tsx
                {newPlayerStates.map((p) => (
                  <div key={p.name} className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                    <span className="text-slate-300 font-medium">{p.name}</span>
                    <span className="text-slate-500 text-xs">Added to roster · rating {p.rating}</span>
                  </div>
                ))}

                {guestStates.map((g) => (
                  <div key={g.name} className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                    <span className="text-slate-300 font-medium">
                      {g.addToRoster ? `${g.name} → ${g.rosterName.trim()}` : g.name}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {g.addToRoster ? `Added to roster · rating ${g.rating}` : 'Guest only'}
                    </span>
                  </div>
                ))}
```

Replace with:

```tsx
                {newPlayerStates.map((p) => (
                  <div key={p.name} className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                    <span className="text-slate-300 font-medium">{p.name}</span>
                    <span className="text-slate-500 text-xs">Added to roster · {p.strength}</span>
                  </div>
                ))}

                {guestStates.map((g) => (
                  <div key={g.name} className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                    <span className="text-slate-300 font-medium">
                      {g.addToRoster ? `${g.name} → ${g.rosterName.trim()}` : g.name}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {g.addToRoster ? `Added to roster · ${g.strength}` : 'Guest only'}
                    </span>
                  </div>
                ))}
```

(Display shows the literal strength label — "below", "average", "above". If you prefer prettier copy, capitalize via a tiny helper, but plain text matches the rest of the codebase.)

- [ ] **Step 8: Run tests and typecheck**

Run: `npm test`
Run: `npx tsc --noEmit`
Expected: PASS for ResultModal-touched paths. `EyeTestSlider` import is now unused — Task 9 will delete the file. PlayerRosterPanel may still error — Task 11.

- [ ] **Step 9: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "feat(ResultModal): consume Strength enum; persist hint via strengthToRating

Switches review state, updater functions, and the EyeTestSlider usage
to StrengthPills + Strength. promote_roster entries now convert the
chosen strength via strengthToRating instead of passing through the
hardcoded rating: 2 — fixes the long-standing bug where a 'strength'
chosen in the lineup builder never persisted to the roster row."
```

---

## Task 9: Delete `EyeTestSlider`

**Files:**
- Delete: `components/EyeTestSlider.tsx`

- [ ] **Step 1: Verify no remaining usages**

Run:

```bash
grep -rn "EyeTestSlider" --include="*.ts" --include="*.tsx"
```

Expected: no results. If any results appear, fix the caller (it should be using `<StrengthPills>` instead, per Task 8).

- [ ] **Step 2: Delete the file**

Run:

```bash
git rm components/EyeTestSlider.tsx
```

- [ ] **Step 3: Verify build still works**

Run: `npm test`
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: delete EyeTestSlider (replaced by StrengthPills)

No callers remain after ResultModal migration."
```

---

## Task 10: Extend `/api/league/[id]/players` GET to include `played` count

**Files:**
- Modify: `app/api/league/[id]/players/route.ts`

- [ ] **Step 1: Update the GET handler to fetch played counts**

Open `app/api/league/[id]/players/route.ts`. Find lines 18-25:

```ts
  const [playersResult, membersResult] = await Promise.all([
    supabase
      .from('player_attributes')
      .select('name, rating, mentality')
      .eq('game_id', id)
      .order('name', { ascending: true }),
    supabase.rpc('get_league_members', { p_game_id: id }),
  ])
```

Replace with:

```ts
  const [playersResult, membersResult, statsResult] = await Promise.all([
    supabase
      .from('player_attributes')
      .select('name, rating, mentality')
      .eq('game_id', id)
      .order('name', { ascending: true }),
    supabase.rpc('get_league_members', { p_game_id: id }),
    supabase.rpc('get_player_stats_public', { p_game_id: id }),
  ])
```

Find the merging section near line 43:

```ts
  const result = (playersResult.data ?? []).map((p) => ({
    ...p,
    ...(linkMap.get(p.name) ?? { linked_user_id: null, linked_display_name: null }),
  }))
```

Replace with:

```ts
  // Build map: player_name -> played count
  const playedMap = new Map<string, number>()
  for (const s of (statsResult.data ?? []) as Array<{ name: string; played: number }>) {
    playedMap.set(s.name, Number(s.played ?? 0))
  }

  const result = (playersResult.data ?? []).map((p) => ({
    name: p.name,
    rating: p.rating,
    mentality: p.mentality,
    played: playedMap.get(p.name) ?? 0,
    ...(linkMap.get(p.name) ?? { linked_user_id: null, linked_display_name: null }),
  }))
```

(Players in `player_attributes` who haven't played any matches yet get `played: 0`, which is correct.)

- [ ] **Step 2: Convert `rating` → `strength` on the API response**

The settings page consumes this endpoint and renders into `PlayerRosterPanel`. After Task 4, `PlayerAttribute.strength: Strength | null` is the contract. So the API needs to convert before returning.

Update the result mapping:

```ts
  const result = (playersResult.data ?? []).map((p) => ({
    name: p.name,
    strength: ratingToStrength(Number(p.rating ?? 0)),
    mentality: p.mentality,
    played: playedMap.get(p.name) ?? 0,
    ...(linkMap.get(p.name) ?? { linked_user_id: null, linked_display_name: null }),
  }))
```

Add the import at the top of the file:

```ts
import { ratingToStrength } from '@/lib/strength'
```

- [ ] **Step 3: Verify `app/[slug]/settings/page.tsx` consumes the new shape**

Open `app/[slug]/settings/page.tsx`. The state is `useState<PlayerAttribute[]>([])` (line 76). After Task 4, `PlayerAttribute` already includes `strength` and optional `played`. No change needed here, unless `tsc` complains.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/league/[id]/players/route.ts
git commit -m "feat(api): include played count and Strength in /players response

Joins player_attributes with get_player_stats_public to surface the
played count needed by the roster panel's 10-game hide rule. Converts
rating (int) to strength (enum) at the boundary so the client gets the
canonical PlayerAttribute shape."
```

---

## Task 11: Migrate `PlayerRosterPanel` to `<StrengthPills>` with 10-game hide

**Files:**
- Modify: `components/PlayerRosterPanel.tsx`

- [ ] **Step 1: Update the imports and intro copy**

Find `components/PlayerRosterPanel.tsx:1-7`:

```tsx
'use client'

import { useState, useCallback } from 'react'
import { ChevronDown, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Mentality, PlayerAttribute } from '@/lib/types'
import MemberLinkPicker from '@/components/MemberLinkPicker'
```

Add the StrengthPills import:

```tsx
'use client'

import { useState, useCallback } from 'react'
import { ChevronDown, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Mentality, PlayerAttribute, Strength } from '@/lib/types'
import { StrengthPills } from '@/components/ui/StrengthPills'
import MemberLinkPicker from '@/components/MemberLinkPicker'
```

Find lines 136-141 (the intro panel):

```tsx
      <div className="bg-sky-950/40 border border-sky-900/40 rounded-lg px-3.5 py-2.5 mb-3.5">
        <div className="text-xs font-semibold text-sky-400 mb-0.5">Eye test &amp; mentality influence Auto-Pick</div>
        <div className="text-xs text-slate-400">
          <span className="text-slate-300">Eye test</span> is your private read on each player — only admins ever see it. <span className="text-slate-300">1</span> = developing, <span className="text-slate-300">2</span> = solid, <span className="text-slate-300">3</span> = top player. <span className="text-slate-300">Mentality</span> (GK · DEF · BAL · ATT) tells Auto-Pick where they&apos;re best deployed. Changes save as you tap.
        </div>
      </div>
```

Replace with:

```tsx
      <div className="bg-sky-950/40 border border-sky-900/40 rounded-lg px-3.5 py-2.5 mb-3.5">
        <div className="text-xs font-semibold text-sky-400 mb-0.5">Strength &amp; mentality influence Auto-Pick</div>
        <div className="text-xs text-slate-400">
          <span className="text-slate-300">Strength</span> is your private read on each player — only admins ever see it. Set <span className="text-slate-300">Below / Average / Above</span> for players new to the league; it stops contributing after their first 10 games. <span className="text-slate-300">Mentality</span> (GK · DEF · BAL · ATT) tells Auto-Pick where they&apos;re best deployed. Changes save as you tap.
        </div>
      </div>
```

- [ ] **Step 2: Update the `patch` helper and add a `handleStrengthChange`**

Find `components/PlayerRosterPanel.tsx:40-66`:

```ts
  const patch = useCallback(
    async (name: string, update: Partial<Pick<PlayerAttribute, 'rating' | 'mentality'>>) => {
      // Capture current state before optimistic update so we can revert
      let snapshot: PlayerAttribute[] = []
      setPlayers((prev) => {
        snapshot = prev
        return prev.map((p) => (p.name === name ? { ...p, ...update } : p))
      })
      setErrorName(null)

      const res = await fetch(
        `/api/league/${leagueId}/players/${encodeURIComponent(name)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(update),
        }
      )

      if (!res.ok) {
        setPlayers(snapshot)
        setErrorName(name)
      }
    },
    [leagueId]
  )
```

Update the signature to use `strength`:

```ts
  const patch = useCallback(
    async (name: string, update: Partial<Pick<PlayerAttribute, 'strength' | 'mentality'>>) => {
      // Capture current state before optimistic update so we can revert
      let snapshot: PlayerAttribute[] = []
      setPlayers((prev) => {
        snapshot = prev
        return prev.map((p) => (p.name === name ? { ...p, ...update } : p))
      })
      setErrorName(null)

      const res = await fetch(
        `/api/league/${leagueId}/players/${encodeURIComponent(name)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(update),
        }
      )

      if (!res.ok) {
        setPlayers(snapshot)
        setErrorName(name)
      }
    },
    [leagueId]
  )
```

Find lines 124-128 (`handleRatingClick`):

```ts
  function handleRatingClick(player: PlayerAttribute, dot: number) {
    // Clicking the active dot decrements by 1 (min 1)
    const next = player.rating === dot ? Math.max(1, dot - 1) : dot
    if (next !== player.rating) patch(player.name, { rating: next })
  }
```

Replace with:

```ts
  function handleStrengthChange(name: string, next: Strength) {
    patch(name, { strength: next })
  }
```

- [ ] **Step 3: Replace the desktop rating dots block with `<StrengthPills>` (conditional)**

Find lines 196-212 (the desktop rating dots row):

```tsx
                {/* Rating dots */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500 mr-1">Eye Test</span>
                  {[1, 2, 3].map((dot) => (
                    <button
                      key={dot}
                      onClick={() => handleRatingClick(player, dot)}
                      className={cn(
                        'w-4 h-4 rounded-full border-2 transition-colors',
                        dot <= player.rating
                          ? 'bg-blue-500 border-blue-600'
                          : 'bg-slate-900 border-slate-600 hover:border-slate-400'
                      )}
                      aria-label={`Set rating to ${dot}`}
                    />
                  ))}
                </div>

                {/* Divider */}
                <div className="w-px h-4 bg-slate-700" />
```

Replace with:

```tsx
                {/* Strength pills (hidden for established players) */}
                {(player.played ?? 0) < 10 && (
                  <>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-500 mr-1">Strength</span>
                      <StrengthPills
                        value={player.strength}
                        onChange={(s) => handleStrengthChange(player.name, s)}
                        size="sm"
                      />
                    </div>
                    {/* Divider */}
                    <div className="w-px h-4 bg-slate-700" />
                  </>
                )}
```

- [ ] **Step 4: Update the mobile collapsed-row indicator**

Find lines 240-250 (the dot-count display in the mobile button):

```tsx
                <div className="flex gap-1">
                  {[1, 2, 3].map((dot) => (
                    <div
                      key={dot}
                      className={cn(
                        'w-1.5 h-1.5 rounded-full',
                        dot <= player.rating ? 'bg-blue-500' : 'bg-slate-600'
                      )}
                    />
                  ))}
                </div>
```

Replace with:

```tsx
                {(player.played ?? 0) < 10 && player.strength && (
                  <span className="text-[10px] font-semibold bg-slate-900 text-slate-400 border border-slate-700 rounded px-1.5 py-0.5">
                    {player.strength === 'below' ? 'Below' : player.strength === 'above' ? 'Above' : 'Avg'}
                  </span>
                )}
```

(Compact label tag — `Below` / `Avg` / `Above` — same visual weight as the existing mentality tag next to it.)

- [ ] **Step 5: Replace the mobile expanded rating row**

Find lines 261-281 (the mobile expanded "Eye Test" block):

```tsx
            {isExpanded && (
              <div className="sm:hidden border-t border-slate-700 px-3 py-3 flex flex-col gap-3">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Eye Test</p>
                  <div className="flex gap-2">
                    {[1, 2, 3].map((n) => (
                      <button
                        key={n}
                        onClick={() => handleRatingClick(player, n)}
                        className={cn(
                          'flex-1 py-1.5 rounded-md border text-sm font-semibold transition-colors',
                          n <= player.rating
                            ? 'bg-blue-950 border-blue-700 text-blue-300'
                            : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
```

Replace with:

```tsx
            {isExpanded && (
              <div className="sm:hidden border-t border-slate-700 px-3 py-3 flex flex-col gap-3">
                {(player.played ?? 0) < 10 && (
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1.5">Strength</p>
                    <StrengthPills
                      value={player.strength}
                      onChange={(s) => handleStrengthChange(player.name, s)}
                    />
                  </div>
                )}
```

(Keep the rest of the mobile-expanded block — Mentality and Member Link — exactly as today.)

- [ ] **Step 6: Update `__tests__/player-roster.test.ts` for the new patch shape**

Open `__tests__/player-roster.test.ts`. Find any fixture or assertion that uses `rating:` on a `PlayerAttribute` and update it (most should already be done in Task 4, but double-check).

- [ ] **Step 7: Run tests and typecheck**

Run: `npm test`
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/PlayerRosterPanel.tsx __tests__/player-roster.test.ts
git commit -m "feat(PlayerRosterPanel): use StrengthPills; hide control for 10+ game players

Replaces the 1-3 dot eye-test row with the shared StrengthPills control.
Hides the control entirely once player.played >= 10 — the rating prior's
weight in wprScore has decayed to zero by then, so editing it is
misleading. Mobile collapsed and expanded states updated to match."
```

---

## Task 12: Final cleanup — remove deprecated `StrengthHint` alias

**Files:**
- Modify: `lib/types.ts` (remove the `StrengthHint` deprecation alias added in Task 3)

- [ ] **Step 1: Verify no remaining references to `StrengthHint`**

Run:

```bash
grep -rn "StrengthHint" --include="*.ts" --include="*.tsx" lib/ components/ app/ __tests__/
```

Expected: no results (other than the alias declaration itself in `lib/types.ts`).

If any remain, replace them with `Strength` and re-run the search.

- [ ] **Step 2: Remove the alias from `lib/types.ts`**

Find:

```ts
/** @deprecated Use Strength. Removed in this PR after all callers are migrated. */
export type StrengthHint = Strength;
```

Delete those two lines entirely.

- [ ] **Step 3: Run tests and typecheck**

Run: `npm test`
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts
git commit -m "chore(types): remove StrengthHint deprecation alias

All callers now use Strength directly."
```

---

## Task 13: Update `/api/league/[id]/guests/name` to accept canonical `strength` key

**Files:**
- Modify: `app/api/league/[id]/guests/name/route.ts`

- [ ] **Step 1: Update the body shape and validation**

Open `app/api/league/[id]/guests/name/route.ts`. Find lines 1-15:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { strengthToRating } from '@/lib/strength'
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
```

Replace with:

```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { strengthToRating } from '@/lib/strength'
import type { Mentality, Strength } from '@/lib/types'

interface Body {
  weekId?: string
  oldName?: string
  newName?: string
  mentality?: Mentality
  strength?: Strength
  strengthHint?: Strength // legacy fallback, removed in follow-up PR
}

const VALID_MENTALITIES: Mentality[] = ['balanced', 'attacking', 'defensive', 'goalkeeper']
const VALID_STRENGTHS: Strength[] = ['below', 'average', 'above']
```

- [ ] **Step 2: Update the body parsing**

Find lines 37-49:

```ts
  const strengthHint = body.strengthHint
```

(plus the surrounding validation context — lines 32-49):

```ts
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
```

Replace with:

```ts
  const weekId = typeof body.weekId === 'string' ? body.weekId : ''
  const oldName = typeof body.oldName === 'string' ? body.oldName : ''
  const newName = typeof body.newName === 'string' ? body.newName.trim() : ''
  const mentality = body.mentality
  // Accept canonical `strength` key with legacy `strengthHint` fallback.
  const strength = body.strength ?? body.strengthHint

  if (!weekId || !oldName || !newName) {
    return NextResponse.json({ error: 'weekId, oldName and newName are required' }, { status: 400 })
  }
  if (!mentality || !VALID_MENTALITIES.includes(mentality)) {
    return NextResponse.json({ error: 'invalid_mentality' }, { status: 400 })
  }
  if (!strength || !VALID_STRENGTHS.includes(strength)) {
    return NextResponse.json({ error: 'invalid_strength' }, { status: 400 })
  }

  const rating = strengthToRating(strength)
```

- [ ] **Step 3: Run tests and typecheck**

Run: `npm test`
Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/league/[id]/guests/name/route.ts
git commit -m "feat(api): /guests/name accepts canonical 'strength' body key

Reads body.strength with body.strengthHint fallback for one-release
deprecation. Both convert via strengthToRating before calling
admin_name_guest. Removes the strengthHintToRating import (the helper
already moved to lib/strength.ts as strengthToRating)."
```

---

## Task 14: Final verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, no failing tests.

- [ ] **Step 2: Run TypeScript typecheck**

Run: `npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: PASS or only pre-existing warnings (unrelated to this PR).

- [ ] **Step 4: Spot-check the four user flows manually in dev**

Run: `npm run dev`

Open `http://localhost:3000` and verify:

1. **Roster panel edit** — Settings → Players. For a player with `played < 10`, the Strength pills are visible; clicking a pill saves the new value (network tab: PATCH body `{ "strength": "above" }`, response 200). For a player with `played >= 10`, NO strength control is visible. Mentality control is visible for both.

2. **Add player in lineup** — On a league's "Next Match" card, click Edit lineup → + Add player → New player. Enter a name, pick "Above average" for Strength, pick a Mentality. Save lineup. Then enter the result. After recording the result, go back to Settings → Players → find the new player. Their Strength pill should be highlighted as "Above" (proves the bug fix from Task 6 + 8).

3. **Name a guest** — On a played-week match card with a guest entry (e.g. "Alice +1"), click the rename action → Name Guest modal. Pick a Strength and Mentality, submit. The renamed player should appear in the roster with the chosen Strength.

4. **Public auto-sync** — On the public results page for a league with `match_entry` enabled publicly, record a result. The players in the lineup who weren't in `player_attributes` get a row with `rating=0`. In the admin Settings → Players, those players appear with NO pill selected (the "needs admin input" state).

If any flow misbehaves, fix in place and commit.

- [ ] **Step 5: Push and open the PR**

Run:

```bash
git push -u origin awmloveland/add-player-settings
gh pr create --base main --title "Strength consolidation: unify hint + eye test" --body "$(cat <<'EOF'
## Summary

Consolidates the parallel \`strengthHint\` and eye-test \`rating\` concepts
into a single canonical \`Strength\` enum (\`'below' | 'average' | 'above'\`)
across the TypeScript codebase. Hides the strength control in the roster
panel for players with \`played >= 10\` since the prior's weight has decayed
to zero. Fixes a latent bug where \`AddPlayerModal\` hardcoded \`rating: 2\`
and silently dropped the admin's chosen strength on promotion.

Spec: \`docs/superpowers/specs/2026-05-12-strength-consolidation-design.md\`

DB column \`player_attributes.rating int\` is unchanged — conversion happens
at the fetcher and API boundaries via \`lib/strength.ts\`. \`wprScore\` math
and the 10-game fade curve are unchanged.

## Test plan
- [ ] Roster panel: pills show for played<10, hidden for played>=10
- [ ] Add player in lineup with "Above average" → after recording, roster shows "Above"
- [ ] Name a guest with strength → permanent record reflects choice
- [ ] Public auto-sync: unrated players show no pill selected
- [ ] \`npm test\` passes
- [ ] \`npx tsc --noEmit\` passes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Notes

This plan covers every section of the spec:

- ✅ **Type system & boundary conversion** — Tasks 1, 3, 4, 5
- ✅ **Read boundaries** — Tasks 4 (data.ts, fetchers.ts) + 5 (mapWeekRow)
- ✅ **Write boundaries** — Tasks 8 (ResultModal promote_roster), 12 (PATCH route via parsePlayerPatch in Task 4), 13 (guests/name)
- ✅ **wprScore internals** — Task 4 step 4
- ✅ **Shared StrengthPills component** — Task 2
- ✅ **PlayerRosterPanel changes** — Task 11
- ✅ **AddPlayerModal changes (incl. bug fix)** — Tasks 6, 8 (ResultModal.handleSave)
- ✅ **NameGuestModal changes** — Task 7
- ✅ **NextMatchCard read/write metadata** — Task 5
- ✅ **API routes** — Tasks 10 (GET extension), 12 (PATCH via shared parser), 13 (guests/name POST)
- ✅ **Backward compat (read fallbacks)** — Task 4 step 5 (rating fallback in parsePlayerPatch), Task 5 step 2 (strength_hint fallback in mapWeekRow), Task 13 (strengthHint fallback)
- ✅ **Tests** — Tasks 1, 2 (new), 4, 11 (updates)
- ✅ **EyeTestSlider deletion** — Task 9
- ✅ **One PR, single deploy** — final assembly in Task 14
