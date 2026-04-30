# Remove `stats_sidebar` feature flag

## Background

The mobile Stats FAB (`components/MobileStatsFAB.tsx`) and the desktop stats
sidebar (`SidebarSticky` + `StatsSidebar`) are both gated per-page by:

```ts
const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)
```

A logged-in member reported the FAB was missing on Android while an
unauthenticated visitor on the same league saw the sidebar on desktop. Root
cause: the league's `stats_sidebar` row had `enabled = false` for members but
`public_enabled = true`, so a logged-in member sees *less* than a logged-out
visitor. The admin viewing on iOS bypasses the flag (`isAdmin || …`) and
never noticed.

The product decision is that the stats sidebar / FAB should be visible to
anyone who can render the page. With no policy left to express, the flag
becomes dead config.

## Goal

Remove the `stats_sidebar` feature flag end to end: render gates, types,
defaults, admin UI, experiments page, internal component gate, and database
rows. The sidebar / FAB always render alongside the rest of the page.

## Non-goals

- No change to `MobileStatsFAB` itself — its `lg:hidden` viewport rule,
  scroll lock, and animation behaviour are unrelated to this bug.
- No change to other feature flags (`match_history`, `match_entry`,
  `player_stats`, `player_comparison`). Those still gate page-level access
  for public visitors.
- No retroactive cleanup of the earlier consolidation migration
  (`20260323000001_consolidate_stats_sidebar_flag.sql`) — migrations are
  immutable history.

## Changes

### 1. Render gates — drop conditional, render unconditionally

Four pages each compute `canSeeStatsSidebar` and wrap both the desktop
`SidebarSticky` and the `MobileStatsFAB` in `{canSeeStatsSidebar && …}`.
Remove the variable, remove the wrappers, render the components directly.

- `app/[slug]/results/page.tsx` — three wrappers (one desktop + one mobile
  on the public branch, one of each on the member/admin branch). Also
  simplify `player_count` (line 154) to always be `players.length`; the
  conditional `(tier !== 'public' || canSeeStatsSidebar)` collapses.
- `app/[slug]/players/page.tsx`
- `app/[slug]/lineup-lab/page.tsx`
- `app/[slug]/honours/page.tsx`

### 2. `StatsSidebar` component — drop the internal gate and unused props

`components/StatsSidebar.tsx` lines 285-298 currently re-check the flag and
short-circuit:

```ts
const tier = resolveVisibilityTier(role)
const showStatsSidebar = isFeatureEnabled(features, 'stats_sidebar', tier)
if (!showStatsSidebar) return null
```

After removal, `features`, `role`, and `tier` are unused inside the
component — none of `YourStatsWidget`, `QuarterlyTableWidget`,
`InFormWidget`, `TeamABWidget` consume them. Remove `features` and `role`
from `StatsSidebarProps` and from the four page call sites.

### 3. Type, defaults, admin UI

- `lib/types.ts:94` — remove `'stats_sidebar'` from the `FeatureKey` union.
- `lib/defaults.ts:15` — remove the `stats_sidebar` row from
  `DEFAULT_FEATURES`.
- `components/FeaturePanel.tsx:41` — remove the `stats_sidebar` row config.
- `app/api/experiments/route.ts:43` — remove `'stats_sidebar'` from
  `VALID_FEATURES`.
- `app/experiments/page.tsx:14` — remove the `stats_sidebar:` label entry.

The TypeScript error from removing the union member will surface any
straggler references at build time.

### 4. Database migration

New migration
`supabase/migrations/<ts>_remove_stats_sidebar_flag.sql`:

```sql
DELETE FROM league_features    WHERE feature = 'stats_sidebar';
DELETE FROM feature_experiments WHERE feature = 'stats_sidebar';
```

Idempotent. Safe to run before or after the code ships — the old code
tolerated any flag value (including a missing row, which evaluated to
`false`; now harmless because nothing reads the flag) and the new code
ignores the row entirely.

### 5. Docs

`CLAUDE.md:141` — remove `'stats_sidebar'` from the `FeatureKey` example
in the type listing.

## Test plan

- `npm run build` — TypeScript should pass with the union member removed.
  Any leftover reference will fail compilation.
- `npm run lint`
- Manual smoke on /[slug]/results, /[slug]/players, /[slug]/lineup-lab,
  /[slug]/honours as three roles:
  - admin signed in
  - member signed in
  - unauthenticated public visitor
  Each role should see the FAB on mobile widths (<1024px) and the
  desktop sidebar at ≥1024px. Settings → Features should no longer list a
  Stats Sidebar row.

## Sequencing

1. Code change merges and deploys.
2. Migration runs (cleanup, not load-bearing).

The order is not strict because the code change makes the flag unread.
