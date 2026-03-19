# League Page Header Redesign

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Results page, Players page, Navbar

---

## Goal

Move league context (name, week progress), tab navigation (Results / Players), and the league settings shortcut out of the sticky header bar and into the scrollable content area of the Results and Players pages. Simplify the navbar so it only carries global controls (logo, user dropdown) on league pages.

---

## New Component: `LeaguePageHeader`

**File:** `components/LeaguePageHeader.tsx`
**Type:** Server component (no `'use client'`). Uses Next.js `<Link>` and `<Button asChild>` from `@/components/ui/button`. Both work correctly inside a server component — `Button` with `asChild` uses Radix Slot internally (a client component), but Next.js renders client components inside server components without issue.

### Props

```ts
interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  playedCount: number
  totalWeeks: number
  pct: number
  currentTab: 'results' | 'players'
  isAdmin: boolean
}
```

### Layout

```
┌─────────────────────────────────────────────┐
│  The Boot Room                          [⚙]  │  ← isAdmin only
│  14 of 20 weeks (70% complete)               │
├─────────────────────────────────────────────┤
│  Results   Players                           │  ← tab nav
└─────────────────────────────────────────────┘
```

- **Top row:** League name as `<h1>` (`text-xl font-semibold text-slate-100`) left-aligned. Settings cog right-aligned — a `<Button asChild variant="ghost" size="icon">` wrapping a `<Link href={`/${leagueId}/settings`}>` containing `<Settings className="size-4" />` from lucide-react. Only rendered when `isAdmin` is true.
- **Below title:** Week progress as `<p>` (`text-sm text-slate-500`) — `"{playedCount} of {totalWeeks} weeks ({pct}% complete)"`.
- **Tab nav:** A `<nav>` with two `<Link>` elements:
  - Results → `/${leagueId}/results`
  - Players → `/${leagueId}/players`
  - Active tab style: `border-b-2 border-slate-100 text-slate-100 font-medium`
  - Inactive tab style: `text-slate-400 hover:text-slate-200`
  - The nav element has `border-b border-slate-700` to draw a separator line under both tabs.
  - Top padding: `pt-4`.
- Use `cn()` from `@/lib/utils` for conditional class merging.

---

## Changes to `app/[leagueId]/results/page.tsx`

### Early-return paths — leave untouched

The `LeaguePrivateState` early return (when `tier === 'public'` and nothing is visible) renders before the context bar and has no context bar of its own. Do not add `<LeaguePageHeader>` to it.

### Public-tier render path

Currently the public-tier render returns a fragment (`<>…</>`) containing the context bar `<div>` (conditionally rendered inside `{canSeeMatchHistory && (…)}`) and a `<main>`.

1. **Remove** the entire `{canSeeMatchHistory && (<div className="bg-slate-800/50 border-b border-slate-700">…</div>)}` block — both the conditional wrapper and the inner div.
2. **Add** `<LeaguePageHeader>` as the first child inside `<main>`, before any other content. Pass `currentTab="results"` and `isAdmin` (already computed as `const isAdmin = tier === 'admin'` earlier in the file).
3. **Remove the fragment wrapper**: since the context bar sibling is gone, the return can simplify from `<>…</>` to just `<main>…</main>`.

`<LeaguePageHeader>` renders unconditionally in this path — it is always appropriate to show the league title and tabs once the public page is reachable (i.e., after the LeaguePrivateState early-return gate has been passed).

### Member/Admin-tier render path

Currently also returns a fragment with the context bar `<div>` and a `<main>`.

1. **Remove** the context bar `<div className="bg-slate-800/50 border-b border-slate-700">…</div>`.
2. **Add** `<LeaguePageHeader>` as the first child inside `<main>`. Pass `currentTab="results"` and `isAdmin`.
3. **Remove the fragment wrapper** — simplify the return to just `<main>…</main>`.

Pass `playedCount`, `totalWeeks`, `pct`, `game.name`, and `leagueId` — all already in scope.

---

## Changes to `app/[leagueId]/players/page.tsx`

### Early-return path — leave untouched

The `LeaguePrivateState` return (`return <LeaguePrivateState leagueName={game.name} />` — a single line, no `<main>`) fires when `player_stats` is not enabled for the user's tier. Note: `isFeatureEnabled` already handles the admin tier — admins are granted access and never hit this early return. Leave this path as-is.

### Main render path

Currently returns a fragment with the context bar `<div>` and a `<main>`.

1. **Remove** the context bar `<div className="bg-slate-800/50 border-b border-slate-700">…</div>`.
2. **Add** `const isAdmin = tier === 'admin'` immediately after `const tier = resolveVisibilityTier(userRole)` (this variable does not currently exist in this file).
3. **Add** `<LeaguePageHeader>` as the first child inside `<main>`, before `<PublicPlayerList>`. Pass `currentTab="players"`, `isAdmin`, `game.name`, `leagueId`, `playedCount`, `totalWeeks`, `pct`.
4. **Remove the fragment wrapper** — simplify the return to just `<main>…</main>`.

---

## Changes to `components/ui/navbar.tsx`

### `resolvedMenu` — replace the IIFE with a simple expression

The current implementation (lines ~179–190) is an IIFE that builds a `MenuItem[]` array containing Results, Players, and optionally Settings when `leagueId` is set. Replace the entire IIFE with:

```ts
const resolvedMenu: MenuItem[] = menu.length > 0 ? menu : []
```

All league-specific items (Results, Players, Settings) are removed from the menu — they live in `LeaguePageHeader` now. The `menu` prop override is preserved for future flexibility.

**Consequence for desktop centre nav:** The centre column already filters out `'Settings'` items (`.filter(item => item.title !== 'Settings')`). With `resolvedMenu` always returning `[]` on league pages (since `menu` prop is never passed), the centre nav renders nothing on league pages — which is the desired outcome. The `.filter` call becomes a harmless no-op and can be left or removed (leave it to avoid unrelated churn).

**Consequence for mobile hamburger sheet:** The sheet iterates `resolvedMenu`. With `[]`, the sheet no longer lists Results, Players, or Settings on league pages. Mobile users access tabs by scrolling to the `LeaguePageHeader` at the top of the scrollable content.

### Desktop right-side — hide Settings cog on league pages

Wrap the Settings cog button in a `!isLeagueDetail` guard:

```tsx
{showNav && user && (
  <div className="flex items-center gap-0.5">
    {/* FlaskConical — unchanged */}
    {!isLeagueDetail && (
      <Button asChild variant="ghost" size="sm">
        <Link href={settingsUrl}>
          <Settings className="size-4" />
        </Link>
      </Button>
    )}
    {/* DropdownMenu — unchanged */}
  </div>
)}
```

**Dead code cleanup:** After this change, `settingsUrl` (currently `leagueId ? \`/${leagueId}/settings\` : '/settings'`) is only used in the cog, which is now hidden on league pages. On non-league pages `leagueId` is falsy so `settingsUrl` correctly resolves to `'/settings'`. The variable can remain as-is — no cleanup needed.

**Note:** Authenticated non-admin members on league pages lose the one-click path to user account settings (`/settings`) that the header cog currently provides. This is an accepted trade-off — user account settings remain accessible by navigating away from the league page. Improving this (e.g., adding a settings link to the user dropdown) is out of scope for this change.

### Imports cleanup

After the changes above, `Settings` from lucide-react is only referenced in:
- `renderMobileMenuItem` for the mobile sheet's Settings link (which renders when `item.title === 'Settings'`)
- The navbar right-side cog (now hidden on league pages)

Since `resolvedMenu` no longer produces a Settings item, `renderMobileMenuItem`'s Settings branch (`if (item.title === 'Settings')`) becomes unreachable on league pages — but it is harmless to leave. The `Settings` import remains valid as it is still referenced in the mobile rendering function. No import changes needed.

---

## What Does Not Change

- User avatar / dropdown menu in the navbar right column — unchanged.
- FlaskConical (developer experiments) button — unchanged.
- `LeaguePrivateState` fallback rendering in both pages — unchanged.
- Feature flag logic, auth checks, data fetching — entirely unchanged.
- All other pages (league list, settings, invite, add-game, etc.) — unaffected.

---

## File Summary

| File | Change |
|------|--------|
| `components/LeaguePageHeader.tsx` | **New** — page header with league title, week info, admin cog, tab nav |
| `app/[leagueId]/results/page.tsx` | Remove context bar + fragment wrapper from both render paths; add `<LeaguePageHeader currentTab="results">` inside `<main>` |
| `app/[leagueId]/players/page.tsx` | Remove context bar + fragment wrapper; add `isAdmin`; add `<LeaguePageHeader currentTab="players">` inside `<main>` |
| `components/ui/navbar.tsx` | Replace `resolvedMenu` IIFE with simple expression; hide Settings cog on league pages |
