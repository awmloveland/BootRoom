# Consolidate Stats Sidebar Feature Flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace three per-widget feature flags (`stats_in_form`, `stats_quarterly_table`, `stats_team_ab`) with a single `stats_sidebar` flag that is always on for members and has a public-visibility toggle defaulting to true.

**Architecture:** Update the `FeatureKey` union type and defaults, create a new `StatsSidebarCard` settings card, wire it into `FeaturePanel`, simplify `StatsSidebar` to a single flag check, and ship a migration to clean up the old rows and seed the new one.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS v3, Supabase (PostgreSQL), `@radix-ui/react-collapsible`, `lucide-react`, `clsx`/`tailwind-merge` via `cn()`.

---

## File Map

| File | Action | What changes |
|---|---|---|
| `lib/types.ts` | Modify | Remove 3 old FeatureKeys, add `stats_sidebar` |
| `lib/defaults.ts` | Modify | Replace 3 stats rows with 1 |
| `components/StatsSidebarCard.tsx` | Create | New settings card (Public toggle only) |
| `components/FeaturePanel.tsx` | Modify | Remove StatsFeatureRow + section, add StatsSidebarCard |
| `components/StatsSidebar.tsx` | Modify | Single flag check, unconditional widget renders |
| `app/experiments/page.tsx` | Modify | Update FEATURE_LABELS exhaustive record |
| `supabase/migrations/20260323000001_consolidate_stats_sidebar_flag.sql` | Create | Migration — seed new flag, delete old rows |

---

## Task 1: Update FeatureKey type and defaults

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/defaults.ts`

- [ ] **Step 1: Update `FeatureKey` in `lib/types.ts`**

  Open `lib/types.ts`. Find the `FeatureKey` union (around line 52). Remove the three old keys and add `stats_sidebar`:

  ```ts
  export type FeatureKey =
    | 'match_history'
    | 'match_entry'
    | 'team_builder'
    | 'player_stats'
    | 'player_comparison'
    | 'stats_sidebar';
  ```

- [ ] **Step 2: Update `DEFAULT_FEATURES` in `lib/defaults.ts`**

  Remove the three stats rows and add one:

  ```ts
  { feature: 'stats_sidebar', enabled: true, config: null, public_enabled: true, public_config: null },
  ```

  The full array should end with:
  ```ts
  { feature: 'player_comparison', enabled: false, config: null, public_enabled: false, public_config: null },
  { feature: 'stats_sidebar',     enabled: true,  config: null, public_enabled: true,  public_config: null },
  ```

- [ ] **Step 3: Fix `app/experiments/page.tsx` FEATURE_LABELS**

  This file has a `FEATURE_LABELS` record typed as `Record<FeatureKey, string>`. TypeScript requires all keys to be present. Remove the three old entries and add the new one:

  ```ts
  stats_sidebar: 'Stats Sidebar',
  ```

  Remove:
  ```ts
  stats_in_form: '...',
  stats_quarterly_table: '...',
  stats_team_ab: '...',
  ```

- [ ] **Step 4: Verify TypeScript compiles**

  ```bash
  cd /Users/willloveland/conductor/workspaces/bootroom/bangui
  npx tsc --noEmit
  ```

  Expected: no errors. If TypeScript reports errors, they will point to any remaining references to the old keys — fix them before continuing.

- [ ] **Step 5: Commit**

  ```bash
  git add lib/types.ts lib/defaults.ts app/experiments/page.tsx
  git commit -m "feat: replace three stats feature keys with single stats_sidebar"
  ```

---

## Task 2: Update StatsSidebar component

**Files:**
- Modify: `components/StatsSidebar.tsx`

- [ ] **Step 1: Replace the three feature flag checks**

  Find these lines near the top of the `StatsSidebar` function body (around line 226):

  ```ts
  const showInForm    = isFeatureEnabled(features, 'stats_in_form',         tier)
  const showQuarterly = isFeatureEnabled(features, 'stats_quarterly_table', tier)
  const showTeamAB    = isFeatureEnabled(features, 'stats_team_ab',         tier)

  if (!showInForm && !showQuarterly && !showTeamAB) return null
  ```

  Replace with:

  ```ts
  const show = isFeatureEnabled(features, 'stats_sidebar', tier)
  if (!show) return null
  ```

- [ ] **Step 2: Make all three widgets render unconditionally**

  Find the return block:

  ```tsx
  return (
    <div className="space-y-3">
      {showInForm    && <InFormWidget    players={players} />}
      {showQuarterly && <QuarterlyTableWidget weeks={weeks} />}
      {showTeamAB    && <TeamABWidget    weeks={weeks} />}
    </div>
  )
  ```

  Replace with:

  ```tsx
  return (
    <div className="space-y-3">
      <InFormWidget players={players} />
      <QuarterlyTableWidget weeks={weeks} />
      <TeamABWidget weeks={weeks} />
    </div>
  )
  ```

  Each widget already handles the empty-data case internally — no additional guards needed.

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add components/StatsSidebar.tsx
  git commit -m "feat: simplify StatsSidebar to single stats_sidebar flag check"
  ```

---

## Task 3: Create StatsSidebarCard settings component

**Files:**
- Create: `components/StatsSidebarCard.tsx`

This card is the settings UI for the `stats_sidebar` feature flag. It matches the style of `TeamBuilderCard` exactly — same outer wrapper, same header pattern, same error/saved feedback — but exposes only a Public toggle (members always have access).

- [ ] **Step 1: Create `components/StatsSidebarCard.tsx`**

  ```tsx
  'use client'

  import { useState } from 'react'
  import { Toggle } from '@/components/ui/toggle'
  import type { LeagueFeature } from '@/lib/types'

  interface StatsSidebarCardProps {
    leagueId: string
    feature: LeagueFeature
    onChanged: () => void
  }

  export function StatsSidebarCard({ leagueId, feature, onChanged }: StatsSidebarCardProps) {
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    async function updateFeature(updated: LeagueFeature) {
      setSaving(true)
      setError(null)
      try {
        const res = await fetch(`/api/league/${leagueId}/features`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(updated),
        })
        if (!res.ok) throw new Error('Failed to save')
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
        onChanged()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setSaving(false)
      }
    }

    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden mb-3">
        <div className="px-4 py-3 border-b border-slate-700/60">
          <div className="text-sm font-semibold text-slate-100">Stats Sidebar</div>
          <div className="text-xs text-slate-500 mt-0.5">
            Live stats widgets shown alongside match results and player pages.
          </div>
        </div>
        <div className="px-4">
          <div className="flex items-center justify-between py-2.5">
            <div>
              <span className="text-sm text-slate-300">Public</span>
              <span className="text-xs text-slate-500 ml-2">visible to anyone with the league link</span>
            </div>
            <Toggle
              enabled={feature.public_enabled}
              onChange={(val) => updateFeature({ ...feature, public_enabled: val })}
              disabled={saving}
            />
          </div>
        </div>
        {error && <div className="px-4 pb-3 text-xs text-red-400">{error}</div>}
        {saved && <div className="px-4 pb-3 text-xs text-sky-400">Saved</div>}
      </div>
    )
  }
  ```

- [ ] **Step 2: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add components/StatsSidebarCard.tsx
  git commit -m "feat: add StatsSidebarCard settings component"
  ```

---

## Task 4: Wire StatsSidebarCard into FeaturePanel

**Files:**
- Modify: `components/FeaturePanel.tsx`

- [ ] **Step 1: Remove StatsFeatureRow and the old Stats Sidebar section**

  In `components/FeaturePanel.tsx`:

  1. Delete the entire `StatsFeatureRow` interface + function (lines 27–78).
  2. Delete the `{/* Stats sidebar widgets */}` section at the bottom of `FeaturePanel` (the `<div className="mt-4">` block with three `StatsFeatureRow` calls, lines 101–124).

- [ ] **Step 2: Add StatsSidebarCard import and render**

  Add to imports at the top:
  ```ts
  import { StatsSidebarCard } from '@/components/StatsSidebarCard'
  ```

  In the `FeaturePanel` return, add `<StatsSidebarCard>` after `<PlayerStatsCard>`:
  ```tsx
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
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add components/FeaturePanel.tsx
  git commit -m "feat: replace stats sidebar rows with StatsSidebarCard in FeaturePanel"
  ```

---

## Task 5: Write and apply the database migration

**Files:**
- Create: `supabase/migrations/20260323000001_consolidate_stats_sidebar_flag.sql`

- [ ] **Step 1: Create the migration file**

  ```sql
  -- Consolidate three per-widget stats flags into a single stats_sidebar flag.

  -- 1. Register the new unified flag globally
  INSERT INTO feature_experiments (feature, available)
  VALUES ('stats_sidebar', true)
  ON CONFLICT (feature) DO NOTHING;

  -- 2. Seed stats_sidebar for all leagues (enabled=true, public_enabled=true)
  INSERT INTO league_features (game_id, feature, enabled, public_enabled)
  SELECT id, 'stats_sidebar', true, true
  FROM games
  ON CONFLICT (game_id, feature) DO NOTHING;

  -- 3. Remove old per-widget rows from league_features
  DELETE FROM league_features
  WHERE feature IN ('stats_in_form', 'stats_quarterly_table', 'stats_team_ab');

  -- 4. Remove old per-widget flags from feature_experiments
  DELETE FROM feature_experiments
  WHERE feature IN ('stats_in_form', 'stats_quarterly_table', 'stats_team_ab');
  ```

- [ ] **Step 2: Apply the migration**

  Run this SQL in the Supabase SQL Editor for the project's database. Steps run in the order written — no FK constraints exist between `league_features` and `feature_experiments`, so ordering is safe.

  Verify by running:
  ```sql
  SELECT feature, available FROM feature_experiments ORDER BY feature;
  SELECT feature, enabled, public_enabled FROM league_features LIMIT 20;
  ```

  Expected: `stats_sidebar` present in `feature_experiments` with `available=true`; old three keys absent from both tables.

- [ ] **Step 3: Commit the migration file**

  ```bash
  git add supabase/migrations/20260323000001_consolidate_stats_sidebar_flag.sql
  git commit -m "chore: add migration to consolidate stats sidebar feature flag"
  ```

---

## Task 6: Manual smoke test

- [ ] **Step 1: Start the dev server**

  ```bash
  npm run dev
  ```

- [ ] **Step 2: Check Settings → Features as admin**

  Navigate to a league's settings page → Features tab. Verify:
  - "Stats Sidebar" card appears below "Player Stats"
  - Card has a single "Public" toggle
  - No "Members" toggle visible
  - No old per-widget rows present

- [ ] **Step 3: Toggle Public off and verify sidebar hides for public**

  Toggle Public off. Open the public league URL in an incognito window. Verify the stats sidebar is not visible.

- [ ] **Step 4: Toggle Public on and verify sidebar shows for public**

  Toggle Public back on. Reload the incognito window. Verify all three widgets (Most In Form, Quarterly Table, Team A vs Team B) are visible.

- [ ] **Step 5: Verify members always see the sidebar regardless of Public toggle**

  With Public toggled off, sign in as a regular member. Verify the stats sidebar is still visible on results and players pages.
