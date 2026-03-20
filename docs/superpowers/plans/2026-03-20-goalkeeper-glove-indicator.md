# Goalkeeper Glove Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display 🧤 after goalkeeper names in all team lineup views for member/admin users.

**Architecture:** Thread a `goalkeepers?: string[]` prop down from the server page through `WeekList` → `MatchCard` → `TeamList`. `NextMatchCard` derives its own array from its existing `allPlayers` prop. All props are optional so existing call sites without goalkeeper data need no changes. `string[]` is used (not `Set`) because `results/page.tsx` is a Server Component and `Set` cannot cross the Next.js serialization boundary.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), React, Tailwind CSS, Jest + ts-jest

---

## Files Modified

| File | Change |
|---|---|
| `lib/__tests__/goalkeeper.test.ts` | New — unit tests for goalkeeper derivation + include logic |
| `components/TeamList.tsx` | Add `goalkeepers?: string[]` prop; append 🧤 via `includes()` |
| `components/MatchCard.tsx` | Add + forward `goalkeepers?: string[]` through `PlayedCard` |
| `components/WeekList.tsx` | Add + forward `goalkeepers?: string[]` to each `MatchCard` |
| `components/PublicMatchList.tsx` | **No change** — intentionally omitted; public tier shows no badges; `MatchCard`'s `goalkeepers` prop is optional so no TypeScript error results |
| `components/NextMatchCard.tsx` | Derive array from `allPlayers`; pass to `TeamList` in lineup state; add emoji to builder tiles |
| `app/[leagueId]/results/page.tsx` | Extend player fetch condition; derive `goalkeepers`; pass to `WeekList` |

---

## Task 1: Write and verify goalkeeper logic tests

**Files:**
- Create: `lib/__tests__/goalkeeper.test.ts`

This validates the two pieces of pure logic used across the implementation:
1. Deriving a `string[]` of goalkeeper names from a `Player[]`
2. The `includes()` check used in `TeamList` to decide whether to show the badge

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/goalkeeper.test.ts`:

```ts
import type { Player } from '@/lib/types'

function makePlayer(name: string, goalkeeper: boolean): Player {
  return {
    name,
    goalkeeper,
    played: 0, won: 0, drew: 0, lost: 0,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: false, points: 0,
    mentality: 'balanced', rating: 0, recentForm: '',
  }
}

describe('goalkeeper name derivation', () => {
  it('extracts only goalkeeper names from player list', () => {
    const players = [
      makePlayer('Alice', true),
      makePlayer('Bob', false),
      makePlayer('Carol', true),
    ]
    const goalkeepers = players.filter(p => p.goalkeeper).map(p => p.name)
    expect(goalkeepers).toEqual(['Alice', 'Carol'])
  })

  it('returns empty array when no players are goalkeepers', () => {
    const players = [makePlayer('Bob', false), makePlayer('Dave', false)]
    const goalkeepers = players.filter(p => p.goalkeeper).map(p => p.name)
    expect(goalkeepers).toEqual([])
  })

  it('returns empty array when player list is empty', () => {
    const goalkeepers = ([] as Player[]).filter(p => p.goalkeeper).map(p => p.name)
    expect(goalkeepers).toEqual([])
  })
})

describe('goalkeeper badge inclusion check', () => {
  it('finds a goalkeeper by exact name match', () => {
    const goalkeepers = ['Alice', 'Carol']
    expect(goalkeepers.includes('Alice')).toBe(true)
  })

  it('does not match a non-goalkeeper', () => {
    const goalkeepers = ['Alice']
    expect(goalkeepers.includes('Bob')).toBe(false)
  })

  it('returns undefined (falsy) when goalkeepers prop is undefined', () => {
    const goalkeepers: string[] | undefined = undefined
    // This is how TeamList will call it: goalkeepers?.includes(player)
    // undefined means no badge — correct behaviour
    expect(goalkeepers?.includes('Alice')).toBeUndefined()
  })

  it('is case-sensitive — mismatched casing produces no badge', () => {
    const goalkeepers = ['Alice']
    expect(goalkeepers.includes('alice')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
npm test lib/__tests__/goalkeeper.test.ts
```

Expected: All tests PASS immediately. These tests validate built-in JS behaviour (`filter`, `map`, `includes`) and the `Player` type import — no implementation of new functions is needed. If any fail, there is a problem with the `Player` type shape or test setup. Fix before proceeding.

- [ ] **Step 3: Commit the tests**

```bash
git add lib/__tests__/goalkeeper.test.ts
git commit -m "test: add goalkeeper name derivation and badge inclusion tests"
```

---

## Task 2: Update `TeamList` to render 🧤 for goalkeepers

**Files:**
- Modify: `components/TeamList.tsx`

- [ ] **Step 1: Read the current file**

Read `components/TeamList.tsx`. It currently has:
```tsx
interface TeamListProps {
  label: string
  players: string[]
}
```
And renders each player in a `<li>` as plain text.

- [ ] **Step 2: Add the `goalkeepers` prop and emoji render**

Replace the entire file content with:

```tsx
interface TeamListProps {
  label: string
  players: string[]
  goalkeepers?: string[]
}

export function TeamList({ label, players, goalkeepers }: TeamListProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        {label}
      </h3>
      <ul className="space-y-1">
        {players.map((player, i) => (
          <li
            key={i}
            className="text-sm font-medium text-slate-100 pl-3 border-l-2 border-slate-700"
          >
            {player}{goalkeepers?.includes(player) ? ' 🧤' : ''}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors. If there are errors, they will be in `TeamList.tsx` — fix them before proceeding.

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```

Expected: All tests pass (including the goalkeeper tests from Task 1).

- [ ] **Step 5: Commit**

```bash
git add components/TeamList.tsx
git commit -m "feat: add goalkeepers prop to TeamList, render 🧤 for goalkeeper names"
```

---

## Task 3: Update `MatchCard` to forward `goalkeepers` prop

**Files:**
- Modify: `components/MatchCard.tsx`

`MatchCard` has two internal sub-components: `CancelledCard` (no lineup, no change needed) and `PlayedCard` (renders two `TeamList` instances). Both are unexported; the outer `MatchCard` function routes between them.

- [ ] **Step 1: Read the current file**

Read `components/MatchCard.tsx`. Note the `MatchCardProps` interface and `PlayedCard` function signature.

- [ ] **Step 2: Add `goalkeepers` to both interfaces and forward**

Make these targeted changes:

**`MatchCardProps` interface** — add `goalkeepers` here (not a separate `PlayedCardProps`). `PlayedCard` and the exported `MatchCard` both use this same interface, so one change covers both. `CancelledCard` has its own `{ week: Week }` interface and is unaffected.
```ts
interface MatchCardProps {
  week: Week
  isOpen: boolean
  onToggle: () => void
  goalkeepers?: string[]
}
```

**`PlayedCard`** — find the two `<TeamList>` calls inside the collapsible content and add `goalkeepers`:
```tsx
<TeamList label="Team A" players={week.teamA} goalkeepers={goalkeepers} />
<TeamList label="Team B" players={week.teamB} goalkeepers={goalkeepers} />
```

The `goalkeepers` prop is already in scope because `PlayedCard` receives `MatchCardProps` which now includes it.

`CancelledCard` — leave entirely unchanged. It accepts only `{ week: Week }` and renders no lineup.

The exported `MatchCard` function already passes all its props to either `CancelledCard` or `PlayedCard`, so no change to its body is needed — `PlayedCard` destructures from `MatchCardProps` directly.

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/MatchCard.tsx
git commit -m "feat: forward goalkeepers prop through MatchCard to TeamList"
```

---

## Task 4: Update `WeekList` to forward `goalkeepers` prop

**Files:**
- Modify: `components/WeekList.tsx`

`PublicMatchList.tsx` is **not changed** — it renders the public tier where goalkeeper badges intentionally do not appear.

- [ ] **Step 1: Read the current file**

Read `components/WeekList.tsx`. It has `interface Props { weeks: Week[] }` and renders `<MatchCard>` for each week.

- [ ] **Step 2: Add `goalkeepers` and forward**

```tsx
import type { Week } from '@/lib/types'

interface Props {
  weeks: Week[]
  goalkeepers?: string[]
}

export function WeekList({ weeks, goalkeepers }: Props) {
  // ... existing state and logic unchanged ...

  return (
    <div className="flex flex-col gap-3">
      {weeks.map((week, index) => {
        // ... existing monthChanged logic unchanged ...
        return (
          <Fragment key={week.week}>
            {monthChanged && <MonthDivider label={formatMonthYear(week.date)} />}
            <MatchCard
              week={week}
              isOpen={openWeek === week.week}
              onToggle={() => setOpenWeek((prev) => (prev === week.week ? null : week.week))}
              goalkeepers={goalkeepers}
            />
          </Fragment>
        )
      })}
    </div>
  )
}
```

Only the `interface Props` and the `<MatchCard>` call change. Everything else in the file stays the same.

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add components/WeekList.tsx
git commit -m "feat: forward goalkeepers prop through WeekList to MatchCard"
```

---

## Task 5: Update `NextMatchCard` — lineup state and builder tiles

**Files:**
- Modify: `components/NextMatchCard.tsx`

There are two independent locations in this large file:

**Location A — Lineup state** (around line 761–767): the `cardState === 'lineup'` block that renders `<TeamList>` with `scheduledWeek.teamA` and `scheduledWeek.teamB`.

**Location B — Auto-pick builder tiles** (around line 604–628): inside the `renderTeam` function in the `isAutoPickMode` block, where each player card renders `{p.name}`.

- [ ] **Step 1: Read the current file**

Read `components/NextMatchCard.tsx`. Locate:
1. The `cardState === 'lineup'` section (search for `scheduledWeek.teamA`)
2. The `renderTeam` function where `p.name` is rendered (search for `text-xs font-medium.*p.name`)

- [ ] **Step 2: Add goalkeeper array derivation and lineup state TeamList props**

After the existing `useMemo` hooks (around line 140), add using `useMemo` to match the existing pattern in this file:

```tsx
const goalkeepers = useMemo(
  () => allPlayers.filter(p => p.goalkeeper).map(p => p.name),
  [allPlayers]
)
```

Note: `allPlayers` defaults to `[]`, so in public mode (`PublicMatchEntrySection` usage) this correctly produces an empty array and no badges are shown.

In the lineup state block, find:
```tsx
<TeamList label="Team A" players={scheduledWeek.teamA} />
<TeamList label="Team B" players={scheduledWeek.teamB} />
```

Change to:
```tsx
<TeamList label="Team A" players={scheduledWeek.teamA} goalkeepers={goalkeepers} />
<TeamList label="Team B" players={scheduledWeek.teamB} goalkeepers={goalkeepers} />
```

- [ ] **Step 3: Add emoji to builder tiles**

In the `renderTeam` function, find the player name span (inside the `players.map` in the auto-pick result section):

```tsx
<span className={cn('text-xs font-medium', team === 'A' ? 'text-sky-100' : 'text-violet-100')}>{p.name}</span>
```

Change to:
```tsx
<span className={cn('text-xs font-medium', team === 'A' ? 'text-sky-100' : 'text-violet-100')}>
  {p.name}{p.goalkeeper ? ' 🧤' : ''}
</span>
```

Guest players always have `goalkeeper: false` (set in `resolvePlayersForAutoPick`), so they correctly receive no badge.

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: show 🧤 in NextMatchCard lineup state and auto-pick builder tiles"
```

---

## Task 6: Extend player fetch in `results/page.tsx` and pass `goalkeepers` to `WeekList`

**Files:**
- Modify: `app/[leagueId]/results/page.tsx`

This is the final wiring step. The server page already fetches `players` for match_entry; we extend that to also cover match_history, derive the `goalkeepers` string array, and pass it to `<WeekList>`.

- [ ] **Step 1: Read the relevant section**

Read `app/[leagueId]/results/page.tsx`. Find step 7 (around line 147):
```ts
let players: Player[] = []
if (tier !== 'public' && canSeeMatchEntry) {
```

- [ ] **Step 2: Extend the fetch condition**

Change:
```ts
if (tier !== 'public' && canSeeMatchEntry) {
```
To:
```ts
if (tier !== 'public' && (canSeeMatchHistory || canSeeMatchEntry)) {
```

This ensures `players` is populated for member/admin users who can see match history even when match_entry is disabled — so goalkeeper badges appear in the history view.

- [ ] **Step 3: Derive the goalkeeper array**

Immediately after the `players` fetch block (after the closing `}`), add:

```ts
const goalkeepers = players.filter(p => p.goalkeeper).map(p => p.name)
```

- [ ] **Step 4: Pass `goalkeepers` to `<WeekList>` in both render paths**

There are two places where `<WeekList>` is rendered: the public tier (uses `PublicMatchList` — no change needed) and the member/admin tier. In the member/admin render block, find:

```tsx
<WeekList weeks={weeks} />
```

Change to:
```tsx
<WeekList weeks={weeks} goalkeepers={goalkeepers} />
```

Note: `ResultsRefresher` already receives `allPlayers={players}` and passes it to `NextMatchCard`, which derives its own `goalkeepers` array internally. No change to `ResultsRefresher`'s props is needed.

- [ ] **Step 5: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors. This is the most important check — it verifies the full prop chain from page → WeekList → MatchCard → TeamList is type-correct end-to-end.

- [ ] **Step 6: Run the full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/[leagueId]/results/page.tsx
git commit -m "feat: extend player fetch and pass goalkeepers to WeekList for match history badges"
```

---

## Task 7: Visual verification

No automated tests cover React rendering in this codebase. Verify the feature visually before pushing.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Check each location**

Sign in as a member or admin and navigate to a league that has a goalkeeper (e.g., Alice).

| Location | What to look for |
|---|---|
| Match history — expand a past game | Alice's name appears as "Alice 🧤" in Team A or Team B list |
| Next match — saved lineup state | "Alice 🧤" in the upcoming lineup card |
| Team builder — after running auto-pick | "Alice 🧤" in the draggable team tiles |
| Player selection pills | Alice's pill shows just "Alice" — no emoji |
| Public page (not logged in) | No 🧤 anywhere — badges hidden for public tier |

- [ ] **Step 3: Confirm non-goalkeeper names are unaffected**

Open any match card. Non-goalkeeper players should have no emoji.

- [ ] **Step 4: Final commit if any visual fixes needed**

If visual issues were found and fixed in the steps above, commit the fixes. Otherwise:

```bash
git log --oneline -6
```

Verify all 6 feature commits are present cleanly.
