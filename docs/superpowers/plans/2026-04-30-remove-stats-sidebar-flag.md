# Remove `stats_sidebar` Feature Flag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the stats sidebar (desktop) and Stats FAB (mobile) render unconditionally on every page that currently gates them, and remove the `stats_sidebar` flag end-to-end (types, defaults, admin UI, experiments page, internal component gate, DB rows).

**Architecture:** Pure deletion / ungating. No new code paths, no new types. Final compile uses TypeScript narrowing of the `FeatureKey` union to surface any remaining references.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind v4, Supabase (Postgres). No tests exist for these surfaces — verification is `npm run build` (TS), `npm run lint`, and a manual smoke checklist.

**Spec:** `docs/superpowers/specs/2026-04-30-remove-stats-sidebar-flag-design.md`

---

## File Structure

**Modify (10):**
- `app/[slug]/results/page.tsx` — drop `canSeeStatsSidebar`, unwrap 3 gates, simplify `player_count`, drop `features`/`role` from `<StatsSidebar>` calls
- `app/[slug]/players/page.tsx` — drop `canSeeStatsSidebar`, unwrap 1 gate, drop `features`/`role` from 2 `<StatsSidebar>` calls
- `app/[slug]/lineup-lab/page.tsx` — same shape as players
- `app/[slug]/honours/page.tsx` — drop `canSeeStatsSidebar`, unwrap 2 gates, drop `features`/`role` from 2 calls
- `components/StatsSidebar.tsx` — drop the internal `isFeatureEnabled` gate; drop `features`, `role`, `tier` from `StatsSidebarProps` and the function body
- `components/FeaturePanel.tsx` — drop the `<StatsSidebarCard>` row + import
- `app/api/experiments/route.ts` — remove `'stats_sidebar'` from `VALID_FEATURES`
- `app/experiments/page.tsx` — remove `stats_sidebar:` label
- `lib/types.ts` — remove `'stats_sidebar'` from `FeatureKey` union
- `lib/defaults.ts` — remove the `stats_sidebar` row from `DEFAULT_FEATURES`
- `CLAUDE.md` — remove `'stats_sidebar'` from the `FeatureKey` example

**Delete (1):**
- `components/StatsSidebarCard.tsx` — orphan after `FeaturePanel` change; only consumer is the row we're removing

**Create (1):**
- `supabase/migrations/20260430000001_remove_stats_sidebar_flag.sql` — delete `league_features` and `feature_experiments` rows

---

## Task 1: DB migration

**Files:**
- Create: `supabase/migrations/20260430000001_remove_stats_sidebar_flag.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Remove the stats_sidebar feature flag.
-- The sidebar / FAB are now unconditional UI; the flag is dead config.

DELETE FROM league_features    WHERE feature = 'stats_sidebar';
DELETE FROM feature_experiments WHERE feature = 'stats_sidebar';
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/20260430000001_remove_stats_sidebar_flag.sql
git commit -m "feat: drop stats_sidebar feature_experiments and league_features rows"
```

The migration is run manually in the Supabase SQL Editor per the project convention; no automated step here.

---

## Task 2: Ungate the four page render sites

This task touches four similar pages. Apply each substep, run `npm run build` between pages if you want intermediate confidence — TypeScript will still pass because `'stats_sidebar'` remains in the `FeatureKey` union until Task 4.

**Files:**
- Modify: `app/[slug]/results/page.tsx`
- Modify: `app/[slug]/players/page.tsx`
- Modify: `app/[slug]/lineup-lab/page.tsx`
- Modify: `app/[slug]/honours/page.tsx`

### 2a. `app/[slug]/results/page.tsx`

- [ ] **Step 1: Remove `canSeeStatsSidebar` and simplify `player_count`**

At line 74, replace:

```ts
  const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)
```

with nothing — delete the line.

At line 154, replace:

```ts
    player_count: (tier !== 'public' || canSeeStatsSidebar) ? players.length : undefined,
```

with:

```ts
    player_count: players.length,
```

- [ ] **Step 2: Unwrap the public-tier gates and drop unused StatsSidebar props**

At lines 198-209, replace:

```tsx
          {canSeeStatsSidebar && (
            <SidebarSticky>
              <StatsSidebar
                players={players}
                weeks={weeks}
                features={features}
                role={userRole}
                leagueDayIndex={leagueDayIndex}
                linkedPlayerName={linkedPlayerName}
              />
            </SidebarSticky>
          )}
```

with:

```tsx
          <SidebarSticky>
            <StatsSidebar
              players={players}
              weeks={weeks}
              leagueDayIndex={leagueDayIndex}
              linkedPlayerName={linkedPlayerName}
            />
          </SidebarSticky>
```

At lines 211-222, replace:

```tsx
        {canSeeStatsSidebar && (
          <MobileStatsFAB>
            <StatsSidebar
              players={players}
              weeks={weeks}
              features={features}
              role={userRole}
              leagueDayIndex={leagueDayIndex}
              linkedPlayerName={linkedPlayerName}
            />
          </MobileStatsFAB>
        )}
```

with:

```tsx
        <MobileStatsFAB>
          <StatsSidebar
            players={players}
            weeks={weeks}
            leagueDayIndex={leagueDayIndex}
            linkedPlayerName={linkedPlayerName}
          />
        </MobileStatsFAB>
```

- [ ] **Step 3: Unwrap the member-tier mobile FAB and drop unused StatsSidebar props**

At lines 290-301, replace:

```tsx
      {canSeeStatsSidebar && (
        <MobileStatsFAB>
          <StatsSidebar
            players={players}
            weeks={weeks}
            features={features}
            role={userRole}
            leagueDayIndex={leagueDayIndex}
            linkedPlayerName={linkedPlayerName}
          />
        </MobileStatsFAB>
      )}
```

with:

```tsx
      <MobileStatsFAB>
        <StatsSidebar
          players={players}
          weeks={weeks}
          leagueDayIndex={leagueDayIndex}
          linkedPlayerName={linkedPlayerName}
        />
      </MobileStatsFAB>
```

The desktop sidebar in the member branch (around line 279-288) is currently *not* gated — it stays as-is structurally, but its `features` and `role` props must be dropped. Replace:

```tsx
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={weeks}
            features={features}
            role={userRole}
            leagueDayIndex={leagueDayIndex}
            linkedPlayerName={linkedPlayerName}
          />
        </SidebarSticky>
```

with:

```tsx
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={weeks}
            leagueDayIndex={leagueDayIndex}
            linkedPlayerName={linkedPlayerName}
          />
        </SidebarSticky>
```

### 2b. `app/[slug]/players/page.tsx`

- [ ] **Step 4: Remove `canSeeStatsSidebar` and ungate the FAB**

At line 50, delete:

```ts
  const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)
```

At lines 108-117 (desktop sidebar — not currently gated, just drop unused props), replace:

```tsx
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
            linkedPlayerName={linkedPlayerName}
          />
        </SidebarSticky>
```

with:

```tsx
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            linkedPlayerName={linkedPlayerName}
          />
        </SidebarSticky>
```

At lines 118-128, replace:

```tsx
      {canSeeStatsSidebar && (
        <MobileStatsFAB>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
            linkedPlayerName={linkedPlayerName}
          />
        </MobileStatsFAB>
      )}
```

with:

```tsx
      <MobileStatsFAB>
        <StatsSidebar
          players={players}
          weeks={playedWeeks}
          linkedPlayerName={linkedPlayerName}
        />
      </MobileStatsFAB>
```

### 2c. `app/[slug]/lineup-lab/page.tsx`

- [ ] **Step 5: Remove `canSeeStatsSidebar` and ungate the FAB**

At line 49, delete:

```ts
  const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)
```

At lines 86-93 (desktop sidebar — not currently gated, drop props), replace:

```tsx
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
          />
        </SidebarSticky>
```

with:

```tsx
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
          />
        </SidebarSticky>
```

At lines 95-104, replace:

```tsx
      {canSeeStatsSidebar && (
        <MobileStatsFAB>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
          />
        </MobileStatsFAB>
      )}
```

with:

```tsx
      <MobileStatsFAB>
        <StatsSidebar
          players={players}
          weeks={playedWeeks}
        />
      </MobileStatsFAB>
```

### 2d. `app/[slug]/honours/page.tsx`

- [ ] **Step 6: Remove `canSeeStatsSidebar` and ungate both desktop sidebar and FAB**

At line 51, delete:

```ts
  const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)
```

At lines 99-109, replace:

```tsx
        {canSeeStatsSidebar && (
          <SidebarSticky>
            <StatsSidebar
              players={players}
              weeks={playedWeeks}
              features={features}
              role={userRole}
              linkedPlayerName={linkedPlayerName}
            />
          </SidebarSticky>
        )}
```

with:

```tsx
        <SidebarSticky>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            linkedPlayerName={linkedPlayerName}
          />
        </SidebarSticky>
```

At lines 111-121, replace:

```tsx
      {canSeeStatsSidebar && (
        <MobileStatsFAB>
          <StatsSidebar
            players={players}
            weeks={playedWeeks}
            features={features}
            role={userRole}
            linkedPlayerName={linkedPlayerName}
          />
        </MobileStatsFAB>
      )}
```

with:

```tsx
      <MobileStatsFAB>
        <StatsSidebar
          players={players}
          weeks={playedWeeks}
          linkedPlayerName={linkedPlayerName}
        />
      </MobileStatsFAB>
```

- [ ] **Step 7: Drop now-unused `isFeatureEnabled` import on each page if it has no other use**

Check each of the four pages — `isFeatureEnabled` may still be needed for other gates (`canSeeMatchHistory`, `canSeeMatchEntry`, `canSeePlayerStats`, `canSeePlayerComparison`). If still used, leave the import. If no longer used, remove the import line.

For the four pages in scope:
- `results/page.tsx` — keeps `isFeatureEnabled` (used for `canSeeMatchHistory`/`canSeeMatchEntry`/`canSeePlayerStats`).
- `players/page.tsx` — keeps it (line 52 uses it for `player_stats`).
- `lineup-lab/page.tsx` — after the change, `isFeatureEnabled` is no longer referenced. Remove the import: `import { isFeatureEnabled } from '@/lib/features'` (line 12).
- `honours/page.tsx` — after the change, `isFeatureEnabled` is no longer referenced. Remove the import: `import { isFeatureEnabled } from '@/lib/features'` (line 7).

- [ ] **Step 8: Verify build still passes**

Run: `npm run build`
Expected: PASS. The `FeatureKey` union still includes `'stats_sidebar'`, so even with the gates removed nothing breaks at compile time. The page render output simply ignores the flag.

- [ ] **Step 9: Commit**

```bash
git add app/\[slug\]/results/page.tsx app/\[slug\]/players/page.tsx app/\[slug\]/lineup-lab/page.tsx app/\[slug\]/honours/page.tsx
git commit -m "feat: render stats sidebar and FAB unconditionally on league pages"
```

---

## Task 3: Strip the internal gate and unused props from `StatsSidebar`

**Files:**
- Modify: `components/StatsSidebar.tsx`

- [ ] **Step 1: Replace the imports and props interface**

At lines 1-15, replace:

```tsx
import { cn } from '@/lib/utils'
import { isFeatureEnabled } from '@/lib/features'
import { resolveVisibilityTier } from '@/lib/roles'
import { computeInForm, computeQuarterlyTable, computeTeamAB } from '@/lib/sidebar-stats'
import { FormDots } from '@/components/FormDots'
import type { Player, Week, LeagueFeature, GameRole } from '@/lib/types'

interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  features: LeagueFeature[]
  role: GameRole | null
  leagueDayIndex?: number
  linkedPlayerName?: string | null
}
```

with:

```tsx
import { cn } from '@/lib/utils'
import { computeInForm, computeQuarterlyTable, computeTeamAB } from '@/lib/sidebar-stats'
import { FormDots } from '@/components/FormDots'
import type { Player, Week } from '@/lib/types'

interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  leagueDayIndex?: number
  linkedPlayerName?: string | null
}
```

- [ ] **Step 2: Remove the gate at the start of the function body**

At lines 285-298, replace:

```tsx
export function StatsSidebar({ players, weeks, features, role, leagueDayIndex, linkedPlayerName }: StatsSidebarProps) {
  const tier = resolveVisibilityTier(role)
  const showStatsSidebar = isFeatureEnabled(features, 'stats_sidebar', tier)
  if (!showStatsSidebar) return null

  return (
    <div className="space-y-3">
      <YourStatsWidget players={players} linkedPlayerName={linkedPlayerName} />
      <QuarterlyTableWidget weeks={weeks} leagueDayIndex={leagueDayIndex} />
      <InFormWidget    players={players} weeks={weeks} />
      <TeamABWidget    weeks={weeks} />
    </div>
  )
}
```

with:

```tsx
export function StatsSidebar({ players, weeks, leagueDayIndex, linkedPlayerName }: StatsSidebarProps) {
  return (
    <div className="space-y-3">
      <YourStatsWidget players={players} linkedPlayerName={linkedPlayerName} />
      <QuarterlyTableWidget weeks={weeks} leagueDayIndex={leagueDayIndex} />
      <InFormWidget    players={players} weeks={weeks} />
      <TeamABWidget    weeks={weeks} />
    </div>
  )
}
```

- [ ] **Step 3: Verify the file still type-checks against the updated call sites from Task 2**

Run: `npm run build`
Expected: PASS. All four pages now pass exactly the props the new interface expects.

- [ ] **Step 4: Commit**

```bash
git add components/StatsSidebar.tsx
git commit -m "refactor: remove stats_sidebar gate and unused props from StatsSidebar"
```

---

## Task 4: Remove the flag from admin UI, experiments, defaults, and the `FeatureKey` union

This task removes everything that referenced the flag by name. The `FeatureKey` union change goes last — once everything else compiles, removing the union member should be a no-op.

**Files:**
- Modify: `components/FeaturePanel.tsx`
- Delete: `components/StatsSidebarCard.tsx`
- Modify: `app/api/experiments/route.ts`
- Modify: `app/experiments/page.tsx`
- Modify: `lib/defaults.ts`
- Modify: `lib/types.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove the `<StatsSidebarCard>` row and its import from `FeaturePanel`**

In `components/FeaturePanel.tsx` line 4, delete:

```tsx
import { StatsSidebarCard } from '@/components/StatsSidebarCard'
```

In the same file at lines 39-43, delete:

```tsx
      <StatsSidebarCard
        leagueId={leagueId}
        feature={getFeature(features, 'stats_sidebar')}
        onChanged={onChanged}
      />
```

- [ ] **Step 2: Delete the orphan `StatsSidebarCard` component**

```bash
git rm components/StatsSidebarCard.tsx
```

- [ ] **Step 3: Drop `'stats_sidebar'` from the experiments API allowlist**

In `app/api/experiments/route.ts` line 43, replace:

```ts
  const VALID_FEATURES = new Set(['match_history', 'match_entry', 'player_stats', 'player_comparison', 'stats_sidebar'])
```

with:

```ts
  const VALID_FEATURES = new Set(['match_history', 'match_entry', 'player_stats', 'player_comparison'])
```

- [ ] **Step 4: Drop the `stats_sidebar` label from the experiments page**

In `app/experiments/page.tsx` lines 9-15, replace:

```ts
const FEATURE_LABELS: Record<FeatureKey, string> = {
  match_history:     'Match History',
  match_entry:       'Match Entry',
  player_stats:      'Player Stats',
  player_comparison: 'Player Comparison',
  stats_sidebar:     'Stats Sidebar',
}
```

with:

```ts
const FEATURE_LABELS: Record<FeatureKey, string> = {
  match_history:     'Match History',
  match_entry:       'Match Entry',
  player_stats:      'Player Stats',
  player_comparison: 'Player Comparison',
}
```

- [ ] **Step 5: Drop the `stats_sidebar` row from `DEFAULT_FEATURES`**

In `lib/defaults.ts`, replace the file body (lines 4-16) with:

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
]
```

- [ ] **Step 6: Remove `'stats_sidebar'` from the `FeatureKey` union**

In `lib/types.ts` lines 89-94, replace:

```ts
export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'player_stats'
  | 'player_comparison'
  | 'stats_sidebar';
```

with:

```ts
export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'player_stats'
  | 'player_comparison';
```

- [ ] **Step 7: Update the `FeatureKey` example in `CLAUDE.md`**

In `CLAUDE.md` find the `FeatureKey` example block (currently around line 137-142). Inside that fenced TypeScript code block, delete the line `  | 'stats_sidebar';` and ensure the previous line ends with `;` rather than a continuation. Do not modify the surrounding markdown fences. The result, inside the fenced block, should be:

    export type FeatureKey =
      | 'match_history'
      | 'match_entry'
      | 'player_stats'
      | 'player_comparison';

- [ ] **Step 8: Run TypeScript build to confirm there are no stragglers**

Run: `npm run build`
Expected: PASS. If TypeScript reports an error like `'"stats_sidebar"' is not assignable to type 'FeatureKey'`, locate the file and remove the reference; the spec accounts for all known references but a future change might add more.

- [ ] **Step 9: Run lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 10: Confirm there are no remaining string literal references**

Run: `git grep -n stats_sidebar -- ':(exclude)docs/' ':(exclude)supabase/migrations/'`
Expected: empty output. (`docs/` and `supabase/migrations/` are excluded — both contain historical references that should remain.)

- [ ] **Step 11: Commit**

```bash
git add components/FeaturePanel.tsx components/StatsSidebarCard.tsx app/api/experiments/route.ts app/experiments/page.tsx lib/defaults.ts lib/types.ts CLAUDE.md
git commit -m "feat: remove stats_sidebar feature flag from types, defaults, and admin UI"
```

---

## Task 5: Manual smoke verification

This is verification, not code. Reviewer should walk through this checklist before merging.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Smoke check on /[slug]/results in three roles**

Visit `/[a-real-league-slug]/results` and verify the FAB shows in each of:

1. Admin signed in (mobile width — viewport <1024px)
2. Member signed in (mobile width)
3. Logged-out public visitor (mobile width)

For each role, click the FAB and verify the bottom sheet opens with the four widgets (Your Stats, Quarterly Table, In Form, Team A/B). Public visitors won't see Your Stats (the widget is empty for unlinked viewers — that's expected, not a regression).

At desktop width (≥1024px) verify the sticky sidebar shows in the same three roles.

- [ ] **Step 3: Repeat the smoke check on /players, /lineup-lab, /honours**

Same three-role matrix on each of the other three pages.

- [ ] **Step 4: Verify Settings → Features no longer lists Stats Sidebar**

Sign in as the admin of any league, navigate to Settings → Features. The `Stats Sidebar` row should be gone. The other rows (Player Stats, etc.) should be unchanged.

- [ ] **Step 5: Verify the experiments page (developer-only) no longer lists Stats Sidebar**

Sign in as a developer profile, navigate to `/experiments`. The `Stats Sidebar` toggle should be absent.

- [ ] **Step 6: Run the migration in Supabase SQL Editor**

Open the Supabase SQL Editor and execute the contents of `supabase/migrations/20260430000001_remove_stats_sidebar_flag.sql`. Verify both `DELETE` statements report rows removed (count depends on number of leagues; `feature_experiments` will report 1).
