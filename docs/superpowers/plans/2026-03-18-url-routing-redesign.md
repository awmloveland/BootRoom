# URL & Routing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate BootRoom onto a single domain (`craft-football.com`), unify public and member league URLs at `/[leagueId]/results` and `/[leagueId]/players`, remove the redundant `public_results_enabled` gate, introduce a developer-only Experiments panel for global feature availability, and simplify the middleware from ~150 lines to ~40.

**Architecture:** New `app/[leagueId]/` route group replaces the split `app/app/league/[id]/` (member) and `app/results/[id]/` (public) directories. All pages in `[leagueId]/` are server components that resolve the viewer's role at render time and show the appropriate tier. A new `feature_experiments` table acts as a global kill switch above the existing per-league `league_features` flags. Middleware drops all hostname logic and becomes a simple auth/role guard.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (PostgreSQL + RLS + Auth), Tailwind CSS, `@supabase/ssr`

**Spec:** `docs/superpowers/specs/2026-03-18-url-routing-redesign-design.md`

> **Note on testing:** This project has no test framework configured. Each task uses `npx tsc --noEmit` (type safety) and `npm run build` (compilation) as verification. Manual smoke-test steps are included at the end of each task.

---

## File Map

### Created
| File | Purpose |
|---|---|
| `supabase/migrations/20260318000001_profiles_role_and_experiments.sql` | Add `profiles.role`, create `feature_experiments` table |
| `supabase/migrations/20260318000002_drop_public_results_enabled.sql` | Drop `games.public_results_enabled` |
| `app/[leagueId]/page.tsx` | Redirect `/[leagueId]` → `/[leagueId]/results` |
| `app/[leagueId]/results/page.tsx` | Auth-aware results page (merges member + public views) |
| `app/[leagueId]/players/page.tsx` | Auth-aware players page (merges member + public views) |
| `app/[leagueId]/settings/page.tsx` | League admin panel (members + invite link only) |
| `app/not-found.tsx` | Global 404 page |
| `app/experiments/page.tsx` | Developer-only global feature flag panel |
| `app/api/experiments/route.ts` | GET/PATCH global feature availability |
| `components/LeaguePrivateState.tsx` | Empty state shown when league has no public features |

### Modified
| File | Change |
|---|---|
| `lib/types.ts` | Add `ProfileRole` type; add `available` field to `LeagueFeature` |
| `middleware.ts` | Complete rewrite — single domain, role-based auth guards only |
| `app/layout.tsx` | Add `<Navbar />` and app shell (replaces `app/app/layout.tsx`) |
| `app/page.tsx` | Merge `app/app/page.tsx` (league list) + `app/website/page.tsx` (public directory) |
| `app/api/league/[id]/features/route.ts` | Gate responses by `feature_experiments.available` |
| `app/settings/page.tsx` | Repurpose as user account page (display name, email, password) |
| `components/ui/navbar.tsx` | Add Experiments icon (developer only); fix settings link routing |
| `vercel.json` | Add 301 redirect from `m.craft-football.com` to `craft-football.com` |

### Deleted
| Path | Reason |
|---|---|
| `app/app/` | Entire directory replaced by flat `app/` structure |
| `app/website/` | Merged into `app/page.tsx` |
| `app/results/` | Replaced by `app/[leagueId]/results/` |
| `app/api/league/[id]/public/route.ts` | `public_results_enabled` column removed |

---

## Task 1: Database migration — profiles.role + feature_experiments

**Files:**
- Create: `supabase/migrations/20260318000001_profiles_role_and_experiments.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260318000001_profiles_role_and_experiments.sql

-- 1. Add role column to profiles
ALTER TABLE profiles
  ADD COLUMN role text NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'developer'));

-- 2. Create feature_experiments table
CREATE TABLE feature_experiments (
  feature     text PRIMARY KEY,
  available   boolean NOT NULL DEFAULT false,
  updated_by  uuid REFERENCES auth.users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Seed with all current FeatureKey values
-- Active features start as available = true
INSERT INTO feature_experiments (feature, available) VALUES
  ('match_history',     true),
  ('match_entry',       true),
  ('team_builder',      true),
  ('player_stats',      true),
  ('player_comparison', false);

-- 4. RLS: only authenticated developers can write; all authenticated users can read
ALTER TABLE feature_experiments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "developers can manage experiments"
  ON feature_experiments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'developer')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'developer')
  );

CREATE POLICY "authenticated users can read experiments"
  ON feature_experiments
  FOR SELECT
  TO authenticated
  USING (true);
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Paste the contents of the migration file into the Supabase SQL Editor for your project and run it. Verify:
- `profiles` table has a `role` column (check Table Editor)
- `feature_experiments` table exists with 5 rows

- [ ] **Step 3: Elevate your developer account**

In Supabase SQL Editor:
```sql
UPDATE profiles SET role = 'developer' WHERE email = 'your@email.com';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260318000001_profiles_role_and_experiments.sql
git commit -m "feat: add profiles.role and feature_experiments table"
```

---

## Task 2: Database migration — drop public_results_enabled

**Files:**
- Create: `supabase/migrations/20260318000002_drop_public_results_enabled.sql`

> **Important:** Run this migration AFTER the new routes are deployed and verified. Dropping the column before new code is live will break the existing app. Add this file now but hold running it until Task 14 is complete.

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260318000002_drop_public_results_enabled.sql

-- Safe to drop: public league visibility is now derived from
-- league_features.public_enabled (per-feature) gated by
-- feature_experiments.available (global). Leagues that were
-- previously public retain their public_enabled flags on
-- league_features and will continue to be publicly visible.

ALTER TABLE games DROP COLUMN IF EXISTS public_results_enabled;
```

- [ ] **Step 2: Commit (do not run yet)**

```bash
git add supabase/migrations/20260318000002_drop_public_results_enabled.sql
git commit -m "feat: migration to drop public_results_enabled (run after deploy)"
```

---

## Task 3: Update TypeScript types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add `ProfileRole` and `available` to `LeagueFeature`**

In `lib/types.ts`, add `ProfileRole` after the existing types and add `available` to `LeagueFeature`:

```typescript
// Add near the top, after existing type exports:
export type ProfileRole = 'user' | 'developer';
```

Update the `LeagueFeature` interface to include the global availability flag:

```typescript
export interface LeagueFeature {
  feature: FeatureKey;
  available: boolean;             // whether this feature is globally available (from feature_experiments)
  enabled: boolean;               // whether members can access this feature
  config?: FeatureConfig | null;
  public_enabled: boolean;
  public_config?: FeatureConfig | null;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd /path/to/BootRoom && npx tsc --noEmit
```

Expected: errors may appear on callers of `LeagueFeature` that don't provide `available` — note them, they'll be fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add ProfileRole type and available field to LeagueFeature"
```

---

## Task 4: Add Experiments API route

**Files:**
- Create: `app/api/experiments/route.ts`

- [ ] **Step 1: Write the route**

```typescript
// app/api/experiments/route.ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { FeatureKey } from '@/lib/types'

/** GET — returns all feature_experiments rows. Any authenticated user can read. */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('feature_experiments')
    .select('feature, available, updated_at')
    .order('feature')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/** PATCH — update availability for one feature. Developer only. */
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check developer role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'developer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json() as { feature: FeatureKey; available: boolean }
  if (!body.feature || typeof body.available !== 'boolean') {
    return NextResponse.json({ error: 'Invalid body: feature and available required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('feature_experiments')
    .update({ available: body.available, updated_by: user.id, updated_at: new Date().toISOString() })
    .eq('feature', body.feature)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/experiments/route.ts
git commit -m "feat: add /api/experiments GET/PATCH route"
```

---

## Task 5: Update features API to gate by feature_experiments

**Files:**
- Modify: `app/api/league/[id]/features/route.ts`

The GET handler must now cross-reference `feature_experiments.available`. Features that are globally disabled are excluded from responses (except nothing changes for admins — they bypass feature checks at the page level, but the API still filters for simplicity).

- [ ] **Step 1: Update the GET handler**

Replace the GET function body in `app/api/league/[id]/features/route.ts`:

```typescript
/** GET — returns feature flags for a league, gated by global feature_experiments availability. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch global availability and per-league flags in parallel
  const [experimentsResult, leagueResult] = await Promise.all([
    supabase.from('feature_experiments').select('feature, available'),
    supabase.from('league_features').select('*').eq('game_id', id),
  ])

  if (experimentsResult.error) {
    return NextResponse.json({ error: experimentsResult.error.message }, { status: 500 })
  }

  const availableSet = new Set(
    (experimentsResult.data ?? [])
      .filter((e) => e.available)
      .map((e) => e.feature as FeatureKey)
  )

  // Merge with defaults, then filter by global availability
  const featureMap = Object.fromEntries((leagueResult.data ?? []).map((f) => [f.feature, f]))
  const features = DEFAULT_FEATURES
    .filter((def) => availableSet.has(def.feature))
    .map((def) => {
      const row = featureMap[def.feature] ?? def
      return { ...row, available: true }
    })

  return NextResponse.json(features)
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/features/route.ts
git commit -m "feat: gate features API response by feature_experiments.available"
```

---

## Task 6: Rewrite middleware

**Files:**
- Modify: `middleware.ts` (full replacement)

- [ ] **Step 1: Replace middleware.ts**

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SIGN_IN_PATH = '/sign-in'

// Routes that require a valid Supabase session
const AUTH_REQUIRED = ['/settings', '/add-game']

// Routes that require profiles.role = 'developer'
const DEVELOPER_REQUIRED = ['/experiments', '/add-game']

function getSupabaseUrl() { return process.env.NEXT_PUBLIC_SUPABASE_URL! }
function getSupabaseAnonKey() {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip static assets, API routes, and auth callback
  if (
    pathname.startsWith('/api') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/_next')
  ) {
    return NextResponse.next({ request })
  }

  // Fix Supabase magic link: /?code= → /auth/callback?code=
  const code = request.nextUrl.searchParams.get('code')
  if (code && (pathname === '/' || pathname === '')) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/callback'
    return NextResponse.redirect(url)
  }

  // Check if this path needs auth or developer role
  const needsAuth = AUTH_REQUIRED.some((p) => pathname === p || pathname.startsWith(p + '/'))
  const needsDeveloper = DEVELOPER_REQUIRED.some((p) => pathname === p || pathname.startsWith(p + '/'))
  const needsLeagueAdmin = /^\/[^/]+\/settings(\/|$)/.test(pathname)

  if (!needsAuth && !needsDeveloper && !needsLeagueAdmin) {
    return NextResponse.next({ request })
  }

  // Build supabase client to check session
  const response = NextResponse.next({ request })
  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = SIGN_IN_PATH
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  if (needsDeveloper) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.role !== 'developer') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  if (needsLeagueAdmin) {
    // Extract leagueId from path like /abc-uuid/settings
    const leagueId = pathname.split('/')[1]
    const { data: member } = await supabase
      .from('game_members')
      .select('role')
      .eq('game_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member || !['creator', 'admin'].includes(member.role)) {
      return NextResponse.redirect(new URL(`/${leagueId}/results`, request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: rewrite middleware for single domain, role-based guards"
```

---

## Task 7: Create LeaguePrivateState component and not-found page

**Files:**
- Create: `components/LeaguePrivateState.tsx`
- Create: `app/not-found.tsx`

- [ ] **Step 1: Create LeaguePrivateState**

```typescript
// components/LeaguePrivateState.tsx
import Link from 'next/link'

interface Props {
  leagueName: string
}

export function LeaguePrivateState({ leagueName }: Props) {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
      <p className="text-slate-100 font-semibold text-lg mb-2">{leagueName}</p>
      <p className="text-slate-400 text-sm mb-6">
        This league hasn&apos;t made any content public yet.
      </p>
      <Link
        href="/sign-in"
        className="inline-flex items-center px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors"
      >
        Sign in
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Create not-found page**

```typescript
// app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
      <p className="text-slate-100 font-semibold text-lg mb-2">Page not found</p>
      <p className="text-slate-400 text-sm mb-6">
        This page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link
        href="/"
        className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium transition-colors"
      >
        Go home
      </Link>
    </div>
  )
}
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add components/LeaguePrivateState.tsx app/not-found.tsx
git commit -m "feat: add LeaguePrivateState component and 404 page"
```

---

## Task 8: Create auth-aware results page

**Files:**
- Create: `app/[leagueId]/page.tsx` (redirect)
- Create: `app/[leagueId]/results/page.tsx`

This is a server component that checks auth state and renders the appropriate tier. It replaces both `app/app/league/[id]/page.tsx` (member) and `app/results/[id]/page.tsx` (public).

- [ ] **Step 1: Create the redirect page**

```typescript
// app/[leagueId]/page.tsx
import { redirect } from 'next/navigation'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LeagueIndexPage({ params }: Props) {
  const { leagueId } = await params
  redirect(`/${leagueId}/results`)
}
```

- [ ] **Step 2: Create the auth-aware results page**

```typescript
// app/[leagueId]/results/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { sortWeeks } from '@/lib/utils'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { NextMatchCard } from '@/components/NextMatchCard'
import type { Week, LeagueFeature, GameRole } from '@/lib/types'
import type { ScheduledWeek } from '@/components/NextMatchCard'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function ResultsPage({ params }: Props) {
  const { leagueId } = await params

  const supabase = await createClient()
  const service = createServiceClient()

  // Check if league exists
  const { data: game } = await service
    .from('games')
    .select('id, name')
    .eq('id', leagueId)
    .maybeSingle()

  if (!game) notFound()

  // Check auth + membership
  const { data: { user } } = await supabase.auth.getUser()
  let userRole: GameRole | null = null
  if (user) {
    const { data: membership } = await service
      .from('game_members')
      .select('role')
      .eq('game_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    userRole = (membership?.role as GameRole) ?? null
  }

  const tier = resolveVisibilityTier(userRole)

  // Fetch global availability + league features in parallel
  const [experimentsResult, featuresResult] = await Promise.all([
    service.from('feature_experiments').select('feature, available'),
    service.from('league_features').select('*').eq('game_id', leagueId),
  ])

  const availableSet = new Set(
    (experimentsResult.data ?? []).filter((e) => e.available).map((e) => e.feature)
  )

  const rawFeatures: LeagueFeature[] = (featuresResult.data ?? [])
    .filter((f) => availableSet.has(f.feature))
    .map((f) => ({ ...f, available: true }))

  // If public tier with no public features → private state
  if (tier === 'public') {
    const hasPublicContent = rawFeatures.some((f) => f.public_enabled)
    if (!hasPublicContent) {
      return <LeaguePrivateState leagueName={game.name} />
    }
  }

  // Fetch weeks
  const { data: weeksData } = await service
    .from('weeks')
    .select('week, date, status, format, team_a, team_b, winner, notes')
    .eq('game_id', leagueId)
    .in('status', ['played', 'cancelled', 'scheduled'])
    .order('week', { ascending: false })

  type WeekRow = {
    week: number; date: string; status: string; format: string | null;
    team_a: string[] | null; team_b: string[] | null; winner: string | null; notes: string | null;
  }
  const weeks: Week[] = sortWeeks(
    (weeksData as WeekRow[] ?? [])
      .filter((r) => r.status !== 'scheduled')
      .map((row) => ({
        week: row.week,
        date: row.date,
        status: row.status as Week['status'],
        format: row.format ?? undefined,
        teamA: row.team_a ?? [],
        teamB: row.team_b ?? [],
        winner: row.winner as Week['winner'] ?? null,
        notes: row.notes ?? undefined,
      }))
  )

  const showMatchEntry = isFeatureEnabled(rawFeatures, 'match_entry', tier)
  const showMatchHistory = isFeatureEnabled(rawFeatures, 'match_history', tier)

  // Fetch scheduled week for match entry section (if applicable)
  let nextWeek: ScheduledWeek | null = null
  if (showMatchEntry) {
    const { data: scheduledRows } = await service
      .from('weeks')
      .select('week, date, format, team_a, team_b')
      .eq('game_id', leagueId)
      .eq('status', 'scheduled')
      .order('week', { ascending: false })
      .limit(1)
    if (scheduledRows?.[0]) {
      const r = scheduledRows[0]
      nextWeek = {
        week: r.week,
        date: r.date,
        format: r.format ?? '',
        teamA: r.team_a ?? [],
        teamB: r.team_b ?? [],
      }
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-100 mb-6">{game.name}</h1>

      {showMatchEntry && nextWeek && (
        <NextMatchCard
          leagueId={leagueId}
          week={nextWeek}
          userRole={userRole}
          features={rawFeatures}
        />
      )}

      {showMatchHistory && (
        <WeekList weeks={weeks} />
      )}
    </main>
  )
}
```

- [ ] **Step 2b: Create WeekList client component**

The accordion open/close state (`openWeek`) was managed in the old client component. Extract it into a dedicated client component so the server page can stay a server component:

```typescript
// components/WeekList.tsx
'use client'

import { useState } from 'react'
import { MatchCard } from '@/components/MatchCard'
import { MonthDivider } from '@/components/MonthDivider'
import { getPlayedWeeks, getMonthKey, formatMonthYear } from '@/lib/utils'
import type { Week } from '@/lib/types'

interface Props {
  weeks: Week[]
}

export function WeekList({ weeks }: Props) {
  const playedWeeks = getPlayedWeeks(weeks)
  const mostRecent = playedWeeks.length > 0
    ? playedWeeks.reduce((a, b) => (a.week > b.week ? a : b))
    : null
  const [openWeek, setOpenWeek] = useState<number | null>(mostRecent?.week ?? null)

  if (weeks.length === 0) {
    return <p className="text-slate-400 text-sm">No results yet.</p>
  }

  // Group played weeks by month — copy month-grouping logic from
  // app/app/league/[id]/page.tsx (the existing renderWeeks function)
  let lastMonthKey = ''
  return (
    <div className="space-y-2">
      {weeks.map((week) => {
        const monthKey = getMonthKey(week.date)
        const showDivider = monthKey !== lastMonthKey
        lastMonthKey = monthKey
        return (
          <div key={week.week}>
            {showDivider && <MonthDivider label={formatMonthYear(week.date)} />}
            <MatchCard
              week={week}
              isOpen={openWeek === week.week}
              onToggle={(w) => setOpenWeek((prev) => (prev === w ? null : w))}
            />
          </div>
        )
      })}
    </div>
  )
}
```

Add `WeekList` import to the results page:
```typescript
import { WeekList } from '@/components/WeekList'
```

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/[leagueId]/page.tsx app/[leagueId]/results/page.tsx
git commit -m "feat: add auth-aware [leagueId]/results page"
```

---

## Task 9: Create auth-aware players page

**Files:**
- Create: `app/[leagueId]/players/page.tsx`

Replaces both `app/app/league/[id]/players/page.tsx` and `app/results/[id]/players/page.tsx`.

- [ ] **Step 1: Create the page**

```typescript
// app/[leagueId]/players/page.tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import type { Player, LeagueFeature, GameRole, FeatureConfig } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function PlayersPage({ params }: Props) {
  const { leagueId } = await params

  const supabase = await createClient()
  const service = createServiceClient()

  // Check if league exists
  const { data: game } = await service
    .from('games')
    .select('id, name')
    .eq('id', leagueId)
    .maybeSingle()

  if (!game) notFound()

  // Check auth + membership
  const { data: { user } } = await supabase.auth.getUser()
  let userRole: GameRole | null = null
  if (user) {
    const { data: membership } = await service
      .from('game_members')
      .select('role')
      .eq('game_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    userRole = (membership?.role as GameRole) ?? null
  }

  const tier = resolveVisibilityTier(userRole)

  // Fetch global availability + league features
  const [experimentsResult, featuresResult] = await Promise.all([
    service.from('feature_experiments').select('feature, available'),
    service.from('league_features').select('*').eq('game_id', leagueId),
  ])

  const availableSet = new Set(
    (experimentsResult.data ?? []).filter((e) => e.available).map((e) => e.feature)
  )

  const rawFeatures: LeagueFeature[] = (featuresResult.data ?? [])
    .filter((f) => availableSet.has(f.feature))
    .map((f) => ({ ...f, available: true }))

  const canSeePlayerStats = isFeatureEnabled(rawFeatures, 'player_stats', tier)

  if (!canSeePlayerStats) {
    return <LeaguePrivateState leagueName={game.name} />
  }

  // Get the right config for this tier
  const statsFeat = rawFeatures.find((f) => f.feature === 'player_stats')
  const config: FeatureConfig | null = tier === 'public'
    ? (statsFeat?.public_config ?? null)
    : (statsFeat?.config ?? null)

  // Fetch players via the public RPC (no membership check, safe for all tiers)
  const { data: playersData } = await service.rpc('get_player_stats_public', { p_game_id: leagueId })
  const players: Player[] = ((playersData ?? []) as Record<string, unknown>[]).map((row) => ({
    name: String(row.name),
    played: Number(row.played),
    won: Number(row.won),
    drew: Number(row.drew),
    lost: Number(row.lost),
    timesTeamA: Number(row.timesTeamA),
    timesTeamB: Number(row.timesTeamB),
    winRate: Number(row.winRate),
    qualified: Boolean(row.qualified),
    points: Number(row.points),
    goalkeeper: Boolean(row.goalkeeper),
    mentality: String(row.mentality ?? 'balanced') as Player['mentality'],
    rating: Number(row.rating ?? 0),
    recentForm: String(row.recentForm ?? ''),
  }))

  // NOTE: The PublicPlayerList component handles column config via FeatureConfig.
  // Reuse it here — it already handles both public and member display.
  // Pass config to control visible columns.
  const { PublicPlayerList } = await import('@/components/PublicPlayerList')

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-100 mb-6">{game.name} — Players</h1>
      <PublicPlayerList players={players} config={config} />
    </main>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/[leagueId]/players/page.tsx
git commit -m "feat: add auth-aware [leagueId]/players page"
```

---

## Task 10: Migrate league settings page

**Files:**
- Create: `app/[leagueId]/settings/page.tsx`

Copy `app/app/league/[id]/settings/page.tsx` and remove:
1. The `publicEnabled` / `togglePublicResults` state and UI (the "Public Results Page" toggle and its card)
2. The `features` section and `loadFeatures` function
3. The `'features'` entry from the `NAV` array
4. The `Section` type — change to `'links' | 'members'`

Also update the `leagueId` extraction: change `const leagueId = params?.id as string` to use `leagueId` from `useParams`:

```typescript
const params = useParams()
const leagueId = (params?.leagueId as string) ?? ''
```

Update the redirect after access check:
```typescript
router.replace(`/${leagueId}/results`)  // was /league/${leagueId}
```

- [ ] **Step 1: Create the file** (copy + edit as described above)

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/[leagueId]/settings/page.tsx
git commit -m "feat: add [leagueId]/settings page (members + invite link)"
```

---

## Task 11: Create Experiments page

**Files:**
- Create: `app/experiments/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// app/experiments/page.tsx
// Middleware already guards this route — only developers reach this page.
'use client'

import { useEffect, useState } from 'react'
import type { FeatureKey } from '@/lib/types'

const FEATURE_LABELS: Record<FeatureKey, string> = {
  match_history:     'Match History',
  match_entry:       'Match Entry',
  team_builder:      'Team Builder',
  player_stats:      'Player Stats',
  player_comparison: 'Player Comparison',
}

interface Experiment {
  feature: FeatureKey
  available: boolean
  updated_at: string
}

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/experiments', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setExperiments(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [])

  async function toggle(feature: FeatureKey, current: boolean) {
    setToggling(feature)
    try {
      const res = await fetch('/api/experiments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature, available: !current }),
        credentials: 'include',
      })
      if (res.ok) {
        setExperiments((prev) =>
          prev.map((e) => e.feature === feature ? { ...e, available: !current } : e)
        )
      }
    } finally {
      setToggling(null)
    }
  }

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-100 mb-2">Experiments</h1>
      <p className="text-sm text-slate-400 mb-6">
        Global feature availability. Turning a feature off removes it from all leagues immediately.
      </p>

      {loading ? (
        <p className="text-slate-400 text-sm">Loading…</p>
      ) : (
        <div className="space-y-2">
          {experiments.map((exp) => (
            <div
              key={exp.feature}
              className="flex items-center justify-between p-4 rounded-lg bg-slate-800 border border-slate-700"
            >
              <div>
                <p className="text-sm font-medium text-slate-200">
                  {FEATURE_LABELS[exp.feature] ?? exp.feature}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">Ship to all leagues</p>
              </div>
              <button
                onClick={() => toggle(exp.feature, exp.available)}
                disabled={toggling === exp.feature}
                className={[
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 disabled:opacity-50',
                  exp.available ? 'bg-sky-600' : 'bg-slate-600',
                ].join(' ')}
                role="switch"
                aria-checked={exp.available}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200',
                    exp.available ? 'translate-x-4' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/experiments/page.tsx
git commit -m "feat: add Experiments page for global feature flag management"
```

---

## Task 12: Update /settings as user account page

**Files:**
- Modify: `app/app/settings/page.tsx` → will eventually move to `app/settings/page.tsx`

For now, rewrite the content of `app/app/settings/page.tsx` to be a user account page (display name, email, password). The file move happens in Task 14.

- [ ] **Step 1: Replace the page content**

```typescript
// app/app/settings/page.tsx (temporary location — moved to app/settings/page.tsx in Task 14)
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

export default function AccountSettingsPage() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setEmail(user.email ?? '')
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle()
      setDisplayName(profile?.display_name ?? '')
      setLoading(false)
    }
    load()
  }, [])

  async function saveDisplayName(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error: err } = await supabase
        .from('profiles')
        .update({ display_name: displayName.trim() })
        .eq('id', user.id)
      if (err) throw err
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <p className="text-slate-400">Loading…</p>
    </div>
  )

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-100 mb-6">Account</h1>

      <div className="p-4 rounded-lg bg-slate-800 border border-slate-700 mb-4">
        <p className="text-xs text-slate-500 mb-1">Email</p>
        <p className="text-sm text-slate-300">{email}</p>
      </div>

      <form onSubmit={saveDisplayName} className="space-y-4">
        <div>
          <label htmlFor="displayName" className="block text-sm text-slate-400 mb-1">
            Display name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
            className="w-full px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100"
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
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
      </form>
    </main>
  )
}
```

- [ ] **Step 2: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add app/app/settings/page.tsx
git commit -m "feat: rewrite /settings as user account page"
```

---

## Task 13: Update root layout and Navbar

**Files:**
- Modify: `app/layout.tsx`
- Modify: `components/ui/navbar.tsx`

The `app/app/layout.tsx` shell (which wraps authenticated routes with `<Navbar />`) is going away. The root `app/layout.tsx` must now include the navbar for all pages.

- [ ] **Step 1: Update root layout**

```typescript
// app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Navbar } from '@/components/ui/navbar'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://craft-football.com'),
  title: 'Crafted Football',
  description: 'Match history browser for The Boot Room 5-a-side league.',
  openGraph: {
    title: 'Crafted Football',
    description: 'Match history browser for The Boot Room 5-a-side league.',
    url: 'https://craft-football.com',
    siteName: 'Crafted Football',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-900 text-slate-100 antialiased min-h-screen`}>
        <Navbar />
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Update Navbar**

In `components/ui/navbar.tsx`, make the following changes:

**a) Add Experiments icon button (developer only)**

Add a `profileRole` state and fetch it alongside existing auth:

```typescript
const [profileRole, setProfileRole] = useState<string | null>(null)

// Inside the useEffect that fetches user auth, add:
if (user) {
  const supabase = createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  setProfileRole(profile?.role ?? null)
}
```

Add the Experiments icon to the nav (import `FlaskConical` from `lucide-react`):

```typescript
{profileRole === 'developer' && (
  <Link href="/experiments" title="Experiments">
    <FlaskConical className="size-5 text-slate-400 hover:text-slate-200 transition-colors" />
  </Link>
)}
```

**b) Fix settings icon routing**

Update the settings link to point to `/[leagueId]/settings` when on a league page, `/settings` otherwise. The navbar already uses `usePathname` and `useParams`. Add:

```typescript
// Derive settings URL from current route
const leagueId = (useParams() as { leagueId?: string })?.leagueId
const settingsUrl = leagueId ? `/${leagueId}/settings` : '/settings'
```

Update the settings `<Link>` to use `settingsUrl`.

**c) Remove domain-switching logic**

Delete any references to `m.craft-football.com`, `craft-football.com` host checks, or cross-domain redirect logic in the navbar.

- [ ] **Step 3: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx components/ui/navbar.tsx
git commit -m "feat: move navbar to root layout, add experiments icon, fix settings routing"
```

---

## Task 14: Migrate home page and delete old directories

**Files:**
- Modify: `app/page.tsx` (merge from `app/app/page.tsx` + `app/website/page.tsx`)
- Modify: `app/settings/page.tsx` (move from `app/app/settings/page.tsx`)
- Delete: `app/app/` (entire directory)
- Delete: `app/website/`
- Delete: `app/results/`
- Delete: `app/api/league/[id]/public/route.ts`

The new `app/page.tsx` should:
- If user is signed in → show their league list (content from `app/app/page.tsx`)
- If not signed in → show the public league directory (content from `app/website/page.tsx`)

- [ ] **Step 1: Write the merged home page**

```typescript
// app/page.tsx
export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    // Signed-in: show their leagues
    const { data: memberships } = await supabase
      .from('game_members')
      .select('game_id, role, games(id, name)')
      .eq('user_id', user.id)

    const leagues = (memberships ?? []).map((m) => ({
      id: (m.games as { id: string; name: string })?.id ?? '',
      name: (m.games as { id: string; name: string })?.name ?? '',
      role: m.role,
    }))

    return (
      <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-100 mb-6">Your leagues</h1>
        {leagues.length === 0 ? (
          <p className="text-slate-400 text-sm">You&apos;re not in any leagues yet.</p>
        ) : (
          <div className="space-y-2">
            {leagues.map((league) => (
              <Link
                key={league.id}
                href={`/${league.id}/results`}
                className="block p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
              >
                <p className="text-sm font-medium text-slate-200">{league.name}</p>
                <p className="text-xs text-slate-500 mt-0.5 capitalize">{league.role}</p>
              </Link>
            ))}
          </div>
        )}
      </main>
    )
  }

  // Unauthenticated: show public league directory
  const service = createServiceClient()

  // Only list leagues where at least one feature is both globally available
  // AND publicly enabled by the league admin
  const [experimentsRes, publicLeaguesRes] = await Promise.all([
    service.from('feature_experiments').select('feature').eq('available', true),
    service.from('league_features').select('game_id, feature, games(id, name)').eq('public_enabled', true),
  ])

  const globallyAvailable = new Set((experimentsRes.data ?? []).map((e) => e.feature))
  const publicLeagues = (publicLeaguesRes.data ?? []).filter((row) => globallyAvailable.has(row.feature))

  // Deduplicate by game_id
  const seen = new Set<string>()
  const directory = (publicLeagues ?? [])
    .filter((row) => {
      const id = (row.games as { id: string } | null)?.id
      if (!id || seen.has(id)) return false
      seen.add(id)
      return true
    })
    .map((row) => ({
      id: (row.games as { id: string; name: string })?.id ?? '',
      name: (row.games as { id: string; name: string })?.name ?? '',
    }))

  return (
    <main className="max-w-md mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-xl font-semibold text-slate-100 mb-6">Leagues</h1>
      {directory.length === 0 ? (
        <p className="text-slate-400 text-sm">No public leagues yet.</p>
      ) : (
        <div className="space-y-2">
          {directory.map((league) => (
            <Link
              key={league.id}
              href={`/${league.id}/results`}
              className="block p-4 rounded-lg bg-slate-800 border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <p className="text-sm font-medium text-slate-200">{league.name}</p>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
```

- [ ] **Step 2: Move settings page**

```bash
cp app/app/settings/page.tsx app/settings/page.tsx
```

- [ ] **Step 3: Verify everything compiles before deleting old directories**

```bash
npx tsc --noEmit && npm run build
```

Fix any remaining type errors before proceeding.

- [ ] **Step 4: Delete old directories**

```bash
rm -rf app/app/
rm -rf app/website/
rm -rf app/results/
rm -f app/api/league/[id]/public/route.ts
```

- [ ] **Step 5: Verify again**

```bash
npx tsc --noEmit && npm run build
```

Expected: clean build with no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: merge home page, move settings, delete old route directories"
```

---

## Task 15: Update vercel.json and run final migration

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Add m.craft-football.com redirect**

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "redirects": [
    {
      "source": "/:path*",
      "has": [{ "type": "host", "value": "m.craft-football.com" }],
      "destination": "https://craft-football.com/:path*",
      "permanent": true
    }
  ]
}
```

- [ ] **Step 2: Run the deferred migration (Task 2)**

Now that new code is deployed and verified, run the migration to drop `public_results_enabled`:

Paste `supabase/migrations/20260318000002_drop_public_results_enabled.sql` into the Supabase SQL Editor and execute.

Verify: `games` table no longer has `public_results_enabled` column in Supabase Table Editor.

- [ ] **Step 3: Configure DNS for m.craft-football.com**

In your DNS provider, ensure `m.craft-football.com` points to Vercel so the 301 redirect in vercel.json can intercept requests. (If it already points to Vercel, no DNS change needed.)

- [ ] **Step 4: Final build check**

```bash
npm run build && npm run lint
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add vercel.json
git commit -m "feat: add m.craft-football.com → craft-football.com redirect in vercel.json"
```

---

## Smoke Test Checklist

After deploying, verify these scenarios manually:

**Public visitor (no account):**
- [ ] `craft-football.com/` shows public league directory
- [ ] `craft-football.com/[uuid]/results` shows public results if features are public-enabled, or LeaguePrivateState if not
- [ ] `craft-football.com/[uuid]/players` shows players if `player_stats` is public-enabled
- [ ] `craft-football.com/[uuid]/settings` redirects to sign-in
- [ ] `craft-football.com/experiments` redirects to sign-in
- [ ] Invalid UUID returns 404

**Signed-in member:**
- [ ] `/` shows their league list
- [ ] `/[uuid]/results` shows member-tier content
- [ ] `/[uuid]/settings` redirects to `/[uuid]/results` (not admin)
- [ ] `/experiments` redirects to `/` (not developer)

**Signed-in admin:**
- [ ] `/[uuid]/settings` loads: Members and Links tabs only (no Features tab, no public results toggle)
- [ ] Invite link generation works

**Developer:**
- [ ] Experiments icon visible in navbar
- [ ] `/experiments` loads with all 5 feature rows
- [ ] Toggling a feature off removes it from all league pages immediately
- [ ] `/add-game` loads

**m.craft-football.com:**
- [ ] `m.craft-football.com/anything` redirects 301 to `craft-football.com/anything`
