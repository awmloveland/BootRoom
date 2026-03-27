# League Tab Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate sequential query waterfalls and duplicate Supabase round-trips across the Results, Players, and Lineup Lab pages so tab switching is genuinely faster.

**Architecture:** Add a database migration with two missing indexes, extract all shared data-fetching into a `lib/fetchers.ts` file using React's per-request `cache()` for deduplication, add an `app/[leagueId]/layout.tsx` that pre-warms the shared fetchers before any page renders, then update each page to use the fetchers in a single parallel `Promise.all`.

**Tech Stack:** Next.js 15 App Router, React `cache()` (built-in), Supabase service client, TypeScript strict

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/20260328000001_add_performance_indexes.sql` | Create | DB indexes on `weeks(game_id, status)` and `config(game_id)` |
| `lib/fetchers.ts` | Create | Per-request cached fetchers: `getGame`, `getAuthAndRole`, `getFeatures`, `getPlayerStats`, `getWeeks` |
| `app/[leagueId]/layout.tsx` | Create | Pre-warms cache for shared fetchers; calls `notFound()` for invalid league IDs |
| `app/[leagueId]/results/page.tsx` | Modify | Replace inline fetching with fetchers; derive `nextWeek` from weeks array; fix double-fetch |
| `app/[leagueId]/players/page.tsx` | Modify | Replace inline fetching with fetchers |
| `app/[leagueId]/lineup-lab/page.tsx` | Modify | Replace inline fetching with fetchers |

---

## Task 1: Database migration — add missing indexes

**Files:**
- Create: `supabase/migrations/20260328000001_add_performance_indexes.sql`

The `weeks` table has a `game_id` column added in a later migration with no index. Every league-scoped query — including the `get_player_stats_public` RPC — does a full table scan. The `config` table has the same problem.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/20260328000001_add_performance_indexes.sql
--
-- Performance: add indexes missing from later migrations.
-- weeks(game_id, status) covers both common filter patterns:
--   WHERE game_id = X
--   WHERE game_id = X AND status = 'played'
-- config(game_id) covers the config lookup inside get_player_stats_public.

CREATE INDEX IF NOT EXISTS idx_weeks_game_id_status ON weeks(game_id, status);
CREATE INDEX IF NOT EXISTS idx_config_game_id ON config(game_id);
```

- [ ] **Step 2: Apply the migration in Supabase**

Open the Supabase dashboard → SQL Editor → paste and run the migration file content. Confirm no errors.

- [ ] **Step 3: Verify indexes exist**

In the Supabase SQL Editor:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('weeks', 'config')
  AND indexname IN ('idx_weeks_game_id_status', 'idx_config_game_id');
```

Expected: two rows returned.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260328000001_add_performance_indexes.sql
git commit -m "feat: add db indexes on weeks(game_id, status) and config(game_id)"
```

---

## Task 2: Create `lib/fetchers.ts`

**Files:**
- Create: `lib/fetchers.ts`

This file is the heart of the change. Each function is wrapped in React's `cache()`, which deduplicates calls within a single render tree (layout + all child pages). Calling `getGame(leagueId)` in both the layout and a page results in exactly one Supabase query per request.

- [ ] **Step 1: Create the file**

```ts
// lib/fetchers.ts
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { sortWeeks } from '@/lib/utils'
import { DEFAULT_FEATURES } from '@/lib/defaults'
import type { GameRole, LeagueFeature, FeatureKey, Player, Week } from '@/lib/types'

// ── Game ─────────────────────────────────────────────────────────────────────

export const getGame = cache(async (leagueId: string) => {
  const service = createServiceClient()
  const { data } = await service
    .from('games')
    .select('id, name, location, day, kickoff_time, bio')
    .eq('id', leagueId)
    .maybeSingle()
  return data
})

// ── Auth + role ───────────────────────────────────────────────────────────────

export const getAuthAndRole = cache(async (leagueId: string) => {
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return { user: null, userRole: null as GameRole | null, isAuthenticated: false }
    const service = createServiceClient()
    const { data: memberRow } = await service
      .from('game_members')
      .select('role')
      .eq('game_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    return {
      user,
      userRole: (memberRow?.role ?? null) as GameRole | null,
      isAuthenticated: true,
    }
  } catch {
    return { user: null, userRole: null as GameRole | null, isAuthenticated: false }
  }
})

// ── Features ──────────────────────────────────────────────────────────────────

export const getFeatures = cache(async (leagueId: string): Promise<LeagueFeature[]> => {
  const service = createServiceClient()
  const [experimentsResult, leagueFeaturesResult] = await Promise.all([
    service.from('feature_experiments').select('feature, available'),
    service.from('league_features').select('*').eq('game_id', leagueId),
  ])
  const availableSet = experimentsResult.error
    ? new Set(DEFAULT_FEATURES.map((f) => f.feature as FeatureKey))
    : new Set(
        (experimentsResult.data ?? [])
          .filter((e) => e.available)
          .map((e) => e.feature as FeatureKey)
      )
  const featureMap = Object.fromEntries((leagueFeaturesResult.data ?? []).map((f) => [f.feature, f]))
  return DEFAULT_FEATURES
    .filter((def) => availableSet.has(def.feature))
    .map((def) => {
      const row = featureMap[def.feature] ?? def
      return { ...row, available: true } as LeagueFeature
    })
})

// ── Player stats ──────────────────────────────────────────────────────────────

export const getPlayerStats = cache(async (leagueId: string): Promise<Player[]> => {
  const service = createServiceClient()
  const { data } = await service.rpc('get_player_stats_public', { p_game_id: leagueId })
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
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
})

// ── Weeks ─────────────────────────────────────────────────────────────────────

type WeekRow = {
  id: string
  week: number
  date: string
  status: string
  format: string | null
  team_a: string[] | null
  team_b: string[] | null
  winner: string | null
  notes: string | null
  goal_difference: number | null
  team_a_rating: number | null
  team_b_rating: number | null
  lineup_metadata: Record<string, unknown> | null
}

function mapWeekRow(row: WeekRow): Week {
  return {
    id: row.id,
    week: row.week,
    date: row.date,
    status: row.status as Week['status'],
    format: row.format ?? undefined,
    teamA: row.team_a ?? [],
    teamB: row.team_b ?? [],
    winner: (row.winner as Week['winner']) ?? null,
    notes: row.notes ?? undefined,
    goal_difference: row.goal_difference ?? null,
    team_a_rating: row.team_a_rating ?? null,
    team_b_rating: row.team_b_rating ?? null,
    lineupMetadata: row.lineup_metadata
      ? {
          guests: ((row.lineup_metadata.guests as any[]) ?? []).map((g: any) => ({
            type: 'guest' as const,
            name: g.name,
            associatedPlayer: g.associated_player,
            rating: g.rating,
          })),
          new_players: ((row.lineup_metadata.new_players as any[]) ?? []).map((p: any) => ({
            type: 'new_player' as const,
            name: p.name,
            rating: p.rating,
          })),
        }
      : null,
  }
}

// Fetches all weeks in all statuses — pages filter in-memory as needed.
// Includes 'scheduled' so the results page can derive nextWeek without a
// separate DB query.
export const getWeeks = cache(async (leagueId: string): Promise<Week[]> => {
  const service = createServiceClient()
  const { data } = await service
    .from('weeks')
    .select('id, week, date, status, format, team_a, team_b, winner, notes, goal_difference, team_a_rating, team_b_rating, lineup_metadata')
    .eq('game_id', leagueId)
    .in('status', ['played', 'cancelled', 'unrecorded', 'scheduled'])
    .order('week', { ascending: false })
  return sortWeeks(((data ?? []) as WeekRow[]).map(mapWeekRow))
})
```

- [ ] **Step 2: Check TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors in `lib/fetchers.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/fetchers.ts
git commit -m "feat: add cached fetchers for per-request query deduplication"
```

---

## Task 3: Create `app/[leagueId]/layout.tsx`

**Files:**
- Create: `app/[leagueId]/layout.tsx`

This layout pre-warms the three fetchers that are shared by all tabs (game, auth/role, features). Because these use React `cache()`, when each page subsequently calls the same fetchers, they resolve instantly from the per-request cache with no additional DB round-trips.

The `notFound()` check for an invalid `leagueId` now lives here — it fires once for all tabs rather than being duplicated in every page.

- [ ] **Step 1: Create the layout**

```tsx
// app/[leagueId]/layout.tsx
import { notFound } from 'next/navigation'
import { getGame, getAuthAndRole, getFeatures } from '@/lib/fetchers'

interface Props {
  children: React.ReactNode
  params: Promise<{ leagueId: string }>
}

export default async function LeagueLayout({ children, params }: Props) {
  const { leagueId } = await params
  // Pre-warm all shared fetchers in parallel. Pages call these same functions
  // and receive the cached results — no extra DB queries.
  const [game] = await Promise.all([
    getGame(leagueId),
    getAuthAndRole(leagueId),
    getFeatures(leagueId),
  ])
  if (!game) notFound()
  return <>{children}</>
}
```

- [ ] **Step 2: Verify the app still loads**

Run `npm run dev`, navigate to a valid league tab, confirm the page renders with no 500 errors. Navigate to `/[some-invalid-id]/results` — confirm you get a 404 page.

- [ ] **Step 3: Commit**

```bash
git add app/[leagueId]/layout.tsx
git commit -m "feat: add league layout to pre-warm shared cached fetchers"
```

---

## Task 4: Update `app/[leagueId]/results/page.tsx`

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

Key changes:
- Remove inline game fetch, auth waterfall, feature flag fetching — all replaced by cached fetcher calls
- Remove inline `WeekRow` type and `mapWeekRow` function — now in `lib/fetchers.ts`
- Remove the separate scheduled-week DB query — derive `nextWeek` from the already-fetched weeks array instead
- Fix the double-fetch: after calling `create_unrecorded_week`, construct the new `Week` row locally from the returned UUID rather than re-fetching all weeks

- [ ] **Step 1: Replace the file contents**

```tsx
// app/[leagueId]/results/page.tsx
export const dynamic = 'force-dynamic'

import { createServiceClient } from '@/lib/supabase/service'
import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { sortWeeks, dayNameToIndex, isPastDeadline, getMostRecentExpectedGameDate, getNextWeekNumber, deriveSeason } from '@/lib/utils'
import { getGame, getAuthAndRole, getFeatures, getPlayerStats, getWeeks } from '@/lib/fetchers'
import { PublicMatchEntrySection } from '@/components/PublicMatchEntrySection'
import { PublicMatchList } from '@/components/PublicMatchList'
import { WeekList } from '@/components/WeekList'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { ResultsSection } from '@/components/ResultsSection'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { StatsSidebar } from '@/components/StatsSidebar'
import { BfcacheRefresh } from '@/components/BfcacheRefresh'
import type { Week, ScheduledWeek, LeagueDetails } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LeagueResultsPage({ params }: Props) {
  const { leagueId } = await params

  // getGame, getAuthAndRole, getFeatures are cache hits from the layout.
  // getPlayerStats and getWeeks run fresh — both start in parallel.
  const [{ userRole, isAuthenticated }, game, features, players, rawWeeks] = await Promise.all([
    getAuthAndRole(leagueId),
    getGame(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
  ])

  // game is guaranteed non-null — the layout already called notFound() if missing.
  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  const canSeeMatchHistory = isAdmin || isFeatureEnabled(features, 'match_history', tier)
  const canSeeMatchEntry = isAdmin || isFeatureEnabled(features, 'match_entry', tier)
  const canSeePlayerStats = isAdmin || isFeatureEnabled(features, 'player_stats', tier)
  const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)

  if (tier === 'public' && !canSeeMatchHistory && !canSeeMatchEntry && !canSeePlayerStats) {
    return (
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-4">
        <LeaguePrivateState leagueName={game!.name} />
      </main>
    )
  }

  const leagueDayIndex = dayNameToIndex(game!.day ?? null) ?? undefined

  // Lazily create an unrecorded row if the most recent expected game day passed
  // with no row. Uses the UUID returned by the RPC to construct the Week locally
  // — no second DB fetch needed.
  let weeks: Week[] = rawWeeks
  const recentDate = getMostRecentExpectedGameDate(weeks, leagueDayIndex)
  if (recentDate && isPastDeadline(recentDate)) {
    const recentWeekNum = getNextWeekNumber(weeks)
    const existingRow = weeks.find((w) => w.date === recentDate)
    if (!existingRow) {
      const season = deriveSeason(weeks) || String(new Date().getFullYear())
      const service = createServiceClient()
      const { data: newId } = await service.rpc('create_unrecorded_week', {
        p_game_id: leagueId,
        p_season: season,
        p_week: recentWeekNum,
        p_date: recentDate,
      })
      // RPC returns UUID on insert, null on ON CONFLICT DO NOTHING.
      // If non-null, the row is new — append it locally without re-fetching.
      if (newId) {
        const unrecordedWeek: Week = {
          id: newId as string,
          week: recentWeekNum,
          date: recentDate,
          status: 'unrecorded',
          teamA: [],
          teamB: [],
          winner: null,
        }
        weeks = sortWeeks([...weeks, unrecordedWeek])
      }
    }
  }

  // Derive nextWeek from already-fetched weeks — getWeeks includes 'scheduled'
  // rows so no extra DB query is needed.
  let nextWeek: ScheduledWeek | null = null
  if (canSeeMatchEntry) {
    const first = weeks
      .filter((w) => w.status === 'scheduled')
      .sort((a, b) => a.week - b.week)[0]
    if (first && !isPastDeadline(first.date)) {
      nextWeek = {
        id: first.id!,
        week: first.week,
        date: first.date,
        format: first.format ?? null,
        teamA: first.teamA,
        teamB: first.teamB,
        status: 'scheduled',
        lineupMetadata: first.lineupMetadata ?? null,
      }
    }
  }

  const goalkeepers = players.filter(p => p.goalkeeper).map(p => p.name)
  const playedCount = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled').length
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  const details: LeagueDetails = {
    location: game!.location ?? null,
    day: game!.day ?? null,
    kickoff_time: game!.kickoff_time ?? null,
    bio: game!.bio ?? null,
    player_count: players.length,
  }

  // ── Public tier ──
  if (tier === 'public') {
    return (
      <main className="px-4 sm:px-6 py-4">
        <BfcacheRefresh />
        <div className="flex justify-center gap-6 items-start">
          <div className="w-full max-w-xl shrink-0 space-y-8">
            <LeaguePageHeader
              leagueName={game!.name}
              leagueId={leagueId}
              playedCount={playedCount}
              totalWeeks={totalWeeks}
              pct={pct}
              currentTab="results"
              isAdmin={isAdmin}
              details={details}
            />
            {canSeeMatchEntry && (
              <PublicMatchEntrySection
                gameId={leagueId}
                weeks={weeks}
                initialScheduledWeek={nextWeek}
              />
            )}
            {canSeeMatchHistory && (
              <section>
                <PublicMatchList weeks={weeks} />
              </section>
            )}
            {!isAuthenticated && (
              <p className="text-xs text-slate-600 text-center pb-4">
                Sign in for full access to your league.
              </p>
            )}
          </div>
          {canSeeStatsSidebar && (
            <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
              <StatsSidebar
                players={players}
                weeks={weeks}
                features={features}
                role={userRole}
                leagueDayIndex={leagueDayIndex}
              />
            </div>
          )}
        </div>
      </main>
    )
  }

  // ── Member / Admin tier ──
  return (
    <main className="px-4 sm:px-6 py-4">
      <BfcacheRefresh />
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          <LeaguePageHeader
            leagueName={game!.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="results"
            isAdmin={isAdmin}
            details={details}
          />
          <div className="flex flex-col gap-3">
            {canSeeMatchEntry ? (
              <ResultsSection
                gameId={leagueId}
                weeks={weeks}
                goalkeepers={goalkeepers}
                initialScheduledWeek={nextWeek}
                canAutoPick={true}
                allPlayers={players}
                showMatchHistory={canSeeMatchHistory}
                leagueDayIndex={leagueDayIndex}
                isAdmin={isAdmin}
              />
            ) : canSeeMatchHistory ? (
              <WeekList
                weeks={weeks}
                goalkeepers={goalkeepers}
                isAdmin={isAdmin}
                gameId={leagueId}
                allPlayers={players}
                onResultSaved={() => {}}
              />
            ) : (
              <div className="py-16 text-center">
                <p className="text-sm text-slate-500">Nothing to show here yet.</p>
              </div>
            )}
          </div>
        </div>
        <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
          <StatsSidebar
            players={players}
            weeks={weeks}
            features={features}
            role={userRole}
            leagueDayIndex={leagueDayIndex}
          />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Check TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify in the browser**

With `npm run dev`:
- As a logged-out user: navigate to a public league's Results tab — confirm match history renders (if enabled) and the "Sign in for full access" message appears
- As a member: navigate to Results — confirm match history and match entry render correctly
- As an admin: confirm all features are visible regardless of feature flag settings
- Open DevTools → Network → filter by `supabase` — confirm the sequential waterfall of requests is gone and requests fire in parallel

- [ ] **Step 4: Commit**

```bash
git add app/\[leagueId\]/results/page.tsx
git commit -m "perf: parallelise results page fetches, fix unrecorded week double-fetch"
```

---

## Task 5: Update `app/[leagueId]/players/page.tsx`

**Files:**
- Modify: `app/[leagueId]/players/page.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
// app/[leagueId]/players/page.tsx
export const dynamic = 'force-dynamic'

import { resolveVisibilityTier } from '@/lib/roles'
import { isFeatureEnabled } from '@/lib/features'
import { getGame, getAuthAndRole, getFeatures, getPlayerStats, getWeeks } from '@/lib/fetchers'
import { LeaguePrivateState } from '@/components/LeaguePrivateState'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { PublicPlayerList } from '@/components/PublicPlayerList'
import { StatsSidebar } from '@/components/StatsSidebar'
import type { LeagueDetails } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LeaguePlayersPage({ params }: Props) {
  const { leagueId } = await params

  // getGame, getAuthAndRole, getFeatures are cache hits from the layout.
  // getPlayerStats and getWeeks run fresh — both start in parallel.
  const [{ userRole }, game, features, players, weeks] = await Promise.all([
    getAuthAndRole(leagueId),
    getGame(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  if (!isAdmin && !isFeatureEnabled(features, 'player_stats', tier)) {
    return <LeaguePrivateState leagueName={game!.name} />
  }

  const playedWeeks = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled')
  const playedCount = playedWeeks.length
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  const details: LeagueDetails = {
    location: game!.location ?? null,
    day: game!.day ?? null,
    kickoff_time: game!.kickoff_time ?? null,
    bio: game!.bio ?? null,
    player_count: players.length,
  }

  const statsFeat = features.find((f) => f.feature === 'player_stats')
  const config = tier === 'public' ? (statsFeat?.public_config ?? null) : (statsFeat?.config ?? null)
  const visibleStats = config?.visible_stats ?? undefined
  const showMentality = config?.show_mentality ?? true

  return (
    <main className="px-4 sm:px-6 pt-4 pb-8">
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          <LeaguePageHeader
            leagueName={game!.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="players"
            isAdmin={isAdmin}
            details={details}
          />
          <PublicPlayerList
            players={players}
            visibleStats={visibleStats}
            showMentality={showMentality}
          />
        </div>
        <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
          />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Check TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify in the browser**

With `npm run dev`:
- As a logged-out user on a league where `player_stats` is not public-enabled: confirm `LeaguePrivateState` renders
- As a member on a league where `player_stats` is member-enabled: confirm the player list renders with correct stat columns
- As an admin: confirm all players and stats visible regardless of feature settings

- [ ] **Step 4: Commit**

```bash
git add app/\[leagueId\]/players/page.tsx
git commit -m "perf: parallelise players page fetches using cached fetchers"
```

---

## Task 6: Update `app/[leagueId]/lineup-lab/page.tsx`

**Files:**
- Modify: `app/[leagueId]/lineup-lab/page.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
// app/[leagueId]/lineup-lab/page.tsx
export const dynamic = 'force-dynamic'

import { resolveVisibilityTier } from '@/lib/roles'
import { getGame, getAuthAndRole, getFeatures, getPlayerStats, getWeeks } from '@/lib/fetchers'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { LineupLab } from '@/components/LineupLab'
import { LineupLabLoginPrompt } from '@/components/LineupLabLoginPrompt'
import { StatsSidebar } from '@/components/StatsSidebar'
import type { LeagueDetails } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function LineupLabPage({ params }: Props) {
  const { leagueId } = await params

  // getGame, getAuthAndRole, getFeatures are cache hits from the layout.
  // getPlayerStats and getWeeks run fresh — both start in parallel.
  const [{ userRole, isAuthenticated }, game, features, players, weeks] = await Promise.all([
    getAuthAndRole(leagueId),
    getGame(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
  ])

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'

  const playedWeeks = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled')
  const playedCount = playedWeeks.length
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  const details: LeagueDetails = {
    location: game!.location ?? null,
    day: game!.day ?? null,
    kickoff_time: game!.kickoff_time ?? null,
    bio: game!.bio ?? null,
    player_count: players.length,
  }

  return (
    <main className="px-4 sm:px-6 pt-4 pb-8">
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0">
          <LeaguePageHeader
            leagueName={game!.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="lineup-lab"
            isAdmin={isAdmin}
            details={details}
          />
          {isAuthenticated
            ? <LineupLab allPlayers={players} />
            : <LineupLabLoginPrompt leagueId={leagueId} />
          }
        </div>
        <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
          />
        </div>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Check TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify in the browser**

With `npm run dev`:
- As a logged-out user: confirm `LineupLabLoginPrompt` renders
- As a logged-in member: confirm `LineupLab` renders with the player list populated
- As an admin: same as member

- [ ] **Step 4: Final end-to-end check**

Open DevTools → Network tab → clear history → load the Results page. Observe:
- Requests to Supabase fire in parallel, not one after another
- Switch to Players tab — the `games`, `game_members`, `feature_experiments`, `league_features` requests should NOT appear again (cache hits, no network calls)
- Switch to Lineup Lab tab — same

Then check the Supabase dashboard → Logs → confirm total query count per page load has dropped.

- [ ] **Step 5: Commit**

```bash
git add app/\[leagueId\]/lineup-lab/page.tsx
git commit -m "perf: parallelise lineup-lab page fetches using cached fetchers"
```

---

## Self-review notes

**Spec coverage:**
- ✅ Task 1: DB indexes on `weeks(game_id, status)` and `config(game_id)`
- ✅ Task 2: `lib/fetchers.ts` with `getGame`, `getAuthAndRole`, `getFeatures`, `getPlayerStats`, `getWeeks`
- ✅ Task 3: `app/[leagueId]/layout.tsx` pre-warming shared fetchers; `notFound()` at layout level
- ✅ Task 4: Results page — parallel fetches, unrecorded week fix, scheduled week derived from existing data
- ✅ Task 5: Players page — parallel fetches
- ✅ Task 6: Lineup Lab page — parallel fetches

**Bonus improvement vs spec:** The results page no longer makes a separate scheduled-week DB query. `getWeeks` already fetches all statuses including `'scheduled'`, so `nextWeek` is derived from the already-fetched array. This eliminates one more network call that was not in the original spec.
