# Stats Sidebar Panel — Design Spec

**Date:** 2026-03-22
**Branch:** awmloveland/stats-sidebar-panel

---

## Overview

Add a sticky stats sidebar to the right of the main content column on the Results, Players, and Lineup Lab tabs. The sidebar contains three "fun stats" widgets: Most In Form, Quarterly League Table, and Team A vs Team B. It is desktop-only (hidden on screens smaller than `lg`). Each widget is independently gated behind an admin-controlled feature flag.

---

## Layout

### Current structure (all three tab pages)
```
<main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
  {/* content */}
</main>
```

### New structure
```
<main className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
  <div className="flex gap-6 items-start">
    <div className="flex-1 min-w-0 max-w-2xl">
      {/* existing content — unchanged */}
    </div>
    <div className="hidden lg:block w-72 shrink-0 sticky top-4 space-y-4">
      <StatsSidebar players={players} weeks={weeks} features={features} role={role} />
    </div>
  </div>
</main>
```

The content column is capped at `max-w-2xl` exactly as before. The outer container widens to `max-w-5xl` only to accommodate the sidebar. On `md` and below the sidebar is `hidden` and the content column fills the full width as today.

---

## Feature Flags

Three new `FeatureKey` values added to `lib/types.ts`:

| Key | Label | Default |
|---|---|---|
| `stats_in_form` | Most In Form | `enabled: false, public_enabled: false` |
| `stats_quarterly_table` | Quarterly Table | `enabled: false, public_enabled: false` |
| `stats_team_ab` | Team A vs Team B | `enabled: false, public_enabled: false` |

All three start admin-only. Admins see all widgets immediately. Promoted independently via Settings → Features.

`FeaturePanel.tsx` gains a **Stats** section below the existing feature list with one row per widget.

A migration seeds the three rows into `league_features` for all existing leagues.

---

## Component: `StatsSidebar`

**File:** `components/StatsSidebar.tsx`

**Props:**
```ts
interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  features: LeagueFeature[]
  role: GameRole | null
}
```

Renders only the widgets whose feature flag passes `isFeatureEnabled(features, key, resolveVisibilityTier(role))`. If no widgets are enabled, renders nothing (empty fragment — no empty shell visible).

Each widget is a self-contained section within the file (not separate component files).

---

## Widget 1 — Most In Form

### Purpose
Show the 5 players in the best recent form, ranked by average points per game over their last 5 games.

### Data
- Source: `players` prop
- Requires: `recentForm: string` (e.g. `'WWDLW'` or `'--WLW'`), `played: number`

### Logic
1. Filter to players where `played >= 5`
2. For each qualifying player, parse `recentForm`: count only non-`'-'` characters; compute points (`W=3, D=1, L=0`) over those games; PPG = points / games_in_form_string (i.e. always 5 if fully played, fewer if `'-'` placeholders exist — use actual game count, not 5)
3. Sort descending by PPG; take top 5

### Display
- Widget title: **Most In Form**
- Per player row: name · `FormDots` component (reused from existing) · `X.X pts/g`
- If 0 qualifying players: muted "Not enough data yet" empty state

---

## Widget 2 — Quarterly League Table

### Purpose
Show the top 5 players by points earned within the current calendar quarter. Resets automatically each quarter. Shows last quarter's champion.

### Quarters
Determined client-side from `new Date()`:

| Quarter | Months |
|---|---|
| Q1 | Jan – Mar |
| Q2 | Apr – Jun |
| Q3 | Jul – Sep |
| Q4 | Oct – Dec |

### Data
- Source: `weeks` prop
- Filter: `status === 'played'` and `week.date` falls within the current quarter
- `week.date` is stored as `'DD MMM YYYY'` — parse with `new Date(week.date)`

### Logic
For each qualifying week, iterate over `teamA` and `teamB` player name arrays. Using `winner` (`'teamA' | 'teamB' | 'draw' | null`), accumulate per-player W/D/L. Points = W×3 + D×1 + L×0. Sort descending by points; take top 5.

For **last quarter's champion**: repeat the same computation over the previous quarter's weeks. The player with the most points is the champion. If tied on points, the player with more wins takes it; if still tied, the first alphabetically.

### Display
- Widget title: **Q[N] [Year] Table** (e.g. "Q1 2026 Table")
- Table columns: rank · name · P (games played) · Pts
- W/D/L columns rendered if the sidebar width allows (they fit at 288px with compact text)
- Last quarter's champion: small callout below the table — "Q[N-1] Champion · [Name]"
- If 0 games in current quarter: muted "Quarter just started" empty state
- If no previous quarter data: omit the champion callout entirely

---

## Widget 3 — Team A vs Team B

### Purpose
Show the all-time split of wins between the two sides and the current winning streak.

### Data
- Source: `weeks` prop, filter `status === 'played'`

### Logic
Iterate over all played weeks:
- Accumulate `teamAWins`, `draws`, `teamBWins`
- Track current streak: walk weeks from newest to oldest; streak ends when the outcome changes

**Streak examples:**
- Last 3 results were all Team A wins → "Team A · 3 in a row"
- Last result was a draw → "Draw"
- Results alternate → "No current streak" (or omit streak line)

### Display
- Widget title: **Team A vs Team B**
- Three counts: Team A wins (blue `text-blue-300`) · Draws (slate) · Team B wins (violet `text-violet-300`)
- Proportional split bar: blue segment | slate segment | violet segment, `h-3 rounded-full`
- Streak line below bar: small dot + text, e.g. `● Team A · 3 in a row`
- If 0 played games: muted "No results yet" empty state

---

## Styling

All styling follows existing conventions (Tailwind utility classes, `cn()` for conditionals, dark-mode-first).

Widget card shell:
```
rounded-lg border border-slate-700 bg-slate-800
```

Widget header:
```
px-3 py-2 border-b border-slate-700/60 text-xs font-semibold text-slate-400 uppercase tracking-wide
```

Widget body:
```
px-3 py-3
```

Empty state text:
```
text-sm text-slate-500 text-center py-4
```

---

## Files Changed

| File | Change |
|---|---|
| `lib/types.ts` | Add `stats_in_form`, `stats_quarterly_table`, `stats_team_ab` to `FeatureKey` union |
| `app/api/league/[id]/features/route.ts` | Add 3 entries to `DEFAULT_FEATURES` |
| `components/FeaturePanel.tsx` | Add Stats section with one toggle row per widget |
| `components/StatsSidebar.tsx` | New component — all three widgets |
| `app/app/league/[id]/results/page.tsx` | Wrap content in new two-column layout, render `StatsSidebar` |
| `app/app/league/[id]/players/page.tsx` | Same layout wrapper + `StatsSidebar` |
| `app/app/league/[id]/lineup-lab/page.tsx` | Same layout wrapper + `StatsSidebar` |
| `supabase/migrations/YYYYMMDDXXXXXX_seed_stats_features.sql` | Seed 3 new `league_features` rows for all existing leagues |

---

## Out of Scope

- No new API routes
- No new Supabase RPCs
- No per-widget config (no `FeatureConfig` for these widgets in this iteration)
- No cross-league aggregates
- No mobile layout for the sidebar
