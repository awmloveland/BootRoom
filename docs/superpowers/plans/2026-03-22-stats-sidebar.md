# Stats Sidebar Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sticky desktop-only sidebar with three independently feature-flagged stat widgets (Most In Form, Quarterly Table, Team A vs Team B) to the Results, Players, and Lineup Lab tab pages.

**Architecture:** Pure client-side computation from already-fetched `players` and `weeks` props; no new API routes or RPCs. A new `lib/sidebar-stats.ts` module holds all pure computation functions (unit-tested). A new `components/StatsSidebar.tsx` renders the three widgets and gates each behind its feature flag. All three tab pages gain a two-column layout wrapper that keeps the content column at `max-w-2xl` and places the sidebar at `w-72 sticky` outside it on `lg+` screens.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS v3, Supabase, Jest + ts-jest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/types.ts` | Modify | Add 3 new `FeatureKey` values |
| `lib/defaults.ts` | Modify | Add 3 `DEFAULT_FEATURES` entries |
| `lib/sidebar-stats.ts` | Create | Pure computation functions: `computeInForm`, `computeQuarterlyTable`, `computeTeamAB` |
| `__tests__/sidebar-stats.test.ts` | Create | Unit tests for all three computation functions |
| `components/StatsSidebar.tsx` | Create | React component — renders up to 3 widgets based on feature flags |
| `components/FeaturePanel.tsx` | Modify | Add `StatsFeatureRow` sub-component + Stats section |
| `app/[leagueId]/results/page.tsx` | Modify | Two-column layout wrapper + `StatsSidebar` (already has `weeks` and `players`) |
| `app/[leagueId]/players/page.tsx` | Modify | Add weeks fetch; two-column layout wrapper + `StatsSidebar` |
| `app/[leagueId]/lineup-lab/page.tsx` | Modify | Add weeks fetch; two-column layout wrapper + `StatsSidebar` |
| `supabase/migrations/20260322000001_seed_stats_features.sql` | Create | Seed `feature_experiments` + `league_features` for 3 new keys |

---

## Task 1: Add feature keys and defaults

**Files:**
- Modify: `lib/types.ts`
- Modify: `lib/defaults.ts`

- [ ] **Step 1: Add 3 keys to the `FeatureKey` union in `lib/types.ts`**

In `lib/types.ts`, find the `FeatureKey` type and append the three new values:

```ts
export type FeatureKey =
  | 'match_history'
  | 'match_entry'
  | 'team_builder'
  | 'player_stats'
  | 'player_comparison'
  | 'stats_in_form'
  | 'stats_quarterly_table'
  | 'stats_team_ab';
```

- [ ] **Step 2: Add 3 entries to `DEFAULT_FEATURES` in `lib/defaults.ts`**

Append to the array:

```ts
  { feature: 'stats_in_form',         enabled: false, config: null, public_enabled: false, public_config: null },
  { feature: 'stats_quarterly_table', enabled: false, config: null, public_enabled: false, public_config: null },
  { feature: 'stats_team_ab',         enabled: false, config: null, public_enabled: false, public_config: null },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/nairobi
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/defaults.ts
git commit -m "feat: add stats sidebar feature keys and defaults"
```

---

## Task 2: Create migration

**Files:**
- Create: `supabase/migrations/20260322000001_seed_stats_features.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Register the three stats features as globally available
INSERT INTO feature_experiments (feature, available) VALUES
  ('stats_in_form',         true),
  ('stats_quarterly_table', true),
  ('stats_team_ab',         true)
ON CONFLICT (feature) DO NOTHING;

-- Seed per-league rows for all existing leagues (admin-only by default)
INSERT INTO league_features (game_id, feature, enabled, public_enabled)
SELECT g.id, feat, false, false
FROM games g
CROSS JOIN (VALUES
  ('stats_in_form'),
  ('stats_quarterly_table'),
  ('stats_team_ab')
) AS t(feat)
ON CONFLICT (game_id, feature) DO NOTHING;
```

- [ ] **Step 2: Run the migration**

Apply via the Supabase SQL Editor (paste and execute). Verify by checking that `feature_experiments` has 3 new rows and `league_features` has 3 new rows per existing league.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260322000001_seed_stats_features.sql
git commit -m "feat: migrate stats sidebar feature flags"
```

---

## Task 3: Computation functions + tests

**Files:**
- Create: `lib/sidebar-stats.ts`
- Create: `__tests__/sidebar-stats.test.ts`

### Step overview: write each test → verify it fails → implement → verify it passes → next test

- [ ] **Step 1: Create `__tests__/sidebar-stats.test.ts` with the `computeInForm` tests**

```ts
import { computeInForm, computeQuarterlyTable, computeTeamAB } from '@/lib/sidebar-stats'
import type { Player, Week } from '@/lib/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Player> & { name: string }): Player {
  return {
    played: 10,
    won: 5, drew: 2, lost: 3,
    timesTeamA: 5, timesTeamB: 5,
    winRate: 50,
    qualified: true,
    points: 17,
    goalkeeper: false,
    mentality: 'balanced',
    rating: 2,
    recentForm: 'WWWWW',
    ...overrides,
  }
}

function makeWeek(overrides: Partial<Week> & { week: number }): Week {
  return {
    date: '01 Jan 2026',
    status: 'played',
    teamA: ['Alice', 'Bob'],
    teamB: ['Charlie', 'Dave'],
    winner: 'teamA',
    ...overrides,
  }
}

// ─── computeInForm ────────────────────────────────────────────────────────────

describe('computeInForm', () => {
  it('excludes players with played < 5', () => {
    const players = [
      makePlayer({ name: 'Alice', played: 4, recentForm: 'WWWW' }),
      makePlayer({ name: 'Bob',   played: 5, recentForm: 'WWWWW' }),
    ]
    const result = computeInForm(players)
    expect(result.map(r => r.name)).toEqual(['Bob'])
  })

  it('computes PPG correctly: W=3 D=1 L=0', () => {
    const players = [
      makePlayer({ name: 'Alice', played: 5, recentForm: 'WWWWW' }), // 15/5 = 3.0
      makePlayer({ name: 'Bob',   played: 5, recentForm: 'WDDLL' }), // 5/5  = 1.0
    ]
    const result = computeInForm(players)
    expect(result[0].name).toBe('Alice')
    expect(result[0].ppg).toBeCloseTo(3.0)
    expect(result[1].ppg).toBeCloseTo(1.0)
  })

  it('uses count of non-dash chars as denominator, not 5', () => {
    // '--WLW': 3 games played, points = 3+0+3 = 6, PPG = 6/3 = 2.0
    const players = [makePlayer({ name: 'Alice', played: 5, recentForm: '--WLW' })]
    const result = computeInForm(players)
    expect(result[0].ppg).toBeCloseTo(2.0)
  })

  it('returns at most 5 players sorted descending by PPG', () => {
    const players = Array.from({ length: 8 }, (_, i) =>
      makePlayer({ name: `P${i}`, played: 5, recentForm: 'W'.repeat(5 - i) + 'L'.repeat(i) })
    )
    const result = computeInForm(players)
    expect(result).toHaveLength(5)
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].ppg).toBeGreaterThanOrEqual(result[i].ppg)
    }
  })

  it('returns empty array when no qualifying players', () => {
    const players = [makePlayer({ name: 'Alice', played: 3 })]
    expect(computeInForm(players)).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL (module not found)**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/nairobi
npx jest __tests__/sidebar-stats.test.ts --no-coverage 2>&1 | head -20
```

Expected: `Cannot find module '@/lib/sidebar-stats'`

- [ ] **Step 3: Create `lib/sidebar-stats.ts` — implement `computeInForm` only**

```ts
import { parseWeekDate } from '@/lib/utils'
import type { Player, Week } from '@/lib/types'

// ─── computeInForm ────────────────────────────────────────────────────────────

export interface InFormEntry {
  name: string
  recentForm: string
  ppg: number
}

export function computeInForm(players: Player[]): InFormEntry[] {
  return players
    .filter(p => p.played >= 5)
    .map(p => {
      const chars = p.recentForm.split('').filter(c => c !== '-')
      if (chars.length === 0) return { name: p.name, recentForm: p.recentForm, ppg: 0 }
      const points = chars.reduce((acc, c) => acc + (c === 'W' ? 3 : c === 'D' ? 1 : 0), 0)
      return { name: p.name, recentForm: p.recentForm, ppg: points / chars.length }
    })
    .sort((a, b) => b.ppg - a.ppg)
    .slice(0, 5)
}

// ─── computeQuarterlyTable ────────────────────────────────────────────────────

export interface QuarterlyEntry {
  name: string
  played: number
  won: number
  drew: number
  lost: number
  points: number
}

export interface QuarterlyTableResult {
  quarterLabel: string          // e.g. 'Q1 2026'
  entries: QuarterlyEntry[]     // top 5
  lastChampion: string | null   // name, or null if no previous quarter data
  lastQuarterLabel: string | null // e.g. 'Q4 2025'
}

function quarterOf(d: Date): { q: number; year: number } {
  return { q: Math.floor(d.getMonth() / 3) + 1, year: d.getFullYear() }
}

function weekInQuarter(week: Week, q: number, year: number): boolean {
  const d = parseWeekDate(week.date)
  const wq = quarterOf(d)
  return wq.q === q && wq.year === year
}

function aggregateWeeks(weeks: Week[]): QuarterlyEntry[] {
  const map = new Map<string, QuarterlyEntry>()
  for (const w of weeks) {
    if (w.status !== 'played') continue
    const allPlayers = [...w.teamA, ...w.teamB]
    for (const name of allPlayers) {
      if (!map.has(name)) map.set(name, { name, played: 0, won: 0, drew: 0, lost: 0, points: 0 })
      const e = map.get(name)!
      e.played++
      const onTeamA = w.teamA.includes(name)
      if (w.winner === 'draw') { e.drew++; e.points += 1 }
      else if ((w.winner === 'teamA' && onTeamA) || (w.winner === 'teamB' && !onTeamA)) { e.won++; e.points += 3 }
      else { e.lost++ }
    }
  }
  return [...map.values()].sort((a, b) => b.points - a.points || b.won - a.won || a.name.localeCompare(b.name))
}

export function computeQuarterlyTable(weeks: Week[], now: Date = new Date()): QuarterlyTableResult {
  const { q, year } = quarterOf(now)
  const quarterLabel = `Q${q} ${year}`

  const currentWeeks = weeks.filter(w => weekInQuarter(w, q, year))
  const entries = aggregateWeeks(currentWeeks).slice(0, 5)

  // Previous quarter
  const prevQ = q === 1 ? 4 : q - 1
  const prevYear = q === 1 ? year - 1 : year
  const prevWeeks = weeks.filter(w => weekInQuarter(w, prevQ, prevYear))
  const prevEntries = aggregateWeeks(prevWeeks)
  const lastChampion = prevEntries.length > 0 ? prevEntries[0].name : null
  const lastQuarterLabel = prevEntries.length > 0 ? `Q${prevQ} ${prevYear}` : null

  return { quarterLabel, entries, lastChampion, lastQuarterLabel }
}

// ─── computeTeamAB ────────────────────────────────────────────────────────────

export interface TeamABResult {
  teamAWins: number
  draws: number
  teamBWins: number
  total: number
  streakTeam: 'teamA' | 'teamB' | 'draw' | null  // null = no streak (alternating)
  streakLength: number
}

export function computeTeamAB(weeks: Week[]): TeamABResult {
  const played = weeks.filter(w => w.status === 'played')
  const teamAWins = played.filter(w => w.winner === 'teamA').length
  const draws     = played.filter(w => w.winner === 'draw').length
  const teamBWins = played.filter(w => w.winner === 'teamB').length

  // Streak: walk from newest to oldest
  const sorted = [...played].sort((a, b) => b.week - a.week)
  let streakTeam: TeamABResult['streakTeam'] = null
  let streakLength = 0
  for (const w of sorted) {
    if (streakTeam === null) {
      streakTeam = w.winner as TeamABResult['streakTeam']
      streakLength = 1
    } else if (w.winner === streakTeam) {
      streakLength++
    } else {
      break
    }
  }

  return { teamAWins, draws, teamBWins, total: played.length, streakTeam, streakLength }
}
```

- [ ] **Step 4: Run `computeInForm` tests — expect PASS**

```bash
npx jest __tests__/sidebar-stats.test.ts --no-coverage -t "computeInForm"
```

Expected: 5 tests passing.

- [ ] **Step 5: Add `computeQuarterlyTable` tests to `__tests__/sidebar-stats.test.ts`**

Append to the test file:

```ts
// ─── computeQuarterlyTable ────────────────────────────────────────────────────

describe('computeQuarterlyTable', () => {
  it('includes only played weeks in the current quarter', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '15 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '15 Apr 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }), // Q2 — excluded
      makeWeek({ week: 3, date: '20 Jan 2026', status: 'cancelled', teamA: [], teamB: [], winner: null }), // excluded
    ]
    const now = new Date(2026, 0, 22) // Jan = Q1
    const result = computeQuarterlyTable(weeks, now)
    expect(result.quarterLabel).toBe('Q1 2026')
    expect(result.entries.map(e => e.name)).toContain('Alice')
    expect(result.entries.find(e => e.name === 'Bob')?.won).toBe(0)
  })

  it('accumulates W/D/L and points correctly', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice', 'Bob'], teamB: ['Charlie'], winner: 'teamA' }),
      makeWeek({ week: 2, date: '12 Jan 2026', teamA: ['Alice'], teamB: ['Charlie', 'Bob'], winner: 'draw' }),
    ]
    const now = new Date(2026, 0, 22)
    const result = computeQuarterlyTable(weeks, now)
    const alice = result.entries.find(e => e.name === 'Alice')!
    expect(alice.won).toBe(1)
    expect(alice.drew).toBe(1)
    expect(alice.points).toBe(4) // 3 + 1
  })

  it('returns at most 5 entries sorted by points desc', () => {
    const players = ['A','B','C','D','E','F']
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '05 Jan 2026', teamA: players.slice(0,3), teamB: players.slice(3), winner: 'teamA' }),
    ]
    const result = computeQuarterlyTable(weeks, new Date(2026, 0, 22))
    expect(result.entries.length).toBeLessThanOrEqual(5)
    for (let i = 1; i < result.entries.length; i++) {
      expect(result.entries[i-1].points).toBeGreaterThanOrEqual(result.entries[i].points)
    }
  })

  it('identifies last quarter champion', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, date: '10 Dec 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }), // Q4 2025
    ]
    const now = new Date(2026, 0, 22) // Q1 2026 — prev is Q4 2025
    const result = computeQuarterlyTable(weeks, now)
    expect(result.lastChampion).toBe('Alice')
    expect(result.lastQuarterLabel).toBe('Q4 2025')
  })

  it('returns null lastChampion when no previous quarter data', () => {
    const result = computeQuarterlyTable([], new Date(2026, 0, 22))
    expect(result.lastChampion).toBeNull()
    expect(result.entries).toHaveLength(0)
  })

  it('handles Q1 rollover correctly (prev = Q4 of prior year)', () => {
    const now = new Date(2026, 0, 15) // Q1 2026
    const result = computeQuarterlyTable([], now)
    expect(result.lastQuarterLabel).toBeNull() // no data
    expect(result.quarterLabel).toBe('Q1 2026')
  })
})
```

- [ ] **Step 6: Run `computeQuarterlyTable` tests — expect PASS**

```bash
npx jest __tests__/sidebar-stats.test.ts --no-coverage -t "computeQuarterlyTable"
```

Expected: 6 tests passing.

- [ ] **Step 7: Add `computeTeamAB` tests to `__tests__/sidebar-stats.test.ts`**

Append:

```ts
// ─── computeTeamAB ────────────────────────────────────────────────────────────

describe('computeTeamAB', () => {
  it('counts wins and draws correctly', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, winner: 'teamA' }),
      makeWeek({ week: 2, winner: 'teamA' }),
      makeWeek({ week: 3, winner: 'teamB' }),
      makeWeek({ week: 4, winner: 'draw'  }),
    ]
    const r = computeTeamAB(weeks)
    expect(r.teamAWins).toBe(2)
    expect(r.teamBWins).toBe(1)
    expect(r.draws).toBe(1)
    expect(r.total).toBe(4)
  })

  it('ignores cancelled weeks', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, winner: 'teamA' }),
      makeWeek({ week: 2, status: 'cancelled', winner: null }),
    ]
    const r = computeTeamAB(weeks)
    expect(r.total).toBe(1)
  })

  it('computes current streak correctly', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, winner: 'teamB' }),
      makeWeek({ week: 2, winner: 'teamA' }),
      makeWeek({ week: 3, winner: 'teamA' }),
      makeWeek({ week: 4, winner: 'teamA' }), // newest
    ]
    const r = computeTeamAB(weeks)
    expect(r.streakTeam).toBe('teamA')
    expect(r.streakLength).toBe(3)
  })

  it('streak of 1 when last two differ', () => {
    const weeks: Week[] = [
      makeWeek({ week: 1, winner: 'teamA' }),
      makeWeek({ week: 2, winner: 'teamB' }), // newest
    ]
    const r = computeTeamAB(weeks)
    expect(r.streakTeam).toBe('teamB')
    expect(r.streakLength).toBe(1)
  })

  it('returns zero totals and null streak for empty input', () => {
    const r = computeTeamAB([])
    expect(r.total).toBe(0)
    expect(r.streakTeam).toBeNull()
    expect(r.streakLength).toBe(0)
  })
})
```

- [ ] **Step 8: Run all sidebar-stats tests — expect all PASS**

```bash
npx jest __tests__/sidebar-stats.test.ts --no-coverage
```

Expected: all tests passing (16 total).

- [ ] **Step 9: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "feat: add sidebar stats computation functions with tests"
```

---

## Task 4: Create `StatsSidebar` component

**Files:**
- Create: `components/StatsSidebar.tsx`

The component gates each widget using `isFeatureEnabled` from `lib/features.ts`. Import `FormDots` from `components/FormDots.tsx` for the in-form widget.

- [ ] **Step 1: Create `components/StatsSidebar.tsx`**

```tsx
'use client'

import { cn } from '@/lib/utils'
import { isFeatureEnabled } from '@/lib/features'
import { resolveVisibilityTier } from '@/lib/roles'
import { computeInForm, computeQuarterlyTable, computeTeamAB } from '@/lib/sidebar-stats'
import { FormDots } from '@/components/FormDots'
import type { Player, Week, LeagueFeature, GameRole } from '@/lib/types'

interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  features: LeagueFeature[]
  role: GameRole | null
}

function WidgetShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800">
      <div className="px-3 py-2 border-b border-slate-700/60 text-xs font-semibold text-slate-400 uppercase tracking-wide">
        {title}
      </div>
      <div className="px-3 py-3">{children}</div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-slate-500 text-center py-4">{message}</p>
}

// ─── Widget 1: Most In Form ───────────────────────────────────────────────────

function InFormWidget({ players }: { players: Player[] }) {
  const entries = computeInForm(players)
  return (
    <WidgetShell title="Most In Form">
      {entries.length === 0 ? (
        <EmptyState message="Not enough data yet" />
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.name} className="flex items-center justify-between gap-2">
              <span className="text-sm text-slate-200 truncate">{e.name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <FormDots form={e.recentForm} />
                <span className="text-xs text-slate-400 w-14 text-right">
                  {e.ppg.toFixed(1)} pts/g
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </WidgetShell>
  )
}

// ─── Widget 2: Quarterly Table ────────────────────────────────────────────────

function QuarterlyTableWidget({ weeks }: { weeks: Week[] }) {
  const { quarterLabel, entries, lastChampion, lastQuarterLabel } = computeQuarterlyTable(weeks)
  return (
    <WidgetShell title={quarterLabel}>
      {entries.length === 0 ? (
        <EmptyState message="Quarter just started" />
      ) : (
        <>
          <div className="space-y-1">
            {entries.map((e, i) => (
              <div key={e.name} className="flex items-center gap-2 text-sm">
                <span className="text-slate-600 w-4 shrink-0 text-right">{i + 1}</span>
                <span className="text-slate-200 flex-1 truncate">{e.name}</span>
                <span className="text-slate-500 text-xs w-6 text-center">{e.played}</span>
                <span className="text-xs w-6 text-center shrink-0 font-medium text-slate-300">{e.won}</span>
                <span className="text-xs w-6 text-center shrink-0 text-slate-500">{e.drew}</span>
                <span className="text-xs w-6 text-center shrink-0 text-slate-500">{e.lost}</span>
                <span className="text-xs w-8 text-right shrink-0 font-semibold text-slate-100">{e.points}</span>
              </div>
            ))}
          </div>
          {/* Column headers */}
          <div className="flex items-center gap-2 text-xs text-slate-600 mt-2 pt-2 border-t border-slate-700/60">
            <span className="w-4 shrink-0" />
            <span className="flex-1" />
            <span className="w-6 text-center shrink-0">P</span>
            <span className="w-6 text-center shrink-0">W</span>
            <span className="w-6 text-center shrink-0">D</span>
            <span className="w-6 text-center shrink-0">L</span>
            <span className="w-8 text-right shrink-0">Pts</span>
          </div>
          {lastChampion && (
            <div className="mt-3 pt-2 border-t border-slate-700/60 text-xs text-slate-500">
              <span className="text-slate-600">{lastQuarterLabel} Champion · </span>
              <span className="text-slate-400">{lastChampion}</span>
            </div>
          )}
        </>
      )}
    </WidgetShell>
  )
}

// ─── Widget 3: Team A vs Team B ───────────────────────────────────────────────

function TeamABWidget({ weeks }: { weeks: Week[] }) {
  const { teamAWins, draws, teamBWins, total, streakTeam, streakLength } = computeTeamAB(weeks)

  const streakLabel =
    streakTeam === 'teamA' ? `Team A · ${streakLength} in a row` :
    streakTeam === 'teamB' ? `Team B · ${streakLength} in a row` :
    streakTeam === 'draw'  ? 'Draw' :
    null

  return (
    <WidgetShell title="Team A vs Team B">
      {total === 0 ? (
        <EmptyState message="No results yet" />
      ) : (
        <>
          <div className="flex justify-between mb-1 text-sm font-semibold">
            <span className="text-blue-300">{teamAWins}</span>
            <span className="text-slate-400">{draws}</span>
            <span className="text-violet-300">{teamBWins}</span>
          </div>
          <div className="flex gap-0.5 rounded-full overflow-hidden h-3 mb-1">
            {teamAWins > 0 && (
              <div
                className="bg-blue-800"
                style={{ flex: teamAWins }}
              />
            )}
            {draws > 0 && (
              <div
                className="bg-slate-600"
                style={{ flex: draws }}
              />
            )}
            {teamBWins > 0 && (
              <div
                className="bg-violet-800"
                style={{ flex: teamBWins }}
              />
            )}
          </div>
          <div className="flex justify-between text-xs text-slate-600 mb-2">
            <span className="text-blue-400/70">Team A</span>
            <span>Draws</span>
            <span className="text-violet-400/70">Team B</span>
          </div>
          {streakLabel && (
            <div className="flex items-center gap-1.5 text-xs text-slate-400 pt-2 border-t border-slate-700/60">
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  streakTeam === 'teamA' ? 'bg-blue-500' :
                  streakTeam === 'teamB' ? 'bg-violet-500' : 'bg-slate-500'
                )}
              />
              {streakLabel}
            </div>
          )}
        </>
      )}
    </WidgetShell>
  )
}

// ─── StatsSidebar ─────────────────────────────────────────────────────────────

export function StatsSidebar({ players, weeks, features, role }: StatsSidebarProps) {
  const tier = resolveVisibilityTier(role)

  const showInForm      = isFeatureEnabled(features, 'stats_in_form',         tier)
  const showQuarterly   = isFeatureEnabled(features, 'stats_quarterly_table', tier)
  const showTeamAB      = isFeatureEnabled(features, 'stats_team_ab',         tier)

  if (!showInForm && !showQuarterly && !showTeamAB) return null

  return (
    <div className="space-y-4">
      {showInForm    && <InFormWidget    players={players} />}
      {showQuarterly && <QuarterlyTableWidget weeks={weeks} />}
      {showTeamAB    && <TeamABWidget    weeks={weeks} />}
    </div>
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
git add components/StatsSidebar.tsx
git commit -m "feat: add StatsSidebar component"
```

---

## Task 5: Wire `FeaturePanel.tsx`

**Files:**
- Modify: `components/FeaturePanel.tsx`

The existing `FeaturePanel` renders bespoke card components for features that have config UI (`TeamBuilderCard`, `PlayerStatsCard`). The three stats widgets have no config, so a lightweight `StatsFeatureRow` handles them.

- [ ] **Step 1: Add `StatsFeatureRow` and Stats section to `components/FeaturePanel.tsx`**

Add the import and new sub-component, then append to the JSX return. The full updated file:

```tsx
'use client'

import { useState } from 'react'
import { TeamBuilderCard } from '@/components/TeamBuilderCard'
import { PlayerStatsCard } from '@/components/PlayerStatsCard'
import type { FeatureKey, LeagueFeature } from '@/lib/types'

interface FeaturePanelProps {
  leagueId: string
  features: LeagueFeature[]
  onChanged: () => void
}

function getFeature(features: LeagueFeature[], key: FeatureKey): LeagueFeature {
  return features.find(f => f.feature === key) ?? {
    feature: key,
    available: false,
    enabled: false,
    config: null,
    public_enabled: false,
    public_config: null,
  }
}

// ─── Simple toggle row for stats widgets (no per-tier config needed) ──────────

interface StatsFeatureRowProps {
  leagueId: string
  feature: LeagueFeature
  label: string
  onChanged: () => void
}

function StatsFeatureRow({ leagueId, feature, label, onChanged }: StatsFeatureRowProps) {
  const [saving, setSaving] = useState(false)

  async function toggle(field: 'enabled' | 'public_enabled') {
    setSaving(true)
    await fetch(`/api/league/${leagueId}/features`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feature: feature.feature,
        [field]: !feature[field],
      }),
    })
    setSaving(false)
    onChanged()
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-3.5 py-2.5 mb-2">
      <span className="text-sm text-slate-200">{label}</span>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            className="accent-blue-500"
            checked={feature.enabled}
            disabled={saving}
            onChange={() => toggle('enabled')}
          />
          Members
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            className="accent-blue-500"
            checked={feature.public_enabled}
            disabled={saving}
            onChange={() => toggle('public_enabled')}
          />
          Public
        </label>
      </div>
    </div>
  )
}

export function FeaturePanel({ leagueId, features, onChanged }: FeaturePanelProps) {
  return (
    <div>
      <div className="bg-sky-950/40 border border-sky-900/40 rounded-lg px-3.5 py-2.5 mb-3.5">
        <div className="text-xs font-semibold text-sky-400 mb-0.5">You always see everything</div>
        <div className="text-xs text-slate-400">
          As a league admin, your own view is never restricted by these settings. Changes here only
          affect members and public visitors — test with a member account to verify.
        </div>
      </div>
      <TeamBuilderCard
        leagueId={leagueId}
        feature={getFeature(features, 'team_builder')}
        onChanged={onChanged}
      />
      <PlayerStatsCard
        leagueId={leagueId}
        feature={getFeature(features, 'player_stats')}
        onChanged={onChanged}
      />

      {/* Stats sidebar widgets */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-0.5">
          Stats Sidebar
        </div>
        <StatsFeatureRow
          leagueId={leagueId}
          feature={getFeature(features, 'stats_in_form')}
          label="Most In Form"
          onChanged={onChanged}
        />
        <StatsFeatureRow
          leagueId={leagueId}
          feature={getFeature(features, 'stats_quarterly_table')}
          label="Quarterly Table"
          onChanged={onChanged}
        />
        <StatsFeatureRow
          leagueId={leagueId}
          feature={getFeature(features, 'stats_team_ab')}
          label="Team A vs Team B"
          onChanged={onChanged}
        />
      </div>
    </div>
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
git add components/FeaturePanel.tsx
git commit -m "feat: add stats sidebar toggles to FeaturePanel"
```

---

## Task 6: Wire sidebar into results page

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

The results page already fetches both `weeks` and `players`. The sidebar only needs to be added to the **member/admin** render path (the public render path keeps `max-w-2xl` as-is since the sidebar public feature flags are off by default; add sidebar to public path too for completeness but it will show nothing until flags are enabled).

- [ ] **Step 1: Add `StatsSidebar` import**

At the top of `app/[leagueId]/results/page.tsx`, add:

```ts
import { StatsSidebar } from '@/components/StatsSidebar'
```

- [ ] **Step 2: Update the member/admin render path**

Replace:

```tsx
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-4">
      <LeaguePageHeader ... />
      <div className="flex flex-col gap-3">
        ...
      </div>
    </main>
  )
```

With:

```tsx
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 max-w-2xl">
          <LeaguePageHeader
            leagueName={game.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="results"
            isAdmin={isAdmin}
            showLineupLabTab={canSeeTeamBuilder}
          />
          <div className="flex flex-col gap-3">
            {canSeeMatchEntry ? (
              <ResultsSection
                gameId={leagueId}
                weeks={weeks}
                goalkeepers={goalkeepers}
                initialScheduledWeek={nextWeek}
                canAutoPick={canSeeTeamBuilder}
                allPlayers={players}
                showMatchHistory={canSeeMatchHistory}
              />
            ) : canSeeMatchHistory ? (
              <WeekList weeks={weeks} goalkeepers={goalkeepers} />
            ) : (
              <div className="py-16 text-center">
                <p className="text-sm text-slate-500">Nothing to show here yet.</p>
              </div>
            )}
          </div>
        </div>
        <div className="hidden lg:block w-72 shrink-0 sticky top-4">
          <StatsSidebar
            players={players}
            weeks={weeks}
            features={features}
            role={userRole}
          />
        </div>
      </div>
    </main>
  )
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/\[leagueId\]/results/page.tsx
git commit -m "feat: wire StatsSidebar into results page"
```

---

## Task 7: Wire sidebar into players page

**Files:**
- Modify: `app/[leagueId]/players/page.tsx`

The players page does not currently fetch full week data (only a count). Add a full weeks fetch to the existing `Promise.all`, then add the two-column layout.

- [ ] **Step 1: Add `sortWeeks` import and `Week` type**

At the top of `app/[leagueId]/players/page.tsx`, add `Week` to the type imports and import `sortWeeks`:

```ts
import { sortWeeks } from '@/lib/utils'
import type { GameRole, LeagueFeature, FeatureKey, Player, Week } from '@/lib/types'
```

- [ ] **Step 2: Add `StatsSidebar` import**

```ts
import { StatsSidebar } from '@/components/StatsSidebar'
```

- [ ] **Step 3: Expand the `Promise.all` to fetch full weeks**

Replace the existing `Promise.all` (which queries weeks with `count: 'exact', head: true`) with:

```ts
  const [experimentsResult, leagueFeaturesResult, weeksResult] = await Promise.all([
    service.from('feature_experiments').select('feature, available'),
    service.from('league_features').select('*').eq('game_id', leagueId),
    service
      .from('weeks')
      .select('week, date, status, format, team_a, team_b, winner, notes')
      .eq('game_id', leagueId)
      .in('status', ['played', 'cancelled'])
      .order('week', { ascending: false }),
  ])
```

- [ ] **Step 4: Map raw weeks rows and compute `playedCount`**

After the `Promise.all`, replace the `playedCount` line with:

```ts
  type WeekRow = {
    week: number; date: string; status: string; format: string | null;
    team_a: string[] | null; team_b: string[] | null; winner: string | null; notes: string | null;
  }
  const weeks: Week[] = sortWeeks(
    ((weeksResult.data ?? []) as WeekRow[]).map((row) => ({
      week: row.week,
      date: row.date,
      status: row.status as Week['status'],
      format: row.format ?? undefined,
      teamA: row.team_a ?? [],
      teamB: row.team_b ?? [],
      winner: row.winner as Week['winner'] ?? null,
      notes: row.notes ?? undefined,
    }))
  )
  const playedCount = weeks.length
```

- [ ] **Step 5: Update the return JSX to two-column layout**

Replace:

```tsx
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-8">
      <LeaguePageHeader ... />
      <PublicPlayerList ... />
    </main>
  )
```

With:

```tsx
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-8">
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 max-w-2xl">
          <LeaguePageHeader
            leagueName={game.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="players"
            isAdmin={isAdmin}
            showLineupLabTab={tier === 'public' ? false : canSeeTeamBuilder}
          />
          <PublicPlayerList
            players={players}
            visibleStats={visibleStats}
            showMentality={showMentality}
          />
        </div>
        <div className="hidden lg:block w-72 shrink-0 sticky top-4">
          <StatsSidebar
            players={players}
            weeks={weeks}
            features={rawFeatures}
            role={userRole}
          />
        </div>
      </div>
    </main>
  )
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/\[leagueId\]/players/page.tsx
git commit -m "feat: wire StatsSidebar into players page"
```

---

## Task 8: Wire sidebar into lineup-lab page

**Files:**
- Modify: `app/[leagueId]/lineup-lab/page.tsx`

Same pattern as Task 7: add weeks fetch, add layout wrapper.

- [ ] **Step 1: Add imports**

```ts
import { sortWeeks } from '@/lib/utils'
import { StatsSidebar } from '@/components/StatsSidebar'
import type { GameRole, LeagueFeature, FeatureKey, Player, Week } from '@/lib/types'
```

- [ ] **Step 2: Expand `Promise.all` to fetch full weeks**

Replace the existing `Promise.all` with:

```ts
  const [experimentsResult, leagueFeaturesResult, weeksResult] = await Promise.all([
    service.from('feature_experiments').select('feature, available'),
    service.from('league_features').select('*').eq('game_id', leagueId),
    service
      .from('weeks')
      .select('week, date, status, format, team_a, team_b, winner, notes')
      .eq('game_id', leagueId)
      .in('status', ['played', 'cancelled'])
      .order('week', { ascending: false }),
  ])
```

- [ ] **Step 3: Map raw weeks and compute `playedCount`**

Replace the `playedCount` line:

```ts
  type WeekRow = {
    week: number; date: string; status: string; format: string | null;
    team_a: string[] | null; team_b: string[] | null; winner: string | null; notes: string | null;
  }
  const weeks: Week[] = sortWeeks(
    ((weeksResult.data ?? []) as WeekRow[]).map((row) => ({
      week: row.week,
      date: row.date,
      status: row.status as Week['status'],
      format: row.format ?? undefined,
      teamA: row.team_a ?? [],
      teamB: row.team_b ?? [],
      winner: row.winner as Week['winner'] ?? null,
      notes: row.notes ?? undefined,
    }))
  )
  const playedCount = weeks.length
```

- [ ] **Step 4: Update return JSX**

Replace:

```tsx
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-8">
      <LeaguePageHeader ... />
      <LineupLab allPlayers={players} />
    </main>
  )
```

With:

```tsx
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-8">
      <div className="flex gap-6 items-start">
        <div className="flex-1 min-w-0 max-w-2xl">
          <LeaguePageHeader
            leagueName={game.name}
            leagueId={leagueId}
            playedCount={playedCount}
            totalWeeks={totalWeeks}
            pct={pct}
            currentTab="lineup-lab"
            isAdmin={isAdmin}
            showLineupLabTab={true}
          />
          <LineupLab allPlayers={players} />
        </div>
        <div className="hidden lg:block w-72 shrink-0 sticky top-4">
          <StatsSidebar
            players={players}
            weeks={weeks}
            features={features}
            role={userRole}
          />
        </div>
      </div>
    </main>
  )
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run all tests to confirm nothing broken**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/\[leagueId\]/lineup-lab/page.tsx
git commit -m "feat: wire StatsSidebar into lineup-lab page"
```

---

## Done

All tasks complete. Verify manually:

1. As an admin, navigate to any league → Results tab on a large screen. Confirm the three stat widgets appear in the right sidebar.
2. Visit Settings → Features and confirm the "Stats Sidebar" section shows three toggles (Most In Form, Quarterly Table, Team A vs Team B).
3. Toggle "Members" on for one widget. Confirm it appears for a member-role account.
4. Confirm the sidebar is not visible on mobile/tablet (resize browser to below `lg`).
5. Confirm the main content column width is unchanged (`max-w-2xl`).
