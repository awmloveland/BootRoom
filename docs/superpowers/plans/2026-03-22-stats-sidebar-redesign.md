# Stats Sidebar Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the three StatsSidebar widgets (Most In Form, Quarterly Table, Head to Head) with improved visual hierarchy — ghost card shells, a hero leader treatment, and richer data presentation.

**Architecture:** Two files change. `lib/sidebar-stats.ts` gets minor data additions (short year labels, `gamesLeft` field, `QUARTER_GAME_COUNT` constant). `components/StatsSidebar.tsx` gets a full visual rewrite across all three widgets; `QuarterlyTableWidget` bypasses the shared `WidgetShell` to support a custom inline-column-label header. No API, feature flag, type (`lib/types.ts`), or routing changes.

**Tech Stack:** Next.js 14, TypeScript strict, Tailwind CSS v3, Jest + ts-jest (tests for data layer only)

---

## File Map

| File | What changes |
|---|---|
| `lib/sidebar-stats.ts` | Add `export const QUARTER_GAME_COUNT = 16`; add `gamesLeft: number` to `QuarterlyTableResult`; change `quarterLabel` and `lastQuarterLabel` to short year format (`Q1 26`) |
| `__tests__/sidebar-stats.test.ts` | Update existing assertions that expect full-year labels; add test for `gamesLeft` |
| `components/StatsSidebar.tsx` | Rewrite `WidgetShell` (ghost bg), `InFormWidget` (hero + ranked list), `QuarterlyTableWidget` (custom shell, new header, progress bar, champion banner), `TeamABWidget` (scoreline + gradient bar + streak) |

---

## Task 1: Update `sidebar-stats.ts` — short year, `gamesLeft`

**Files:**
- Modify: `lib/sidebar-stats.ts`
- Test: `__tests__/sidebar-stats.test.ts`

### Background

`computeQuarterlyTable` currently returns labels like `"Q1 2026"`. We need `"Q1 26"` (last two digits). We also need it to return `gamesLeft: number` so the widget can render a quarter progress bar. A `QUARTER_GAME_COUNT = 16` constant (exported) defines weeks per quarter; `gamesLeft = Math.max(0, QUARTER_GAME_COUNT - maxPlayed)` where `maxPlayed` is the highest `played` count across all entries in the current quarter.

The existing test file `__tests__/sidebar-stats.test.ts` has assertions for the old label format — these will break intentionally before the fix.

- [ ] **Step 1: Update existing year-format test assertions to expect the new short-year format**

In `__tests__/sidebar-stats.test.ts`, find every assertion that references `'Q1 2026'`, `'Q4 2025'`, or any full-year quarter label and change them to short-year format:

```ts
// Line 91 — was: expect(result.quarterLabel).toBe('Q1 2026')
expect(result.quarterLabel).toBe('Q1 26')

// Line 128 — was: expect(result.lastQuarterLabel).toBe('Q4 2025')
expect(result.lastQuarterLabel).toBe('Q4 25')

// Line 142 — was: expect(result.quarterLabel).toBe('Q1 2026')
expect(result.quarterLabel).toBe('Q1 26')
```

- [ ] **Step 2: Add a test for `gamesLeft`**

Append inside the `describe('computeQuarterlyTable', ...)` block in `__tests__/sidebar-stats.test.ts`:

```ts
it('returns gamesLeft as QUARTER_GAME_COUNT minus maxPlayed', () => {
  // Two weeks played in Q1 2026, max played by any player = 2
  const weeks: Week[] = [
    makeWeek({ week: 1, date: '05 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    makeWeek({ week: 2, date: '12 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamB' }),
  ]
  const result = computeQuarterlyTable(weeks, new Date(2026, 0, 22))
  // QUARTER_GAME_COUNT is 16; maxPlayed = 2 → gamesLeft = 14
  expect(result.gamesLeft).toBe(14)
})

it('returns QUARTER_GAME_COUNT as gamesLeft when entries is empty', () => {
  const result = computeQuarterlyTable([], new Date(2026, 0, 22))
  expect(result.gamesLeft).toBe(16)
})

it('clamps gamesLeft to 0 when maxPlayed exceeds QUARTER_GAME_COUNT', () => {
  // Artificially create 20 weeks to exceed the constant
  const weeks: Week[] = Array.from({ length: 20 }, (_, i) =>
    makeWeek({ week: i + 1, date: '05 Jan 2026', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' })
  )
  const result = computeQuarterlyTable(weeks, new Date(2026, 0, 22))
  expect(result.gamesLeft).toBe(0)
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/nairobi
npx jest __tests__/sidebar-stats.test.ts --no-coverage
```

Expected: failures on the year-format assertions and on `gamesLeft` (field doesn't exist yet).

- [ ] **Step 4: Update `lib/sidebar-stats.ts`**

Make the following changes:

**a) Add the exported constant at the top of the file, after the imports:**
```ts
export const QUARTER_GAME_COUNT = 16
```

**b) Add `gamesLeft` to the `QuarterlyTableResult` interface:**
```ts
export interface QuarterlyTableResult {
  quarterLabel: string
  entries: QuarterlyEntry[]
  lastChampion: string | null
  lastQuarterLabel: string | null
  gamesLeft: number  // ← add this
}
```

**c) Update `computeQuarterlyTable` — short year labels and `gamesLeft` calculation:**

Replace the body of `computeQuarterlyTable` with:

```ts
export function computeQuarterlyTable(weeks: Week[], now: Date = new Date()): QuarterlyTableResult {
  const { q, year } = quarterOf(now)
  const yy = String(year).slice(-2)
  const quarterLabel = `Q${q} ${yy}`

  const currentWeeks = weeks.filter(w => weekInQuarter(w, q, year))
  const entries = aggregateWeeks(currentWeeks).slice(0, 5)

  const maxPlayed = entries.length > 0 ? Math.max(...entries.map(e => e.played)) : 0
  const gamesLeft = Math.max(0, QUARTER_GAME_COUNT - maxPlayed)

  const prevQ = q === 1 ? 4 : q - 1
  const prevYear = q === 1 ? year - 1 : year
  const prevYY = String(prevYear).slice(-2)
  const prevWeeks = weeks.filter(w => weekInQuarter(w, prevQ, prevYear))
  const prevEntries = aggregateWeeks(prevWeeks)
  const lastChampion = prevEntries.length > 0 ? prevEntries[0].name : null
  const lastQuarterLabel = prevEntries.length > 0 ? `Q${prevQ} ${prevYY}` : null

  return { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft }
}
```

- [ ] **Step 5: Run the tests to confirm they all pass**

```bash
npx jest __tests__/sidebar-stats.test.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "feat: short year labels, gamesLeft field, QUARTER_GAME_COUNT in sidebar-stats"
```

---

## Task 2: Rewrite `WidgetShell` — ghost card

**Files:**
- Modify: `components/StatsSidebar.tsx:15-24`

### Background

`WidgetShell` currently uses `bg-slate-800` — the same as match cards in the main content column. Changing it to `bg-transparent` makes the sidebar recede so the main content reads as the primary focus.

- [ ] **Step 1: Update `WidgetShell`**

In `components/StatsSidebar.tsx`, replace the `WidgetShell` function (lines 15–24):

```tsx
function WidgetShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-transparent overflow-hidden">
      <div className="px-3 py-2 border-b border-slate-700/40 text-xs font-semibold text-slate-500 uppercase tracking-widest">
        {title}
      </div>
      <div className="px-3 py-3">{children}</div>
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
git commit -m "feat: ghost card shell (transparent bg) for StatsSidebar widgets"
```

---

## Task 3: Rewrite `InFormWidget` — hero + ranked list

**Files:**
- Modify: `components/StatsSidebar.tsx:32-55`

### Background

Replace the flat list with a two-section layout: the top player gets a featured "hero" block with a large PPG number and form string; players 2–5 appear as a compact ranked list below a divider. The divider and ranked list are only rendered when there are 2+ entries.

- [ ] **Step 1: Replace `InFormWidget`**

In `components/StatsSidebar.tsx`, replace the `InFormWidget` function (lines 32–55):

```tsx
function InFormWidget({ players }: { players: Player[] }) {
  const entries = computeInForm(players)
  return (
    <WidgetShell title="Most In Form">
      {entries.length === 0 ? (
        <EmptyState message="Not enough data yet" />
      ) : (
        <>
          {/* Hero: rank 1 */}
          <div className={cn(entries.length > 1 && 'border-b border-slate-700/50 pb-[10px] mb-[10px]')}>
            <p className="text-[9px] font-bold uppercase tracking-wide text-sky-300 mb-1">
              The Gaffer&apos;s Pick
            </p>
            <p className="text-[15px] font-bold text-slate-100 mb-2">{entries[0].name}</p>
            <div className="flex items-end justify-between">
              <FormDots form={entries[0].recentForm} />
              <div className="text-right">
                <p className="text-[22px] font-extrabold text-sky-300 leading-none">
                  {entries[0].ppg.toFixed(1)}
                </p>
                <p className="text-[9px] uppercase tracking-wide text-sky-400 mt-0.5">pts / game</p>
              </div>
            </div>
          </div>

          {/* Ranked list: ranks 2–5 */}
          {entries.length > 1 && (
            <div className="flex flex-col gap-[5px]">
              {entries.slice(1).map((e, i) => (
                <div key={e.name} className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-600 w-[14px] text-right shrink-0">
                    {i + 2}
                  </span>
                  <span className="text-[13px] text-slate-300 flex-1 truncate">{e.name}</span>
                  <FormDots form={e.recentForm} />
                  <span className="text-[10px] font-semibold px-[7px] py-px rounded-full bg-slate-700/40 text-slate-500 shrink-0">
                    {e.ppg.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </WidgetShell>
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
git commit -m "feat: InFormWidget hero leader + ranked list redesign"
```

---

## Task 4: Rewrite `QuarterlyTableWidget` — custom shell, P+Pts columns, progress bar, champion banner

**Files:**
- Modify: `components/StatsSidebar.tsx:57-100`

### Background

This widget bypasses `WidgetShell` entirely and renders its own `rounded-lg border border-slate-700` container so the header can hold inline column labels (`P`, `Pts`) alongside the quarter title. The table drops W/D/L and shows only rank, name, P (played), and Pts. Below the table: a quarter progress bar (omitted when `entries.length === 0` or `gamesLeft <= 0`) and an amber champion banner (when `lastChampion` is non-null).

`fillPct` is computed locally: `Math.round(((QUARTER_GAME_COUNT - gamesLeft) / QUARTER_GAME_COUNT) * 100)`.

- [ ] **Step 1: Add `QUARTER_GAME_COUNT` to the import from `sidebar-stats`**

At the top of `components/StatsSidebar.tsx`, update the import line:

```ts
import { computeInForm, computeQuarterlyTable, computeTeamAB, QUARTER_GAME_COUNT } from '@/lib/sidebar-stats'
```

- [ ] **Step 2: Replace `QuarterlyTableWidget`**

Replace the `QuarterlyTableWidget` function (lines 57–100):

```tsx
function QuarterlyTableWidget({ weeks }: { weeks: Week[] }) {
  const { quarterLabel, entries, lastChampion, lastQuarterLabel, gamesLeft } = computeQuarterlyTable(weeks)
  const fillPct = Math.round(((QUARTER_GAME_COUNT - gamesLeft) / QUARTER_GAME_COUNT) * 100)
  const showProgress = entries.length > 0 && gamesLeft > 0

  return (
    <div className="rounded-lg border border-slate-700 bg-transparent overflow-hidden">
      {/* Header with inline column labels */}
      <div className="px-3 py-1.5 border-b border-slate-700/40 flex items-center gap-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex-1">
          {quarterLabel}
        </span>
        <span className="text-[10px] font-semibold uppercase text-slate-700 w-[22px] text-center">P</span>
        <span className="text-[10px] font-semibold uppercase text-slate-500 w-[28px] text-right">Pts</span>
      </div>

      <div className="px-3 py-3">
        {entries.length === 0 ? (
          <EmptyState message="Quarter just started" />
        ) : (
          <div className="flex flex-col gap-[2px]">
            {entries.map((e, i) => (
              <div
                key={e.name}
                className={cn(
                  'flex items-center gap-1 px-1 py-[3px] rounded -mx-1',
                  i === 0 && 'bg-sky-400/[0.06]'
                )}
              >
                <span className={cn(
                  'text-[11px] w-[14px] text-right shrink-0',
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
                <span className="text-[11px] text-slate-600 w-[22px] text-center shrink-0">
                  {e.played}
                </span>
                <span className={cn(
                  'text-[12px] font-bold w-[28px] text-right shrink-0',
                  i === 0 ? 'text-sky-300' : 'text-slate-300'
                )}>
                  {e.points}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Quarter progress bar */}
        {showProgress && (
          <div className="py-[7px] border-t border-b border-slate-700/40 my-2">
            <div className="flex justify-between items-baseline mb-[5px]">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                Quarter progress
              </span>
              <span className="text-[10px] text-slate-600">{gamesLeft} left</span>
            </div>
            <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-slate-600" style={{ width: `${fillPct}%` }} />
            </div>
          </div>
        )}

        {/* Previous quarter champion */}
        {lastChampion && lastQuarterLabel && (
          <div className="flex items-center justify-between bg-amber-400/[0.07] border border-amber-400/[0.14] rounded-md px-[10px] py-[6px]">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-amber-600 mb-0.5">
                {lastQuarterLabel} Champion
              </p>
              <p className="text-[13px] font-bold text-yellow-200">{lastChampion}</p>
            </div>
            <span className="text-lg leading-none">🏆</span>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/StatsSidebar.tsx
git commit -m "feat: QuarterlyTableWidget custom shell, P+Pts columns, progress bar, champion banner"
```

---

## Task 5: Rewrite `TeamABWidget` — scoreline, gradient bar, streak

**Files:**
- Modify: `components/StatsSidebar.tsx:102-165`

### Background

Replace the current layout (numbers top / thin flat bar / team labels below) with: team labels + large win numbers on one row (separated by muted draws count), a taller gradient bar, and a reworked streak line with a coloured dot + bold team name + readable label. Title changes from `"Team A vs Team B"` to `"Head to Head"`.

- [ ] **Step 1: Replace `TeamABWidget`**

Replace the `TeamABWidget` function (lines 102–165):

```tsx
function TeamABWidget({ weeks }: { weeks: Week[] }) {
  const { teamAWins, draws, teamBWins, total, streakTeam, streakLength } = computeTeamAB(weeks)

  const streakDotClass =
    streakTeam === 'teamA' ? 'bg-blue-500' :
    streakTeam === 'teamB' ? 'bg-violet-500' :
    'bg-slate-500'

  const streakNameClass =
    streakTeam === 'teamA' ? 'text-blue-300' :
    streakTeam === 'teamB' ? 'text-violet-300' :
    'text-slate-400'

  const streakName =
    streakTeam === 'teamA' ? 'Team A' :
    streakTeam === 'teamB' ? 'Team B' :
    'Draw'

  return (
    <WidgetShell title="Head to Head">
      {total === 0 ? (
        <EmptyState message="No results yet" />
      ) : (
        <>
          {/* Scoreline */}
          <div className="flex justify-between items-baseline mb-[6px]">
            <div>
              <span className="text-[9px] font-bold uppercase tracking-wide text-blue-500">Team A</span>
              <span className="text-[16px] font-extrabold text-blue-300 ml-[5px]">{teamAWins}</span>
            </div>
            <span className="text-[11px] text-slate-700">{draws}D</span>
            <div>
              <span className="text-[16px] font-extrabold text-violet-300 mr-[5px]">{teamBWins}</span>
              <span className="text-[9px] font-bold uppercase tracking-wide text-violet-700">Team B</span>
            </div>
          </div>

          {/* Gradient bar */}
          <div className="flex gap-0.5 rounded-md overflow-hidden h-3 mb-[10px]">
            {teamAWins > 0 && (
              <div
                className="bg-gradient-to-r from-blue-900 to-blue-500"
                style={{ flex: teamAWins }}
              />
            )}
            {draws > 0 && (
              <div className="bg-slate-800" style={{ flex: draws }} />
            )}
            {teamBWins > 0 && (
              <div
                className="bg-gradient-to-r from-violet-700 to-violet-900"
                style={{ flex: teamBWins }}
              />
            )}
          </div>

          {/* Streak */}
          {streakTeam !== null && (
            <div className="flex items-center gap-1.5 pt-2 border-t border-slate-700/40">
              <span className={cn('w-[7px] h-[7px] rounded-full shrink-0', streakDotClass)} />
              <span className={cn('text-[12px] font-semibold', streakNameClass)}>{streakName}</span>
              <span className="text-[11px] text-slate-500">on a {streakLength}-game streak</span>
            </div>
          )}
        </>
      )}
    </WidgetShell>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
npx jest --no-coverage
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/StatsSidebar.tsx
git commit -m "feat: TeamABWidget scoreline, gradient bar, streak redesign + rename to Head to Head"
```

---

## Done

All five tasks complete. The sidebar now has:
- Ghost card shells across all three widgets
- "Most In Form" — hero leader with "The Gaffer's Pick" label, WDL form, PPG pills for ranks 2–5
- "Q1 26" — inline P/Pts column headers, leader row tinted, quarter progress bar, amber champion banner
- "Head to Head" — team scoreline with draws, tall gradient bar, readable streak line
