# Team Balance — Guest Pre-Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move guest+associated player pairing from a post-hoc naive swap into `autoPick`'s search phase so the algorithm finds the globally best balance within the hard constraint, and extend the "Plays with" dropdown to show all league players.

**Architecture:** Add an optional `pairs` parameter to `autoPick` that pre-pins guest+associated player pairs before the combination search — mirroring the existing GK pinning pattern. Remove the post-processing `pinGuestsToAssociatedTeam` function in `NextMatchCard`. Switch `AddPlayerModal`'s dropdown to use the already-available `allLeaguePlayers` prop.

**Tech Stack:** TypeScript, Jest (ts-jest), Next.js 14 App Router, React

**Spec:** `docs/superpowers/specs/2026-03-21-team-balance-guest-pinning-design.md`

---

## File Map

| File | Change |
|---|---|
| `lib/__tests__/autoPick.test.ts` | **Create** — unit tests for the updated `autoPick` function |
| `lib/autoPick.ts` | **Modify** — add `pairs` param, GK pool exclusion, pair pinning, `sizeA` recalculation |
| `components/NextMatchCard.tsx` | **Modify** — build `pairs` from `guestEntries`, pass to `autoPick`, delete `pinGuestsToAssociatedTeam` |
| `components/AddPlayerModal.tsx` | **Modify** — switch dropdown to `allLeaguePlayers`, update warning copy |

---

## Task 1: Write failing tests for `autoPick` pair pinning

**Files:**
- Create: `lib/__tests__/autoPick.test.ts`

- [ ] **Step 1: Create the test file with a player factory and five test cases**

```ts
// lib/__tests__/autoPick.test.ts
import { autoPick } from '@/lib/autoPick'
import type { Player } from '@/lib/types'

function makePlayer(name: string, overrides?: Partial<Player>): Player {
  return {
    name,
    played: 0, won: 0, drew: 0, lost: 0,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0, qualified: false, points: 0,
    goalkeeper: false, mentality: 'balanced', rating: 2, recentForm: '',
    ...overrides,
  }
}

// ─── Helper ──────────────────────────────────────────────────────────────────

function onSameTeam(suggestion: { teamA: Player[]; teamB: Player[] }, a: string, b: string): boolean {
  const inA = (name: string) => suggestion.teamA.some((p) => p.name === name)
  return inA(a) === inA(b)
}

// ─── Baseline: no pairs ───────────────────────────────────────────────────────

describe('autoPick — no pairs (baseline)', () => {
  it('returns valid suggestions with all players distributed', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`Player ${i + 1}`))
    const result = autoPick(players)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(10)
    }
  })
})

// ─── One pair ─────────────────────────────────────────────────────────────────
// Use 10 players so there are C(8,4)=70 possible splits of the free pool —
// the probability of every split accidentally keeping the pair together is
// negligible without the pinning logic.

describe('autoPick — one guest+associated pair', () => {
  it('places guest and associated player on the same team in ALL suggestions', () => {
    const players = [
      makePlayer('Alice'),
      makePlayer('Bob'),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Eve'),
      makePlayer('Frank'),
      makePlayer('Grace'),
      makePlayer('Hank'),
      makePlayer('Iris'),
      makePlayer('Alice +1'),
    ]
    const pairs: Array<[string, string]> = [['Alice +1', 'Alice']]
    const result = autoPick(players, pairs)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(onSameTeam(s, 'Alice', 'Alice +1')).toBe(true)
    }
  })
})

// ─── Multiple guests per associated player ────────────────────────────────────

describe('autoPick — two guests sharing one associated player', () => {
  it('places both guests and their associated player on the same team', () => {
    const players = [
      makePlayer('Alice'),
      makePlayer('Bob'),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Eve'),
      makePlayer('Alice +1'),
      makePlayer('Alice +2'),
    ]
    const pairs: Array<[string, string]> = [
      ['Alice +1', 'Alice'],
      ['Alice +2', 'Alice'],
    ]
    const result = autoPick(players, pairs)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(onSameTeam(s, 'Alice', 'Alice +1')).toBe(true)
      expect(onSameTeam(s, 'Alice', 'Alice +2')).toBe(true)
    }
  })
})

// ─── Associated player is a GK ────────────────────────────────────────────────

describe('autoPick — associated player is a GK', () => {
  it('places the guest on the same team as the GK-pinned associated player', () => {
    const players = [
      makePlayer('Alice', { goalkeeper: true }),
      makePlayer('Bob', { goalkeeper: true }),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Alice +1'),
      makePlayer('Eve'),
    ]
    const pairs: Array<[string, string]> = [['Alice +1', 'Alice']]
    const result = autoPick(players, pairs)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(onSameTeam(s, 'Alice', 'Alice +1')).toBe(true)
    }
  })
})

// ─── Associated player not in squad ──────────────────────────────────────────

describe('autoPick — associated player not in squad', () => {
  it('distributes the guest freely when their associated player is absent', () => {
    const players = [
      makePlayer('Bob'),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Eve'),
      makePlayer('Alice +1'), // associated with 'Alice', who is NOT in the squad
    ]
    const pairs: Array<[string, string]> = [['Alice +1', 'Alice']]
    const result = autoPick(players, pairs)
    expect(result.suggestions.length).toBeGreaterThan(0)
    // All 5 players must be distributed across both teams
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(5)
      expect(s.teamA.some((p) => p.name === 'Alice +1') || s.teamB.some((p) => p.name === 'Alice +1')).toBe(true)
    }
  })
})

// ─── Guest is themselves a GK ─────────────────────────────────────────────────

describe('autoPick — guest has goalkeeper: true', () => {
  it('excludes the guest-GK from GK pool, places via pair pinning, preserves goalkeeper flag', () => {
    const players = [
      makePlayer('Alice', { goalkeeper: true }),
      makePlayer('Bob', { goalkeeper: true }),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Bob +1', { goalkeeper: true }), // guest who is also a GK
      makePlayer('Eve'),
    ]
    const pairs: Array<[string, string]> = [['Bob +1', 'Bob']]
    const result = autoPick(players, pairs)
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      // Pair constraint satisfied
      expect(onSameTeam(s, 'Bob', 'Bob +1')).toBe(true)
      // goalkeeper flag preserved on the guest object
      const allPlayers = [...s.teamA, ...s.teamB]
      const guestObj = allPlayers.find((p) => p.name === 'Bob +1')
      expect(guestObj?.goalkeeper).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run tests — expect all to fail (autoPick doesn't accept pairs yet)**

```bash
npx jest lib/__tests__/autoPick.test.ts --no-coverage
```

Expected: 6 test suites failing. The `pairs` parameter doesn't exist yet so TypeScript will error, or the constraint checks will fail. Do not proceed until you see failures.

---

## Task 2: Implement pair pinning in `autoPick`

**Files:**
- Modify: `lib/autoPick.ts`

- [ ] **Step 1: Replace the GK-pinning block and add pair pinning**

Open `lib/autoPick.ts`. Replace everything from the `// GK constraint:` comment block down through the `const sizeA = ...` line (currently lines 30–42) with:

```ts
  // ── Step 1: GK pinning ────────────────────────────────────────────────────
  // Guests are excluded from the GK candidate pool — their team placement is
  // governed by pair pinning below. Excluding them prevents a conflict where
  // the GK step pins a guest to the opposite team from their associated player.
  const guestNames = new Set((pairs ?? []).map(([guestName]) => guestName.toLowerCase()))
  const gkPlayers = [...players.filter(
    (p) => (p.goalkeeper || p.mentality === 'goalkeeper') && !guestNames.has(p.name.toLowerCase())
  )].sort(() => Math.random() - 0.5)
  const pinnedA: Player | null = gkPlayers.length >= 1 ? gkPlayers[0] : null
  const pinnedB: Player | null = gkPlayers.length >= 2 ? gkPlayers[1] : null

  // ── Step 2: Pair pinning ──────────────────────────────────────────────────
  // Track which team each pinned player belongs to (by lower-cased name).
  const playerByName = new Map(players.map((p) => [p.name.toLowerCase(), p]))
  const pinnedSide = new Map<string, 'A' | 'B'>()
  if (pinnedA) pinnedSide.set(pinnedA.name.toLowerCase(), 'A')
  if (pinnedB) pinnedSide.set(pinnedB.name.toLowerCase(), 'B')

  const pairsOnA: Player[] = []
  const pairsOnB: Player[] = []
  let nextSide: 'A' | 'B' = 'A'

  for (const [guestName, assocName] of pairs ?? []) {
    const guestKey = guestName.toLowerCase()
    const assocKey = assocName.toLowerCase()
    const guest = playerByName.get(guestKey)
    const assoc = playerByName.get(assocKey)
    if (!guest || !assoc) continue // either not in squad — skip

    if (pinnedSide.has(assocKey)) {
      // Associated player already pinned (GK or earlier pair) — follow them.
      // Alternation counter does NOT increment (no new side decision made).
      if (!pinnedSide.has(guestKey)) {
        const side = pinnedSide.get(assocKey)!
        pinnedSide.set(guestKey, side)
        if (side === 'A') pairsOnA.push(guest)
        else pairsOnB.push(guest)
      }
    } else if (!pinnedSide.has(guestKey)) {
      // Neither player pinned yet — assign both to nextSide and toggle.
      pinnedSide.set(assocKey, nextSide)
      pinnedSide.set(guestKey, nextSide)
      if (nextSide === 'A') pairsOnA.push(assoc, guest)
      else pairsOnB.push(assoc, guest)
      nextSide = nextSide === 'A' ? 'B' : 'A'
    }
  }

  const searchPool = players.filter((p) => !pinnedSide.has(p.name.toLowerCase()))

  // How many free-pool players go into Team A
  const playersOnA = (pinnedA ? 1 : 0) + pairsOnA.length
  const rawSizeA = Math.ceil(n / 2) - playersOnA
  const sizeA = Math.max(0, Math.min(searchPool.length, rawSizeA))
```

- [ ] **Step 2: Update the team reconstruction block**

Find the existing line (currently just after the `rawSplits` block):

```ts
  // Prepend pinned GKs to their respective teams
  const allSplits: [Player[], Player[]][] = rawSplits.map(([a, b]) => [
    pinnedA ? [pinnedA, ...a] : a,
    pinnedB ? [pinnedB, ...b] : b,
  ])
```

Replace it with:

```ts
  // Prepend all pinned players (GKs + pairs) to their respective teams
  const allSplits: [Player[], Player[]][] = rawSplits.map(([a, b]) => [
    [...(pinnedA ? [pinnedA] : []), ...pairsOnA, ...a],
    [...(pinnedB ? [pinnedB] : []), ...pairsOnB, ...b],
  ])
```

- [ ] **Step 3: Update the `autoPick` function signature**

Change the first line of `autoPick`:

```ts
export function autoPick(players: Player[], pairs?: Array<[string, string]>): AutoPickResult {
```

- [ ] **Step 4: Run the autoPick tests — all should pass**

```bash
npx jest lib/__tests__/autoPick.test.ts --no-coverage
```

Expected: 6 passing. If any test fails, the pairing logic isn't working — debug before continuing.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

```bash
npx jest --no-coverage
```

Expected: all previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/autoPick.ts lib/__tests__/autoPick.test.ts
git commit -m "feat: pre-pin guest+associated pairs in autoPick for better balance"
```

---

## Task 3: Update `NextMatchCard` — pass pairs, remove post-processing

**Files:**
- Modify: `components/NextMatchCard.tsx`

- [ ] **Step 1: Delete `pinGuestsToAssociatedTeam`**

Find and delete the entire `pinGuestsToAssociatedTeam` function (lines 215–266 approximately — starts with `function pinGuestsToAssociatedTeam(` and ends with the closing `}`).

- [ ] **Step 2: Update `handleAutoPick`**

Find the `handleAutoPick` function (approximately lines 268–281). Replace the entire function body with:

```ts
  function handleAutoPick() {
    const resolved = resolvePlayersForAutoPick(squadNames, allPlayers, guestEntries, newPlayerEntries)
    const pairs: Array<[string, string]> = guestEntries.map((g) => [g.name, g.associatedPlayer])
    const result = autoPick(resolved, pairs)
    setAutoPickResult(result)
    if (result.suggestions.length > 0) {
      setLocalTeamA(result.suggestions[0].teamA)
      setLocalTeamB(result.suggestions[0].teamB)
    }
  }
```

- [ ] **Step 3: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: all passing. (There are no component tests, so this is a TypeScript compilation check via ts-jest.)

- [ ] **Step 4: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: remove post-hoc guest pinning, pass pairs to autoPick"
```

---

## Task 4: Update `AddPlayerModal` — full roster dropdown and updated warning copy

**Files:**
- Modify: `components/AddPlayerModal.tsx`

- [ ] **Step 1: Switch the dropdown to use `allLeaguePlayers`**

Find this block in the guest step (around line 149–152):

```tsx
                    <option value="">Select a player…</option>
                    {players.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
```

Replace with:

```tsx
                    <option value="">Select a player…</option>
                    {allLeaguePlayers.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
```

- [ ] **Step 2: Update the warning copy**

Find the warning block (around line 159–163):

```tsx
                  {showWarning && (
                    <div className="mt-2 flex gap-2 bg-amber-950 border border-amber-800 rounded p-2 text-[11px] text-amber-400 leading-relaxed">
                      ⚠ {associatedPlayer} isn&apos;t in the current lineup. The guest will be added but can&apos;t be pinned to a team until {associatedPlayer} is selected.
                    </div>
                  )}
```

Replace with:

```tsx
                  {showWarning && (
                    <div className="mt-2 flex gap-2 bg-amber-950 border border-amber-800 rounded p-2 text-[11px] text-amber-400 leading-relaxed">
                      ⚠ {associatedPlayer} isn&apos;t in the current lineup. The guest will be distributed freely by balance until {associatedPlayer} is also added.
                    </div>
                  )}
```

- [ ] **Step 3: Run the full test suite**

```bash
npx jest --no-coverage
```

Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add components/AddPlayerModal.tsx
git commit -m "feat: show all league players in guest 'plays with' dropdown"
```

---

## Task 5: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify guest pairing in auto-pick**

1. Open a league with at least 8 attending players
2. Add a guest via "+ Add guest or new player" → select a player from the "Plays with" dropdown
3. Click "Auto-Pick Teams"
4. Verify the guest and their associated player appear on the **same team**
5. Repeat auto-pick several times (each run is randomised) — they should always be together

- [ ] **Step 3: Verify the full roster dropdown**

1. Open the "+ Add guest or new player" modal → choose "Guest"
2. Confirm the "Plays with" dropdown lists **all** league players, not just those marked as attending
3. Select a non-attending player — confirm the amber warning appears with the updated copy: *"…will be distributed freely by balance until [player] is also added."*

- [ ] **Step 4: Verify suggestions 2 and 3 also satisfy the constraint**

The key regression this change fixes is that previously only suggestion 0 had guests patched — suggestions 1 and 2 were silently broken. Verify the fix:

1. Open browser devtools console on the league page
2. Add a guest, click "Auto-Pick Teams"
3. In the console, run: `window.__autoPickResult` (if not exposed, add a temporary `console.log(result)` in `handleAutoPick` before the `setAutoPickResult` call)
4. Inspect `suggestions[1]` and `suggestions[2]` — confirm the guest and their associated player appear on the same team in both

- [ ] **Step 5: Verify no regressions**

1. Auto-pick with no guests — confirm teams are still balanced
2. Auto-pick with a guest whose associated player is a GK — confirm guest follows the GK to the same team
3. Auto-pick with two guests sharing the same associated player — confirm all three are on the same team
