# Win Probability Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw "Team Ratings" score bar in the lineup builder with a win probability display — bold % figures flanking the bar and a pundit-style description line below it.

**Architecture:** Add a `winCopy()` helper to `lib/utils.ts`, then update the `isAutoPickMode` rendering section in `NextMatchCard.tsx` to use `winProbability()` for the bar width, show rounded % figures either side, replace the score label with copy from `winCopy()`, and remove the now-redundant score tags on the team headers.

**Tech Stack:** TypeScript (strict), React (Next.js 14 App Router), Tailwind CSS utility classes, `lib/utils.ts` for shared pure functions.

---

## File Map

| File | Change |
|---|---|
| `lib/utils.ts` | Add `winCopy()` export |
| `components/NextMatchCard.tsx` | Update `isAutoPickMode` section: bar width, % flanking labels, copy line, remove score tags + `score` param from `renderTeam` |

---

## Task 1: Add `winCopy` to `lib/utils.ts`

**Files:**
- Modify: `lib/utils.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/utils.winCopy.test.ts` with:

```ts
import { winCopy } from '../utils'

describe('winCopy', () => {
  it('returns even copy when exactly 50/50', () => {
    const result = winCopy(0.5)
    expect(result.team).toBe('even')
    expect(result.text).toBe("Too close to call — this one could go either way")
  })

  it('returns even copy within 1pp of 50 (Team A side)', () => {
    const result = winCopy(0.51)
    expect(result.team).toBe('even')
  })

  it('returns even copy within 1pp of 50 (Team B side)', () => {
    const result = winCopy(0.49)
    expect(result.team).toBe('even')
  })

  it('returns slight edge copy for Team A at 53%', () => {
    const result = winCopy(0.53)
    expect(result.team).toBe('A')
    expect(result.text).toBe("Slight edge to Team A going into this one")
  })

  it('returns slight edge copy for Team B at 47%', () => {
    const result = winCopy(0.47)
    expect(result.team).toBe('B')
    expect(result.text).toBe("Slight edge to Team B going into this one")
  })

  it('returns stronger side copy at 58% Team A', () => {
    const result = winCopy(0.58)
    expect(result.team).toBe('A')
    expect(result.text).toBe("Team A look like the stronger side tonight")
  })

  it('returns favourites copy at 65% Team A', () => {
    const result = winCopy(0.65)
    expect(result.team).toBe('A')
    expect(result.text).toBe("Team A are favourites heading into this one")
  })

  it('returns heavy favourites copy at 75% Team B', () => {
    const result = winCopy(0.25)
    expect(result.team).toBe('B')
    expect(result.text).toBe("The odds heavily favour Team B tonight")
  })

  it('places 55% in the stronger-side bucket, not slight-edge', () => {
    const result = winCopy(0.55)
    expect(result.text).toBe("Team A look like the stronger side tonight")
  })

  it('places 62% in the favourites bucket, not stronger-side', () => {
    const result = winCopy(0.62)
    expect(result.text).toBe("Team A are favourites heading into this one")
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/west-monroe
npx jest lib/__tests__/utils.winCopy.test.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `winCopy is not a function` or similar export error.

- [ ] **Step 3: Add `winCopy` to `lib/utils.ts`**

Append after the `winProbability` function (around line 145):

```ts
/**
 * Returns pundit-style copy and the leading team for a given Team A win probability.
 * Thresholds: even ≤51%, slight edge >51–<55%, stronger side 55–<62%,
 * favourites 62–<70%, heavy favourites ≥70%.
 */
export function winCopy(probA: number): { text: string; team: 'A' | 'B' | 'even' } {
  const pct = probA * 100
  const isEven = Math.abs(pct - 50) <= 1
  if (isEven) return { text: "Too close to call — this one could go either way", team: 'even' }
  const leading = pct > 50 ? 'A' : 'B'
  const leadPct = pct > 50 ? pct : 100 - pct
  const name = leading === 'A' ? 'Team A' : 'Team B'
  if (leadPct < 55) return { text: `Slight edge to ${name} going into this one`, team: leading }
  if (leadPct < 62) return { text: `${name} look like the stronger side tonight`, team: leading }
  if (leadPct < 70) return { text: `${name} are favourites heading into this one`, team: leading }
  return { text: `The odds heavily favour ${name} tonight`, team: leading }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx jest lib/__tests__/utils.winCopy.test.ts --no-coverage 2>&1 | tail -20
```

Expected: all 10 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.winCopy.test.ts
git commit -m "feat: add winCopy helper for pundit-style win probability copy"
```

---

## Task 2: Update the balance bar in `NextMatchCard.tsx`

**Files:**
- Modify: `components/NextMatchCard.tsx`

This task touches the `isAutoPickMode` IIFE section only. There are four sub-changes:

1. Remove `score: number` param from `renderTeam` and update both call sites
2. Remove the score tag JSX from `renderTeam`'s header row
3. Replace bar width with `winProbability`-derived value
4. Replace the score row below the bar with % figures + `winCopy` copy line

- [ ] **Step 1: Import `winProbability` (already imported) and add `winCopy` to the import**

Find the import at the top of `components/NextMatchCard.tsx`:

```ts
import { getNextMatchDate, getNextWeekNumber, deriveSeason, ewptScore } from '@/lib/utils'
```

Change to:

```ts
import { getNextMatchDate, getNextWeekNumber, deriveSeason, ewptScore, winProbability, winCopy } from '@/lib/utils'
```

Note: `winProbability` may already be imported — check first and only add what is missing.

- [ ] **Step 2: Remove `score` param from `renderTeam` and update call sites**

Find the `renderTeam` function signature inside the `isAutoPickMode` IIFE:

```ts
const renderTeam = (team: 'A' | 'B', players: Player[], score: number) => (
```

Change to:

```ts
const renderTeam = (team: 'A' | 'B', players: Player[]) => (
```

Then update both call sites below:

```ts
// Before
{renderTeam('A', localTeamA, liveScoreA)}
{renderTeam('B', localTeamB, liveScoreB)}

// After
{renderTeam('A', localTeamA)}
{renderTeam('B', localTeamB)}
```

- [ ] **Step 3: Remove the score tag from the `renderTeam` header row**

Inside `renderTeam`, find the header div (currently `flex items-center justify-between mb-2`) and replace it with just the team title:

```tsx
// Before
<div className="flex items-center justify-between mb-2">
  <p className="text-sm font-semibold text-slate-100">{team === 'A' ? 'Team A' : 'Team B'}</p>
  <span className={cn(
    'px-1.5 py-0.5 rounded text-xs font-semibold tabular-nums',
    team === 'A'
      ? 'bg-sky-900/60 border border-sky-700 text-sky-300'
      : 'bg-violet-900/60 border border-violet-700 text-violet-300'
  )}>
    {score.toFixed(1)}
  </span>
</div>

// After
<p className="text-sm font-semibold text-slate-100 mb-2">{team === 'A' ? 'Team A' : 'Team B'}</p>
```

- [ ] **Step 4: Replace the bar section below the team grid**

Find the `space-y-1.5` div after the team grid (contains the bar track and score row). Replace it entirely:

```tsx
// Before
<div className="space-y-1.5">
  <div className="flex h-1.5 rounded-full overflow-hidden">
    <div
      className="bg-sky-600 transition-all"
      style={{ width: `${liveScoreA + liveScoreB === 0 ? 50 : (liveScoreA / (liveScoreA + liveScoreB)) * 100}%` }}
    />
    <div className="bg-violet-600 flex-1" />
  </div>
  <div className="flex items-center justify-between">
    <span className="text-xs text-sky-400/70 font-medium tabular-nums">{liveScoreA.toFixed(1)}</span>
    <span className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">Team Ratings</span>
    <span className="text-xs text-violet-400/70 font-medium tabular-nums">{liveScoreB.toFixed(1)}</span>
  </div>
</div>

// After
{(() => {
  const winProbA = winProbability(liveScoreA, liveScoreB)
  const winProbB = 1 - winProbA
  const isEven = Math.abs(winProbA * 100 - 50) <= 1
  const copy = winCopy(winProbA)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2.5">
        <span className={cn(
          'text-[15px] font-bold tabular-nums min-w-[34px]',
          isEven ? 'text-slate-400' : 'text-sky-300'
        )}>
          {Math.round(winProbA * 100)}%
        </span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden flex">
          <div
            className="bg-sky-600 transition-all"
            style={{ width: `${winProbA * 100}%` }}
          />
          <div className="bg-violet-600 flex-1" />
        </div>
        <span className={cn(
          'text-[15px] font-bold tabular-nums min-w-[34px] text-right',
          isEven ? 'text-slate-400' : 'text-violet-300'
        )}>
          {Math.round(winProbB * 100)}%
        </span>
      </div>
      <p className={cn(
        'text-xs font-medium text-center',
        copy.team === 'A' ? 'text-sky-400' : copy.team === 'B' ? 'text-violet-400' : 'text-slate-400'
      )}>
        {copy.text}
      </p>
    </div>
  )
})()}
```

- [ ] **Step 5: Run the TypeScript compiler to check for errors**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/west-monroe
npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors. If errors appear, fix them before proceeding.

- [ ] **Step 6: Verify the dev server builds cleanly**

```bash
npm run dev 2>&1 | head -30
```

Expected: `ready - started server on 0.0.0.0:3000` with no compilation errors.

- [ ] **Step 7: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: replace team ratings bar with win probability display"
```
