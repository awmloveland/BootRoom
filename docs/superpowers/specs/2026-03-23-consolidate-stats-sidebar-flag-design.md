# Design: Consolidate Stats Sidebar Feature Flag

**Date:** 2026-03-23
**Branch:** awmloveland/consolidate-stats-sidebar-flag

---

## Problem

The stats sidebar currently has three independent feature flags (`stats_in_form`, `stats_quarterly_table`, `stats_team_ab`). This causes several issues:

1. All three default to `enabled: false`, so members never see the sidebar even though it should always be on for them.
2. Three separate toggles in the settings panel are unnecessary complexity — the sidebar is an all-or-nothing feature for members.
3. The panel UI uses a non-standard row style (checkboxes + label) instead of the card pattern used by Team Builder and Player Stats.
4. The migration seeding these three flags into `feature_experiments` may not have been applied, causing the toggles to not appear at all.

---

## Solution

Replace the three flags with a single `stats_sidebar` flag. Members always see the sidebar (`enabled: true` hardcoded in defaults). The only configurable control is whether the public can see it (`public_enabled`, defaulting to `true`).

---

## Data Model

### `lib/types.ts` — FeatureKey

Remove:
```ts
| 'stats_in_form'
| 'stats_quarterly_table'
| 'stats_team_ab'
```

Add:
```ts
| 'stats_sidebar'
```

### `lib/defaults.ts` — DEFAULT_FEATURES

Remove the three stats rows. Add:
```ts
{ feature: 'stats_sidebar', enabled: true, config: null, public_enabled: true, public_config: null }
```

---

## Components

### `components/StatsSidebarCard.tsx` (new)

A new card component matching the style of `TeamBuilderCard`:

- Outer wrapper: `rounded-xl border border-slate-700 bg-slate-800 overflow-hidden mb-3`
- Header section (`px-4 py-3 border-b border-slate-700/60`):
  - Title: "Stats Sidebar"
  - Subtitle: "Live stats widgets shown alongside match results and player pages."
- Body (`px-4`): single toggle row for **Public** only
  - Label: "Public", hint: "visible to anyone with the league link"
  - `Toggle` component from `components/ui/toggle`
  - On change: PATCH `/api/league/[id]/features` with updated `public_enabled`
- Error and saved feedback (`px-4 pb-3 text-xs`) matching TeamBuilderCard pattern
- No Members row — members always have access; the toggle is not exposed

### `components/FeaturePanel.tsx`

- Remove `StatsFeatureRow` component definition
- Remove the "Stats Sidebar" `<div className="mt-4">` section with three `StatsFeatureRow` calls
- Add `import { StatsSidebarCard } from '@/components/StatsSidebarCard'`
- Render `<StatsSidebarCard>` below `<PlayerStatsCard>`, passing `leagueId`, `feature`, `onChanged`

### `components/StatsSidebar.tsx`

Replace:
```ts
const showInForm    = isFeatureEnabled(features, 'stats_in_form',         tier)
const showQuarterly = isFeatureEnabled(features, 'stats_quarterly_table', tier)
const showTeamAB    = isFeatureEnabled(features, 'stats_team_ab',         tier)
if (!showInForm && !showQuarterly && !showTeamAB) return null
```

With:
```ts
const show = isFeatureEnabled(features, 'stats_sidebar', tier)
if (!show) return null
```

Remove the three individual `show*` guards on the widgets — all three render unconditionally once the sidebar is shown.

---

## Database Migration

New file: `supabase/migrations/20260323000001_consolidate_stats_sidebar_flag.sql`

```sql
-- 1. Register the new unified flag
INSERT INTO feature_experiments (feature, available)
VALUES ('stats_sidebar', true)
ON CONFLICT (feature) DO NOTHING;

-- 2. Seed stats_sidebar for all leagues
--    Default: enabled=true, public_enabled=true
INSERT INTO league_features (game_id, feature, enabled, public_enabled)
SELECT id, 'stats_sidebar', true, true
FROM games
ON CONFLICT (game_id, feature) DO NOTHING;

-- 3. Remove the old per-widget flags from feature_experiments
DELETE FROM feature_experiments
WHERE feature IN ('stats_in_form', 'stats_quarterly_table', 'stats_team_ab');

-- 4. Remove the old per-widget rows from league_features
DELETE FROM league_features
WHERE feature IN ('stats_in_form', 'stats_quarterly_table', 'stats_team_ab');
```

---

## Behaviour Summary

| Audience | Sees sidebar? | Configurable? |
|---|---|---|
| Admin | Always | No (admin bypass) |
| Member | Always | No (enabled=true, not exposed in card) |
| Public | Only if public_enabled=true | Yes — Public toggle in card |

---

## Files Changed

| File | Change |
|---|---|
| `lib/types.ts` | Remove 3 old FeatureKeys, add `stats_sidebar` |
| `lib/defaults.ts` | Replace 3 rows with 1 |
| `components/StatsSidebarCard.tsx` | New card component |
| `components/FeaturePanel.tsx` | Remove StatsFeatureRow + old section, add StatsSidebarCard |
| `components/StatsSidebar.tsx` | Single flag check |
| `supabase/migrations/20260323000001_consolidate_stats_sidebar_flag.sql` | New migration |
