# Winning Margins Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a flagged "Winning Margins" stats card (average winning margin, biggest win, margin chart with draws, close-games %) under Head to Head in the desktop sidebar and on the Overview tab, hidden from non-admins until the league has 10 wins.

**Architecture:** A pure `computeMargins(weeks)` in `lib/sidebar-stats.ts` produces a `MarginStats` object. `MarginsWidget` in `components/StatsSidebar.tsx` renders it with the shared `WidgetShell`, and applies the 10-win threshold (admins bypass it and get a progress hint). A new `margin_stats` feature flag gates where the card renders: the layout's `LeagueSidebar` and the Overview page each work out `canSeeMargins` and `isAdmin` from data they already fetch.

**Tech Stack:** Next.js 16 App Router (server components), React 19, TypeScript strict, Tailwind v4 arbitrary values, Jest + Testing Library, Supabase SQL migrations.

**Spec:** `docs/superpowers/specs/2026-10-06-winning-margins-card-design.md`

> **Update 2026-10-06:** the `margin_stats` flag (Task 3, and the `canSeeMargins` wiring in Task 4) was built and then removed at the user's request. The card renders unconditionally; the 10-win threshold is the only gate. The spec reflects the final design.

---

## File map

| File | Change |
|---|---|
| `lib/types.ts` | Add `'margin_stats'` to `FeatureKey`; add `MarginStats` interface |
| `lib/sidebar-stats.ts` | Add `MIN_MARGIN_WINS` and `computeMargins()` after `computeTeamAB` |
| `__tests__/sidebar-stats.test.ts` | `computeMargins` unit tests |
| `components/StatsSidebar.tsx` | Add `MarginsWidget`; `StatsSidebar` gains `canSeeMargins` and `isAdmin` props |
| `__tests__/stats-sidebar.test.tsx` | `MarginsWidget` and `StatsSidebar` gating tests |
| `lib/defaults.ts` | `margin_stats` default row |
| `app/experiments/page.tsx` | `FEATURE_LABELS` entry (required by `Record<FeatureKey, string>`) |
| `components/FeaturePanel.tsx` | `FeatureToggleCard` row |
| `supabase/migrations/20261006000002_seed_margin_stats.sql` | Seed `feature_experiments` and `league_features` |
| `app/[slug]/(tabs)/layout.tsx` | Pass `canSeeMargins` and `isAdmin` to `StatsSidebar` |
| `app/[slug]/(tabs)/overview/page.tsx` | Render `MarginsWidget` after `TeamABWidget` |

Commit messages in this repo are plain sentences ("Add …"), no `feat:` prefix. End every commit message with:

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

---

### Task 1: Margin stats calculation

**Files:**
- Modify: `lib/types.ts` (after the `FeatureConfig` block, near line 100)
- Modify: `lib/sidebar-stats.ts` (insert after `computeTeamAB`, which ends around line 630)
- Test: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Add the `MarginStats` type**

In `lib/types.ts`, add this after the `FeatureConfig` interface (the file uses semicolons):

```ts
/** All-time winning margin stats. Built by computeMargins in lib/sidebar-stats.ts. */
export interface MarginStats {
  /** Mean margin of wins with a recorded margin. Draws excluded. */
  avgWinMargin: number | null;
  biggestWin: number | null;
  /** Eight counts: draws, then margins 1, 2, 3, 4, 5, 6, and 7+. */
  buckets: number[];
  /** Most common win margin (1–7, 7 meaning 7+). Ties go to the smaller margin. */
  modeMargin: number | null;
  /** (wins by 1 + draws) / counted, as a rounded whole percentage. */
  closeGamePct: number | null;
  /** Draws plus wins with a recorded margin. */
  counted: number;
  /** Wins with a recorded margin. Compared against MIN_MARGIN_WINS. */
  winCount: number;
}
```

- [ ] **Step 2: Write the failing tests**

In `__tests__/sidebar-stats.test.ts`, change the first import line to:

```ts
import { computeInForm, computeQuarterlyTable, computeTeamAB, computeAllQuarters, computeMargins } from '@/lib/sidebar-stats'
```

Append at the end of the file:

```ts
// ─── computeMargins ───────────────────────────────────────────────────────────

describe('computeMargins', () => {
  const win = (week: number, margin: number | null, winner: 'teamA' | 'teamB' = 'teamA') =>
    makeWeek({ week, winner, goal_difference: margin })
  const draw = (week: number, margin: number | null = 0) =>
    makeWeek({ week, winner: 'draw', goal_difference: margin })

  it('returns zeros and nulls for no weeks', () => {
    expect(computeMargins([])).toEqual({
      avgWinMargin: null,
      biggestWin: null,
      buckets: [0, 0, 0, 0, 0, 0, 0, 0],
      modeMargin: null,
      closeGamePct: null,
      counted: 0,
      winCount: 0,
    })
  })

  it('ignores weeks that were not played', () => {
    const r = computeMargins([
      makeWeek({ week: 1, status: 'cancelled', winner: null, goal_difference: null }),
      makeWeek({ week: 2, status: 'dnf', winner: null, goal_difference: null }),
      makeWeek({ week: 3, status: 'scheduled', winner: null }),
    ])
    expect(r.counted).toBe(0)
  })

  it('counts a draw as margin 0 even when no margin was saved', () => {
    const r = computeMargins([draw(1, null), draw(2, 0)])
    expect(r.buckets[0]).toBe(2)
    expect(r.counted).toBe(2)
    expect(r.winCount).toBe(0)
  })

  it('skips wins with no recorded margin', () => {
    const r = computeMargins([win(1, null), win(2, 3)])
    expect(r.winCount).toBe(1)
    expect(r.counted).toBe(1)
    expect(r.avgWinMargin).toBe(3)
  })

  it('puts margins of 7 and above in the 7+ bucket', () => {
    const r = computeMargins([win(1, 7), win(2, 9, 'teamB'), win(3, 12)])
    expect(r.buckets).toEqual([0, 0, 0, 0, 0, 0, 0, 3])
    expect(r.biggestWin).toBe(12)
    expect(r.modeMargin).toBe(7)
  })

  it('breaks a tie for most common margin towards the smaller margin', () => {
    const r = computeMargins([win(1, 3), win(2, 3), win(3, 2), win(4, 2), win(5, 5)])
    expect(r.modeMargin).toBe(2)
  })

  it('never makes draws the most common margin', () => {
    const r = computeMargins([draw(1), draw(2), draw(3), win(4, 4)])
    expect(r.modeMargin).toBe(4)
  })

  it('averages wins only, and counts draws as close games', () => {
    // wins 1, 1, 4 → avg 2; close = (2 one-goal + 1 draw) / 4 = 75%
    const r = computeMargins([win(1, 1), win(2, 1, 'teamB'), win(3, 4), draw(4)])
    expect(r.avgWinMargin).toBe(2)
    expect(r.closeGamePct).toBe(75)
  })

  it('rounds close games to a whole percentage', () => {
    // 1 one-goal win of 3 counted → 33.33…%
    const r = computeMargins([win(1, 1), win(2, 2), win(3, 3)])
    expect(r.closeGamePct).toBe(33)
  })

  it('handles a league of only draws', () => {
    const r = computeMargins([draw(1), draw(2)])
    expect(r.avgWinMargin).toBeNull()
    expect(r.biggestWin).toBeNull()
    expect(r.modeMargin).toBeNull()
    expect(r.closeGamePct).toBe(100)
  })

  it('matches the craft-football reference numbers', () => {
    // buckets [7, 11, 10, 10, 4, 3, 5, 1] from the spec
    const margins = [
      ...Array(11).fill(1), ...Array(10).fill(2), ...Array(10).fill(3),
      ...Array(4).fill(4), ...Array(3).fill(5), ...Array(5).fill(6), 7,
    ]
    const weeks = [
      ...margins.map((m, i) => win(i + 1, m)),
      ...Array.from({ length: 7 }, (_, i) => draw(100 + i, i < 4 ? 0 : null)),
    ]
    const r = computeMargins(weeks)
    expect(r.buckets).toEqual([7, 11, 10, 10, 4, 3, 5, 1])
    expect(r.avgWinMargin!.toFixed(1)).toBe('2.9')
    expect(r.biggestWin).toBe(7)
    expect(r.modeMargin).toBe(1)
    expect(r.closeGamePct).toBe(35)
    expect(r.winCount).toBe(44)
  })
})
```

- [ ] **Step 3: Run the tests to check they fail**

Run: `npm test -- __tests__/sidebar-stats.test.ts -t computeMargins`
Expected: FAIL, `computeMargins` is not a function or not exported.

- [ ] **Step 4: Implement `computeMargins`**

In `lib/sidebar-stats.ts`, change the type import on line 3 to:

```ts
import type { MarginStats, Player, Week } from '@/lib/types'
```

Insert after the closing brace of `computeTeamAB` (before the `// ─── computeTeammates` banner):

```ts
// ─── computeMargins ───────────────────────────────────────────────────────────

/** Wins a league needs before non-admins see the Winning Margins card. */
export const MIN_MARGIN_WINS = 10

/**
 * All-time winning margins from played weeks. A draw always counts as margin 0;
 * a win with no recorded margin is skipped. Buckets run draws, 1–6, then 7+.
 */
export function computeMargins(weeks: Week[]): MarginStats {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0]
  let winCount = 0
  let winTotal = 0
  let biggest = 0

  for (const w of weeks) {
    if (w.status !== 'played') continue
    if (w.winner === 'draw') {
      buckets[0]++
      continue
    }
    if (w.winner !== 'teamA' && w.winner !== 'teamB') continue
    const margin = w.goal_difference
    if (margin == null || margin < 1) continue
    buckets[Math.min(margin, 7)]++
    winCount++
    winTotal += margin
    biggest = Math.max(biggest, margin)
  }

  let modeMargin: number | null = null
  for (let m = 1; m <= 7; m++) {
    if (buckets[m] > 0 && (modeMargin === null || buckets[m] > buckets[modeMargin])) modeMargin = m
  }

  const counted = buckets[0] + winCount
  return {
    avgWinMargin: winCount > 0 ? winTotal / winCount : null,
    biggestWin: winCount > 0 ? biggest : null,
    buckets,
    modeMargin,
    closeGamePct: counted > 0 ? Math.round(((buckets[0] + buckets[1]) / counted) * 100) : null,
    counted,
    winCount,
  }
}
```

- [ ] **Step 5: Run the tests to check they pass**

Run: `npm test -- __tests__/sidebar-stats.test.ts`
Expected: PASS, all suites including `computeMargins`.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "Add computeMargins for winning margin stats

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: MarginsWidget

**Files:**
- Modify: `components/StatsSidebar.tsx` (imports on line 2; new widget after `TeamABWidget`, before the `// ─── StatsSidebar` banner)
- Test: `__tests__/stats-sidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `__tests__/stats-sidebar.test.tsx`, change the `StatsSidebar` import to:

```ts
import { StatsSidebar, InFormWidget, TeamABWidget, MarginsWidget } from '@/components/StatsSidebar'
```

Add this helper and fixture below the `WEEKS` constant:

```ts
function marginWeeks(results: (number | 'draw')[]): Week[] {
  return results.map((r, i) => ({
    id: `m${i}`, season: '2026', week: i + 1, date: '08 Jan 2026', status: 'played',
    teamA: ['Alice', 'Bob'], teamB: ['Charlie', 'Dave'],
    winner: r === 'draw' ? 'draw' : 'teamA',
    goal_difference: r === 'draw' ? 0 : r,
  }))
}

// 10 wins (avg 3.2, biggest 9, most common 1) and a draw. Close games 4/11 = 36%.
const TEN_WINS = marginWeeks([1, 1, 1, 2, 2, 3, 3, 4, 6, 9, 'draw'])
```

Add this `describe` block after the `TeamABWidget` block:

```ts
describe('MarginsWidget', () => {
  it('shows the average, biggest win, chart labels and close games', () => {
    const { container } = render(<MarginsWidget weeks={TEN_WINS} />)
    expect(screen.getByText('Winning Margins')).toBeInTheDocument()
    expect(screen.getByText('All Time')).toBeInTheDocument()
    expect(screen.getByText('3.2')).toBeInTheDocument()
    expect(screen.getByText('Avg goals per win')).toBeInTheDocument()
    expect(screen.getByText('+9')).toBeInTheDocument()
    expect(screen.getByText('Biggest')).toBeInTheDocument()
    for (const label of ['D', '1', '2', '3', '4', '5', '6', '7+']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(container).toHaveTextContent('Close games · 36% · 1 goal or a draw')
    expect(container).not.toHaveTextContent('Visible to non-admins')
  })

  it('highlights the most common margin and skips empty buckets', () => {
    const { container } = render(<MarginsWidget weeks={TEN_WINS} />)
    expect(container.querySelector('[data-bucket="1"]')!.className).toContain('bg-[#38bdf8]')
    expect(container.querySelector('[data-bucket="2"]')!.className).toContain('bg-[#223a5c]')
    expect(container.querySelector('[data-bucket="D"]')!.className).toContain('bg-[#2c4a72]')
    expect(container.querySelector('[data-bucket="5"]')).toBeNull()
  })

  it('describes the chart for screen readers', () => {
    render(<MarginsWidget weeks={TEN_WINS} />)
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Draws 1, 1 goal 3, 2 goals 2, 3 goals 2, 4 goals 1, 5 goals 0, 6 goals 1, 7+ goals 1',
    )
  })

  it('renders nothing for a non-admin below 10 wins', () => {
    const { container } = render(<MarginsWidget weeks={TEN_WINS.slice(1)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows an admin the card with a progress hint below 10 wins', () => {
    const { container } = render(<MarginsWidget weeks={TEN_WINS.slice(1)} isAdmin />)
    expect(screen.getByText('Winning Margins')).toBeInTheDocument()
    expect(container).toHaveTextContent('Visible to non-admins after 10 wins · 9 so far')
  })

  it('shows an admin only the hint when nothing is counted yet', () => {
    const { container } = render(<MarginsWidget weeks={[]} isAdmin />)
    expect(container).toHaveTextContent('Visible to non-admins after 10 wins · 0 so far')
    expect(container).not.toHaveTextContent('Avg goals per win')
  })

  it('shows a dash and no biggest win when an admin has only draws', () => {
    render(<MarginsWidget weeks={marginWeeks(['draw', 'draw'])} isAdmin />)
    expect(screen.getByText('-')).toBeInTheDocument()
    expect(screen.queryByText('Biggest')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npm test -- __tests__/stats-sidebar.test.tsx -t MarginsWidget`
Expected: FAIL, `MarginsWidget` is not exported (element type is undefined).

- [ ] **Step 3: Implement `MarginsWidget`**

In `components/StatsSidebar.tsx`, change line 2 to:

```ts
import { computeInForm, computeMargins, computeQuarterlyTable, computeTeamAB, computeTeammates, MIN_MARGIN_WINS } from '@/lib/sidebar-stats'
```

Insert after the closing brace of `TeamABWidget`:

```tsx
// ─── Widget 4: Winning Margins ────────────────────────────────────────────

const MARGIN_LABELS = ['D', '1', '2', '3', '4', '5', '6', '7+']
const MARGIN_META_CLASS = 'font-plex text-[8.5px] uppercase tracking-[.14em] text-[#6f88a8]'

function marginBucketName(index: number): string {
  if (index === 0) return 'Draws'
  return index === 1 ? '1 goal' : `${MARGIN_LABELS[index]} goals`
}

export function MarginsWidget({
  weeks,
  size = 'sidebar',
  isAdmin = false,
}: {
  weeks: Week[]
  size?: WidgetSize
  /** Admins see the card before the league reaches MIN_MARGIN_WINS, with a hint. */
  isAdmin?: boolean
}) {
  const { avgWinMargin, biggestWin, buckets, modeMargin, closeGamePct, counted, winCount } = computeMargins(weeks)
  const belowThreshold = winCount < MIN_MARGIN_WINS
  if (belowThreshold && !isAdmin) return null

  const maxCount = Math.max(...buckets)
  const hint = belowThreshold && (
    <p className={cn(MARGIN_META_CLASS, 'text-[#4f688a]', counted > 0 && 'mt-2')}>
      Visible to non-admins after {MIN_MARGIN_WINS} wins ·{' '}
      <span className="font-bold text-[#8ba4c4]">{winCount}</span> so far
    </p>
  )

  return (
    <WidgetShell title="Winning Margins" size={size} headerRight={<AllTimeChip />}>
      {counted === 0 ? hint : (
        <>
          <div className="flex items-end justify-between mb-3.5">
            <div>
              <div className="font-grotesk text-[34px] font-bold leading-none text-[#f4f9ff]">
                {avgWinMargin === null ? '-' : avgWinMargin.toFixed(1)}
              </div>
              <div className={cn(MARGIN_META_CLASS, 'mt-1.5')}>Avg goals per win</div>
            </div>
            {biggestWin !== null && (
              <div className="text-right">
                <div className="font-grotesk text-[15px] font-bold text-[#bef264]">+{biggestWin}</div>
                <div className={cn(MARGIN_META_CLASS, 'mt-1')}>Biggest</div>
              </div>
            )}
          </div>

          {/* Margin chart: draws, then 1 to 7+ */}
          <div
            role="img"
            aria-label={buckets.map((count, i) => `${marginBucketName(i)} ${count}`).join(', ')}
            className="flex items-end gap-[5px] h-14"
          >
            {buckets.map((count, i) => (
              <div key={MARGIN_LABELS[i]} className="flex-1 h-full flex items-end">
                {count > 0 && (
                  <div
                    data-bucket={MARGIN_LABELS[i]}
                    className={cn(
                      'w-full rounded-t-[2px]',
                      i === 0 ? 'bg-[#2c4a72]' : i === modeMargin ? 'bg-[#38bdf8]' : 'bg-[#223a5c]',
                    )}
                    style={{ height: `${(count / maxCount) * 100}%` }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-[5px] mt-[5px]" aria-hidden="true">
            {MARGIN_LABELS.map((label) => (
              <span key={label} className="flex-1 text-center font-plex text-[8.5px] text-[#4f688a]">{label}</span>
            ))}
          </div>

          <div className="h-px bg-[#17263c] mt-3 mb-2.5" />
          <p className={MARGIN_META_CLASS}>
            Close games · <span className="font-bold text-[#f4f9ff]">{closeGamePct}%</span> · 1 goal or a draw
          </p>
          {hint}
        </>
      )}
    </WidgetShell>
  )
}
```

Note: the axis labels are `aria-hidden` because the chart's `aria-label` already says the same thing. `getByText` in the Step 1 test still finds them (it ignores `aria-hidden`).

- [ ] **Step 4: Run the tests to check they pass**

Run: `npm test -- __tests__/stats-sidebar.test.tsx`
Expected: PASS, including every existing `StatsSidebar` test.

- [ ] **Step 5: Commit**

```bash
git add components/StatsSidebar.tsx __tests__/stats-sidebar.test.tsx
git commit -m "Add the Winning Margins card component

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `margin_stats` feature flag

**Files:**
- Modify: `lib/types.ts:90-96` (`FeatureKey`)
- Modify: `lib/defaults.ts`
- Modify: `app/experiments/page.tsx:10-17` (`FEATURE_LABELS`)
- Modify: `components/FeaturePanel.tsx`
- Create: `supabase/migrations/20261006000002_seed_margin_stats.sql`

- [ ] **Step 1: Add the key**

In `lib/types.ts`, change the end of `FeatureKey` to:

```ts
  | 'lineup_share_image'
  | 'margin_stats';
```

- [ ] **Step 2: Add the default row**

In `lib/defaults.ts`, add after the `lineup_share_image` entry:

```ts
  { feature: 'margin_stats', enabled: false, config: null, public_enabled: false, public_config: null },
```

- [ ] **Step 3: Add the experiments label**

In `app/experiments/page.tsx`, add to `FEATURE_LABELS` after `lineup_share_image`:

```ts
  margin_stats:        'Winning Margins',
```

- [ ] **Step 4: Add the FeaturePanel row**

In `components/FeaturePanel.tsx`, add after the `lineup_share_image` `FeatureToggleCard`:

```tsx
      <FeatureToggleCard
        leagueId={leagueId}
        feature={getFeature(features, 'margin_stats')}
        title="Winning Margins"
        description="Show the average winning margin, biggest win and close games under Head to Head, once the league has 10 wins. Admins always see it; choose who else does."
        onChanged={onChanged}
      />
```

- [ ] **Step 5: Write the seed migration**

Create `supabase/migrations/20261006000002_seed_margin_stats.sql`:

```sql
-- Register the margin_stats feature as globally available
INSERT INTO feature_experiments (feature, available) VALUES
  ('margin_stats', true)
ON CONFLICT (feature) DO NOTHING;

-- Seed per-league rows for all existing leagues (admin-only by default)
INSERT INTO league_features (game_id, feature, enabled, public_enabled)
SELECT g.id, 'margin_stats', false, false
FROM games g
ON CONFLICT (game_id, feature) DO NOTHING;
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (A missing `FEATURE_LABELS` entry would fail here.)

- [ ] **Step 7: Commit**

```bash
git add lib/types.ts lib/defaults.ts app/experiments/page.tsx components/FeaturePanel.tsx supabase/migrations/20261006000002_seed_margin_stats.sql
git commit -m "Add the margin_stats feature flag

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Render the card in the sidebar and on Overview

**Files:**
- Modify: `components/StatsSidebar.tsx` (`StatsSidebarProps` near line 14, `StatsSidebar` near line 300)
- Modify: `app/[slug]/(tabs)/layout.tsx` (imports line 4; `LeagueSidebar` lines ~100-125)
- Modify: `app/[slug]/(tabs)/overview/page.tsx` (imports line 15; flags ~line 61; card list ~line 128)
- Test: `__tests__/stats-sidebar.test.tsx`

- [ ] **Step 1: Write the failing tests**

In `__tests__/stats-sidebar.test.tsx`, add inside `describe('StatsSidebar', …)`:

```ts
  it('shows Winning Margins only when the flag allows it', () => {
    const { rerender } = render(<StatsSidebar players={PLAYERS} weeks={TEN_WINS} leagueDayIndex={4} />)
    expect(screen.queryByText('Winning Margins')).not.toBeInTheDocument()
    rerender(<StatsSidebar players={PLAYERS} weeks={TEN_WINS} leagueDayIndex={4} canSeeMargins />)
    expect(screen.getByText('Winning Margins')).toBeInTheDocument()
  })

  it('passes admin status through to Winning Margins', () => {
    const nine = TEN_WINS.slice(1)
    const { rerender } = render(<StatsSidebar players={PLAYERS} weeks={nine} leagueDayIndex={4} canSeeMargins />)
    expect(screen.queryByText('Winning Margins')).not.toBeInTheDocument()
    rerender(<StatsSidebar players={PLAYERS} weeks={nine} leagueDayIndex={4} canSeeMargins isAdmin />)
    expect(screen.getByText('Winning Margins')).toBeInTheDocument()
  })
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npm test -- __tests__/stats-sidebar.test.tsx -t "Winning Margins"`
Expected: FAIL, the card is never rendered (and TypeScript in Jest may flag the unknown props).

- [ ] **Step 3: Wire up `StatsSidebar`**

In `components/StatsSidebar.tsx`, replace `StatsSidebarProps` with:

```ts
interface StatsSidebarProps {
  players: Player[]
  weeks: Week[]
  leagueDayIndex?: number
  linkedPlayerName?: string | null
  /** margin_stats flag, resolved for the viewer's tier. */
  canSeeMargins?: boolean
  isAdmin?: boolean
}
```

Replace the `StatsSidebar` function with:

```tsx
export function StatsSidebar({ players, weeks, leagueDayIndex, linkedPlayerName, canSeeMargins = false, isAdmin = false }: StatsSidebarProps) {
  return (
    <div className="flex flex-col gap-3">
      <YourStatsWidget players={players} linkedPlayerName={linkedPlayerName} />
      <TeammatesWidget players={players} weeks={weeks} linkedPlayerName={linkedPlayerName} />
      <QuarterlyTableWidget weeks={weeks} leagueDayIndex={leagueDayIndex} />
      <InFormWidget    players={players} weeks={weeks} />
      <TeamABWidget    weeks={weeks} />
      {canSeeMargins && <MarginsWidget weeks={weeks} isAdmin={isAdmin} />}
    </div>
  )
}
```

- [ ] **Step 4: Run the tests to check they pass**

Run: `npm test -- __tests__/stats-sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Pass the flag from the layout**

In `app/[slug]/(tabs)/layout.tsx`, change line 4 to:

```ts
import { isFeatureEnabled, isLeagueHidden } from '@/lib/features'
```

In `LeagueSidebar`, replace from the `if (isLeagueHidden(…))` line to the end of the returned JSX with:

```tsx
  const tier = resolveVisibilityTier(userRole)
  if (isLeagueHidden(features, tier)) return null

  // Large screens only. Below lg these stats live on the Overview tab.
  return (
    <SidebarSticky>
      <StatsSidebar
        players={players}
        weeks={weeks}
        leagueDayIndex={dayNameToIndex(game.day ?? null) ?? undefined}
        linkedPlayerName={claim.playerName}
        canSeeMargins={isFeatureEnabled(features, 'margin_stats', tier)}
        isAdmin={tier === 'admin'}
      />
    </SidebarSticky>
  )
```

- [ ] **Step 6: Render on Overview**

In `app/[slug]/(tabs)/overview/page.tsx`, change line 15 to:

```ts
import { InFormWidget, MarginsWidget, TeamABWidget } from '@/components/StatsSidebar'
```

After the `const canShareLineupImage = …` line, add:

```ts
  const canSeeMargins = isFeatureEnabled(features, 'margin_stats', tier)
```

After `<TeamABWidget weeks={weeks} size="page" linkedPlayer={linkedPlayer} />`, add:

```tsx
        {canSeeMargins && <MarginsWidget weeks={weeks} size="page" isAdmin={isAdmin} />}
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add components/StatsSidebar.tsx __tests__/stats-sidebar.test.tsx "app/[slug]/(tabs)/layout.tsx" "app/[slug]/(tabs)/overview/page.tsx"
git commit -m "Show Winning Margins in the sidebar and on Overview

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Full verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no new errors in the touched files.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Manual check notes**

Local dev uses the production Supabase project. The card will not appear for anyone, admins included, until `20261006000002_seed_margin_stats.sql` is applied (`getFeatures` drops features missing from `feature_experiments`). Do not apply it from the agent: the user runs it by hand in the Supabase SQL Editor. After that, an admin of `craft-football` should see the card under Head to Head with avg 2.9, +7, and close games 35%. Before that, check the card's look through the Jest tests only.
