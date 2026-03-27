# League Tab Performance — Design Spec

**Date:** 2026-03-27
**Status:** Approved

---

## Problem Statement

Switching between league tabs (Results, Players, Lineup Lab) is noticeably slow, and initial page loads are sluggish. Investigation identified four compounding root causes:

1. **Missing database indexes** — `weeks.game_id` and `config.game_id` were added in a later migration with no index created. Every league-scoped query does a full table scan across all leagues' data.
2. **Sequential auth waterfall** — every page runs `getUser()` → role lookup → then starts data fetches. All data uses the service client (bypasses RLS) so there is no reason to block data fetches on auth completing.
3. **Duplicate fetches across tabs** — game details, auth/role, feature flags, and player stats are fetched independently on every tab. `get_player_stats_public` (an expensive RPC with a `CROSS JOIN LATERAL`) runs fresh on Results, Players, and Lineup Lab.
4. **Double-fetch on results page** — if an unrecorded week needs creating, the results page fetches weeks, calls an RPC to create the row, then fetches weeks again.

---

## Goals

- Reduce the number of actual Supabase round-trips per page load
- Eliminate sequential query chains where parallelism is possible
- Eliminate duplicate queries for data that is shared across tabs within the same request
- Fix full table scans on the most frequently queried table (`weeks`)

## Non-Goals

- Persistent server-side caching (not addressing perceived speed via stale data)
- Changing tab navigation to client-side (tabs must remain separate, shareable URLs)
- Any changes to the visual UI

---

## Changes

### 1. Database migration — add missing indexes

**File:** `supabase/migrations/20260328000001_add_performance_indexes.sql`

```sql
-- Covers: WHERE game_id = X and WHERE game_id = X AND status = 'played'
CREATE INDEX idx_weeks_game_id_status ON weeks(game_id, status);

-- Covers: WHERE game_id = X AND key = 'config' in get_player_stats_public RPC
CREATE INDEX idx_config_game_id ON config(game_id);
```

The composite `(game_id, status)` index on `weeks` covers the two most common filter patterns used across all pages and inside the player stats RPC. The `config(game_id)` index fixes the config lookup inside `get_player_stats_public`.

No changes to existing indexes. No data migrations required.

---

### 2. Centralised cached fetchers — `lib/fetchers.ts`

Create a new file `lib/fetchers.ts` that wraps each shared data-fetching function in React's `cache()`. This provides per-request deduplication: if both the layout and a page component call `getGame(leagueId)`, the Supabase query executes exactly once per request.

**Functions to expose:**

| Fetcher | Data returned | Used by |
|---|---|---|
| `getGame(leagueId)` | Game row (name, location, day, kickoff_time, bio) | All tabs |
| `getAuthAndRole(leagueId)` | `{ user, userRole }` | All tabs |
| `getFeatures(leagueId)` | Merged `LeagueFeature[]` from experiments + league_features | All tabs |
| `getPlayerStats(leagueId)` | `Player[]` from `get_player_stats_public` RPC | Results, Players, Lineup Lab |
| `getWeeks(leagueId)` | All weeks (played, cancelled, unrecorded, scheduled) | Results, Players, Lineup Lab |

Each function is a pure async function wrapped in `cache()`. No state, no side effects.

`getAuthAndRole` runs the auth chain as a single unit: `getUser()` then conditionally `game_members` lookup. The sequential dependency within auth is unavoidable, but this chain now runs in parallel with all data fetches.

---

### 3. Shared layout — `app/[leagueId]/layout.tsx`

Create a server component layout at `app/[leagueId]/layout.tsx`. Its sole purpose is to call the cached fetchers to seed the request cache before child pages render. Pages then call the same fetchers and receive cached results for free.

The layout renders `{children}` — it adds no visual chrome of its own. It performs a `notFound()` check on the game to catch invalid league IDs at the layout level.

```tsx
// app/[leagueId]/layout.tsx (server component)
export default async function LeagueLayout({ children, params }) {
  const { leagueId } = await params
  const game = await getGame(leagueId)
  if (!game) notFound()
  // Also warm: auth/role, features — called by all pages
  await Promise.all([getAuthAndRole(leagueId), getFeatures(leagueId)])
  return <>{children}</>
}
```

The layout does not need to fetch player stats or weeks — those are tab-specific and warmed by the individual pages.

---

### 4. Parallelise within each page

Each page is updated to fire all independent fetches simultaneously. The pattern for every page:

```ts
const [{ user, userRole }, game, features, players, weeks] = await Promise.all([
  getAuthAndRole(leagueId),   // cache hit — already ran in layout
  getGame(leagueId),           // cache hit — already ran in layout
  getFeatures(leagueId),       // cache hit — already ran in layout
  getPlayerStats(leagueId),    // first call on this page — runs fresh
  getWeeks(leagueId),          // first call on this page — runs fresh
])
```

Because the layout pre-warms the shared fetchers, by the time each page's `Promise.all` runs, `getAuthAndRole`, `getGame`, and `getFeatures` are already resolved from cache. Only the tab-specific fetches (player stats, weeks, scheduled week) hit the network.

**Results page specifics:**
- `getPlayerStats` and `getWeeks` run in parallel (not sequential as today)
- The scheduled week fetch runs as a separate parallel call alongside the above
- The unrecorded week creation is kept: after `create_unrecorded_week` resolves, the new week row is constructed locally from the known values (game_id, date, week number, status='unrecorded') and appended to the existing weeks array — no second network fetch

**Players page specifics:**
- All three shared fetches (game, auth, features) are cache hits
- Only `getPlayerStats` and `getWeeks` hit the network, running in parallel

**Lineup Lab page specifics:**
- Identical to Players: cache hits for shared data, parallel network fetch for players + weeks

---

### 5. Query parallelisation within `getAuthAndRole`

The auth chain has an unavoidable sequential dependency (need `user.id` before looking up `game_members`), but it now runs in parallel with data fetches rather than blocking them:

```ts
export const getAuthAndRole = cache(async (leagueId: string) => {
  try {
    const authSupabase = await createClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    if (!user) return { user: null, userRole: null }
    const { data: memberRow } = await serviceSupabase
      .from('game_members')
      .select('role')
      .eq('game_id', leagueId)
      .eq('user_id', user.id)
      .maybeSingle()
    return { user, userRole: (memberRow?.role ?? null) as GameRole | null }
  } catch {
    return { user: null, userRole: null }
  }
})
```

---

## Before / After Query Count

### Results page (member, today)
1. `games` — sequential
2. `getUser()` — sequential after 1
3. `game_members` — sequential after 2
4. `feature_experiments` + `league_features` — parallel, but sequential after 3
5. `weeks` — sequential after 4
6. `weeks` (scheduled) — sequential after 5
7. `weeks` (re-fetch if unrecorded created) — conditional, sequential after 6
8. `get_player_stats_public` — sequential after 7

**Up to 8 sequential steps.** Total time = sum of all round-trips.

### Results page (member, after)
- Layout: `getGame` + `getAuthAndRole` + `getFeatures` — all in parallel, cached
- Page: `Promise.all([getGame, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getScheduledWeek])` — cache hits for first 3, two real fetches in parallel

**2 parallel steps.** Total time = max(layout parallel group, page parallel group).

---

## File Changes Summary

| File | Change |
|---|---|
| `supabase/migrations/20260328000001_add_performance_indexes.sql` | New — adds two indexes |
| `lib/fetchers.ts` | New — cached fetcher functions |
| `app/[leagueId]/layout.tsx` | New — shared layout to warm cache |
| `app/[leagueId]/results/page.tsx` | Updated — use fetchers, parallelise, fix double-fetch |
| `app/[leagueId]/players/page.tsx` | Updated — use fetchers, parallelise |
| `app/[leagueId]/lineup-lab/page.tsx` | Updated — use fetchers, parallelise |

Settings page (`[leagueId]/settings/page.tsx`) is already client-side and uses its own API routes — not in scope.

---

## Testing Approach

- Verify each page renders correctly for: unauthenticated user, member, admin
- Verify `notFound()` still fires for an invalid `leagueId`
- Verify feature flag gating still works (feature-disabled tabs show correct states)
- Verify the unrecorded week logic on results page still creates the row when needed, with no double-fetch
- Manually compare tab switch speed before and after in the browser (Network tab in DevTools)
- Check Supabase dashboard query logs to confirm reduction in query count per page load
