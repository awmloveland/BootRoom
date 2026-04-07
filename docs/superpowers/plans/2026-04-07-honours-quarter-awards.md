# Honours Quarter Awards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a horizontal scrollable row of personal award chips (Champion, Iron Man, Win Machine, Sharp Shooter, Clutch, Untouchable, On Fire) inside each expanded quarter card on the Honours tab.

**Architecture:** Extend `computeAllCompletedQuarters` in `lib/sidebar-stats.ts` to compute awards alongside standings. `CompletedQuarter` gains an `awards: QuarterAward[]` field. `QuarterCard` in `HonoursSection.tsx` renders the row from `quarter.awards`.

**Tech Stack:** TypeScript, React, Tailwind CSS, Radix Collapsible, Jest

---

## File Map

| File | Change |
|---|---|
| `lib/sidebar-stats.ts` | Add `QuarterAward` type; add `awards` to `CompletedQuarter`; add `maxBy`, `longestWinStreak`, `buildQuarterAwards` helpers; wire into `computeAllCompletedQuarters` |
| `__tests__/sidebar-stats.test.ts` | Add tests for `longestWinStreak` (via `buildQuarterAwards`) and all award logic |
| `components/HonoursSection.tsx` | Render awards row inside `QuarterCard` collapsible content |
| `app/globals.css` | Add `.scrollbar-hide` utility |

---

## Task 1: Add `QuarterAward` type and stub `awards` on `CompletedQuarter`

**Files:**
- Modify: `lib/sidebar-stats.ts`

This task adds the new type and updates the push in `computeAllCompletedQuarters` to include `awards: []` as a stub. This keeps the TypeScript compiler happy and lets existing tests continue to pass before the real computation is wired in.

- [ ] **Step 1: Add `QuarterAward` interface and update `CompletedQuarter`**

In `lib/sidebar-stats.ts`, add the `QuarterAward` interface directly after the `QuarterlyEntry` interface (around line 90), and add `awards` to `CompletedQuarter`:

```ts
export interface QuarterAward {
  key: 'champion' | 'iron_man' | 'win_machine' | 'sharp_shooter' | 'clutch' | 'untouchable' | 'on_fire'
  nickname: string
  icon: string
  player: string
  stat: string  // pre-formatted, e.g. "2.3 PPG", "5-game streak"
}

// Update the existing CompletedQuarter interface — add the awards field:
export interface CompletedQuarter {
  quarterLabel: string      // e.g. "Q1 25"
  year: number
  q: number
  champion: string          // top-ranked player name
  entries: QuarterlyEntry[] // full table, all players, sorted points desc → wins desc → name asc
  awards: QuarterAward[]    // ordered: champion first, rest conditional
}
```

- [ ] **Step 2: Update the `completed.push()` call with a stub**

In `computeAllCompletedQuarters`, the push on line 222 currently reads:
```ts
completed.push({ quarterLabel, year, q, champion, entries })
```

Change it to:
```ts
completed.push({ quarterLabel, year, q, champion, entries, awards: [] })
```

- [ ] **Step 3: Verify existing tests still pass**

```bash
npm test -- --testPathPattern=sidebar-stats
```

Expected: all existing tests pass (the `awards: []` stub satisfies TypeScript; no existing test checks `awards`).

- [ ] **Step 4: Commit**

```bash
git add lib/sidebar-stats.ts
git commit -m "feat: add QuarterAward type and stub awards on CompletedQuarter"
```

---

## Task 2: Add `maxBy` and `longestWinStreak` helpers with tests

**Files:**
- Modify: `lib/sidebar-stats.ts`
- Modify: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Write the failing tests for `longestWinStreak`**

`longestWinStreak` is a private function, so we test it indirectly via `buildQuarterAwards` (Task 3). However, to build up the logic incrementally, add a `describe('buildQuarterAwards — On Fire award')` block to `__tests__/sidebar-stats.test.ts` at the end of the file. This references `buildQuarterAwards` which doesn't exist yet — the tests will fail to compile until Task 3.

Actually, test `longestWinStreak` logic by testing the `on_fire` award through `buildQuarterAwards` in Task 3. For now, just add `maxBy` and `longestWinStreak` to the file without tests — they're pure utility functions whose correctness will be verified by the `buildQuarterAwards` tests.

- [ ] **Step 2: Add `maxBy` to `lib/sidebar-stats.ts`**

Add this private helper near the top of the private helpers section (before `aggregateWeeks`):

```ts
function maxBy<T>(arr: T[], fn: (item: T) => number): T | undefined {
  if (arr.length === 0) return undefined
  return arr.reduce((best, item) => fn(item) > fn(best) ? item : best)
}
```

- [ ] **Step 3: Add `longestWinStreak` to `lib/sidebar-stats.ts`**

Add after `maxBy`:

```ts
function longestWinStreak(weeks: Week[]): { player: string; count: number } {
  const sorted = [...weeks].sort(
    (a, b) => parseWeekDate(a.date).getTime() - parseWeekDate(b.date).getTime()
  )
  const current = new Map<string, number>()
  const best = new Map<string, number>()

  for (const w of sorted) {
    const allPlayers = [...w.teamA, ...w.teamB]
    for (const name of allPlayers) {
      const onTeamA = w.teamA.includes(name)
      const won =
        (w.winner === 'teamA' && onTeamA) ||
        (w.winner === 'teamB' && !onTeamA)
      const streak = won ? (current.get(name) ?? 0) + 1 : 0
      current.set(name, streak)
      if (streak > (best.get(name) ?? 0)) best.set(name, streak)
    }
  }

  let topPlayer = ''
  let topCount = 0
  for (const [name, count] of best) {
    if (count > topCount) { topPlayer = name; topCount = count }
  }
  return { player: topPlayer, count: topCount }
}
```

- [ ] **Step 4: Verify no regressions**

```bash
npm test -- --testPathPattern=sidebar-stats
```

Expected: all existing tests still pass (new functions are private, no new tests yet).

- [ ] **Step 5: Commit**

```bash
git add lib/sidebar-stats.ts
git commit -m "feat: add maxBy and longestWinStreak helpers"
```

---

## Task 3: Add `buildQuarterAwards`, wire it in, and test

**Files:**
- Modify: `lib/sidebar-stats.ts`
- Modify: `__tests__/sidebar-stats.test.ts`

- [ ] **Step 1: Write failing tests for `buildQuarterAwards`**

`buildQuarterAwards` is private, so test it by calling `computeAllCompletedQuarters` with controlled data and checking `quarter.awards`. Add this describe block to `__tests__/sidebar-stats.test.ts` after the existing `computeAllCompletedQuarters` suite:

```ts
// ─── computeAllCompletedQuarters — awards ─────────────────────────────────────

describe('computeAllCompletedQuarters — awards', () => {
  // All test weeks are in Q1 2025 (end date = 31 Mar 2025, so now must be > that)
  const NOW = new Date(2025, 3, 1) // 1 Apr 2025

  function makeQ1Week(overrides: Partial<Week> & { week: number }): Week {
    return {
      date: '06 Jan 2025',
      status: 'played',
      teamA: ['Alice'],
      teamB: ['Bob'],
      winner: 'teamA',
      ...overrides,
    }
  }

  function getQ1Awards(weeks: Week[]) {
    const result = computeAllCompletedQuarters(weeks, NOW)
    return result[0]?.quarters[0]?.awards ?? []
  }

  it('champion chip is always first and uses top-of-standings player', () => {
    const weeks = [
      makeQ1Week({ week: 1, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeQ1Week({ week: 2, date: '13 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    // Alice: 2 wins = 6 pts. Bob: 0 pts.
    const awards = getQ1Awards(weeks)
    expect(awards[0].key).toBe('champion')
    expect(awards[0].player).toBe('Alice')
    expect(awards[0].stat).toBe('6 pts')
  })

  it('iron_man is the player with most games played', () => {
    const weeks = [
      makeQ1Week({ week: 1, teamA: ['Alice', 'Bob'], teamB: ['Charlie'], winner: 'teamA' }),
      makeQ1Week({ week: 2, date: '13 Jan 2025', teamA: ['Alice', 'Bob'], teamB: ['Charlie'], winner: 'teamA' }),
      makeQ1Week({ week: 3, date: '20 Jan 2025', teamA: ['Alice'], teamB: ['Charlie'], winner: 'teamA' }),
    ]
    // Alice: 3 games. Bob: 2. Charlie: 3.
    const awards = getQ1Awards(weeks)
    const ironMan = awards.find(a => a.key === 'iron_man')
    expect(ironMan).toBeDefined()
    // Alice and Charlie both played 3 — tie goes to earlier standings rank (Alice leads on pts)
    expect(ironMan!.player).toBe('Alice')
    expect(ironMan!.stat).toBe('3 games')
  })

  it('win_machine is the player with most wins', () => {
    const weeks = [
      makeQ1Week({ week: 1, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeQ1Week({ week: 2, date: '13 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const awards = getQ1Awards(weeks)
    const winMachine = awards.find(a => a.key === 'win_machine')
    expect(winMachine!.player).toBe('Alice')
    expect(winMachine!.stat).toBe('2 wins')
  })

  it('win_machine is absent when nobody has any wins', () => {
    const weeks = [
      makeQ1Week({ week: 1, teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
    ]
    const awards = getQ1Awards(weeks)
    expect(awards.find(a => a.key === 'win_machine')).toBeUndefined()
  })

  it('sharp_shooter uses points/played and requires min 3 games', () => {
    const weeks = [
      // Alice: 3 wins in 3 games → 9 pts, PPG 3.0
      makeQ1Week({ week: 1, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeQ1Week({ week: 2, date: '13 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeQ1Week({ week: 3, date: '20 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const awards = getQ1Awards(weeks)
    const ss = awards.find(a => a.key === 'sharp_shooter')
    expect(ss).toBeDefined()
    expect(ss!.player).toBe('Alice')
    expect(ss!.stat).toBe('3.0 PPG')
  })

  it('sharp_shooter is absent when no player has 3+ games', () => {
    const weeks = [
      makeQ1Week({ week: 1, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const awards = getQ1Awards(weeks)
    expect(awards.find(a => a.key === 'sharp_shooter')).toBeUndefined()
  })

  it('clutch is absent when best win-rate player has 0 wins', () => {
    const weeks = [
      makeQ1Week({ week: 1, teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
      makeQ1Week({ week: 2, date: '13 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
      makeQ1Week({ week: 3, date: '20 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
    ]
    const awards = getQ1Awards(weeks)
    expect(awards.find(a => a.key === 'clutch')).toBeUndefined()
  })

  it('untouchable requires 0 losses and min 3 games', () => {
    const weeks = [
      makeQ1Week({ week: 1, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeQ1Week({ week: 2, date: '13 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'draw' }),
      makeQ1Week({ week: 3, date: '20 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const awards = getQ1Awards(weeks)
    const ut = awards.find(a => a.key === 'untouchable')
    expect(ut).toBeDefined()
    expect(ut!.player).toBe('Alice')
    expect(ut!.stat).toBe('3 games, 0 losses')
  })

  it('untouchable is absent when all qualified players have at least one loss', () => {
    const weeks = [
      makeQ1Week({ week: 1, teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeQ1Week({ week: 2, date: '13 Jan 2025', teamA: ['Bob'], teamB: ['Alice'], winner: 'teamA' }),
      makeQ1Week({ week: 3, date: '20 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    // Alice: 2W 1L. Bob: 1W 2L. Both have losses.
    const awards = getQ1Awards(weeks)
    expect(awards.find(a => a.key === 'untouchable')).toBeUndefined()
  })

  it('on_fire requires a streak of at least 2 consecutive wins', () => {
    const weeks = [
      makeQ1Week({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeQ1Week({ week: 2, date: '13 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeQ1Week({ week: 3, date: '20 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
    ]
    const awards = getQ1Awards(weeks)
    const onFire = awards.find(a => a.key === 'on_fire')
    expect(onFire).toBeDefined()
    expect(onFire!.player).toBe('Alice')
    expect(onFire!.stat).toBe('3-game streak')
  })

  it('on_fire is absent when no player has 2+ consecutive wins', () => {
    const weeks = [
      makeQ1Week({ week: 1, date: '06 Jan 2025', teamA: ['Alice'], teamB: ['Bob'], winner: 'teamA' }),
      makeQ1Week({ week: 2, date: '13 Jan 2025', teamA: ['Bob'], teamB: ['Alice'], winner: 'teamA' }), // Bob wins
    ]
    // Alice: W then L. Bob: L then W. No streak ≥ 2.
    const awards = getQ1Awards(weeks)
    expect(awards.find(a => a.key === 'on_fire')).toBeUndefined()
  })

  it('returns empty awards array for a quarter with a single player', () => {
    const weeks = [
      makeQ1Week({ week: 1, teamA: ['Alice'], teamB: [], winner: 'teamA' }),
      makeQ1Week({ week: 2, date: '13 Jan 2025', teamA: ['Alice'], teamB: [], winner: 'teamA' }),
      makeQ1Week({ week: 3, date: '20 Jan 2025', teamA: ['Alice'], teamB: [], winner: 'teamA' }),
    ]
    // Alice wins 3 times. Champion chip always present. Iron Man present. Win Machine present.
    // Sharp Shooter present (3 games). Clutch present. Untouchable present. On Fire present.
    // (Single player corner case — all non-conditional awards still fire)
    const awards = getQ1Awards(weeks)
    expect(awards.find(a => a.key === 'champion')!.player).toBe('Alice')
  })
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
npm test -- --testPathPattern=sidebar-stats
```

Expected: FAIL — `awards` is `[]` so all award-specific assertions fail.

- [ ] **Step 3: Add `buildQuarterAwards` to `lib/sidebar-stats.ts`**

Add this private function after `longestWinStreak`:

```ts
function buildQuarterAwards(entries: QuarterlyEntry[], weekSlice: Week[]): QuarterAward[] {
  const awards: QuarterAward[] = []
  const qualified = entries.filter(e => e.played >= 3)

  // Champion — always first
  if (entries.length > 0) {
    const top = entries[0]
    awards.push({ key: 'champion', nickname: 'Champion', icon: '🏅',
      player: top.name, stat: `${top.points} pts` })
  }

  // Iron Man — most games played (no minimum)
  const ironMan = maxBy(entries, e => e.played)
  if (ironMan) {
    awards.push({ key: 'iron_man', nickname: 'Iron Man', icon: '⚽',
      player: ironMan.name, stat: `${ironMan.played} games` })
  }

  // Win Machine — most wins (must have ≥1 win)
  const winMachine = maxBy(entries, e => e.won)
  if (winMachine && winMachine.won > 0) {
    awards.push({ key: 'win_machine', nickname: 'Win Machine', icon: '🏆',
      player: winMachine.name, stat: `${winMachine.won} wins` })
  }

  // Sharp Shooter — best PPG, min 3 games
  const sharpShooter = maxBy(qualified, e => e.points / e.played)
  if (sharpShooter) {
    awards.push({ key: 'sharp_shooter', nickname: 'Sharp Shooter', icon: '⚡',
      player: sharpShooter.name, stat: `${(sharpShooter.points / sharpShooter.played).toFixed(1)} PPG` })
  }

  // Clutch — best win rate, min 3 games and ≥1 win
  const clutch = maxBy(qualified, e => e.won / e.played)
  if (clutch && clutch.won > 0) {
    awards.push({ key: 'clutch', nickname: 'Clutch', icon: '🎯',
      player: clutch.name, stat: `${Math.round((clutch.won / clutch.played) * 100)}% win rate` })
  }

  // Untouchable — zero losses, min 3 games
  const untouchable = qualified.find(e => e.lost === 0)
  if (untouchable) {
    awards.push({ key: 'untouchable', nickname: 'Untouchable', icon: '🛡️',
      player: untouchable.name, stat: `${untouchable.played} games, 0 losses` })
  }

  // On Fire — longest win streak, min 2 consecutive wins
  const streak = longestWinStreak(weekSlice)
  if (streak.count >= 2) {
    awards.push({ key: 'on_fire', nickname: 'On Fire', icon: '🔥',
      player: streak.player, stat: `${streak.count}-game streak` })
  }

  return awards
}
```

- [ ] **Step 4: Wire `buildQuarterAwards` into `computeAllCompletedQuarters`**

Replace the stub push from Task 1 with the real call. The relevant section in `computeAllCompletedQuarters` currently reads:

```ts
    const entries = aggregateWeeks(playedWeeks)
    if (entries.length === 0) continue
    const champion = entries[0].name

    completed.push({ quarterLabel, year, q, champion, entries, awards: [] })
```

Change to:

```ts
    const entries = aggregateWeeks(playedWeeks)
    if (entries.length === 0) continue
    const champion = entries[0].name
    const awards = buildQuarterAwards(entries, playedWeeks)

    completed.push({ quarterLabel, year, q, champion, entries, awards })
```

- [ ] **Step 5: Run all tests**

```bash
npm test -- --testPathPattern=sidebar-stats
```

Expected: all tests pass, including the new awards suite.

- [ ] **Step 6: Commit**

```bash
git add lib/sidebar-stats.ts __tests__/sidebar-stats.test.ts
git commit -m "feat: compute quarter awards (champion, iron man, win machine, sharp shooter, clutch, untouchable, on fire)"
```

---

## Task 4: Render the awards row in `QuarterCard`

**Files:**
- Modify: `components/HonoursSection.tsx`

- [ ] **Step 1: Add the awards row inside `Collapsible.Content`**

The `Collapsible.Content` in `QuarterCard` currently contains a single `<div className="border-t border-slate-700 px-4 py-3">` with column headers and rows. Insert the awards row immediately after the `<Collapsible.Content>` opening tag, before that `<div>`.

The updated `Collapsible.Content` block (full replacement of lines 52–112):

```tsx
        {/* Body — collapsible */}
        <Collapsible.Content className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
          {/* Awards row — shown above the table when the card is open */}
          {quarter.awards.length > 0 && (
            <div className="flex gap-2 overflow-x-auto border-t border-slate-700 px-3 py-2.5 scrollbar-hide">
              {quarter.awards.map(award => (
                <div
                  key={award.key}
                  className="flex-shrink-0 flex flex-col gap-0.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 min-w-[108px]"
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

          <div className="border-t border-slate-700 px-4 py-3">
            {/* Column headers */}
            <div className="flex items-center gap-1 pb-2 mb-1 border-b border-slate-700/40">
              <span className="flex-1 text-[10px] font-semibold uppercase text-slate-500">Player</span>
              <span className="w-[22px] text-center text-[10px] font-semibold uppercase text-slate-700">P</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">W</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">D</span>
              <span className="w-[18px] text-center text-[10px] font-semibold uppercase text-slate-700">L</span>
              <span className="w-[28px] text-right text-[10px] font-semibold uppercase text-slate-500">Pts</span>
            </div>

            {/* Standings table */}
            <div className="flex flex-col gap-[2px]">
              {visibleEntries.map((e, i) => (
                <div
                  key={e.name}
                  className={cn(
                    'flex items-center gap-1 py-[3px]',
                    i === 0 ? '-mx-4 px-4 bg-sky-400/[0.06]' : '-mx-1 px-1'
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
                  <span className="text-xs text-slate-400 w-[22px] text-center shrink-0">{e.played}</span>
                  <span className="text-xs text-slate-400 w-[18px] text-center shrink-0">{e.won}</span>
                  <span className="text-xs text-slate-400 w-[18px] text-center shrink-0">{e.drew}</span>
                  <span className="text-xs text-slate-400 w-[18px] text-center shrink-0">{e.lost}</span>
                  <span className={cn(
                    'text-sm font-bold w-[28px] text-right shrink-0',
                    i === 0 ? 'text-sky-300' : 'text-slate-200'
                  )}>
                    {e.points}
                  </span>
                </div>
              ))}
            </div>

            {/* See more / See less */}
            {hiddenCount > 0 && (
              <div className="mt-3 flex justify-center">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowAll(v => !v) }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-300 border border-slate-700 hover:border-slate-600 rounded px-3 py-1 transition-colors"
                >
                  {showAll ? 'See Less' : `See All (${quarter.entries.length})`}
                </button>
              </div>
            )}
          </div>
        </Collapsible.Content>
```

- [ ] **Step 2: Verify the TypeScript build is clean**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Verify all tests still pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add components/HonoursSection.tsx
git commit -m "feat: render quarter awards row in HonoursSection QuarterCard"
```

---

## Task 5: Add `scrollbar-hide` utility

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add `scrollbar-hide` to `app/globals.css`**

The file currently has three `@tailwind` directives and a `@layer base` block. Append a `@layer utilities` block at the end:

```css
@layer utilities {
  .scrollbar-hide {
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
}
```

- [ ] **Step 2: Verify the dev server compiles without errors**

```bash
npm run build 2>&1 | tail -20
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add scrollbar-hide utility class"
```

---

## Self-Review Checklist (for the implementer)

After completing all tasks, verify:

- [ ] `computeAllCompletedQuarters` returns `awards: QuarterAward[]` on every `CompletedQuarter`
- [ ] Champion chip is always index 0 in `awards` when entries exist
- [ ] Conditional awards (win_machine, sharp_shooter, clutch, untouchable, on_fire) are absent when their criteria aren't met
- [ ] Awards row is inside `Collapsible.Content` (not in the header — not visible when collapsed)
- [ ] Awards row does not render when `quarter.awards.length === 0`
- [ ] Scrollbar is hidden on webkit and Firefox
- [ ] `npm test` passes fully
- [ ] `npx tsc --noEmit` passes with zero errors
