# Player Card Dynamic Metric Chip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When sorting players by Won, Win Rate, or Recent Form, each player card header shows that player's value for the active metric instead of always showing games played.

**Architecture:** Pass `sortBy` from `PublicPlayerList` down to `PlayerCard` as a new prop. Inside `PlayerCard`, a `HEADER_METRIC` config map converts each `SortKey` to a display `ReactNode`. `SortKey` is moved from `PublicPlayerList` to `lib/types.ts` so both components can import it cleanly.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS, React, `FormDots` component (`components/FormDots.tsx`)

---

## File Map

| File | Change |
|---|---|
| `lib/types.ts` | Add `SortKey` export |
| `components/PublicPlayerList.tsx` | Import `SortKey` from `@/lib/types`; pass `sortBy` prop to `<PlayerCard>` |
| `components/PlayerCard.tsx` | Import `SortKey` + `FormDots`; add `sortBy` prop; add `HEADER_METRIC` map; replace hardcoded chip |

---

## Task 1: Export `SortKey` from `lib/types.ts`

`SortKey` is currently defined locally in `PublicPlayerList.tsx`. Moving it to `lib/types.ts` lets `PlayerCard` import it without a sibling component dependency.

**Files:**
- Modify: `lib/types.ts`
- Modify: `components/PublicPlayerList.tsx`

- [ ] **Step 1: Add `SortKey` to `lib/types.ts`**

Open `lib/types.ts` and add the following export anywhere in the file (after the existing type definitions is fine):

```ts
export type SortKey = 'name' | 'played' | 'won' | 'winRate' | 'recentForm'
```

- [ ] **Step 2: Update `PublicPlayerList.tsx` to import from `@/lib/types`**

In `components/PublicPlayerList.tsx`, replace the local `SortKey` type definition:

```ts
// Remove this:
type SortKey = 'name' | 'played' | 'won' | 'winRate' | 'recentForm'
```

Add `SortKey` to the existing `@/lib/types` import at the top of the file:

```ts
import type { Player, SortKey } from '@/lib/types'
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If errors appear, check that `SortKey` is exported from `lib/types.ts` and imported (not re-defined) in `PublicPlayerList.tsx`.

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts components/PublicPlayerList.tsx
git commit -m "refactor: move SortKey type to lib/types"
```

---

## Task 2: Pass `sortBy` prop to `PlayerCard`

`PublicPlayerList` already holds `sortBy` state. Wire it into every `PlayerCard` render call.

**Files:**
- Modify: `components/PublicPlayerList.tsx`

- [ ] **Step 1: Add `sortBy` to each `PlayerCard` call**

In `components/PublicPlayerList.tsx`, find the `displayed.map` block (around line 140) and add `sortBy={sortBy}` to each `<PlayerCard>`:

```tsx
displayed.map((player) => (
  <PlayerCard
    key={player.name}
    player={player}
    isOpen={openPlayer === player.name}
    onToggle={() => setOpenPlayer((prev) => (prev === player.name ? null : player.name))}
    visibleStats={visibleStats}
    showMentality={showMentality}
    sortBy={sortBy}
  />
))
```

At this point TypeScript will error because `PlayerCard` doesn't accept `sortBy` yet — that's expected and will be fixed in Task 3.

- [ ] **Step 2: Commit (WIP — intentionally broken)**

```bash
git add components/PublicPlayerList.tsx
git commit -m "wip: pass sortBy to PlayerCard (prop not yet accepted)"
```

> **Note:** If CI runs `tsc --noEmit` on every commit, this WIP commit will fail the type check. In that case, skip this commit and fold Tasks 2 and 3 into a single commit after Task 3 Step 4 passes.

---

## Task 3: Add `HEADER_METRIC` map and dynamic chip to `PlayerCard`

This is the core change. Replace the hardcoded `{player.played} games` chip with a lookup that renders the active sort metric.

**Files:**
- Modify: `components/PlayerCard.tsx`

- [ ] **Step 1: Add `sortBy` to `PlayerCardProps` and import dependencies**

Open `components/PlayerCard.tsx`. Add `SortKey` to the existing `@/lib/types` import and add a new import for `FormDots`:

```ts
import type { Player, SortKey } from '@/lib/types'
import { FormDots } from '@/components/FormDots'
```

Add `sortBy` to `PlayerCardProps`:

```ts
interface PlayerCardProps {
  player: Player
  isOpen: boolean
  onToggle: () => void
  sortBy: SortKey
  /** Stat keys to show in the expanded body — undefined means show all */
  visibleStats?: string[]
  /** Whether to show the ATT/BAL/DEF/GK mentality badge — defaults to true */
  showMentality?: boolean
}
```

Update the destructure in the function signature:

```ts
export function PlayerCard({
  player,
  isOpen,
  onToggle,
  sortBy,
  visibleStats,
  showMentality = true,
}: PlayerCardProps) {
```

- [ ] **Step 2: Add the `HEADER_METRIC` config map**

Add this constant after the existing `STAT_ROWS` array (before the `PlayerCard` function definition):

```tsx
const HEADER_METRIC: Record<SortKey, (p: Player) => React.ReactNode> = {
  name:       (p) => `${p.played} games`,
  played:     (p) => `${p.played} games`,
  won:        (p) => (
    <>
      <span className="font-semibold text-slate-100">{p.won}</span>
      <span className="text-xs text-slate-400"> wins</span>
    </>
  ),
  winRate:    (p) => (
    <>
      <span className="font-semibold text-slate-100">{p.winRate.toFixed(1)}%</span>
      <span className="text-xs text-slate-400"> win rate</span>
    </>
  ),
  recentForm: (p) =>
    p.recentForm ? <FormDots form={p.recentForm} /> : `${p.played} games`,
}
```

**Edge cases handled by this map:**
- `won = 0` → renders `0 wins` (acceptable)
- `winRate = 0` → renders `0.0% win rate` (acceptable)
- `recentForm = ''` → falls back to `{p.played} games` to avoid a blank chip

- [ ] **Step 3: Replace the hardcoded chip in the card header**

Find the existing chip in the `<Collapsible.Trigger>` button (currently around line 85):

```tsx
<span className="text-xs text-slate-400">{player.played} games</span>
```

Replace it with:

```tsx
<span className="text-xs text-slate-400 flex items-center gap-1">
  {HEADER_METRIC[sortBy](player)}
</span>
```

Note: The outer `text-xs text-slate-400` acts as defaults for plain-string cases (`name`, `played`, empty-`recentForm` fallback). `FormDots` overrides colours via its own per-character class names, so the inherited defaults don't conflict.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. Common issues to check:
- `SortKey` imported from `@/lib/types` in both files
- `FormDots` imported in `PlayerCard.tsx`
- `HEADER_METRIC` defined before the `PlayerCard` function

- [ ] **Step 5: Smoke test in the browser**

Start the dev server:

```bash
npm run dev
```

Navigate to the players tab of any league. Verify:
1. Default sort (Name) → cards show `{n} games` as before
2. Click **Games Played** sort → cards still show `{n} games`
3. Click **Won** sort → cards show `{n} wins`
4. Click **Win Rate** sort → cards show `{n.n}% win rate`
5. Click **Recent Form** sort → cards show W/D/L letters in sky/slate/red
6. Toggle sort direction (Low–High / High–Low) → metric chip stays correct, order changes
7. Search for a player → chip updates correctly for that player
8. Expand a card → expanded body stats are unchanged

- [ ] **Step 6: Commit**

```bash
git add components/PlayerCard.tsx
git commit -m "feat: show active sort metric in player card header chip"
```
