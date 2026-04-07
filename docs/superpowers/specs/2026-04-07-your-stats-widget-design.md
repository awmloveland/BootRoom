# Your Stats Widget Design

**Date:** 2026-04-07
**Status:** Approved

## Overview

When a member has a linked player, a personal "Your Stats" widget appears at the top of the stats sidebar (desktop) and mobile stats sheet. It shows their all-time W/D/L record, win rate, and recent form in a compact card that blends visually with the existing sidebar widgets. Nothing renders if the user has no linked player.

---

## Data Layer

### `getMyClaimStatus` → `getMyClaimInfo`

Rename the existing fetcher in `lib/fetchers.ts`. Return type changes from `PlayerClaimStatus | 'none'` to:

```ts
{ status: PlayerClaimStatus | 'none', playerName: string | null }
```

The Supabase query already reads `player_claims` — extend the select to also return `COALESCE(admin_override_name, player_name) AS player_name`. No additional DB round-trip.

---

## Page Changes

Both `app/[leagueId]/results/page.tsx` and `app/[leagueId]/players/page.tsx` require the same change.

Currently `getMyClaimStatus` is only called when `tier === 'member'`. Widen the fetch to cover admins too (they can also have a linked player), guarding only against the public tier:

```ts
let linkedPlayerName: string | null = null
let showClaimBanner = false
if (tier !== 'public') {
  const { status, playerName } = await getMyClaimInfo(leagueId)
  linkedPlayerName = playerName
  if (tier === 'member') showClaimBanner = status === 'none'
}
```

Pass `linkedPlayerName` as a new prop to `StatsSidebar` (and the duplicate `StatsSidebar` inside `MobileStatsFAB`) on both pages.

---

## `StatsSidebar` Component

### New prop

```ts
interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  features: LeagueFeature[]
  role: GameRole | null
  leagueDayIndex?: number
  linkedPlayerName?: string | null   // new
}
```

### `YourStatsWidget`

New private widget function inside `StatsSidebar.tsx`. Receives a resolved `Player` (looked up by matching `linkedPlayerName` against `players[]` by name). Returns `null` if no match found.

**Visual spec** (matches approved mockup — Option B, sky outline badge):

- **Shell**: identical `WidgetShell`-style container as other widgets — `rounded-lg border border-slate-700 bg-transparent overflow-hidden`
- **Header**: `Your Stats` label in standard `text-slate-500 uppercase tracking-widest text-xs` + `All Time` badge: `text-sky-400 bg-sky-400/[0.08] border border-sky-400/25 rounded text-[8px] font-bold uppercase tracking-[0.08em] px-[5px] py-px`
- **Hero block** (name left, win rate right):
  - Player name: `text-[15px] font-bold text-slate-100 uppercase tracking-wide`
  - Record: `text-[11px] text-slate-600 font-medium mt-1` — formatted as `{won}W · {drew}D · {lost}L`
  - Win rate: `text-[32px] font-black text-sky-300 leading-none` with `%` at `text-[14px] font-bold text-sky-400`, label `text-[8px] uppercase tracking-widest text-sky-400 mt-0.5`
- **Divider**: `border-t border-slate-700/40 my-[10px]`
- **Bottom row** (form left, played right):
  - `<FormDots form={player.recentForm} />` — existing component, already reverses so most recent is rightmost
  - Played chip: `text-[10px] text-slate-600` — `{player.played} played` with played count in `text-slate-400 font-semibold`

### Render position

`YourStatsWidget` renders at the top of the `StatsSidebar` return, before `InFormWidget`. It is not gated behind any additional feature flag — it is implicitly gated by the parent `stats_sidebar` feature check already in place.

```tsx
return (
  <div className="space-y-3">
    <YourStatsWidget players={players} linkedPlayerName={linkedPlayerName} />
    <InFormWidget players={players} weeks={weeks} />
    <QuarterlyTableWidget weeks={weeks} leagueDayIndex={leagueDayIndex} />
    <TeamABWidget weeks={weeks} />
  </div>
)
```

---

## Out of Scope

- Quarterly ranking within the Your Stats widget (all-time only)
- Any changes to the mobile FAB trigger button or sheet chrome
- Showing the widget to public-tier visitors (they are never linked)
