# League Page Header Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move league title, week progress, settings cog, and tab navigation from the sticky header bar into the scrollable content area on Results and Players pages, and simplify the navbar accordingly.

**Architecture:** A new `LeaguePageHeader` server component encapsulates all per-league page chrome (title, progress, admin settings link, Results/Players tab nav). Both page files swap their inline context bar for this component and drop the outer fragment wrapper. The navbar loses its league-specific menu items and the per-league settings cog.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind CSS v3, lucide-react, `cn()` from `@/lib/utils`, `<Button asChild>` from `@/components/ui/button`

**Spec:** `docs/superpowers/specs/2026-03-19-league-page-header-redesign.md`

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `components/LeaguePageHeader.tsx` | New component — league title, week progress, admin settings cog, Results/Players tab nav |
| Modify | `app/[leagueId]/results/page.tsx` | Remove context bar + fragment wrappers from both render paths; add `<LeaguePageHeader currentTab="results">` |
| Modify | `app/[leagueId]/players/page.tsx` | Same — add `isAdmin`, remove context bar + fragment, add `<LeaguePageHeader currentTab="players">` |
| Modify | `components/ui/navbar.tsx` | Replace `resolvedMenu` IIFE with `[]`; hide Settings cog on league pages |

---

## Task 1: Create `LeaguePageHeader` component

**Files:**
- Create: `components/LeaguePageHeader.tsx`

- [ ] **Step 1: Create the component file**

```tsx
import Link from 'next/link'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface LeaguePageHeaderProps {
  leagueName: string
  leagueId: string
  playedCount: number
  totalWeeks: number
  pct: number
  currentTab: 'results' | 'players'
  isAdmin: boolean
}

export function LeaguePageHeader({
  leagueName,
  leagueId,
  playedCount,
  totalWeeks,
  pct,
  currentTab,
  isAdmin,
}: LeaguePageHeaderProps) {
  return (
    <div className="mb-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">{leagueName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {playedCount} of {totalWeeks} weeks ({pct}% complete)
          </p>
        </div>
        {isAdmin && (
          <Button asChild variant="ghost" size="icon">
            <Link href={`/${leagueId}/settings`}>
              <Settings className="size-4" />
            </Link>
          </Button>
        )}
      </div>
      <nav className="flex gap-6 border-b border-slate-700 pt-4">
        <Link
          href={`/${leagueId}/results`}
          className={cn(
            '-mb-px border-b-2 pb-2 text-sm font-medium',
            currentTab === 'results'
              ? 'border-slate-100 text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          Results
        </Link>
        <Link
          href={`/${leagueId}/players`}
          className={cn(
            '-mb-px border-b-2 pb-2 text-sm font-medium',
            currentTab === 'players'
              ? 'border-slate-100 text-slate-100'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          )}
        >
          Players
        </Link>
      </nav>
    </div>
  )
}
```

> **Note on `-mb-px`:** The tab links have `border-b-2` and `-mb-px`. This pulls each tab's bottom border down by 1px so it sits exactly on top of the nav's `border-b border-slate-700`, creating the standard underline-tab visual where the active tab's border appears to replace the separator.

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`
Expected: no errors related to `LeaguePageHeader.tsx`

- [ ] **Step 3: Commit**

```bash
git add components/LeaguePageHeader.tsx
git commit -m "feat: add LeaguePageHeader component with title, progress, tabs, and admin cog"
```

---

## Task 2: Update `results/page.tsx`

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

### Context — what's there now

There are two render paths that each return a fragment (`<>…</>`) containing:
1. A context bar `<div className="bg-slate-800/50 border-b border-slate-700">` with league name and week progress
2. A `<main>` with the actual page content

The `LeaguePrivateState` early return at the top of the public-tier block has no context bar and must not be touched.

### Public-tier path (the `if (tier === 'public') { return (…) }` block)

- [ ] **Step 4: Remove public-tier context bar and fragment; add LeaguePageHeader**

The current public-tier return looks like this (simplified):

```tsx
if (tier === 'public') {
  return (
    <>
      {canSeeMatchHistory && (
        <div className="bg-slate-800/50 border-b border-slate-700">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">{game.name}</span>
            <span className="text-xs text-slate-400">{playedCount} of {totalWeeks} weeks ({pct}% complete)</span>
          </div>
        </div>
      )}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4 space-y-8">
        {/* … */}
      </main>
    </>
  )
}
```

Replace it with:

```tsx
if (tier === 'public') {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4 space-y-8">
      <LeaguePageHeader
        leagueName={game.name}
        leagueId={leagueId}
        playedCount={playedCount}
        totalWeeks={totalWeeks}
        pct={pct}
        currentTab="results"
        isAdmin={isAdmin}
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
    </main>
  )
}
```

Add the import for `LeaguePageHeader` at the top of the file:

```tsx
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
```

### Member/Admin-tier path (the final `return` at the bottom of the file)

- [ ] **Step 5: Remove member/admin-tier context bar and fragment; add LeaguePageHeader**

The current member/admin return looks like this (simplified):

```tsx
return (
  <>
    <div className="bg-slate-800/50 border-b border-slate-700">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
        <span className="text-xs text-slate-400">{game.name}</span>
        <span className="text-xs text-slate-400">{playedCount} of {totalWeeks} weeks ({pct}% complete)</span>
      </div>
    </div>
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
      <div className="flex flex-col gap-3">
        {/* … */}
      </div>
    </main>
  </>
)
```

Replace it with:

```tsx
return (
  <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
    <LeaguePageHeader
      leagueName={game.name}
      leagueId={leagueId}
      playedCount={playedCount}
      totalWeeks={totalWeeks}
      pct={pct}
      currentTab="results"
      isAdmin={isAdmin}
    />
    <div className="flex flex-col gap-3">
      {canSeeMatchEntry && (
        <ResultsRefresher
          gameId={leagueId}
          weeks={weeks}
          initialScheduledWeek={nextWeek}
          canEdit={true}
          canAutoPick={canSeeTeamBuilder}
          allPlayers={players}
        />
      )}
      {canSeeMatchHistory && (
        <WeekList weeks={weeks} />
      )}
      {!canSeeMatchHistory && !canSeeMatchEntry && (
        <div className="py-16 text-center">
          <p className="text-sm text-slate-500">Nothing to show here yet.</p>
        </div>
      )}
    </div>
  </main>
)
```

- [ ] **Step 6: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add app/\[leagueId\]/results/page.tsx
git commit -m "feat: replace context bar with LeaguePageHeader on results page"
```

---

## Task 3: Update `players/page.tsx`

**Files:**
- Modify: `app/[leagueId]/players/page.tsx`

### Context — what's there now

The file has one main render path (after a `LeaguePrivateState` early return that must not be touched). It currently returns a fragment (`<>…</>`) with a context bar `<div>` and a `<main>` containing `<PublicPlayerList>`. The variable `isAdmin` does not exist in this file.

- [ ] **Step 8: Add `isAdmin`, remove context bar and fragment, add LeaguePageHeader**

1. After line `const tier = resolveVisibilityTier(userRole)`, add:

```ts
const isAdmin = tier === 'admin'
```

2. The current return at the bottom of the file looks like this:

```tsx
return (
  <>
    <div className="bg-slate-800/50 border-b border-slate-700">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between">
        <span className="text-xs text-slate-400">{game.name}</span>
        <span className="text-xs text-slate-400">{playedCount} of {totalWeeks} weeks ({pct}% complete)</span>
      </div>
    </div>
    <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-8">
      <PublicPlayerList
        players={players}
        visibleStats={visibleStats}
        showMentality={showMentality}
      />
    </main>
  </>
)
```

Replace it with:

```tsx
return (
  <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-8">
    <LeaguePageHeader
      leagueName={game.name}
      leagueId={leagueId}
      playedCount={playedCount}
      totalWeeks={totalWeeks}
      pct={pct}
      currentTab="players"
      isAdmin={isAdmin}
    />
    <PublicPlayerList
      players={players}
      visibleStats={visibleStats}
      showMentality={showMentality}
    />
  </main>
)
```

3. Add the import at the top of the file:

```tsx
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
```

- [ ] **Step 9: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add app/\[leagueId\]/players/page.tsx
git commit -m "feat: replace context bar with LeaguePageHeader on players page"
```

---

## Task 4: Simplify `navbar.tsx`

**Files:**
- Modify: `components/ui/navbar.tsx`

### Context — what's there now

The navbar builds `resolvedMenu` via an IIFE (lines ~179–190) that produces Results, Players, and optionally Settings items when `leagueId` is set. These are used in both the desktop centre nav and the mobile hamburger sheet.

The right-side controls always render a Settings cog button when `user` is logged in.

### Step A — Replace the `resolvedMenu` IIFE

- [ ] **Step 11: Replace the resolvedMenu IIFE**

Find this block (lines ~179–190):

```ts
const resolvedMenu = menu.length > 0 ? menu : (() => {
  const items: MenuItem[] = [
    ...(leagueId
      ? [
          { title: 'Results', url: `/${leagueId}/results` },
          { title: 'Players', url: `/${leagueId}/players` },
          ...(isLeagueAdmin ? [{ title: 'Settings', url: `/${leagueId}/settings` }] : []),
        ]
      : []),
  ]
  return items
})()
```

Replace it with:

```ts
const resolvedMenu: MenuItem[] = menu.length > 0 ? menu : []
```

### Step B — Hide Settings cog on league pages

- [ ] **Step 12: Wrap the Settings cog in `!isLeagueDetail`**

Find the Settings cog button in the desktop right-side controls block (inside `{showNav && user && (…)}`):

```tsx
<Button asChild variant="ghost" size="sm">
  <Link href={settingsUrl}>
    <Settings className="size-4" />
  </Link>
</Button>
```

Wrap it:

```tsx
{!isLeagueDetail && (
  <Button asChild variant="ghost" size="sm">
    <Link href={settingsUrl}>
      <Settings className="size-4" />
    </Link>
  </Button>
)}
```

- [ ] **Step 13: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 14: Commit**

```bash
git add components/ui/navbar.tsx
git commit -m "feat: remove league tabs and settings cog from navbar on league pages"
```

---

## Task 5: Visual verification

- [ ] **Step 15: Start the dev server**

Run: `npm run dev`

- [ ] **Step 16: Verify Results page**

Open a Results page (e.g. `http://localhost:3000/<league-id>/results`).

Check:
- The thin `bg-slate-800/50` context bar under the header is **gone**
- The header bar shows only the logo (left) and user avatar/dropdown (right) — no Results/Players tabs in the centre, no settings cog
- At the top of the scrollable content, the league name appears as a heading (`text-xl font-semibold`)
- Below it: `"{N} of 52 weeks ({pct}% complete)"` in muted text
- Admin-only: a settings cog icon button appears top-right of the heading block, links to `/<id>/settings`
- Below the heading block: a tab nav showing **Results** (active, underlined white) and **Players** (muted)
- Clicking Players navigates to the Players page

- [ ] **Step 17: Verify Players page**

Open the Players page (`/<league-id>/players`).

Check:
- Same header/content structure as Results
- Tab nav shows **Results** (muted) and **Players** (active, underlined white)
- `<PublicPlayerList>` renders below the tab nav as before

- [ ] **Step 18: Verify unauthenticated / public tier**

Open a Results or Players page while signed out (or in incognito).

Check:
- If the league has public features enabled: `LeaguePageHeader` renders with no settings cog (since `isAdmin` is false for public visitors)
- If the league has no public features enabled: `LeaguePrivateState` renders — no `LeaguePageHeader` (correct, this is the early-return path)

- [ ] **Step 19: Verify mobile**

Resize browser to mobile width and open the hamburger menu.

Check:
- Results, Players, and Settings are no longer listed in the mobile sheet on league pages
- Logout button still appears
- Developer experiments button still appears (if applicable)

- [ ] **Step 20: Final commit (if any fixes needed from verification)**

```bash
git add -p
git commit -m "fix: <describe any visual fixes>"
```
