# New Player AutoPick Balance Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace index-based new-player pinning in `autoPick()` with a post-generation count-balance filter, so new players are distributed by rating rather than insertion order.

**Architecture:** Remove the `newPlayerPinsA`/`newPlayerPinsB` parameters and pin loop from `autoPick()`. Add an optional `newPlayerNames` set used only as a post-filter: any split where new-player count differs by more than 1 between teams is discarded, with a fallback to the full set if no split passes. `NextMatchCard` passes the set instead of computing pin arrays.

**Tech Stack:** TypeScript, Jest (`npm test`)

---

## File Map

| File | Change |
|---|---|
| `lib/autoPick.ts` | Remove pin params + loop; add `newPlayerNames?: Set<string>`; add count-balance filter |
| `components/NextMatchCard.tsx` | Remove pin computation; pass `newPlayerNameSet` to `autoPick` |
| `lib/__tests__/autoPick.test.ts` | Remove old pin tests; add count-balance filter tests |

---

### Task 1: Replace old pin tests with count-balance filter tests

**Files:**
- Modify: `lib/__tests__/autoPick.test.ts:189-261`

- [ ] **Step 1: Delete the `newPlayerPinsA / newPlayerPinsB` describe block**

Replace lines 189–261 (the entire `describe('autoPick — newPlayerPinsA / newPlayerPinsB', ...)` block) with the following:

```ts
// ─── New player count-balance filter ─────────────────────────────────────────

describe('autoPick — newPlayerNames count-balance filter', () => {
  it('splits 4 new players evenly (2 per team) in all suggestions', () => {
    // 6 rated players + 4 new players (all same wprOverride → algorithm needs
    // count-balance filter to guarantee even split)
    const rated = Array.from({ length: 6 }, (_, i) =>
      makePlayer(`Rated ${i + 1}`, { wprOverride: 60 })
    )
    const newPlayers = [
      makePlayer('New1', { wprOverride: 50 }),
      makePlayer('New2', { wprOverride: 50 }),
      makePlayer('New3', { wprOverride: 50 }),
      makePlayer('New4', { wprOverride: 50 }),
    ]
    const newPlayerNames = new Set(newPlayers.map((p) => p.name))
    const result = autoPick([...rated, ...newPlayers], undefined, newPlayerNames)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      const countA = s.teamA.filter((p) => newPlayerNames.has(p.name)).length
      const countB = s.teamB.filter((p) => newPlayerNames.has(p.name)).length
      expect(Math.abs(countA - countB)).toBeLessThanOrEqual(1)
    }
  })

  it('splits 5 new players with at most a 1-player count difference per team', () => {
    const rated = Array.from({ length: 5 }, (_, i) =>
      makePlayer(`Rated ${i + 1}`, { wprOverride: 60 })
    )
    const newPlayers = Array.from({ length: 5 }, (_, i) =>
      makePlayer(`New ${i + 1}`, { wprOverride: 50 })
    )
    const newPlayerNames = new Set(newPlayers.map((p) => p.name))
    const result = autoPick([...rated, ...newPlayers], undefined, newPlayerNames)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      const countA = s.teamA.filter((p) => newPlayerNames.has(p.name)).length
      const countB = s.teamB.filter((p) => newPlayerNames.has(p.name)).length
      expect(Math.abs(countA - countB)).toBeLessThanOrEqual(1)
    }
  })

  it('uses new player wprOverride ratings to find best balance within count constraint', () => {
    // Two strong and two weak new players — algorithm should split one strong + one weak per team
    const rated = Array.from({ length: 6 }, (_, i) =>
      makePlayer(`Rated ${i + 1}`, { wprOverride: 55 })
    )
    const newPlayers = [
      makePlayer('StrongA', { wprOverride: 80 }),
      makePlayer('StrongB', { wprOverride: 80 }),
      makePlayer('WeakA', { wprOverride: 20 }),
      makePlayer('WeakB', { wprOverride: 20 }),
    ]
    const newPlayerNames = new Set(newPlayers.map((p) => p.name))

    // Run multiple times to reduce sensitivity to random sampling
    let foundGoodSplit = false
    for (let i = 0; i < 20; i++) {
      const result = autoPick([...rated, ...newPlayers], undefined, newPlayerNames)
      if (result.suggestions.length === 0) continue
      const s = result.suggestions[0]
      const strongOnA = s.teamA.filter((p) => p.name === 'StrongA' || p.name === 'StrongB').length
      const weakOnA = s.teamA.filter((p) => p.name === 'WeakA' || p.name === 'WeakB').length
      // A balanced split puts one strong and one weak per team
      if (strongOnA === 1 && weakOnA === 1) {
        foundGoodSplit = true
        break
      }
    }
    expect(foundGoodSplit).toBe(true)
  })

  it('returns valid suggestions with small squads when newPlayerNames is supplied', () => {
    // Robustness: 3 players total, 2 new. The 2v1 split has valid 1-1 new-player
    // splits (Rated+New1 vs New2, or Rated+New2 vs New1) so the filter passes —
    // we just verify the function returns suggestions and distributes all players.
    const players = [
      makePlayer('Rated', { wprOverride: 60 }),
      makePlayer('New1', { wprOverride: 50 }),
      makePlayer('New2', { wprOverride: 50 }),
    ]
    const newPlayerNames = new Set(['New1', 'New2'])
    const result = autoPick(players, undefined, newPlayerNames)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(3)
    }
  })

  it('passes no newPlayerNames — behaviour unchanged from baseline', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`Player ${i + 1}`))
    const result = autoPick(players)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(10)
    }
  })
})
```

- [ ] **Step 2: Run the new tests to confirm they fail (pin-based interface is still in place)**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/almaty && npm test -- --testPathPattern="autoPick" 2>&1 | tail -30
```

Expected: failures in the new `count-balance filter` describe block because `autoPick` still accepts pin arrays.

---

### Task 2: Update `autoPick()` — remove pins, add count-balance filter

**Files:**
- Modify: `lib/autoPick.ts`

- [ ] **Step 1: Replace the function signature and JSDoc**

Replace lines 18–34:

```ts
/**
 * Given a list of players attending the game, return up to 3 balanced team splits.
 * Uses exhaustive search for n ≤ 20, random sampling for n > 20.
 * Guest players (not in DB) should be passed with a wprOverride set to the appropriate
 * league percentile and all stats at zero.
 *
 * @param pairs - Optional array of [guestName, associatedPlayerName] pairs.
 *   Each guest will be pinned to the same team as their associated player.
 * @param newPlayerNames - Optional set of player names that are new/unknown.
 *   Used as a post-generation count-balance filter: splits where the new-player count
 *   differs by more than 1 between teams are discarded. If no split passes, falls back
 *   to the full set.
 */
export function autoPick(
  players: Player[],
  pairs?: Array<[string, string]>,
  newPlayerNames?: Set<string>,
): AutoPickResult {
```

- [ ] **Step 2: Remove the new-player pinning loop**

Delete lines 64–77 (the two `for` loops that push to `pinnedTeamA`/`pinnedTeamB` based on `newPlayerPinsA`/`newPlayerPinsB`):

```ts
  // New player pinning: pin named new players to their designated team.
  // These are resolved before pair pinning so guest pair logic can observe them.
  for (const name of (newPlayerPinsA ?? [])) {
    const player = searchPool.find((p) => p.name === name)
    if (!player) continue
    searchPool = searchPool.filter((p) => p !== player)
    pinnedTeamA.push(player)
  }
  for (const name of (newPlayerPinsB ?? [])) {
    const player = searchPool.find((p) => p.name === name)
    if (!player) continue
    searchPool = searchPool.filter((p) => p !== player)
    pinnedTeamB.push(player)
  }
```

Remove those lines entirely. Nothing replaces them.

- [ ] **Step 3: Add the count-balance filter after the scoring step**

After the `scored` array is built (currently line 151–156) and before `bestDiff` is computed, insert:

```ts
  // Count-balance filter: when new players are identified, discard splits where
  // the new-player count differs by more than 1 between teams. This ensures
  // unknowns are spread evenly regardless of how many there are or their order.
  // Falls back to the full scored set if no split passes (e.g. extreme small squads).
  let filteredScored = scored
  if (newPlayerNames && newPlayerNames.size >= 2) {
    const balanced = scored.filter((s) => {
      const countA = s.teamA.filter((p) => newPlayerNames.has(p.name)).length
      const countB = s.teamB.filter((p) => newPlayerNames.has(p.name)).length
      return Math.abs(countA - countB) <= 1
    })
    if (balanced.length > 0) filteredScored = balanced
  }
```

Then update the `bestDiff` and `pool` lines to reference `filteredScored` instead of `scored`:

```ts
  const bestDiff = filteredScored.reduce((min, s) => (s.diff < min ? s.diff : min), Infinity)

  const pool = filteredScored.filter((s) => s.diff <= Math.max(bestDiff * 1.05, bestDiff + 3) + 0.001)
```

- [ ] **Step 4: Run the autoPick tests**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/almaty && npm test -- --testPathPattern="autoPick" 2>&1 | tail -30
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/almaty && git add lib/autoPick.ts lib/__tests__/autoPick.test.ts && git commit -m "feat: replace new-player index pins with count-balance filter in autoPick"
```

---

### Task 3: Update `NextMatchCard` call site

**Files:**
- Modify: `components/NextMatchCard.tsx:239-247`

- [ ] **Step 1: Replace pin computation with newPlayerNameSet**

Find this block (around lines 239–247):

```ts
    const newPlayerNames = newPlayerEntries.map((p) => p.name)
    const pinsA = newPlayerNames.length >= 2
      ? newPlayerNames.filter((_, i) => i % 2 === 0)
      : undefined
    const pinsB = newPlayerNames.length >= 2
      ? newPlayerNames.filter((_, i) => i % 2 === 1)
      : undefined

    const result = autoPick(resolved, pairs, pinsA, pinsB)
```

Replace with:

```ts
    const newPlayerNameSet = newPlayerEntries.length > 0
      ? new Set(newPlayerEntries.map((p) => p.name))
      : undefined

    const result = autoPick(resolved, pairs, newPlayerNameSet)
```

- [ ] **Step 2: Run the full test suite**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/almaty && npm test 2>&1 | tail -20
```

Expected: all tests pass, no TypeScript errors.

- [ ] **Step 3: Confirm TypeScript compiles cleanly**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/almaty && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (zero errors).

- [ ] **Step 4: Commit**

```bash
cd /Users/willloveland/conductor/workspaces/bootroom/almaty && git add components/NextMatchCard.tsx && git commit -m "feat: pass newPlayerNameSet to autoPick instead of index-based pins"
```
