# Stats Sidebar Redesign

**Date:** 2026-03-22
**Status:** Approved
**Scope:** Visual redesign of the three `StatsSidebar` widgets. Includes minor data changes to `lib/sidebar-stats.ts` only: short year format in labels, a new `gamesLeft` field on `QuarterlyTableResult`, and a `QUARTER_GAME_COUNT` constant. No changes to API routes, feature flags, types outside `sidebar-stats.ts`, or any other files.

---

## Overview

The three stats widgets (Most In Form, Quarterly Table, Team A vs Team B) currently use `bg-slate-800` card shells — the same background as match cards in the main content column. This flattens the page hierarchy and gives users no clear focal point. This redesign applies consistent visual improvements across all three widgets to create depth and hierarchy without changing any underlying data or feature flag logic.

---

## Shared Change: Widget Shell

**Current:** `bg-slate-800 border-slate-700` — same as match cards
**New:** `bg-transparent border-slate-700` — ghost card

The `WidgetShell` component's outer container changes from `bg-slate-800` to `bg-transparent`. Everything else (border radius, border colour, overflow) stays the same.

---

## Widget 1: Most In Form

### Shell title
No change — stays `"Most In Form"`. Rendered via `WidgetShell` as normal.

### Hero section (rank 1)
Replace the current flat row with a hero treatment for the top player. The hero section sits flat on the widget background (no inner card, no fill) and is separated from the ranked list below by `border-b border-slate-700/50 pb-[10px] mb-[10px]`. **This separator border is omitted when `entries.length < 2`** (hero only, nothing below it).

Layout (inside `WidgetShell`'s body):
- **Label:** `"The Gaffer's Pick"` — `text-[9px] font-bold uppercase tracking-wide text-sky-300 mb-1`
- **Name:** `text-[15px] font-bold text-slate-100 mb-2`
- **Bottom row:** `flex items-end justify-between`
  - Left: `<FormDots form={e.recentForm} />` (unchanged)
  - Right: PPG block — `text-[22px] font-extrabold text-sky-300 leading-none` with `text-[9px] uppercase tracking-wide text-sky-400 mt-0.5` label `"pts / game"` below it

### Ranked list (ranks 2–5)
Each row: `flex items-center gap-1.5`

- Rank number: `text-[11px] text-slate-600 w-[14px] text-right shrink-0`
- Player name: `text-[13px] text-slate-300 flex-1 truncate`
- Form string: `<FormDots>` (unchanged)
- PPG pill: `text-[10px] font-semibold px-[7px] py-px rounded-full bg-slate-700/40 text-slate-500 shrink-0`
  - Value is PPG number only (e.g. `"2.2"`) — no unit label

---

## Widget 2: Quarterly Table

### Shell structure
`QuarterlyTableWidget` **bypasses `WidgetShell`** and renders its own outer container directly. This avoids the inner padding wrapper (`px-3 py-3`) conflicting with the custom header layout and the full-width borders on the progress section. The outer shell is:

```tsx
<div className="rounded-lg border border-slate-700 overflow-hidden">
  {/* custom header */}
  {/* body with px-3 py-3 */}
</div>
```

When `entries.length === 0` the custom outer shell still renders with its header, and an `<EmptyState message="Quarter just started" />` is shown in the body. The progress section is **omitted** when `entries.length === 0` (since `maxPlayed` would be 0, producing a meaningless "16 left / 0% fill" bar). The champion banner is still shown when `lastChampion` is non-null.

### Custom header
```tsx
<div className="px-3 py-1.5 border-b border-slate-700/40 flex items-center gap-1">
  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex-1">
    {quarterLabel}  {/* e.g. "Q1 26" */}
  </span>
  <span className="text-[10px] font-semibold uppercase text-slate-700 w-[22px] text-center">P</span>
  <span className="text-[10px] font-semibold uppercase text-slate-500 w-[28px] text-right">Pts</span>
</div>
```

### Quarter label format
`computeQuarterlyTable` in `lib/sidebar-stats.ts` is updated to use a short year — `String(year).slice(-2)` (always two digits, e.g. `2026 → "26"`, `2006 → "06"`). The change is isolated to the two label string interpolations:
- `quarterLabel`: `Q${q} ${String(year).slice(-2)}`
- `lastQuarterLabel`: `Q${prevQ} ${String(prevYear).slice(-2)}`

No other uses of `year`/`prevYear` inside the function are changed.

### Table rows (all 5 players)
Columns: rank · name · P · Pts. W, D, L columns are dropped.

- **Row 1 (leader):** `flex items-center gap-1 px-1 py-[3px] rounded bg-sky-400/[0.06] -mx-1`
  - Rank: `text-[11px] font-bold text-sky-400 w-[14px] text-right shrink-0`
  - Name: `text-[13px] font-semibold text-slate-100 flex-1 truncate`
  - P: `text-[11px] text-slate-600 w-[22px] text-center shrink-0`
  - Pts: `text-[12px] font-bold text-sky-300 w-[28px] text-right shrink-0`
- **Rows 2–5:** same structure without the tint class
  - Rank: `text-slate-600`; Name: `text-slate-400`; Pts: `text-slate-300 font-bold`

### Quarter progress bar
Rendered in `px-3` body, separated by top and bottom borders.

```tsx
<div className="py-[7px] border-t border-b border-slate-700/40 my-2">
  <div className="flex justify-between items-baseline mb-[5px]">
    <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
      Quarter progress
    </span>
    <span className="text-[10px] text-slate-600">{gamesLeft} left</span>
  </div>
  <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
    <div className="h-full rounded-full bg-slate-600" style={{ width: `${fillPct}%` }} />
  </div>
</div>
```

**`gamesLeft` and `fillPct` calculation:** Add `export const QUARTER_GAME_COUNT = 16` at the top of `lib/sidebar-stats.ts` (exported so `QuarterlyTableWidget` can import it). This represents the number of weeks (game sessions) in a quarter, not per-player game counts. `gamesLeft: number` is added to `QuarterlyTableResult` — always a `number`, never null. Calculated in `computeQuarterlyTable` as `Math.max(0, QUARTER_GAME_COUNT - maxPlayed)` where `maxPlayed = Math.max(...entries.map(e => e.played), 0)`. Update the destructuring in `QuarterlyTableWidget` to include `gamesLeft`. `fillPct` is a **local variable computed inside `QuarterlyTableWidget`**, not added to `QuarterlyTableResult`: `const fillPct = Math.round(((QUARTER_GAME_COUNT - gamesLeft) / QUARTER_GAME_COUNT) * 100)`.

Note: using `maxPlayed` as a proxy for weeks elapsed is an acknowledged approximation — a player who missed weeks may cause a slight undercount. This is acceptable for a sidebar widget.

> If `gamesLeft <= 0` (quarter complete or overrun), the progress section is omitted.

### Champion banner
Rendered below the progress section inside `px-3` body padding.

```tsx
<div className="flex items-center justify-between bg-amber-400/[0.07] border border-amber-400/[0.14] rounded-md px-[10px] py-[6px]">
  <div>
    <div className="text-[9px] font-bold uppercase tracking-wide text-amber-600 mb-0.5">
      {lastQuarterLabel} Champion  {/* e.g. "Q4 25 Champion" */}
    </div>
    <div className="text-[13px] font-bold text-yellow-200">{lastChampion}</div>
  </div>
  <span className="text-lg leading-none">🏆</span>
</div>
```

Only rendered when `lastChampion` is non-null.

---

## Widget 3: Head to Head (Team A vs Team B)

### Shell title
Change from `"Team A vs Team B"` to `"Head to Head"`. Rendered via `WidgetShell` as normal.

### Win numbers + labels row
`flex justify-between items-baseline mb-[6px]`

- Left group: Team A label + wins
  - Label: `text-[9px] font-bold uppercase tracking-wide text-blue-500`
  - Wins: `text-[16px] font-extrabold text-blue-300 ml-[5px]`
- Centre: draws — `"{draws}D"` in `text-[11px] text-slate-700`
- Right group: Team B wins + label
  - Wins: `text-[16px] font-extrabold text-violet-300 mr-[5px]`
  - Label: `text-[9px] font-bold uppercase tracking-wide text-violet-700`

### Bar
The bar is taller (`h-3` vs current `h-1.5`), changes from `rounded-full` to `rounded-md`, and uses gradient fills instead of flat colours. Draws segment changes from `bg-slate-600` to `bg-slate-800`.

`flex gap-0.5 rounded-md overflow-hidden h-3 mb-[10px]`

- Team A segment: `bg-gradient-to-r from-blue-900 to-blue-500` with `style={{ flex: teamAWins }}`
- Draws segment: `bg-slate-800` with `style={{ flex: draws }}`
- Team B segment: `bg-gradient-to-r from-violet-700 to-violet-900` with `style={{ flex: teamBWins }}`
- Zero-value segments are omitted (unchanged from current)

### Streak line
`flex items-center gap-1.5 pt-2 border-t border-slate-700/40`

- Dot: `w-[7px] h-[7px] rounded-full shrink-0`
  - `bg-blue-500` for Team A streak
  - `bg-violet-500` for Team B streak
  - `bg-slate-500` for draw streak
- Team name span: `text-[12px] font-semibold` — this span always contains the team identifier
  - `text-blue-300` + `"Team A"` for Team A streak
  - `text-violet-300` + `"Team B"` for Team B streak
  - `text-slate-400` + `"Draw"` for draw streak (occupies the same span slot)
- Label: `text-[11px] text-slate-500` — `"on a {streakLength}-game streak"`
- Not rendered when `streakTeam` is null

---

## Files to Change

| File | Change |
|---|---|
| `components/StatsSidebar.tsx` | All visual changes — `WidgetShell` bg, `InFormWidget`, `QuarterlyTableWidget` (custom shell + custom header), `TeamABWidget` |
| `lib/sidebar-stats.ts` | Short year format in `quarterLabel` / `lastQuarterLabel`; add `gamesLeft` to `QuarterlyTableResult`; add `QUARTER_GAME_COUNT` constant |

No new files. No changes to feature flags, API routes, data fetching, type definitions, or `FormDots.tsx`.

---

## Out of Scope

- Mobile layout (sidebar is already `hidden lg:block`)
- Changes to `lib/types.ts`
- Any changes to the main content column
- New feature flags
