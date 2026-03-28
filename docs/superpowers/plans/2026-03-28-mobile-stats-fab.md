# Mobile Stats FAB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating pill button on mobile that opens a bottom sheet containing the existing stats sidebar widgets (Most In Form, Quarterly Table, Head to Head).

**Architecture:** A new `MobileStatsFAB` client component owns open/close state and renders the FAB pill + backdrop + bottom sheet shell. The three pages that already use `StatsSidebar` pass it as children — widget rendering stays server-side, only the drawer shell is a client component.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, lucide-react (`Activity`, `X` icons), React `useState`/`useEffect`.

---

## File map

| File | Action |
|---|---|
| `components/MobileStatsFAB.tsx` | **Create** — client component: FAB pill, backdrop, bottom sheet |
| `app/[leagueId]/results/page.tsx` | **Modify** — add `<MobileStatsFAB>` in public + member/admin renders |
| `app/[leagueId]/players/page.tsx` | **Modify** — derive `canSeeStatsSidebar`, add `<MobileStatsFAB>` |
| `app/[leagueId]/lineup-lab/page.tsx` | **Modify** — add `isFeatureEnabled` import, derive `canSeeStatsSidebar`, add `<MobileStatsFAB>` |

---

## Task 1: Create `MobileStatsFAB` component

**Files:**
- Create: `components/MobileStatsFAB.tsx`

This component has no testable business logic — it's a pure UI shell. Skip unit tests. Verify visually at the end of the plan.

- [ ] **Step 1: Create the file**

```tsx
// components/MobileStatsFAB.tsx
'use client'

import { useState, useEffect } from 'react'
import { Activity, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileStatsFABProps {
  children: React.ReactNode
}

export function MobileStatsFAB({ children }: MobileStatsFABProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  return (
    <>
      {/* Pill FAB */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-4 lg:hidden z-30 flex items-center gap-2 bg-sky-500 text-white rounded-full px-4 py-2.5 shadow-lg shadow-sky-500/30 text-sm font-semibold"
        aria-label="View live stats"
      >
        <Activity size={16} />
        Stats
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 bg-slate-900/80 z-40 lg:hidden transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
      />

      {/* Bottom sheet */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 lg:hidden bg-slate-800 border-t border-slate-700 rounded-t-2xl max-h-[85vh] flex flex-col transition-transform duration-300 ease-in-out',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-slate-600 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 flex-shrink-0">
          <span className="text-sm font-semibold text-slate-100">Live Stats</span>
          <button
            onClick={() => setOpen(false)}
            className="text-slate-400 hover:text-slate-200 p-1"
            aria-label="Close stats"
          >
            <X size={18} />
          </button>
        </div>
        {/* Scrollable content */}
        <div className="overflow-y-auto px-4 pb-6 pt-2">
          {children}
        </div>
      </div>
    </>
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
git add components/MobileStatsFAB.tsx
git commit -m "feat: add MobileStatsFAB client component"
```

---

## Task 2: Update `results/page.tsx`

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

The page has two render paths: public tier (lines ~124–172) and member/admin tier (lines ~175–231). Both need the FAB added. `canSeeStatsSidebar` is already computed at line 43.

- [ ] **Step 1: Add the import**

Add `MobileStatsFAB` to the imports near the top of the file (after the `StatsSidebar` import):

```tsx
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
```

- [ ] **Step 2: Add the FAB to the public render**

In the public tier return block, add `<MobileStatsFAB>` as the last child of `<main>`, after the `flex` container div:

```tsx
// ── Public tier ──
if (tier === 'public') {
  return (
    <main className="px-4 sm:px-6 py-4">
      <BfcacheRefresh />
      <div className="flex justify-center gap-6 items-start">
        <div className="w-full max-w-xl shrink-0 space-y-8">
          <LeaguePageHeader
            leagueName={game!.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="results"
            isAdmin={isAdmin}
            details={details}
          />
          {canSeeMatchEntry && (
            <PublicMatchEntrySection
              gameId={leagueId}
              weeks={weeks}
              initialScheduledWeek={nextWeek}
            />
          )}
          {canSeeMatchHistory && (
            <section>
              <PublicMatchList weeks={weeks} />
            </section>
          )}
          {!isAuthenticated && (
            <p className="text-xs text-slate-600 text-center pb-4">
              Sign in for full access to your league.
            </p>
          )}
        </div>
        {canSeeStatsSidebar && (
          <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
            <StatsSidebar
              players={players}
              weeks={weeks}
              features={features}
              role={userRole}
              leagueDayIndex={leagueDayIndex}
            />
          </div>
        )}
      </div>
      {canSeeStatsSidebar && (
        <MobileStatsFAB>
          <StatsSidebar
            players={players}
            weeks={weeks}
            features={features}
            role={userRole}
            leagueDayIndex={leagueDayIndex}
          />
        </MobileStatsFAB>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Add the FAB to the member/admin render**

In the member/admin return block, add `<MobileStatsFAB>` as the last child of `<main>`, after the `flex` container div. Note: the desktop sidebar here has no explicit `canSeeStatsSidebar` guard (StatsSidebar returns null internally) — add one to the mobile FAB so the pill never renders with an empty sheet:

```tsx
// ── Member / Admin tier ──
return (
  <main className="px-4 sm:px-6 py-4">
    <BfcacheRefresh />
    <div className="flex justify-center gap-6 items-start">
      <div className="w-full max-w-xl shrink-0">
        <LeaguePageHeader
          leagueName={game!.name}
          leagueId={leagueId}
          playedCount={playedCount}
          totalWeeks={totalWeeks}
          pct={pct}
          currentTab="results"
          isAdmin={isAdmin}
          details={details}
        />
        <div className="flex flex-col gap-3">
          {canSeeMatchEntry ? (
            <ResultsSection
              gameId={leagueId}
              weeks={weeks}
              goalkeepers={goalkeepers}
              initialScheduledWeek={nextWeek}
              canAutoPick={true}
              allPlayers={players}
              showMatchHistory={canSeeMatchHistory}
              leagueDayIndex={leagueDayIndex}
              isAdmin={isAdmin}
            />
          ) : canSeeMatchHistory ? (
            <WeekList
              weeks={weeks}
              goalkeepers={goalkeepers}
              isAdmin={isAdmin}
              gameId={leagueId}
              allPlayers={players}
              onResultSaved={() => {}}
            />
          ) : (
            <div className="py-16 text-center">
              <p className="text-sm text-slate-500">Nothing to show here yet.</p>
            </div>
          )}
        </div>
      </div>
      <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
        <StatsSidebar
          players={players}
          weeks={weeks}
          features={features}
          role={userRole}
          leagueDayIndex={leagueDayIndex}
        />
      </div>
    </div>
    {canSeeStatsSidebar && (
      <MobileStatsFAB>
        <StatsSidebar
          players={players}
          weeks={weeks}
          features={features}
          role={userRole}
          leagueDayIndex={leagueDayIndex}
        />
      </MobileStatsFAB>
    )}
  </main>
)
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\[leagueId\]/results/page.tsx
git commit -m "feat: add mobile stats FAB to results page"
```

---

## Task 3: Update `players/page.tsx`

**Files:**
- Modify: `app/[leagueId]/players/page.tsx`

This page doesn't currently derive `canSeeStatsSidebar` — add it alongside the other feature checks, then add the FAB.

- [ ] **Step 1: Add the import**

Add `MobileStatsFAB` to the imports (after the `StatsSidebar` import):

```tsx
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
```

- [ ] **Step 2: Derive `canSeeStatsSidebar`**

After the existing `const isAdmin = tier === 'admin'` line, add:

```tsx
const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)
```

(`isFeatureEnabled` and `resolveVisibilityTier` are already imported in this file.)

- [ ] **Step 3: Add the FAB**

After the closing `</main>` tag... actually the page returns a `<main>`. Add the FAB as the last child of `<main>`, after the `flex` container. The full return becomes:

```tsx
return (
  <main className="px-4 sm:px-6 pt-4 pb-8">
    <div className="flex justify-center gap-6 items-start">
      <div className="w-full max-w-xl shrink-0">
        <LeaguePageHeader
          leagueName={game!.name}
          leagueId={leagueId}
          playedCount={playedCount}
          totalWeeks={totalWeeks}
          pct={pct}
          currentTab="players"
          isAdmin={isAdmin}
          details={details}
        />
        <PublicPlayerList
          players={players}
          visibleStats={visibleStats}
          showMentality={showMentality}
        />
      </div>
      <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
        <StatsSidebar
          players={players}
          weeks={playedWeeks}
          features={features}
          role={userRole}
        />
      </div>
    </div>
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
  </main>
)
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\[leagueId\]/players/page.tsx
git commit -m "feat: add mobile stats FAB to players page"
```

---

## Task 4: Update `lineup-lab/page.tsx`

**Files:**
- Modify: `app/[leagueId]/lineup-lab/page.tsx`

This page doesn't currently import `isFeatureEnabled` — add it, then derive `canSeeStatsSidebar` and add the FAB.

- [ ] **Step 1: Add imports**

Add two imports. `isFeatureEnabled` from features (not currently imported) and `MobileStatsFAB`:

```tsx
import { isFeatureEnabled } from '@/lib/features'
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
```

- [ ] **Step 2: Derive `canSeeStatsSidebar`**

After `const isAdmin = tier === 'admin'`, add:

```tsx
const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)
```

- [ ] **Step 3: Add the FAB**

Add `<MobileStatsFAB>` as the last child of `<main>`. The full return becomes:

```tsx
return (
  <main className="px-4 sm:px-6 pt-4 pb-8">
    <div className="flex justify-center gap-6 items-start">
      <div className="w-full max-w-xl shrink-0">
        <LeaguePageHeader
          leagueName={game!.name}
          leagueId={leagueId}
          playedCount={playedCount}
          totalWeeks={totalWeeks}
          pct={pct}
          currentTab="lineup-lab"
          isAdmin={isAdmin}
          details={details}
        />
        {isAuthenticated
          ? <LineupLab allPlayers={players} />
          : <LineupLabLoginPrompt leagueId={leagueId} />
        }
      </div>
      <div className="hidden lg:block w-72 shrink-0 sticky top-[72px]">
        <StatsSidebar
          players={players}
          weeks={playedWeeks}
          features={features}
          role={userRole}
        />
      </div>
    </div>
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
  </main>
)
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/\[leagueId\]/lineup-lab/page.tsx
git commit -m "feat: add mobile stats FAB to lineup-lab page"
```

---

## Task 5: Manual verification

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify mobile FAB appears**

Open a league results, players, or lineup-lab page. Resize the browser to below `1024px` (or use DevTools device emulation). Confirm:
- Sky-500 pill with `Activity` icon and "Stats" label is visible at bottom-right
- Pill is absent at `lg` breakpoint and above

- [ ] **Step 3: Verify sheet opens and closes**

Tap the pill. Confirm:
- Sheet slides up from the bottom with three widgets (Most In Form, Quarterly Table, Head to Head)
- Backdrop darkens the page behind the sheet
- Tapping the backdrop closes the sheet
- Tapping X closes the sheet
- Tapping the pill again closes the sheet
- Page scroll is locked while sheet is open and restored on close

- [ ] **Step 4: Verify feature flag gate**

In Settings → Features, toggle `stats_sidebar` off for members. Visit the results page as a member. Confirm the FAB pill does not appear.

- [ ] **Step 5: Verify desktop is unchanged**

At `lg` breakpoint and above, confirm:
- FAB pill is not visible
- Desktop sidebar renders as before
