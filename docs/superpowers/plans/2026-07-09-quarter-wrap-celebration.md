# Quarter Wrap Celebration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a calendar quarter ends with a known champion, celebrate it with a shared "Champion + Awards Reel" — live for the admin who records the clinching game, and as a self-expiring card on the Results tab for everyone.

**Architecture:** One presentational `QuarterCelebration` component drives two surfaces. A pure `findNewlyCompletedQuarter` helper decides when recording a game clinches a quarter (Surface A, inside `ResultModal`). A pure `getCelebratedQuarter` helper decides when the Results tab shows the freshly-finished quarter (Surface B). Both reuse the existing `computeAllQuarters` / `buildQuarterAwards` / `buildQuarterShareText` machinery — no new data model. A feature flag (`quarter_celebration`) gates Surface B for members/public; admins always see both surfaces.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind CSS v3, Radix UI, Supabase (Postgres + RLS), Jest (+ `@testing-library/react` for component tests).

**Spec:** `docs/superpowers/specs/2026-07-09-quarter-wrap-celebration-design.md`

---

## Design notes carried from the spec

- **Content depth:** Champion hero + full awards reel in one card (treatment B).
- **Surface A:** the celebration *replaces* the ResultModal share step when the recorded game clinches a quarter (A1). Scoped to the **normal (non-DNF) result path** — a DNF that happens to settle a quarter's last week is covered by Surface B on next visit. (The spec's "calendar rollover / non-recording completions are covered by B" note extends to this.)
- **Surface B:** self-expiring card keyed off "current calendar quarter has zero played weeks." No dismiss button, no timers, no dismissal state.
- **Champion accent colour:** amber (`text-amber-300` + 👑), matching the approved mockup and the existing sidebar champion badge. This is the established champion-motif exception to the "no yellow/orange" rule; everything else stays in the slate / sky / indigo Honours palette.

---

## File structure

| File | Responsibility | Change |
|---|---|---|
| `lib/types.ts` | `FeatureKey` union | Modify — add `'quarter_celebration'` |
| `lib/defaults.ts` | `DEFAULT_FEATURES` fallback list | Modify — add seed row |
| `lib/sidebar-stats.ts` | quarter derivation + two new pure helpers | Modify — add `findNewlyCompletedQuarter`, `getCelebratedQuarter` |
| `components/QuarterCelebration.tsx` | the shared champion + awards reel (both variants) | Create |
| `components/ResultModal.tsx` | Surface A — new `'celebrate'` step + clinch routing | Modify |
| `app/[slug]/results/page.tsx` | Surface B — render the card, gated | Modify |
| `components/QuarterCelebrationCard.tsx` | admin Members/Public toggles for the flag | Create |
| `components/FeaturePanel.tsx` | wire the toggle card in | Modify |
| `supabase/migrations/20260709000001_seed_quarter_celebration.sql` | register + seed the flag | Create |
| `lib/__tests__/sidebar-stats.celebration.test.ts` | tests for both new helpers | Create |
| `__tests__/quarter-celebration.test.tsx` | render test for the component | Create |

Run tests with: `npm test`. Single file: `npm test -- <path>`.

---

## Task 1: Add the `quarter_celebration` feature key + default

**Files:**
- Modify: `lib/types.ts:90-94`
- Modify: `lib/defaults.ts:11-15`

- [ ] **Step 1: Add the key to the `FeatureKey` union**

In `lib/types.ts`, change the union (currently lines 90-94) to:

```ts
export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'player_stats'
  | 'player_comparison'
  | 'quarter_celebration';
```

- [ ] **Step 2: Add the default row**

In `lib/defaults.ts`, add a final entry to the `DEFAULT_FEATURES` array (after the `player_comparison` line):

```ts
  { feature: 'quarter_celebration', enabled: false, config: null, public_enabled: false, public_config: null },
```

- [ ] **Step 3: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/defaults.ts
git commit -m "feat: add quarter_celebration feature key + default"
```

---

## Task 2: `findNewlyCompletedQuarter` helper (TDD)

Detects whether recording a game caused a quarter to transition to `completed`.

**Files:**
- Test: `lib/__tests__/sidebar-stats.celebration.test.ts`
- Modify: `lib/sidebar-stats.ts` (add exported function after `computeAllQuarters`, ~line 442)

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/sidebar-stats.celebration.test.ts`:

```ts
import { findNewlyCompletedQuarter, getCelebratedQuarter } from '../sidebar-stats'
import type { Week, WeekStatus } from '../types'

function makeWeek(weekNum: number, date: string, status: WeekStatus): Week {
  const played = status === 'played'
  return {
    season: '2026',
    week: weekNum,
    date,
    status,
    teamA: played ? ['Dave', 'Ali'] : [],
    teamB: played ? ['Steve', 'Sam'] : [],
    winner: played ? 'teamA' : null,
  }
}

describe('findNewlyCompletedQuarter', () => {
  // Fixed "now" in Q3 2026 so Q2 2026 is calendar-past.
  const now = new Date(2026, 6, 8)

  it('returns the quarter when recording its last outstanding week completes it', () => {
    const before: Week[] = [
      makeWeek(1, '10 Apr 2026', 'played'),
      makeWeek(2, '17 Apr 2026', 'scheduled'), // outstanding → Q2 not yet completed
    ]
    const after: Week[] = [
      makeWeek(1, '10 Apr 2026', 'played'),
      makeWeek(2, '17 Apr 2026', 'played'),  // now settled → Q2 completes
    ]
    const result = findNewlyCompletedQuarter(before, after, now)
    expect(result).not.toBeNull()
    expect(result!.q).toBe(2)
    expect(result!.year).toBe(2026)
    expect(result!.champion).toBeTruthy()
  })

  it('returns null when the recorded game is in the current (in-progress) quarter', () => {
    const before: Week[] = [makeWeek(1, '3 Jul 2026', 'scheduled')]
    const after: Week[] = [makeWeek(1, '3 Jul 2026', 'played')]
    expect(findNewlyCompletedQuarter(before, after, now)).toBeNull()
  })

  it('returns null when no quarter status changed', () => {
    const before: Week[] = [makeWeek(1, '10 Apr 2026', 'played')]
    const after: Week[] = [
      makeWeek(1, '10 Apr 2026', 'played'),
      makeWeek(2, '17 Apr 2026', 'played'),
    ]
    // Q2 was already completed in `before` (all settled, one played) → not newly completed
    expect(findNewlyCompletedQuarter(before, after, now)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/__tests__/sidebar-stats.celebration.test.ts`
Expected: FAIL — `findNewlyCompletedQuarter is not a function` (and `getCelebratedQuarter` import undefined).

- [ ] **Step 3: Implement the helper**

In `lib/sidebar-stats.ts`, add after the `computeAllQuarters` function (after line 442):

```ts
/**
 * Returns the quarter that transitioned to `completed` (with a champion) between
 * two week sets, or null if none did. Used to decide whether recording a game
 * clinched a quarter. If more than one newly completes, returns the most recent.
 */
export function findNewlyCompletedQuarter(
  weeksBefore: Week[],
  weeksAfter: Week[],
  now: Date = new Date(),
): QuarterSummary | null {
  const completedKeys = (weeks: Week[]): Set<string> => {
    const keys = new Set<string>()
    for (const yr of computeAllQuarters(weeks, now)) {
      for (const s of yr.quarters) {
        if (s.status === 'completed' && s.champion) keys.add(`${s.year}-${s.q}`)
      }
    }
    return keys
  }

  const before = completedKeys(weeksBefore)
  const newly: QuarterSummary[] = []
  for (const yr of computeAllQuarters(weeksAfter, now)) {
    for (const s of yr.quarters) {
      if (s.status === 'completed' && s.champion && !before.has(`${s.year}-${s.q}`)) {
        newly.push(s)
      }
    }
  }
  if (newly.length === 0) return null
  newly.sort((a, b) => b.year - a.year || b.q - a.q)
  return newly[0]
}
```

- [ ] **Step 4: Run the test to verify the `findNewlyCompletedQuarter` cases pass**

Run: `npm test -- lib/__tests__/sidebar-stats.celebration.test.ts -t findNewlyCompletedQuarter`
Expected: the three `findNewlyCompletedQuarter` tests PASS. (The `getCelebratedQuarter` import is still undefined — its tests come in Task 3.)

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar-stats.ts lib/__tests__/sidebar-stats.celebration.test.ts
git commit -m "feat: add findNewlyCompletedQuarter helper"
```

---

## Task 3: `getCelebratedQuarter` helper (TDD)

Decides whether the Results tab should show the freshly-finished quarter — true while the current calendar quarter has no played weeks and the previous quarter completed with a champion.

**Files:**
- Modify: `lib/__tests__/sidebar-stats.celebration.test.ts` (add a `describe` block)
- Modify: `lib/sidebar-stats.ts` (add exported function next to `findNewlyCompletedQuarter`)

- [ ] **Step 1: Write the failing test**

Append to `lib/__tests__/sidebar-stats.celebration.test.ts`:

```ts
describe('getCelebratedQuarter', () => {
  const now = new Date(2026, 6, 8) // Q3 2026

  it('returns the previous quarter while the current quarter has no played games', () => {
    const weeks: Week[] = [
      makeWeek(1, '10 Apr 2026', 'played'),
      makeWeek(2, '17 Apr 2026', 'played'),
    ]
    const result = getCelebratedQuarter(weeks, now)
    expect(result).not.toBeNull()
    expect(result!.q).toBe(2)
    expect(result!.champion).toBeTruthy()
  })

  it('returns null once the current quarter has a played game', () => {
    const weeks: Week[] = [
      makeWeek(1, '10 Apr 2026', 'played'),
      makeWeek(2, '17 Apr 2026', 'played'),
      makeWeek(3, '3 Jul 2026', 'played'), // Q3 now has a played game
    ]
    expect(getCelebratedQuarter(weeks, now)).toBeNull()
  })

  it('returns null when the previous quarter has no champion (no played games)', () => {
    const weeks: Week[] = [makeWeek(1, '17 Apr 2026', 'cancelled')]
    expect(getCelebratedQuarter(weeks, now)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- lib/__tests__/sidebar-stats.celebration.test.ts -t getCelebratedQuarter`
Expected: FAIL — `getCelebratedQuarter is not a function`.

- [ ] **Step 3: Implement the helper**

In `lib/sidebar-stats.ts`, add immediately after `findNewlyCompletedQuarter`:

```ts
/**
 * Returns the freshly-finished quarter to celebrate on the Results tab, or null.
 * Shows while the current calendar quarter has zero played weeks and the
 * previous quarter is completed with a champion. Returns null the moment the
 * new quarter records its first game (self-expiry).
 */
export function getCelebratedQuarter(weeks: Week[], now: Date = new Date()): QuarterSummary | null {
  const { q, year } = quarterOf(now)
  const currentPlayed = weeks.filter(w => weekInQuarter(w, q, year) && w.status === 'played').length
  if (currentPlayed > 0) return null

  const prevQ = q === 1 ? 4 : q - 1
  const prevYear = q === 1 ? year - 1 : year
  const summary = computeAllQuarters(weeks, now)
    .find(y => y.year === prevYear)
    ?.quarters.find(s => s.q === prevQ)

  if (summary && summary.status === 'completed' && summary.champion) return summary
  return null
}
```

(`quarterOf` and `weekInQuarter` are module-private helpers already defined in this file at lines 142 and 167 — no import needed.)

- [ ] **Step 4: Run the full test file**

Run: `npm test -- lib/__tests__/sidebar-stats.celebration.test.ts`
Expected: all six tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar-stats.ts lib/__tests__/sidebar-stats.celebration.test.ts
git commit -m "feat: add getCelebratedQuarter helper"
```

---

## Task 4: `QuarterCelebration` component

The shared presentational reel — champion hero + awards + share button. Used by both surfaces.

**Files:**
- Create: `components/QuarterCelebration.tsx`
- Test: `__tests__/quarter-celebration.test.tsx`

- [ ] **Step 1: Write the failing render test**

Create `__tests__/quarter-celebration.test.tsx`:

```tsx
/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { QuarterCelebration } from '@/components/QuarterCelebration'
import type { QuarterSummary } from '@/lib/sidebar-stats'

const quarter: QuarterSummary = {
  q: 2,
  year: 2026,
  quarterLabel: 'Q2 26',
  seasonName: 'Spring',
  status: 'completed',
  weekRange: { from: 1, to: 2 },
  dateRange: { from: '10 Apr 2026', to: '17 Apr 2026' },
  champion: 'Marcus',
  entries: [
    { name: 'Marcus', played: 6, won: 5, drew: 1, lost: 0, points: 16 },
    { name: 'Danny', played: 6, won: 3, drew: 0, lost: 3, points: 9 },
  ],
  awards: [
    { key: 'champion', nickname: 'Champion', icon: '🏅', player: 'Marcus', stat: '16 pts' },
    { key: 'iron_man', nickname: 'Iron Man', icon: '⚽', player: 'Danny', stat: '6 games' },
  ],
  gamesPlayed: 6,
}

describe('QuarterCelebration', () => {
  it('shows the champion as the hero', () => {
    render(<QuarterCelebration quarter={quarter} leagueName="Test FC" leagueSlug="test-fc" variant="card" />)
    expect(screen.getByText('Marcus')).toBeInTheDocument()
    expect(screen.getByText(/Spring Champion/i)).toBeInTheDocument()
  })

  it('renders the awards reel but excludes the champion award', () => {
    render(<QuarterCelebration quarter={quarter} leagueName="Test FC" leagueSlug="test-fc" variant="card" />)
    expect(screen.getByText('Iron Man')).toBeInTheDocument()
    // "Champion" nickname must not appear in the reel (it's the hero, not a medal)
    expect(screen.queryByText('Champion')).not.toBeInTheDocument()
  })

  it('renders a share button', () => {
    render(<QuarterCelebration quarter={quarter} leagueName="Test FC" leagueSlug="test-fc" variant="modal" />)
    expect(screen.getByRole('button', { name: /share the glory/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- __tests__/quarter-celebration.test.tsx`
Expected: FAIL — cannot find module `@/components/QuarterCelebration`.

- [ ] **Step 3: Implement the component**

Create `components/QuarterCelebration.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn, buildQuarterShareText, shareOrCopy } from '@/lib/utils'
import type { QuarterSummary } from '@/lib/sidebar-stats'

interface QuarterCelebrationProps {
  quarter: QuarterSummary
  leagueName: string
  leagueSlug: string
  variant: 'modal' | 'card'
}

export function QuarterCelebration({ quarter, leagueName, leagueSlug, variant }: QuarterCelebrationProps) {
  const [copied, setCopied] = useState(false)

  const champion = quarter.entries?.[0]
  const medals = (quarter.awards ?? []).filter(a => a.key !== 'champion')

  async function handleShare() {
    const text = buildQuarterShareText({ leagueName, leagueSlug, quarter })
    const result = await shareOrCopy(text)
    if (result === 'copied') {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const record = champion
    ? [
        `${champion.points} pts`,
        `${champion.won} ${champion.won === 1 ? 'win' : 'wins'}`,
        champion.drew > 0 ? `${champion.drew} ${champion.drew === 1 ? 'draw' : 'draws'}` : null,
      ].filter(Boolean).join(' · ')
    : ''

  return (
    <div className={cn(
      'relative overflow-hidden',
      variant === 'card' && 'rounded-xl border border-slate-700 bg-slate-800',
    )}>
      {/* CSS-only celebratory sheen — decorative, non-interactive */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 15%, rgba(96,165,250,0.25) 0, transparent 40%), ' +
            'radial-gradient(circle at 80% 10%, rgba(167,139,250,0.22) 0, transparent 40%), ' +
            'radial-gradient(circle at 50% 0%, rgba(251,191,36,0.18) 0, transparent 45%)',
        }}
      />

      <div className="relative px-5 pt-5 pb-4 text-center">
        <div className="text-4xl leading-none">👑</div>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Q{quarter.q} {quarter.year} · {quarter.seasonName} Champion
        </p>
        <p className="mt-1 text-2xl font-extrabold text-amber-300">
          {champion?.name ?? '—'}
        </p>
        {record && <p className="mt-1 text-xs text-slate-400">{record}</p>}
      </div>

      {medals.length > 0 && (
        <div className="relative flex gap-2 overflow-x-auto border-t border-slate-700 px-3 py-2.5 scrollbar-hide">
          {medals.map(award => (
            <div
              key={award.key}
              className="flex-shrink-0 flex flex-col gap-0.5 bg-slate-700/50 border border-slate-600 rounded-lg px-2.5 py-2 min-w-[108px]"
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs">{award.icon}</span>
                <span className="text-[10px] font-bold tracking-wide uppercase text-indigo-400">
                  {award.nickname}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-100">{award.player}</span>
              <span className="text-[10px] text-slate-500">{award.stat}</span>
            </div>
          ))}
        </div>
      )}

      <div className="relative border-t border-slate-700 px-4 py-3">
        <button
          type="button"
          onClick={handleShare}
          className="w-full px-3 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold transition-colors"
        >
          {copied ? 'Copied — go and brag 📣' : 'Share the glory'}
        </button>
        {variant === 'card' && (
          <Link
            href={`/${leagueSlug}/honours#q-${quarter.year}-${quarter.q}`}
            className="mt-2 block text-center text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            See full standings →
          </Link>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- __tests__/quarter-celebration.test.tsx`
Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/QuarterCelebration.tsx __tests__/quarter-celebration.test.tsx
git commit -m "feat: add shared QuarterCelebration component"
```

---

## Task 5: Surface A — the admin moment in `ResultModal`

Add a `'celebrate'` step that replaces the share step when the recorded game clinches a quarter.

**Files:**
- Modify: `components/ResultModal.tsx`

- [ ] **Step 1: Import the helper, the component, and the type**

In `components/ResultModal.tsx`, update the imports near the top (lines 6-8). Add `findNewlyCompletedQuarter` and its `QuarterSummary` type, and the component:

```ts
import { cn, buildResultShareText, buildDnfShareText, buildResultHeadline, resolveTeamRatingForResult } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Winner, ScheduledWeek, LineupMetadata, Player, Mentality, Week, Strength } from '@/lib/types'
import { findNewlyCompletedQuarter } from '@/lib/sidebar-stats'
import type { QuarterSummary } from '@/lib/sidebar-stats'
import { QuarterCelebration } from '@/components/QuarterCelebration'
```

- [ ] **Step 2: Add `'celebrate'` to the step union and celebrate state**

Change line 27:

```ts
type ResultStep = 'winner' | 'review' | 'confirm' | 'share' | 'celebrate'
```

Add state next to the other `useState` calls (after line 93, `const [shareCopied, ...]`):

```ts
  const [celebrateQuarter, setCelebrateQuarter] = useState<QuarterSummary | null>(null)
```

- [ ] **Step 3: Add a routing helper inside the component**

Add this function inside `ResultModal`, immediately before `handleSave` (before line 173):

```ts
  // After a successful save, celebrate if this game clinched a quarter;
  // otherwise fall through to the normal per-game share step.
  function routeAfterSave(weeksAfter: Week[]) {
    const clinched = findNewlyCompletedQuarter(weeks, weeksAfter, new Date())
    if (clinched) {
      setCelebrateQuarter(clinched)
      setStep('celebrate')
    } else {
      setStep('share')
    }
  }
```

- [ ] **Step 4: Route through the helper on the normal (non-DNF) path**

In `handleSave`, replace the two lines at the end of the non-DNF branch (currently lines 364-365):

```ts
      setShareData({ dnf: false, winner, goalDifference, shareText, highlightsText })
      setStep('share')
```

with:

```ts
      setShareData({ dnf: false, winner, goalDifference, shareText, highlightsText })
      const weeksAfter = weeks.some(w => w.id === scheduledWeek.id)
        ? weeks.map(w => (w.id === scheduledWeek.id ? syntheticWeek : w))
        : [...weeks, syntheticWeek]
      routeAfterSave(weeksAfter)
```

(The DNF branch keeps `setStep('share')` unchanged — DNF-clinched quarters are covered by Surface B.)

- [ ] **Step 5: Treat `'celebrate'` as a terminal step in the header + close behaviour**

Change the `Dialog.Root` `onOpenChange` (line 374) from:

```tsx
    <Dialog.Root open onOpenChange={(open) => { if (!open) { if (step === 'share') onSaved(); else onClose() } }}>
```

to:

```tsx
    <Dialog.Root open onOpenChange={(open) => { if (!open) { if (step === 'share' || step === 'celebrate') onSaved(); else onClose() } }}>
```

Change the header close-button condition (line 395) from `{step === 'share' && (` to:

```tsx
            {(step === 'share' || step === 'celebrate') && (
```

- [ ] **Step 6: Render the celebrate step**

Immediately after the closing of the `share` step block (after line 740, the `)}` that closes `{step === 'share' && shareData && ( … )}`), add:

```tsx
          {/* ── Step: celebrate ── */}
          {step === 'celebrate' && celebrateQuarter && (
            <>
              <div className="p-4">
                <QuarterCelebration
                  quarter={celebrateQuarter}
                  leagueName={leagueName}
                  leagueSlug={leagueSlug}
                  variant="modal"
                />
              </div>
              <div className="px-5 pb-5 pt-1">
                <button
                  type="button"
                  onClick={onSaved}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-600 text-slate-300 text-sm hover:border-slate-500 transition-colors"
                >
                  Done
                </button>
              </div>
            </>
          )}
```

- [ ] **Step 7: Verify type-check and existing modal tests still pass**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites PASS (no ResultModal behaviour regressions).

- [ ] **Step 8: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "feat: celebrate quarter clinch in the result modal (Surface A)"
```

---

## Task 6: Surface B — the Results-tab card

Render the celebration card on both the public and member/admin branches, gated by the feature flag (admins always see it).

**Files:**
- Modify: `app/[slug]/results/page.tsx`

- [ ] **Step 1: Import the helper and the component**

In `app/[slug]/results/page.tsx`, add to the imports:

```ts
import { getCelebratedQuarter } from '@/lib/sidebar-stats'
import { QuarterCelebration } from '@/components/QuarterCelebration'
```

- [ ] **Step 2: Compute the card visibility after `weeks` is finalized**

After the `nextWeek` derivation block (after line 140) and before `const goalkeepers = …`, add:

```ts
  const celebratedQuarter = getCelebratedQuarter(weeks)
  const canSeeCelebration =
    isAdmin || isFeatureEnabled(features, 'quarter_celebration', tier)
  const showCelebration = celebratedQuarter !== null && canSeeCelebration
```

- [ ] **Step 3: Render the card on the public branch**

In the public-tier return, insert the card as the first child inside the `space-y-8` column, immediately after the closing `/>` of `<LeaguePageHeader … />` (after line 175):

```tsx
            {showCelebration && (
              <QuarterCelebration
                quarter={celebratedQuarter!}
                leagueName={game.name}
                leagueSlug={slug}
                variant="card"
              />
            )}
```

- [ ] **Step 4: Render the card on the member / admin branch**

In the member/admin return, insert the card immediately after the `{showClaimBanner && …}` line (after line 237) and before `<div className="flex flex-col gap-3">`:

```tsx
          {showCelebration && (
            <div className="mb-3">
              <QuarterCelebration
                quarter={celebratedQuarter!}
                leagueName={game.name}
                leagueSlug={slug}
                variant="card"
              />
            </div>
          )}
```

- [ ] **Step 5: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/[slug]/results/page.tsx
git commit -m "feat: show quarter celebration card on the results tab (Surface B)"
```

---

## Task 7: Admin toggle card in the Feature panel

Give admins Members/Public toggles for the flag, mirroring the existing panel style.

**Files:**
- Create: `components/QuarterCelebrationCard.tsx`
- Modify: `components/FeaturePanel.tsx`

- [ ] **Step 1: Create the toggle card**

Create `components/QuarterCelebrationCard.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { Toggle } from '@/components/ui/toggle'
import type { LeagueFeature } from '@/lib/types'

interface QuarterCelebrationCardProps {
  leagueId: string
  feature: LeagueFeature
  onChanged: () => void
}

export function QuarterCelebrationCard({ leagueId, feature, onChanged }: QuarterCelebrationCardProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function update(patch: { enabled?: boolean; public_enabled?: boolean }) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/features`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ ...feature, ...patch }),
      })
      if (!res.ok) throw new Error('Failed to save')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden mb-3">
      <div className="px-4 py-3 border-b border-slate-700/60">
        <div className="text-sm font-semibold text-slate-100">Quarter Celebration</div>
        <div className="text-xs text-slate-500 mt-0.5">
          Show the champion + awards card on the Results tab when a quarter wraps.
          Admins always see it; choose who else does.
        </div>
      </div>
      <div className="rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/60 border-b border-slate-700/60">
          <span className="text-sm text-slate-300">Members</span>
          <Toggle enabled={feature.enabled} onChange={(v) => update({ enabled: v })} disabled={saving} />
        </div>
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/60">
          <span className="text-sm text-slate-300">Public</span>
          <Toggle enabled={feature.public_enabled} onChange={(v) => update({ public_enabled: v })} disabled={saving} />
        </div>
      </div>
      {error && <div className="px-4 py-2 text-xs text-red-400">{error}</div>}
    </div>
  )
}
```

- [ ] **Step 2: Wire it into the Feature panel**

In `components/FeaturePanel.tsx`, add the import after the `PlayerStatsCard` import (line 3):

```ts
import { QuarterCelebrationCard } from '@/components/QuarterCelebrationCard'
```

Then render it after the `<PlayerStatsCard … />` block (after line 37, before the closing `</div>`):

```tsx
      <QuarterCelebrationCard
        leagueId={leagueId}
        feature={getFeature(features, 'quarter_celebration')}
        onChanged={onChanged}
      />
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/QuarterCelebrationCard.tsx components/FeaturePanel.tsx
git commit -m "feat: add quarter celebration toggle to the feature panel"
```

---

## Task 8: Migration — register + seed the flag

**Files:**
- Create: `supabase/migrations/20260709000001_seed_quarter_celebration.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260709000001_seed_quarter_celebration.sql`, mirroring `20260322000001_seed_stats_features.sql`:

```sql
-- Register the quarter_celebration feature as globally available
INSERT INTO feature_experiments (feature, available) VALUES
  ('quarter_celebration', true)
ON CONFLICT (feature) DO NOTHING;

-- Seed per-league rows for all existing leagues (admin-only by default)
INSERT INTO league_features (game_id, feature, enabled, public_enabled)
SELECT g.id, 'quarter_celebration', false, false
FROM games g
ON CONFLICT (game_id, feature) DO NOTHING;
```

- [ ] **Step 2: Note the manual apply step**

Migrations in this repo are run by hand via the Supabase SQL Editor (see repo convention in `supabase/migrations/`). Leave a note in the PR description that this migration must be run. No automated command to execute here.

Verification once applied (in the SQL editor):

```sql
SELECT * FROM feature_experiments WHERE feature = 'quarter_celebration';
SELECT count(*) FROM league_features WHERE feature = 'quarter_celebration';
```

Expected: one available=true experiment row; one league_features row per existing league.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260709000001_seed_quarter_celebration.sql
git commit -m "feat: seed quarter_celebration feature flag"
```

---

## Task 9: Full verification

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all suites PASS, including the new `sidebar-stats.celebration` and `quarter-celebration` files.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 4: Manual smoke test (dev server)**

Run: `npm run dev`, then:
- As an admin, record the last outstanding game of a calendar-past quarter → the result modal ends on the celebrate step showing the champion + awards, with a working "Share the glory" button.
- Visit the Results tab of a league whose previous quarter completed and whose current quarter has no played games yet → the champion card appears at the top. Record a game in the current quarter → the card disappears.
- In Settings → Features, toggle Quarter Celebration Members/Public off → confirm a member/public view hides the card while the admin still sees it.
```
