# League Details Info Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a league info bar (location, day/time, player count, bio) between the league title and tabs on all league pages, with an admin-only empty-state prompt and a League Details settings tab to edit the fields.

**Architecture:** Four nullable columns are added to the `games` table and fetched inline on each league page by extending the existing `games` select. A `LeagueInfoBar` component handles all three states (filled, empty-admin-prompt, hidden). Editing happens via a new `LeagueDetailsForm` component in a new first tab on the settings page.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, Supabase (service client for public reads, `is_game_admin` RPC for admin writes), Jest for unit tests.

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Create | `supabase/migrations/20260323000002_league_details_columns.sql` | Add 4 nullable columns to `games` |
| Modify | `lib/types.ts` | Add `LeagueDetails` interface |
| Modify | `lib/utils.ts` | Add `buildLeagueInfoFacts()` and `isLeagueDetailsFilled()` helpers |
| Create | `__tests__/league-info-bar.test.ts` | Unit tests for the two helpers |
| Create | `components/LeagueInfoBar.tsx` | Renders filled / empty-prompt / null states |
| Modify | `components/LeaguePageHeader.tsx` | Accept `details` prop, render `<LeagueInfoBar>` |
| Modify | `app/[leagueId]/results/page.tsx` | Extend `games` select, assemble and pass `details` |
| Modify | `app/[leagueId]/players/page.tsx` | Extend `games` select, assemble and pass `details` |
| Modify | `app/[leagueId]/lineup-lab/page.tsx` | Extend `games` select, assemble and pass `details` |
| Create | `app/api/league/[id]/details/route.ts` | GET (public) + PATCH (admin) for league details |
| Create | `components/LeagueDetailsForm.tsx` | Settings form with preview strip |
| Modify | `app/[leagueId]/settings/page.tsx` | Add Details as first tab, TabInitialiser + Suspense |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260323000002_league_details_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add league detail columns to games table
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS location    text,
  ADD COLUMN IF NOT EXISTS day         text,
  ADD COLUMN IF NOT EXISTS kickoff_time text,
  ADD COLUMN IF NOT EXISTS bio         text;
```

- [ ] **Step 2: Run the migration**

Paste the SQL into the Supabase SQL Editor and execute it. Verify the four columns appear on the `games` table in the Supabase Table Editor with no default values and nullable = true.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260323000002_league_details_columns.sql
git commit -m "feat: add league detail columns to games table"
```

---

## Task 2: Add `LeagueDetails` type

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add the interface**

In `lib/types.ts`, after the `Game` interface, add:

```ts
export interface LeagueDetails {
  location: string | null
  day: string | null           // stored singular: "Thursday"
  kickoff_time: string | null  // e.g. "6:30pm"
  bio: string | null
  player_count?: number        // derived from players.length — omitted if players not fetched
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add LeagueDetails type"
```

---

## Task 3: Utility helpers + tests (TDD)

**Files:**
- Modify: `lib/utils.ts`
- Create: `__tests__/league-info-bar.test.ts`

The two helpers contain the core display logic that would otherwise be scattered across the component. Extracting them makes them testable in isolation.

- `buildLeagueInfoFacts(details: LeagueDetails): string[]` — returns an array of non-empty line-1 fact strings (location, formatted day+time, player count). Returns `[]` if all are absent.
- `isLeagueDetailsFilled(details: LeagueDetails | null | undefined): boolean` — returns true if at least one field is non-null and non-empty.

- [ ] **Step 1: Write the failing tests**

Create `__tests__/league-info-bar.test.ts`:

```ts
import { buildLeagueInfoFacts, isLeagueDetailsFilled } from '@/lib/utils'
import type { LeagueDetails } from '@/lib/types'

describe('buildLeagueInfoFacts', () => {
  it('returns empty array when all fields are null', () => {
    const details: LeagueDetails = { location: null, day: null, kickoff_time: null, bio: null }
    expect(buildLeagueInfoFacts(details)).toEqual([])
  })

  it('includes location when present', () => {
    const details: LeagueDetails = { location: 'Hackney Marshes', day: null, kickoff_time: null, bio: null }
    expect(buildLeagueInfoFacts(details)).toEqual(['📍 Hackney Marshes'])
  })

  it('formats day and kickoff_time together when both present', () => {
    const details: LeagueDetails = { location: null, day: 'Thursday', kickoff_time: '6:30pm', bio: null }
    expect(buildLeagueInfoFacts(details)).toEqual(['🕖 Thursdays · 6:30pm'])
  })

  it('omits day+time chip when only day is present', () => {
    const details: LeagueDetails = { location: null, day: 'Thursday', kickoff_time: null, bio: null }
    expect(buildLeagueInfoFacts(details)).toEqual([])
  })

  it('omits day+time chip when only kickoff_time is present', () => {
    const details: LeagueDetails = { location: null, day: null, kickoff_time: '6:30pm', bio: null }
    expect(buildLeagueInfoFacts(details)).toEqual([])
  })

  it('includes player count when present', () => {
    const details: LeagueDetails = { location: null, day: null, kickoff_time: null, bio: null, player_count: 14 }
    expect(buildLeagueInfoFacts(details)).toEqual(['👥 14 players'])
  })

  it('returns all three facts when all present', () => {
    const details: LeagueDetails = {
      location: 'Hackney Marshes',
      day: 'Thursday',
      kickoff_time: '6:30pm',
      bio: 'A great league.',
      player_count: 14,
    }
    expect(buildLeagueInfoFacts(details)).toEqual([
      '📍 Hackney Marshes',
      '🕖 Thursdays · 6:30pm',
      '👥 14 players',
    ])
  })
})

describe('isLeagueDetailsFilled', () => {
  it('returns false when details is null', () => {
    expect(isLeagueDetailsFilled(null)).toBe(false)
  })

  it('returns false when all fields are null', () => {
    const details: LeagueDetails = { location: null, day: null, kickoff_time: null, bio: null }
    expect(isLeagueDetailsFilled(details)).toBe(false)
  })

  it('returns true when location is set', () => {
    const details: LeagueDetails = { location: 'Hackney', day: null, kickoff_time: null, bio: null }
    expect(isLeagueDetailsFilled(details)).toBe(true)
  })

  it('returns true when only bio is set', () => {
    const details: LeagueDetails = { location: null, day: null, kickoff_time: null, bio: 'A great league.' }
    expect(isLeagueDetailsFilled(details)).toBe(true)
  })

  it('returns false when all fields are empty strings', () => {
    const details: LeagueDetails = { location: '', day: '', kickoff_time: '', bio: '' }
    expect(isLeagueDetailsFilled(details)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm test -- --testPathPattern=league-info-bar --no-coverage
```

Expected: FAIL — `buildLeagueInfoFacts` and `isLeagueDetailsFilled` not found.

- [ ] **Step 3: Implement the helpers in `lib/utils.ts`**

Add at the bottom of `lib/utils.ts`:

```ts
import type { LeagueDetails } from '@/lib/types'

/** Returns the array of non-empty line-1 fact strings for the info bar. */
export function buildLeagueInfoFacts(details: LeagueDetails): string[] {
  const facts: string[] = []
  if (details.location) facts.push(`📍 ${details.location}`)
  if (details.day && details.kickoff_time) facts.push(`🕖 ${details.day}s · ${details.kickoff_time}`)
  if (details.player_count !== undefined) facts.push(`👥 ${details.player_count} players`)
  return facts
}

/** Returns true if at least one LeagueDetails field is non-null and non-empty. */
export function isLeagueDetailsFilled(details: LeagueDetails | null | undefined): boolean {
  if (!details) return false
  return !!(details.location || details.day || details.kickoff_time || details.bio)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm test -- --testPathPattern=league-info-bar --no-coverage
```

Expected: PASS — all 11 tests green.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts __tests__/league-info-bar.test.ts
git commit -m "feat: add buildLeagueInfoFacts and isLeagueDetailsFilled helpers"
```

---

## Task 4: `LeagueInfoBar` component

**Files:**
- Create: `components/LeagueInfoBar.tsx`

- [ ] **Step 1: Create the component**

```tsx
import Link from 'next/link'
import { buildLeagueInfoFacts, isLeagueDetailsFilled } from '@/lib/utils'
import type { LeagueDetails } from '@/lib/types'

interface LeagueInfoBarProps {
  details: LeagueDetails | null
  isAdmin: boolean
  leagueId: string
}

export function LeagueInfoBar({ details, isAdmin, leagueId }: LeagueInfoBarProps) {
  const filled = isLeagueDetailsFilled(details)

  // Nothing to show
  if (!filled && !isAdmin) return null

  // Empty state — admin prompt only
  if (!filled) {
    return (
      <div className="mb-3 flex items-center justify-between rounded-md border border-dashed border-slate-700 px-3 py-2">
        <span className="text-xs text-slate-500">Add location, schedule &amp; a short bio</span>
        <Link
          href={`/${leagueId}/settings?tab=details`}
          className="text-xs text-blue-500 hover:text-blue-400"
        >
          + Add details
        </Link>
      </div>
    )
  }

  // Filled state
  const facts = buildLeagueInfoFacts(details!)
  const hasFacts = facts.length > 0
  const hasBio = !!(details?.bio)

  return (
    <div className="mb-3">
      {hasFacts && (
        <p className="text-sm text-slate-500">
          {facts.join(' · ')}
        </p>
      )}
      {hasBio && (
        <p className="text-sm text-slate-500 leading-snug">
          {details!.bio}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/LeagueInfoBar.tsx
git commit -m "feat: add LeagueInfoBar component"
```

---

## Task 5: Wire `LeagueInfoBar` into `LeaguePageHeader`

**Files:**
- Modify: `components/LeaguePageHeader.tsx`

- [ ] **Step 1: Add `details` prop and render `LeagueInfoBar`**

Replace the current `LeaguePageHeaderProps` interface and component:

```tsx
import Link from 'next/link'
import { Settings, ClipboardList, Users, FlaskConical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LeagueInfoBar } from '@/components/LeagueInfoBar'
import { cn } from '@/lib/utils'
import type { LeagueDetails } from '@/lib/types'

interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  playedCount: number
  totalWeeks: number
  pct: number
  currentTab: 'results' | 'players' | 'lineup-lab'
  isAdmin: boolean
  showLineupLabTab?: boolean
  details?: LeagueDetails | null
}

export function LeaguePageHeader({
  leagueName,
  leagueId,
  playedCount,
  totalWeeks,
  pct,
  currentTab,
  isAdmin,
  showLineupLabTab,
  details,
}: LeaguePageHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">{leagueName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {playedCount} of {totalWeeks} weeks ({pct}% complete)
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="ghost" size="icon">
            <Link href={`/${leagueId}/settings`} aria-label="League settings">
              <Settings className="size-4" />
            </Link>
          </Button>
        )}
      </div>
      <div className="mt-3">
        <LeagueInfoBar details={details ?? null} isAdmin={isAdmin} leagueId={leagueId} />
      </div>
      <nav className="flex gap-6 border-b border-slate-700 pt-3">
        <Link
          href={`/${leagueId}/results`}
          className={cn(
            '-mb-px flex items-center gap-2 border-b-2 pb-2 text-base font-medium',
            currentTab === 'results'
              ? 'border-slate-100 text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <ClipboardList className="size-4" />
          Results
        </Link>
        <Link
          href={`/${leagueId}/players`}
          className={cn(
            '-mb-px flex items-center gap-2 border-b-2 pb-2 text-base font-medium',
            currentTab === 'players'
              ? 'border-slate-100 text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          <Users className="size-4" />
          Players
        </Link>
        {showLineupLabTab && (
          <Link
            href={`/${leagueId}/lineup-lab`}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 pb-2 text-base font-medium',
              currentTab === 'lineup-lab'
                ? 'border-slate-100 text-slate-100'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            )}
          >
            <FlaskConical className="size-4" />
            Lineup Lab
          </Link>
        )}
      </nav>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/LeaguePageHeader.tsx
git commit -m "feat: wire LeagueInfoBar into LeaguePageHeader"
```

---

## Task 6: Pass `details` from the Results page

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

- [ ] **Step 1: Extend the `games` select and assemble `details`**

In `app/[leagueId]/results/page.tsx`:

1. Change the `games` select at the top (line ~30) from:
   ```ts
   .select('id, name')
   ```
   to:
   ```ts
   .select('id, name, location, day, kickoff_time, bio')
   ```

2. After the `players` array is assembled (after line ~173), add:
   ```ts
   import type { LeagueDetails } from '@/lib/types'

   const details: LeagueDetails = {
     location: game.location ?? null,
     day: game.day ?? null,
     kickoff_time: game.kickoff_time ?? null,
     bio: game.bio ?? null,
     player_count: players.length,
   }
   ```

3. Pass `details={details}` to both `<LeaguePageHeader>` calls in the public render and the member/admin render.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/[leagueId]/results/page.tsx
git commit -m "feat: pass league details to LeaguePageHeader on results page"
```

---

## Task 7: Pass `details` from the Players page

**Files:**
- Modify: `app/[leagueId]/players/page.tsx`

- [ ] **Step 1: Extend the `games` select and assemble `details`**

1. Change the `games` select (line ~26) from:
   ```ts
   .select('id, name')
   ```
   to:
   ```ts
   .select('id, name, location, day, kickoff_time, bio')
   ```

2. After `players` is assembled (after line ~129), add:
   ```ts
   const details: LeagueDetails = {
     location: game.location ?? null,
     day: game.day ?? null,
     kickoff_time: game.kickoff_time ?? null,
     bio: game.bio ?? null,
     player_count: players.length,
   }
   ```
   Note: on the players page, `players` is always fetched before the render (the early return at line ~106 exits before `LeaguePageHeader` is rendered), so `players.length` is always safe here.

3. Add `import type { LeagueDetails } from '@/lib/types'` to the import block (merge with existing type imports).

4. Pass `details={details}` to `<LeaguePageHeader>`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/[leagueId]/players/page.tsx
git commit -m "feat: pass league details to LeaguePageHeader on players page"
```

---

## Task 8: Pass `details` from the Lineup Lab page

**Files:**
- Modify: `app/[leagueId]/lineup-lab/page.tsx`

- [ ] **Step 1: Extend the `games` select and assemble `details`**

1. Change the `games` select (line ~24) from:
   ```ts
   .select('id, name')
   ```
   to:
   ```ts
   .select('id, name, location, day, kickoff_time, bio')
   ```

2. After `players` is assembled (after line ~129), add:
   ```ts
   const details: LeagueDetails = {
     location: game.location ?? null,
     day: game.day ?? null,
     kickoff_time: game.kickoff_time ?? null,
     bio: game.bio ?? null,
     player_count: players.length,
   }
   ```

3. Add `import type { LeagueDetails } from '@/lib/types'` to imports.

4. Pass `details={details}` to `<LeaguePageHeader>`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/[leagueId]/lineup-lab/page.tsx
git commit -m "feat: pass league details to LeaguePageHeader on lineup-lab page"
```

---

## Task 9: API route for league details

**Files:**
- Create: `app/api/league/[id]/details/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { NextResponse } from 'next/server'

const VALID_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const VALID_TIMES = ['5:00pm', '5:30pm', '6:00pm', '6:30pm', '7:00pm', '7:30pm', '8:00pm', '8:30pm', '9:00pm']

/** GET — returns league details. Publicly accessible. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const service = createServiceClient()

  const { data: game, error } = await service
    .from('games')
    .select('location, day, kickoff_time, bio')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Derive player_count via COUNT on game_members
  const { count } = await service
    .from('game_members')
    .select('*', { count: 'exact', head: true })
    .eq('game_id', id)

  return NextResponse.json({
    location: game.location ?? null,
    day: game.day ?? null,
    kickoff_time: game.kickoff_time ?? null,
    bio: game.bio ?? null,
    player_count: count ?? 0,
  })
}

/** PATCH — update league details. Admin only. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()

  // Validate optional fields
  const location = typeof body.location === 'string' ? body.location.trim() || null : null
  const day = typeof body.day === 'string' && VALID_DAYS.includes(body.day) ? body.day : null
  const kickoff_time = typeof body.kickoff_time === 'string' && VALID_TIMES.includes(body.kickoff_time) ? body.kickoff_time : null
  const bio = typeof body.bio === 'string' ? body.bio.trim() || null : null

  const service = createServiceClient()
  const { error } = await service
    .from('games')
    .update({ location, day, kickoff_time, bio })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/details/route.ts
git commit -m "feat: add GET/PATCH API route for league details"
```

---

## Task 10: `LeagueDetailsForm` component

**Files:**
- Create: `components/LeagueDetailsForm.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { buildLeagueInfoFacts } from '@/lib/utils'
import type { LeagueDetails } from '@/lib/types'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TIMES = ['5:00pm', '5:30pm', '6:00pm', '6:30pm', '7:00pm', '7:30pm', '8:00pm', '8:30pm', '9:00pm']

interface LeagueDetailsFormProps {
  leagueId: string
}

export function LeagueDetailsForm({ leagueId }: LeagueDetailsFormProps) {
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<LeagueDetails | null>(null)
  const [location, setLocation] = useState('')
  const [day, setDay] = useState('')
  const [kickoffTime, setKickoffTime] = useState('')
  const [bio, setBio] = useState('')
  const [playerCount, setPlayerCount] = useState<number>(0)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/league/${leagueId}/details`, { credentials: 'include' })
        const data = await res.json()
        setLocation(data.location ?? '')
        setDay(data.day ?? '')
        setKickoffTime(data.kickoff_time ?? '')
        setBio(data.bio ?? '')
        setPlayerCount(data.player_count ?? 0)
        setSaved({
          location: data.location ?? null,
          day: data.day ?? null,
          kickoff_time: data.kickoff_time ?? null,
          bio: data.bio ?? null,
          player_count: data.player_count ?? 0,
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [leagueId])

  async function handleSave() {
    setSaving(true)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/details`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          location: location.trim() || null,
          day: day || null,
          kickoff_time: kickoffTime || null,
          bio: bio.trim() || null,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Save failed')
      }
      setSaved({
        location: location.trim() || null,
        day: day || null,
        kickoff_time: kickoffTime || null,
        bio: bio.trim() || null,
        player_count: playerCount,
      })
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setSaveState('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-400 py-4">Loading…</p>
  }

  // Build preview using saved values
  const previewFacts = saved ? buildLeagueInfoFacts(saved) : []
  const previewBio = saved?.bio ?? null

  return (
    <div className="rounded-lg bg-slate-800 border border-slate-700 overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 border-b border-slate-700/60">
        <p className="text-sm font-medium text-slate-200">League Details</p>
        <p className="text-xs text-slate-500 mt-0.5">Shown between the league title and tabs on all league pages.</p>
      </div>

      {/* Card body */}
      <div className="px-4 py-4 space-y-4">

        {/* Preview strip */}
        <div className="rounded-md bg-slate-900 border border-slate-800 px-3 py-2.5">
          <p className="text-xs uppercase tracking-wide text-slate-600 mb-1.5">Preview</p>
          {previewFacts.length === 0 && !previewBio ? (
            <p className="text-xs text-slate-600 italic">Nothing to preview yet.</p>
          ) : (
            <>
              {previewFacts.length > 0 && (
                <p className="text-sm text-slate-500">{previewFacts.join(' · ')}</p>
              )}
              {previewBio && (
                <p className="text-sm text-slate-500 leading-snug">{previewBio}</p>
              )}
            </>
          )}
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1.5">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Hackney Marshes, Pitch 3"
            className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-slate-500"
          />
        </div>

        {/* Day + Kick-off time */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1.5">Day</label>
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-slate-500"
            >
              <option value="">— select —</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1.5">Kick-off time</label>
            <select
              value={kickoffTime}
              onChange={(e) => setKickoffTime(e.target.value)}
              className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-slate-500"
            >
              <option value="">— select —</option>
              {TIMES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Players (read-only) */}
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1.5">Players in league</label>
          <div className="flex items-center gap-2 rounded-md bg-slate-900 border border-slate-800 px-3 py-2">
            <span className="text-sm text-slate-500">{playerCount} players</span>
            <span className="text-xs rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-slate-500">auto</span>
          </div>
          <p className="mt-1 text-xs text-slate-600">Counted from the Players tab — updates automatically.</p>
        </div>

        <hr className="border-slate-700/40" />

        {/* Bio */}
        <div>
          <label className="block text-xs uppercase tracking-wide text-slate-500 mb-1.5">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="A short description of the league…"
            rows={3}
            className="w-full rounded-md bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-slate-500 resize-none leading-relaxed"
          />
          <p className="mt-1 text-xs text-slate-600">Keep it short — one or two sentences works best.</p>
        </div>

      </div>

      {/* Card footer */}
      <div className="px-4 py-3 border-t border-slate-700/60">
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'w-full rounded-md py-2 text-sm font-medium transition-colors',
            saveState === 'saved'
              ? 'bg-slate-700 text-slate-300'
              : 'bg-slate-100 text-slate-900 hover:bg-white disabled:opacity-50'
          )}
        >
          {saving ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save changes'}
        </button>
        {saveState === 'error' && errorMsg && (
          <p className="mt-2 text-xs text-red-400">{errorMsg}</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add components/LeagueDetailsForm.tsx
git commit -m "feat: add LeagueDetailsForm settings component"
```

---

## Task 11: Update settings page

**Files:**
- Modify: `app/[leagueId]/settings/page.tsx`

- [ ] **Step 1: Add the `'details'` section, `TabInitialiser`, and `LeagueDetailsForm`**

Make the following changes to `app/[leagueId]/settings/page.tsx`:

**a) Imports** — add to the top of the file:
```ts
import { Suspense, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Info, Settings2, Users } from 'lucide-react'
import { LeagueDetailsForm } from '@/components/LeagueDetailsForm'
```
(Remove `Settings2` and `Users` from the existing import and replace with the above if they're already there.)

**b) Section type** — change:
```ts
type Section = 'members' | 'features'
```
to:
```ts
type Section = 'details' | 'members' | 'features'
```

**c) `useState` default** — change:
```ts
const [section, setSection] = useState<Section>('members')
```
to:
```ts
const [section, setSection] = useState<Section>('details')
```

**d) `TabInitialiser` component** — add this component definition inside the file, before `LeagueSettingsPage`:

```tsx
function TabInitialiser({ onTab }: { onTab: (tab: Section) => void }) {
  const searchParams = useSearchParams()
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab === 'details' || tab === 'members' || tab === 'features') {
      onTab(tab as Section)
    }
  }, [searchParams, onTab])
  return null
}
```

**e) `NAV` array** — replace the existing `NAV` with:
```ts
const NAV: { id: Section; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'details',  label: 'League Details', Icon: Info },
  { id: 'members',  label: 'Members',        Icon: Users },
  { id: 'features', label: 'Features',       Icon: Settings2 },
]
```

**f) Add `<Suspense>` + `<TabInitialiser>` just before the section tabs nav** — inside the return, before the `<div className="flex gap-1 mb-6...">` tabs row:
```tsx
<Suspense fallback={null}>
  <TabInitialiser onTab={setSection} />
</Suspense>
```

**g) Add the details section render block** — add before the `{section === 'members' && ...}` block:
```tsx
{section === 'details' && (
  <LeagueDetailsForm leagueId={leagueId} />
)}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Run all tests**

```bash
npm test -- --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/[leagueId]/settings/page.tsx
git commit -m "feat: add League Details tab to settings page"
```

---

## Task 12: End-to-end smoke test

Manual verification steps before opening the PR.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify empty state (admin)**

1. Sign in as an admin and open a league
2. Confirm a dashed prompt strip "Add location, schedule & a short bio" appears between the title and tabs
3. Click "+ Add details" — confirm it lands on the League Details tab in settings (not Members)

- [ ] **Step 3: Verify the settings form**

1. In the League Details tab, confirm the card renders with preview, all fields, and full-width Save button
2. Fill in all fields and click Save
3. Confirm the button shows "Saved" for ~2 seconds

- [ ] **Step 4: Verify filled state**

1. Navigate back to the league (Results, Players, Lineup Lab)
2. Confirm the info bar shows the filled state on all three tabs
3. Confirm line 1 shows location · day+time · player count
4. Confirm line 2 shows the bio (plain text, not italic)

- [ ] **Step 5: Verify member/public visibility**

1. Sign in as a member (or open the public league URL)
2. Confirm the filled info bar is visible
3. Clear all fields in settings (save with empty fields)
4. Confirm the info bar disappears entirely for members and public

- [ ] **Step 6: Commit any fixes, then open the PR**

```bash
git push origin awmloveland/league-details-info-bar
```
