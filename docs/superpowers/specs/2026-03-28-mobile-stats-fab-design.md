# Mobile Stats FAB — Design Spec

**Date:** 2026-03-28
**Status:** Approved

---

## Problem

The stats sidebar (`StatsSidebar`) is hidden on mobile via `hidden lg:block`. The three widgets — Most In Form, Quarterly Table, Head to Head — are completely inaccessible below the `lg` breakpoint.

---

## Solution

A floating pill button (FAB) on mobile that opens a bottom sheet containing the existing `StatsSidebar` widgets. On-demand, non-intrusive, zero new data fetching.

---

## Architecture

### New component: `components/MobileStatsFAB.tsx`

A `'use client'` component. All widget rendering stays server-side — this component only owns the open/close UI shell.

**Props:**
```ts
interface MobileStatsFABProps {
  children: React.ReactNode
}
```

**Renders three things:**

1. **Pill button**
   - `fixed bottom-6 right-4 lg:hidden`
   - Background: sky-500 (`bg-sky-500`)
   - Contents: `Activity` icon from `lucide-react` (16px, white) + "Stats" label
   - `shadow-lg` drop shadow with sky glow
   - Tap: toggles `open` state

2. **Backdrop**
   - `fixed inset-0 bg-slate-900/80 z-40`
   - Visible when `open === true`
   - Tap: closes sheet
   - Transition: `opacity-0` → `opacity-100`, `duration-300`

3. **Bottom sheet**
   - `fixed inset-x-0 bottom-0 z-50`
   - Background: `bg-slate-800`, top border: `border-t border-slate-700`
   - Corners: `rounded-t-2xl`
   - Height: `max-h-[85vh]`
   - Transition: `translate-y-full` → `translate-y-0`, `duration-300 ease-in-out`
   - Internal layout:
     - Drag handle: `w-10 h-1 bg-slate-600 rounded-full mx-auto mt-3 mb-4`
     - Header row: "Live Stats" title (left, `text-sm font-semibold text-slate-100`) + X close button (right, `text-slate-400`)
     - Scrollable body: `overflow-y-auto px-4 pb-6 pt-2` containing `{children}`

**State:**
```ts
const [open, setOpen] = useState(false)
```

**Body scroll lock:**
```ts
useEffect(() => {
  document.body.style.overflow = open ? 'hidden' : ''
  return () => { document.body.style.overflow = '' }
}, [open])
```

**Close triggers:** X button, backdrop tap, pill button tap when open.

---

### Pages updated

The same pattern is applied to all three pages. The existing `hidden lg:block` desktop sidebar is untouched.

**`app/[leagueId]/results/page.tsx`**
- Applied in both the public render and the member/admin render
- Guarded by the existing `canSeeStatsSidebar` boolean
- Passes `leagueDayIndex` (same as the desktop sidebar)

**`app/[leagueId]/players/page.tsx`**
- Added outside the main content column
- Uses `playedWeeks` for the `weeks` prop (same as the desktop sidebar)
- No separate feature flag guard needed — page already returns early if player_stats is disabled; StatsSidebar's own `isFeatureEnabled` check handles the rest

**`app/[leagueId]/lineup-lab/page.tsx`**
- Same pattern, no guard needed beyond StatsSidebar's internal check

**Usage pattern (same in all three pages):**
```tsx
<MobileStatsFAB>
  <StatsSidebar
    players={players}
    weeks={weeks}
    features={features}
    role={userRole}
    leagueDayIndex={leagueDayIndex}
  />
</MobileStatsFAB>
```

---

## Behaviour

| Trigger | Effect |
|---|---|
| Tap pill button (closed) | Opens sheet, shows backdrop |
| Tap pill button (open) | Closes sheet |
| Tap backdrop | Closes sheet |
| Tap X button | Closes sheet |
| Sheet open | `overflow: hidden` on body — page scroll locked |
| Sheet closed | Body scroll restored |

---

## Constraints

- FAB is `lg:hidden` — never appears on desktop, no double-sidebar risk
- No new data fetching, API routes, DB queries, or migrations
- No new feature flags — `stats_sidebar` flag already gates everything
- No new dependencies — uses `lucide-react` (already installed) and Tailwind only
- Desktop behaviour is completely unchanged

---

## Files changed

| File | Change |
|---|---|
| `components/MobileStatsFAB.tsx` | **New** — client component |
| `app/[leagueId]/results/page.tsx` | Add `<MobileStatsFAB>` in public + member/admin renders |
| `app/[leagueId]/players/page.tsx` | Add `<MobileStatsFAB>` |
| `app/[leagueId]/lineup-lab/page.tsx` | Add `<MobileStatsFAB>` |
