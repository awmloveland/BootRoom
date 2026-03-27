# Lineup Lab Public Login Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Lineup Lab tab always visible, showing a login prompt for unauthenticated users instead of hiding the tab, and remove the now-obsolete `team_builder` feature flag.

**Architecture:** Create a `LineupLabLoginPrompt` component, restructure `lineup-lab/page.tsx` to branch on `isAuthenticated` rather than redirecting, strip `showLineupLabTab` from `LeaguePageHeader`, remove `canSeeTeamBuilder` from all pages, then delete the `team_builder` feature flag from types/defaults/UI/DB.

**Tech Stack:** Next.js 15 App Router, TypeScript (strict), Tailwind CSS, lucide-react, Supabase

---

## File Map

| Action | File |
|---|---|
| **Create** | `components/LineupLabLoginPrompt.tsx` |
| **Modify** | `app/[leagueId]/lineup-lab/page.tsx` |
| **Modify** | `components/LeaguePageHeader.tsx` |
| **Modify** | `app/[leagueId]/results/page.tsx` |
| **Modify** | `app/[leagueId]/players/page.tsx` |
| **Modify** | `lib/types.ts` |
| **Modify** | `lib/defaults.ts` |
| **Modify** | `components/FeaturePanel.tsx` |
| **Delete** | `components/TeamBuilderCard.tsx` |
| **Create** | `supabase/migrations/20260327000001_remove_team_builder_flag.sql` |

---

## Task 1: Create LineupLabLoginPrompt component

**Files:**
- Create: `components/LineupLabLoginPrompt.tsx`

- [ ] **Step 1: Create the component**

```tsx
import Link from 'next/link'
import { Lock } from 'lucide-react'

interface LineupLabLoginPromptProps {
  leagueId: string
}

export function LineupLabLoginPrompt({ leagueId }: LineupLabLoginPromptProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
        <Lock size={22} className="text-slate-500" />
      </div>
      <p className="text-slate-100 font-semibold text-sm">Sign in to use Lineup Lab</p>
      <p className="text-slate-500 text-sm max-w-xs">
        Build and save lineups for your league matches.
      </p>
      <Link
        href={`/sign-in?redirect=/${leagueId}/lineup-lab`}
        className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded-md"
      >
        Sign in
      </Link>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/minnetonka
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add components/LineupLabLoginPrompt.tsx
git commit -m "feat: add LineupLabLoginPrompt component"
```

---

## Task 2: Update lineup-lab/page.tsx — replace redirect with login prompt

**Files:**
- Modify: `app/[leagueId]/lineup-lab/page.tsx`

The current page redirects logged-out users and users without the `team_builder` feature. Replace this with:
- If not authenticated → slim data fetch (weeks count only) + render `LineupLabLoginPrompt`
- If authenticated → full data fetch + render lineup UI as before

The feature flag check (`canSeeTeamBuilder`) is removed entirely.

- [ ] **Step 1: Rewrite lineup-lab/page.tsx**

```tsx
export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { sortWeeks } from '@/lib/utils'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { LineupLab } from '@/components/LineupLab'
import { LineupLabLoginPrompt } from '@/components/LineupLabLoginPrompt'
import { StatsSidebar } from '@/components/StatsSidebar'
import { DEFAULT_FEATURES } from '@/lib/defaults'
import type { GameRole, LeagueFeature, FeatureKey, Player, Week, LeagueDetails } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LineupLabPage({ params }: Props) {
  const { leagueId } = await params
  const service = createServiceClient()

  // 1. Verify league exists
  const { data: game } = await service
    .from('games')
    .select('id, name, location, day, kickoff_time, bio')
    .eq('id', leagueId)
    .maybeSingle()

  if (!game) notFound()

  // 2. Resolve auth
  let userRole: GameRole | null = null
  let isAuthenticated = false
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (user) {
      isAuthenticated = true
      const { data: memberRow } = await service
        .from('game_members')
        .select('role')
        .eq('game_id', leagueId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (memberRow) {
        userRole = memberRow.role as GameRole
      }
    }
  } catch (err) {
    console.error('[lineup-lab] auth check failed:', err)
  }

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  // 3. If not authenticated — slim render with login prompt
  if (!isAuthenticated) {
    const { data: weeksData } = await service
      .from('weeks')
      .select('week')
      .eq('game_id', leagueId)
      .in('status', ['played', 'cancelled'])

    const playedCount = weeksData?.length ?? 0
    const totalWeeks = 52
    const pct = Math.round((playedCount / totalWeeks) * 100)
    const details: LeagueDetails = {
      location: game.location ?? null,
      day: game.day ?? null,
      kickoff_time: game.kickoff_time ?? null,
      bio: game.bio ?? null,
    }

    return (
      <main className="px-4 sm:px-6 pt-4 pb-8">
        <div className="w-full max-w-xl mx-auto">
          <LeaguePageHeader
            leagueName={game.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="lineup-lab"
            isAdmin={isAdmin}
            details={details}
          />
          <LineupLabLoginPrompt leagueId={leagueId} />
        </div>
      </main>
    )
  }

  // 4. Authenticated — full data fetch
  const [experimentsResult, leagueFeaturesResult, weeksResult] = await Promise.all([
    service.from('feature_experiments').select('feature, available'),
    service.from('league_features').select('*').eq('game_id', leagueId),
    service
      .from('weeks')
      .select('week, date, status, format, team_a, team_b, winner, notes')
      .eq('game_id', leagueId)
      .in('status', ['played', 'cancelled'])
      .order('week', { ascending: false }),
  ])

  type WeekRow = {
    week: number; date: string; status: string; format: string | null;
    team_a: string[] | null; team_b: string[] | null; winner: string | null; notes: string | null;
  }
  const weeks: Week[] = sortWeeks(
    ((weeksResult.data ?? []) as WeekRow[]).map((row) => ({
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
  const playedCount = weeks.length
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  const availableSet = experimentsResult.error
    ? new Set(DEFAULT_FEATURES.map((f) => f.feature as FeatureKey))
    : new Set(
        (experimentsResult.data ?? [])
          .filter((e) => e.available)
          .map((e) => e.feature as FeatureKey)
      )
  const featureMap = Object.fromEntries((leagueFeaturesResult.data ?? []).map((f) => [f.feature, f]))
  const features: LeagueFeature[] = DEFAULT_FEATURES
    .filter((def) => availableSet.has(def.feature))
    .map((def) => {
      const row = featureMap[def.feature] ?? def
      return { ...row, available: true } as LeagueFeature
    })

  const { data: playersData } = await service.rpc('get_player_stats_public', {
    p_game_id: leagueId,
  })

  const players: Player[] = ((playersData ?? []) as Record<string, unknown>[]).map((row) => ({
    name: String(row.name),
    played: Number(row.played),
    won: Number(row.won),
    drew: Number(row.drew),
    lost: Number(row.lost),
    timesTeamA: Number(row.timesTeamA ?? 0),
    timesTeamB: Number(row.timesTeamB ?? 0),
    winRate: Number(row.winRate),
    qualified: Boolean(row.qualified),
    points: Number(row.points ?? 0),
    goalkeeper: Boolean(row.goalkeeper),
    mentality: String(row.mentality ?? 'balanced') as Player['mentality'],
    rating: Number(row.rating ?? 0),
    recentForm: String(row.recentForm ?? ''),
  }))

  const details: LeagueDetails = {
    location: game.location ?? null,
    day: game.day ?? null,
    kickoff_time: game.kickoff_time ?? null,
    bio: game.bio ?? null,
    player_count: players.length,
  }

  return (
    <main className="px-4 sm:px-6 pt-4 pb-8">
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          <LeaguePageHeader
            leagueName={game.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="lineup-lab"
            isAdmin={isAdmin}
            details={details}
          />
          <LineupLab allPlayers={players} />
        </div>
        <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
          <StatsSidebar
            players={players}
            weeks={weeks}
            features={features}
            role={userRole}
          />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors (note: `showLineupLabTab` prop errors on LeaguePageHeader will appear until Task 3 removes the prop — that's fine, it will be resolved there)

- [ ] **Step 3: Commit**

```bash
git add app/[leagueId]/lineup-lab/page.tsx
git commit -m "feat: show login prompt in lineup lab for unauthenticated users"
```

---

## Task 3: Remove showLineupLabTab from LeaguePageHeader and callers

**Files:**
- Modify: `components/LeaguePageHeader.tsx`
- Modify: `app/[leagueId]/results/page.tsx`
- Modify: `app/[leagueId]/players/page.tsx`

Remove `showLineupLabTab` prop entirely — the Lineup Lab tab now renders unconditionally.

- [ ] **Step 1: Update LeaguePageHeader.tsx**

Remove `showLineupLabTab` from the interface and the component, and unwrap the conditional around the Lineup Lab tab link:

In `components/LeaguePageHeader.tsx`, make these two changes:

**Remove from interface** (lines 8–18):
```tsx
interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  playedCount: number
  totalWeeks: number
  pct: number
  currentTab: 'results' | 'players' | 'lineup-lab'
  isAdmin: boolean
  details?: LeagueDetails | null
}
```

**Remove from destructured params and replace the conditional tab** (the `{showLineupLabTab && (...)}` block at lines 76–89) with the unconditional tab:
```tsx
<Link
  href={`/${leagueId}/lineup-lab`}
  className={cn(
    '-mb-px flex items-center gap-2 border-b-2 pb-2 text-sm font-medium',
    currentTab === 'lineup-lab'
      ? 'border-slate-200 text-slate-200'
      : 'border-transparent text-slate-700 hover:text-slate-400'
  )}
>
  <FlaskConical className="size-3.5" />
  Lineup Lab
</Link>
```

- [ ] **Step 2: Update results/page.tsx**

Remove `canSeeTeamBuilder` (line 127) and update both `LeaguePageHeader` usages to drop the `showLineupLabTab` prop.

Remove this line:
```tsx
const canSeeTeamBuilder = isAdmin || isFeatureEnabled(features, 'team_builder', tier)
```

In the public tier render (around line 262), change:
```tsx
showLineupLabTab={false}
```
to nothing (remove the prop entirely).

In the member/admin tier render (around line 315), change:
```tsx
showLineupLabTab={canSeeTeamBuilder}
```
to nothing (remove the prop entirely).

- [ ] **Step 3: Update players/page.tsx**

Remove `canSeeTeamBuilder` (line 102) and update the `LeaguePageHeader` usage to drop the `showLineupLabTab` prop.

Remove this line:
```tsx
const canSeeTeamBuilder = isAdmin || isFeatureEnabled(rawFeatures, 'team_builder', tier)
```

In the `LeaguePageHeader` call (around line 157), change:
```tsx
showLineupLabTab={tier === 'public' ? false : canSeeTeamBuilder}
```
to nothing (remove the prop entirely).

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add components/LeaguePageHeader.tsx app/[leagueId]/results/page.tsx app/[leagueId]/players/page.tsx
git commit -m "feat: make lineup lab tab always visible"
```

---

## Task 4: Remove team_builder feature flag from codebase

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/defaults.ts`
- Modify: `components/FeaturePanel.tsx`
- Delete: `components/TeamBuilderCard.tsx`

- [ ] **Step 1: Remove 'team_builder' from FeatureKey in lib/types.ts**

Change the `FeatureKey` type (lines 73–79) from:
```ts
export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'team_builder'
  | 'player_stats'
  | 'player_comparison'
  | 'stats_sidebar';
```
to:
```ts
export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'player_stats'
  | 'player_comparison'
  | 'stats_sidebar';
```

- [ ] **Step 2: Remove team_builder from lib/defaults.ts**

Change the `DEFAULT_FEATURES` array from:
```ts
export const DEFAULT_FEATURES: {
  feature: FeatureKey
  enabled: boolean
  config: object | null
  public_enabled: boolean
  public_config: object | null
}[] = [
  { feature: 'match_history',     enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'match_entry',       enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'team_builder',      enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'player_stats',      enabled: true,  config: { max_players: null, visible_stats: ['played','won','drew','lost','winRate','recentForm'] }, public_enabled: false, public_config: null },
  { feature: 'player_comparison', enabled: false, config: null, public_enabled: false, public_config: null },
  { feature: 'stats_sidebar',     enabled: true,  config: null, public_enabled: true,  public_config: null },
]
```
to:
```ts
export const DEFAULT_FEATURES: {
  feature: FeatureKey
  enabled: boolean
  config: object | null
  public_enabled: boolean
  public_config: object | null
}[] = [
  { feature: 'match_history',     enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'match_entry',       enabled: true,  config: null, public_enabled: false, public_config: null },
  { feature: 'player_stats',      enabled: true,  config: { max_players: null, visible_stats: ['played','won','drew','lost','winRate','recentForm'] }, public_enabled: false, public_config: null },
  { feature: 'player_comparison', enabled: false, config: null, public_enabled: false, public_config: null },
  { feature: 'stats_sidebar',     enabled: true,  config: null, public_enabled: true,  public_config: null },
]
```

- [ ] **Step 3: Update FeaturePanel.tsx — remove TeamBuilderCard**

Replace the content of `components/FeaturePanel.tsx` with:
```tsx
'use client'

import { PlayerStatsCard } from '@/components/PlayerStatsCard'
import { StatsSidebarCard } from '@/components/StatsSidebarCard'
import type { FeatureKey, LeagueFeature } from '@/lib/types'

interface FeaturePanelProps {
  leagueId: string
  features: LeagueFeature[]
  onChanged: () => void
}

function getFeature(features: LeagueFeature[], key: FeatureKey): LeagueFeature {
  return features.find(f => f.feature === key) ?? {
    feature: key,
    available: false,
    enabled: false,
    config: null,
    public_enabled: false,
    public_config: null,
  }
}

export function FeaturePanel({ leagueId, features, onChanged }: FeaturePanelProps) {
  return (
    <div>
      <div className="bg-sky-950/40 border border-sky-900/40 rounded-lg px-3.5 py-2.5 mb-3.5">
        <div className="text-xs font-semibold text-sky-400 mb-0.5">You always see everything</div>
        <div className="text-xs text-slate-400">
          As a league admin, your own view is never restricted by these settings. Changes here only
          affect members and public visitors — test with a member account to verify.
        </div>
      </div>
      <PlayerStatsCard
        leagueId={leagueId}
        feature={getFeature(features, 'player_stats')}
        onChanged={onChanged}
      />
      <StatsSidebarCard
        leagueId={leagueId}
        feature={getFeature(features, 'stats_sidebar')}
        onChanged={onChanged}
      />
    </div>
  )
}
```

- [ ] **Step 4: Delete TeamBuilderCard.tsx**

```bash
git rm components/TeamBuilderCard.tsx
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/defaults.ts components/FeaturePanel.tsx
git commit -m "feat: remove team_builder feature flag from codebase"
```

---

## Task 5: SQL migration — remove team_builder from database

**Files:**
- Create: `supabase/migrations/20260327000001_remove_team_builder_flag.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Remove team_builder feature flag from all leagues and global experiments.
-- The Lineup Lab tab is now always visible; access is gated by authentication,
-- not a feature flag.

DELETE FROM league_features WHERE feature = 'team_builder';
DELETE FROM feature_experiments WHERE feature = 'team_builder';
```

- [ ] **Step 2: Run the migration**

Open the Supabase SQL Editor for this project and execute the contents of `supabase/migrations/20260327000001_remove_team_builder_flag.sql`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260327000001_remove_team_builder_flag.sql
git commit -m "feat: migrate db to remove team_builder feature flag rows"
```

---

## Manual Verification Checklist

After all tasks are complete, verify end-to-end:

- [ ] Logged-out user visiting `/<leagueId>/results` → Lineup Lab tab is visible in the nav
- [ ] Logged-out user clicking Lineup Lab tab → lands on login prompt with lock icon and "Sign in" button
- [ ] "Sign in" button href is `/sign-in?redirect=/<leagueId>/lineup-lab`
- [ ] After signing in via that redirect, lands back on the Lineup Lab page with full UI
- [ ] Logged-in member visiting Lineup Lab → sees full lineup lab UI (no prompt)
- [ ] Admin visiting Settings → Features → no "Team Builder" row visible
- [ ] `npx tsc --noEmit` passes with zero errors
