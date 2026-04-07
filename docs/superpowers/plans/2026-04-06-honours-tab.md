# Honours Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Honours" tab to each league page showing completed quarterly standings champions, grouped by year, visible to members and admins only.

**Architecture:** A new `computeAllCompletedQuarters` function in `lib/sidebar-stats.ts` derives all completed quarters from week data (completeness = no `unrecorded`/`scheduled` weeks in the quarter). A new server-side page route at `app/[leagueId]/honours/page.tsx` fetches weeks and passes computed data to a client `HonoursSection` component. Access is gated by visibility tier — public/unauthenticated visitors see `HonoursLoginPrompt`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, `@radix-ui/react-collapsible`, `lucide-react` (Trophy icon), Jest for unit tests.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `lib/sidebar-stats.ts` | Add `CompletedQuarter`, `HonoursYear` types + `computeAllCompletedQuarters` |
| Modify | `__tests__/sidebar-stats.test.ts` | Tests for `computeAllCompletedQuarters` |
| Create | `components/HonoursLoginPrompt.tsx` | Login prompt for unauthenticated/public visitors |
| Create | `components/HonoursSection.tsx` | Client component — year groups + collapsible quarter cards |
| Modify | `components/LeaguePageHeader.tsx` | Add Honours tab + Trophy icon |
| Create | `app/[leagueId]/honours/page.tsx` | Server route — fetches data, gates by tier |

---

## Task 1: Add `computeAllCompletedQuarters` to `lib/sidebar-stats.ts`

**Files:**
- Modify: `lib/sidebar-stats.ts`

The `aggregateWeeks` helper is already private in this file and can be called directly. `quarterOf` and `parseWeekDate` are also already present.

- [ ] **Step 1: Add the exported types after the existing `QuarterlyTableResult` interface (around line 100)**

Open `lib/sidebar-stats.ts` and add after the `QuarterlyTableResult` interface:

```ts
export interface CompletedQuarter {
  quarterLabel: string      // e.g. "Q1 25"
  year: number
  q: number
  champion: string          // top-ranked player name
  entries: QuarterlyEntry[] // full table, all players, sorted points desc → wins desc → name asc
}

export interface HonoursYear {
  year: number
  quarters: CompletedQuarter[] // sorted newest quarter first within year
}
```

- [ ] **Step 2: Add `computeAllCompletedQuarters` at the end of `lib/sidebar-stats.ts`**

```ts
// ─── computeAllCompletedQuarters ─────────────────────────────────────────────

export function computeAllCompletedQuarters(weeks: Week[]): HonoursYear[] {
  // Group all weeks by (year, q) bucket key
  const buckets = new Map<string, Week[]>()
  for (const w of weeks) {
    const d = parseWeekDate(w.date)
    const { q, year } = quarterOf(d)
    const key = `${year}-${q}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(w)
  }

  const completed: CompletedQuarter[] = []

  for (const [key, qWeeks] of buckets) {
    // A quarter is complete only when every week is played or cancelled.
    // A single unrecorded or scheduled week keeps the quarter hidden.
    const hasIncomplete = qWeeks.some(w => w.status === 'unrecorded' || w.status === 'scheduled')
    if (hasIncomplete) continue

    // Skip quarters with no played weeks (e.g. all-cancelled quarter has no rankings).
    const playedWeeks = qWeeks.filter(w => w.status === 'played')
    if (playedWeeks.length === 0) continue

    const [yearStr, qStr] = key.split('-')
    const year = Number(yearStr)
    const q = Number(qStr)
    const yy = String(year).slice(-2)
    const quarterLabel = `Q${q} ${yy}`

    // Full table — no cap. aggregateWeeks sorts points desc → wins desc → name asc.
    const entries = aggregateWeeks(playedWeeks)
    const champion = entries[0].name

    completed.push({ quarterLabel, year, q, champion, entries })
  }

  // Sort newest first overall, then group by year
  completed.sort((a, b) => b.year - a.year || b.q - a.q)

  const byYear = new Map<number, CompletedQuarter[]>()
  for (const c of completed) {
    if (!byYear.has(c.year)) byYear.set(c.year, [])
    byYear.get(c.year)!.push(c)
  }

  // Return years newest first; quarters within each year already newest-first from sort above
  return Array.from(byYear.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, quarters]) => ({ year, quarters }))
}
```

- [ ] **Step 3: Verify the file compiles**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/perth && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/sidebar-stats.ts
git commit -m "feat: add computeAllCompletedQuarters to sidebar-stats"
```

---

## Task 2: Test `computeAllCompletedQuarters`

**Files:**
- Modify: `__tests__/sidebar-stats.test.ts`

The existing file already has `makeWeek` and `makePlayer` helpers at the top — reuse them.

- [ ] **Step 1: Add tests at the bottom of `__tests__/sidebar-stats.test.ts`**

```ts
// ─── computeAllCompletedQuarters ─────────────────────────────────────────────

import { computeAllCompletedQuarters } from '@/lib/sidebar-stats'

describe('computeAllCompletedQuarters', () => {
  it('returns empty array when there are no weeks', () => {
    expect(computeAllCompletedQuarters([])).toEqual([])
  })

  it('returns a completed quarter when all weeks are played or cancelled and at least one is played', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '13 Jan 2025', status: 'cancelled', teamA: [], teamB: [], winner: null }),
    ]
    const result = computeAllCompletedQuarters(weeks)
    expect(result).toHaveLength(1)
    expect(result[0].year).toBe(2025)
    expect(result[0].quarters).toHaveLength(1)
    expect(result[0].quarters[0].quarterLabel).toBe('Q1 25')
    expect(result[0].quarters[0].champion).toBe('Alice')
  })

  it('excludes a quarter that has an unrecorded week', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '13 Jan 2025', status: 'unrecorded', teamA: [], teamB: [], winner: null }),
    ]
    expect(computeAllCompletedQuarters(weeks)).toEqual([])
  })

  it('excludes a quarter that has a scheduled week', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '13 Jan 2025', status: 'scheduled', teamA: [], teamB: [], winner: null }),
    ]
    expect(computeAllCompletedQuarters(weeks)).toEqual([])
  })

  it('excludes a quarter where all weeks are cancelled (no played weeks)', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', status: 'cancelled', teamA: [], teamB: [], winner: null }),
    ]
    expect(computeAllCompletedQuarters(weeks)).toEqual([])
  })

  it('returns the full player table, not capped at 5', () => {
    const players = ['A','B','C','D','E','F','G']
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: players.slice(0, 4), teamB: players.slice(4), winner: 'teamA' }),
    ]
    const result = computeAllCompletedQuarters(weeks)
    expect(result[0].quarters[0].entries).toHaveLength(7)
  })

  it('champion is the highest-points player', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '13 Jan 2025', teamA: ['Bob'], teamB: ['Alice'], winner: 'teamA' }),
      makeWeek({ week: 3, date: '20 Jan 2025', teamA: ['Bob'], teamB: ['Alice'], winner: 'teamA' }),
    ]
    // Bob: 2 wins = 6 pts. Alice: 1 win = 3 pts.
    const result = computeAllCompletedQuarters(weeks)
    expect(result[0].quarters[0].champion).toBe('Bob')
  })

  it('groups quarters by year, newest year first', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2024', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '06 Jan 2025', teamA: ['Bob'], teamB: ['Alice'], winner: 'teamA' }),
    ]
    const result = computeAllCompletedQuarters(weeks)
    expect(result[0].year).toBe(2025)
    expect(result[1].year).toBe(2024)
  })

  it('sorts quarters within a year newest-first (Q4 before Q3)', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q1
      makeWeek({ week: 2, date: '06 Apr 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q2
      makeWeek({ week: 3, date: '06 Jul 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q3
      makeWeek({ week: 4, date: '06 Oct 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q4
    ]
    const result = computeAllCompletedQuarters(weeks)
    expect(result[0].year).toBe(2025)
    const qs = result[0].quarters.map(q => q.q)
    expect(qs).toEqual([4, 3, 2, 1])
  })

  it('handles multiple quarters across multiple years', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '06 Oct 2024', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q4 2024
      makeWeek({ week: 2, date: '06 Jan 2025', teamA: ['Bob'], teamB: ['Alice'], winner: 'teamA' }), // Q1 2025
    ]
    const result = computeAllCompletedQuarters(weeks)
    expect(result).toHaveLength(2)
    expect(result[0].year).toBe(2025)
    expect(result[0].quarters[0].quarterLabel).toBe('Q1 25')
    expect(result[1].year).toBe(2024)
    expect(result[1].quarters[0].quarterLabel).toBe('Q4 24')
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/perth && npx jest __tests__/sidebar-stats.test.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests pass (including the new `computeAllCompletedQuarters` describe block).

- [ ] **Step 3: Commit**

```bash
git add __tests__/sidebar-stats.test.ts
git commit -m "test: add computeAllCompletedQuarters tests"
```

---

## Task 3: Create `HonoursLoginPrompt` component

**Files:**
- Create: `components/HonoursLoginPrompt.tsx`

Modelled directly on `components/LineupLabLoginPrompt.tsx`.

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { Lock } from 'lucide-react'
import { AuthDialog } from '@/components/AuthDialog'

interface HonoursLoginPromptProps {
  leagueId: string
}

export function HonoursLoginPrompt({ leagueId }: HonoursLoginPromptProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
        <Lock size={22} className="text-slate-500" />
      </div>
      <div className="flex flex-col items-center gap-1">
        <p className="text-slate-100 font-semibold text-base">Sign in to view Honours</p>
        <p className="text-slate-500 text-sm max-w-xs">
          See quarterly champions and standings for your league.
        </p>
      </div>
      <AuthDialog
        redirect={`/${leagueId}/honours`}
        trigger={(openSignIn) => (
          <button
            onClick={openSignIn}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-5 py-2 rounded-md transition-colors"
          >
            Sign in
          </button>
        )}
      />
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/perth && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/HonoursLoginPrompt.tsx
git commit -m "feat: add HonoursLoginPrompt component"
```

---

## Task 4: Create `HonoursSection` component

**Files:**
- Create: `components/HonoursSection.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useState } from 'react'
import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompletedQuarter, HonoursYear } from '@/lib/sidebar-stats'

interface HonoursSectionProps {
  data: HonoursYear[]
}

function QuarterCard({
  quarter,
  isOpen,
  onToggle,
}: {
  quarter: CompletedQuarter
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <Collapsible.Root open={isOpen} onOpenChange={onToggle}>
      <div className="rounded-lg border border-slate-700 overflow-hidden">
        {/* Header — always visible */}
        <Collapsible.Trigger asChild>
          <button className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.02] transition-colors">
            <span className="text-xs font-semibold uppercase tracking-widest text-slate-500 shrink-0">
              {quarter.quarterLabel}
            </span>
            <span className="text-sm font-bold text-amber-300 uppercase flex-1 truncate">
              {quarter.champion}
            </span>
            <span className="text-sm leading-none shrink-0">🏆</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200',
                isOpen && 'rotate-180'
              )}
            />
          </button>
        </Collapsible.Trigger>

        {/* Body — collapsible */}
        <Collapsible.Content>
          <div className="border-t border-slate-700/40 px-3 py-3">
            {/* Column headers */}
            <div className="flex items-center gap-1 pb-2 mb-1 border-b border-slate-700/40">
              <span className="flex-1 text-[10px] font-semibold uppercase text-slate-500">Player</span>
              <span className="w-[22px] text-center text-[10px] font-semibold uppercase text-slate-700">P</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">W</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">D</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">L</span>
              <span className="w-[28px] text-right text-[10px] font-semibold uppercase text-slate-500">Pts</span>
            </div>

            {/* Full standings table */}
            <div className="flex flex-col gap-[2px]">
              {quarter.entries.map((e, i) => (
                <div
                  key={e.name}
                  className={cn(
                    'flex items-center gap-1 py-[3px]',
                    i === 0 ? '-mx-3 px-3 bg-sky-400/[0.06]' : '-mx-1 px-1'
                  )}
                >
                  <span className={cn(
                    'text-[11px] w-[14px] text-left shrink-0',
                    i === 0 ? 'font-bold text-sky-400' : 'text-slate-600'
                  )}>
                    {i + 1}
                  </span>
                  <span className={cn(
                    'text-[13px] flex-1 truncate',
                    i === 0 ? 'font-semibold text-slate-100' : 'text-slate-400'
                  )}>
                    {e.name}
                  </span>
                  <span className="text-[11px] text-slate-600 w-[22px] text-center shrink-0">{e.played}</span>
                  <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">{e.won}</span>
                  <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">{e.drew}</span>
                  <span className="text-[11px] text-slate-600 w-[18px] text-center shrink-0">{e.lost}</span>
                  <span className={cn(
                    'text-[12px] font-bold w-[28px] text-right shrink-0',
                    i === 0 ? 'text-sky-300' : 'text-slate-300'
                  )}>
                    {e.points}
                  </span>
                </div>
              ))}
            </div>

            {/* Champion banner */}
            <div className="border-t border-slate-700/40 mt-3 pt-3">
              <div className="flex items-center justify-between bg-amber-400/[0.07] border border-amber-400/[0.14] rounded-md px-[10px] py-[6px]">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-600">
                    {quarter.quarterLabel} Champion
                  </p>
                  <p className="text-[13px] font-bold text-yellow-200 uppercase">{quarter.champion}</p>
                </div>
                <span className="text-lg leading-none">🏆</span>
              </div>
            </div>
          </div>
        </Collapsible.Content>
      </div>
    </Collapsible.Root>
  )
}

export function HonoursSection({ data }: HonoursSectionProps) {
  // Build a flat key for each quarter to track which is open.
  // Default: open the very first quarter (most recent overall).
  const firstKey = data.length > 0 && data[0].quarters.length > 0
    ? `${data[0].year}-${data[0].quarters[0].q}`
    : null
  const [openKey, setOpenKey] = useState<string | null>(firstKey)

  if (data.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">No completed quarters yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {data.map((yearGroup) => (
        <div key={yearGroup.year}>
          {/* Year divider — same style as MonthDivider */}
          <div className="flex items-center gap-3 px-1 py-1 mt-4 mb-2 first:mt-0">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-xs font-medium tracking-wider text-slate-600 uppercase">
              {yearGroup.year}
            </span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          <div className="flex flex-col gap-2">
            {yearGroup.quarters.map((quarter) => {
              const key = `${yearGroup.year}-${quarter.q}`
              return (
                <QuarterCard
                  key={key}
                  quarter={quarter}
                  isOpen={openKey === key}
                  onToggle={() => setOpenKey(openKey === key ? null : key)}
                />
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/perth && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/HonoursSection.tsx
git commit -m "feat: add HonoursSection component"
```

---

## Task 5: Add Honours tab to `LeaguePageHeader`

**Files:**
- Modify: `components/LeaguePageHeader.tsx`

- [ ] **Step 1: Add `Trophy` to the lucide-react import and `'honours'` to the `currentTab` union**

Find the import line (line 2):
```ts
import { ClipboardList, Users, FlaskConical } from 'lucide-react'
```
Replace with:
```ts
import { ClipboardList, Users, Trophy, FlaskConical } from 'lucide-react'
```

Find the `currentTab` type in the interface (line 14):
```ts
  currentTab: 'results' | 'players' | 'lineup-lab'
```
Replace with:
```ts
  currentTab: 'results' | 'players' | 'honours' | 'lineup-lab'
```

- [ ] **Step 2: Add the Honours tab link between Players and Lineup Lab**

Find the Players `<Link>` block and the Lineup Lab `<Link>` block. Insert the Honours link between them:

```tsx
        <Link
          href={`/${leagueId}/honours`}
          className={cn(
            '-mb-px flex items-center gap-2 border-b-2 pb-2 text-sm font-medium',
            currentTab === 'honours'
              ? 'border-slate-200 text-slate-200'
              : 'border-transparent text-slate-400 hover:text-slate-300'
          )}
        >
          <Trophy className="size-3.5" />
          Honours
        </Link>
```

The final tab order in the `<nav>` should be: Results · Players · Honours · Lineup Lab.

- [ ] **Step 3: Verify it compiles**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/perth && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/LeaguePageHeader.tsx
git commit -m "feat: add Honours tab to LeaguePageHeader"
```

---

## Task 6: Create the Honours page route

**Files:**
- Create: `app/[leagueId]/honours/page.tsx`

Follows the exact same pattern as `app/[leagueId]/lineup-lab/page.tsx`.

- [ ] **Step 1: Create the file**

```tsx
// app/[leagueId]/honours/page.tsx
export const dynamic = 'force-dynamic'

import { resolveVisibilityTier } from '@/lib/roles'
import { getGame, getAuthAndRole, getFeatures, getPlayerStats, getWeeks, getJoinRequestStatus, getPendingBadgeCount, getMyClaimStatus } from '@/lib/fetchers'
import { isFeatureEnabled } from '@/lib/features'
import { computeAllCompletedQuarters } from '@/lib/sidebar-stats'
import { LeaguePageHeader } from '@/components/LeaguePageHeader'
import { HonoursSection } from '@/components/HonoursSection'
import { HonoursLoginPrompt } from '@/components/HonoursLoginPrompt'
import { StatsSidebar } from '@/components/StatsSidebar'
import { MobileStatsFAB } from '@/components/MobileStatsFAB'
import { ClaimOnboardingBanner } from '@/components/ClaimOnboardingBanner'
import type { LeagueDetails, JoinRequestStatus } from '@/lib/types'

interface Props {
  params: Promise<{ leagueId: string }>
}

export default async function HonoursPage({ params }: Props) {
  const { leagueId } = await params

  const [{ user, userRole, isAuthenticated }, game, features, players, weeks, pendingRequestCount] = await Promise.all([
    getAuthAndRole(leagueId),
    getGame(leagueId),
    getFeatures(leagueId),
    getPlayerStats(leagueId),
    getWeeks(leagueId),
    getPendingBadgeCount(leagueId),
  ])

  // Resolve joinStatus for the Join/Share button
  let joinStatus: JoinRequestStatus | 'member' | 'not-member' | null = null
  if (!isAuthenticated) {
    joinStatus = null
  } else if (userRole !== null) {
    joinStatus = 'member'
  } else {
    joinStatus = await getJoinRequestStatus(leagueId, user!.id)
  }

  const tier = resolveVisibilityTier(userRole)
  const isAdmin = tier === 'admin'
  const canSeeStatsSidebar = isAdmin || isFeatureEnabled(features, 'stats_sidebar', tier)

  // Show onboarding banner for non-admin members with no claim.
  let showClaimBanner = false
  if (tier === 'member') {
    const claimStatus = await getMyClaimStatus(leagueId)
    showClaimBanner = claimStatus === 'none'
  }

  const playedWeeks = weeks.filter((w) => w.status === 'played' || w.status === 'cancelled')
  const playedCount = playedWeeks.length
  const totalWeeks = 52
  const pct = Math.round((playedCount / totalWeeks) * 100)

  const details: LeagueDetails = {
    location: game!.location ?? null,
    day: game!.day ?? null,
    kickoff_time: game!.kickoff_time ?? null,
    bio: game!.bio ?? null,
    player_count: players.length,
  }

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
            currentTab="honours"
            isAdmin={isAdmin}
            details={details}
            joinStatus={joinStatus}
            pendingRequestCount={pendingRequestCount}
          />
          {showClaimBanner && <ClaimOnboardingBanner leagueId={leagueId} />}
          {tier === 'public' || !isAuthenticated ? (
            <HonoursLoginPrompt leagueId={leagueId} />
          ) : (
            <HonoursSection data={computeAllCompletedQuarters(weeks)} />
          )}
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
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/perth && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Run all tests to confirm nothing broken**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/perth && npx jest --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/[leagueId]/honours/page.tsx
git commit -m "feat: add Honours page route"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run the full test suite one more time**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/perth && npx jest --no-coverage 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 2: Run a full TypeScript check**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/perth && npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 3: Check git log looks clean**

```bash
git log --oneline -8
```

Expected: 6 clean commits for this feature on top of the branch.
