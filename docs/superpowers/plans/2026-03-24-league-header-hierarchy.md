# League Header Visual Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the visual hierarchy of the league header by making the title clearly dominant and progressively muting all supporting content beneath it.

**Architecture:** Two component files are changed in sequence — `LeaguePageHeader.tsx` (title, progress, gear, tabs) then `LeagueInfoBar.tsx` (pills with Lucide icons, bio). No new files. No logic changes — purely visual/styling. TypeScript compilation is the verification gate since the project has no component render tests.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS v3, lucide-react, shadcn/ui conventions

**Spec:** `docs/superpowers/specs/2026-03-24-league-header-hierarchy-design.md`

---

## File Map

| File | Change type | What changes |
|---|---|---|
| `components/LeaguePageHeader.tsx` | Modify | Title size/weight, progress text size+format, gear icon colour+hover, tab size+icon size+colours |
| `components/LeagueInfoBar.tsx` | Modify | Replace `buildLeagueInfoFacts` with inline Lucide pill rendering; bio text size+colour |

---

## Task 1: Update `LeaguePageHeader.tsx`

**Files:**
- Modify: `components/LeaguePageHeader.tsx`

### What to change

Current state of the component (read before editing):

```
h1: text-2xl font-semibold text-slate-100
progress p: text-sm text-slate-500, format "(35% complete)"
gear Button: variant="ghost" size="icon"
  Settings icon: size-4 (no explicit colour)
tab links: text-base font-medium
  inactive: text-slate-400 hover:text-slate-200
  active: border-slate-100 text-slate-100
  icons: size-4
```

- [ ] **Step 1: Update the title classes**

In `components/LeaguePageHeader.tsx` line 35, change:
```tsx
<h1 className="text-2xl font-semibold text-slate-100">{leagueName}</h1>
```
to:
```tsx
<h1 className="text-3xl font-extrabold tracking-tight text-slate-100">{leagueName}</h1>
```

- [ ] **Step 2: Update the progress text**

Line 36–38, change:
```tsx
<p className="mt-1 text-sm text-slate-500">
  {playedCount} of {totalWeeks} weeks ({pct}% complete)
</p>
```
to:
```tsx
<p className="mt-1 text-xs text-slate-500">
  {playedCount} of {totalWeeks} weeks · {pct}% complete
</p>
```

- [ ] **Step 3: Update the gear button and icon colour**

The `<Button>` block sits inside a `{isAdmin && (...)}` conditional (line 40). Edit only the inner `<Button>` block (lines 41–46), leaving the conditional wrapper untouched:

Change:
```tsx
<Button asChild variant="ghost" size="icon">
  <Link href={`/${leagueId}/settings`} aria-label="League settings">
    <Settings className="size-4" />
  </Link>
</Button>
```
to:
```tsx
<Button asChild variant="ghost" size="icon" className="text-slate-500 hover:text-slate-400">
  <Link href={`/${leagueId}/settings`} aria-label="League settings">
    <Settings className="size-4" />
  </Link>
</Button>
```

- [ ] **Step 4: Update the tab links**

For each of the three tab `<Link>` elements (lines 52–89), update the `className` `cn(...)` call:

**Active state class:** `border-slate-100 text-slate-100` → `border-slate-200 text-slate-200`

**Inactive state class:** `border-transparent text-slate-400 hover:text-slate-200` → `border-transparent text-slate-700 hover:text-slate-400`

**Text size:** `text-base` → `text-xs`

**Icon size** (inside each tab link): `size-4` → `size-3`

The Results tab (lines 52–63) should look like:
```tsx
<Link
  href={`/${leagueId}/results`}
  className={cn(
    '-mb-px flex items-center gap-2 border-b-2 pb-2 text-xs font-medium',
    currentTab === 'results'
      ? 'border-slate-200 text-slate-200'
      : 'border-transparent text-slate-700 hover:text-slate-400'
  )}
>
  <ClipboardList className="size-3" />
  Results
</Link>
```

Apply the same pattern to the Players tab (`<Users className="size-3" />`) and the Lineup Lab tab (`<FlaskConical className="size-3" />`).

The `<nav>` wrapper (line 51) and `showLineupLabTab` conditional are unchanged — only the classes on the `<Link>` elements and their icons are updated.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. If errors appear, fix them before continuing.

- [ ] **Step 6: Commit**

```bash
git add components/LeaguePageHeader.tsx
git commit -m "feat: improve visual hierarchy in LeaguePageHeader"
```

---

## Task 2: Update `LeagueInfoBar.tsx`

**Files:**
- Modify: `components/LeagueInfoBar.tsx`

### Context

Currently `LeagueInfoBar` calls `buildLeagueInfoFacts(details)` which returns a `string[]` with emoji baked in (e.g. `"📍 Hackney Marshes"`). This is incompatible with Lucide icons and also only renders a day/time entry when *both* fields are set. We replace the filled-state rendering entirely with inline JSX.

The `isLeagueDetailsFilled` guard and the admin empty-state prompt are **unchanged**.

- [ ] **Step 1: Add Lucide imports**

At the top of `components/LeagueInfoBar.tsx`, replace the existing import line:
```tsx
import { buildLeagueInfoFacts, isLeagueDetailsFilled } from '@/lib/utils'
```
with:
```tsx
import { MapPin, Calendar, Users } from 'lucide-react'
import { isLeagueDetailsFilled } from '@/lib/utils'
```

(`buildLeagueInfoFacts` is no longer used from this file.)

- [ ] **Step 2: Replace the filled-state render**

Replace the entire filled-state return block (currently lines 37–57):

```tsx
// Filled state
const facts = buildLeagueInfoFacts(details!)

return (
  <div className="space-y-2">
    {facts.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {facts.map((fact) => (
          <span
            key={fact}
            className="inline-flex items-center gap-1.5 text-sm text-slate-300 bg-slate-800 border border-slate-700 rounded-full px-3 py-1"
          >
            {fact}
          </span>
        ))}
      </div>
    )}
    {details!.bio && (
      <p className="text-sm text-slate-400 leading-relaxed">{details!.bio}</p>
    )}
  </div>
)
```

with:

```tsx
// Build pills inline — bypasses buildLeagueInfoFacts (incompatible: returns string[], not JSX)
const d = details!
const dayTime = d.day && d.kickoff_time
  ? `${d.day} ${d.kickoff_time}`
  : d.day ?? d.kickoff_time ?? null

const pillClass = 'inline-flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 border border-slate-800 rounded px-2 py-0.5'
const iconClass = 'size-[11px] shrink-0'  // shrink-0 prevents flex compression on narrow screens

return (
  <div className="space-y-2">
    <div className="flex flex-wrap gap-1.5">
      {d.location && (
        <span className={pillClass}>
          <MapPin className={iconClass} />
          {d.location}
        </span>
      )}
      {dayTime && (
        <span className={pillClass}>
          <Calendar className={iconClass} />
          {dayTime}
        </span>
      )}
      {d.player_count != null && (
        <span className={pillClass}>
          <Users className={iconClass} />
          {d.player_count} players
        </span>
      )}
    </div>
    {d.bio && (
      <p className="text-xs text-slate-500 leading-relaxed">{d.bio}</p>
    )}
  </div>
)
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. `player_count` is typed as `number | undefined` on `LeagueDetails` (never `null`), so `d.player_count != null` correctly guards against `undefined` while being safe against any future `null` assignments.

**Edge case to be aware of:** `isLeagueDetailsFilled` (used for the empty-state guard) checks `location`, `day`, `kickoff_time`, and `bio` — it does *not* check `player_count`. This means a league where only `player_count` is set will still show the admin empty-state prompt rather than the pill row. This is intentional per the spec.

- [ ] **Step 4: Run existing tests to confirm no regressions**

```bash
npm test
```

Expected: all tests pass. The existing tests cover `buildLeagueInfoFacts` and `isLeagueDetailsFilled` in `lib/utils.ts` — neither is changed, so they should be unaffected.

- [ ] **Step 5: Commit**

```bash
git add components/LeagueInfoBar.tsx
git commit -m "feat: replace emoji pills with Lucide icons and inline rendering in LeagueInfoBar"
```

---

## Done

Both commits on branch `awmloveland/league-details-info-bar`. Raise a PR when ready.
