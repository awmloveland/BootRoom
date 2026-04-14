# New Player Lineup Balance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the eye-test slider for new players and guests with a league-median WPR default and a three-way strength selector, and ensure multiple new players are distributed across both teams.

**Architecture:** Add `wprOverride` to the `Player` type so `wprScore` can short-circuit for synthetic players. `resolvePlayersForAutoPick` computes the league median WPR at call time and injects it (±15 for the strength hint) into guest and new player objects. `autoPick` gains two optional pin lists so new players are alternated across teams before the search runs.

**Tech Stack:** TypeScript, Next.js 14 App Router, Jest (test runner: `npm test`)

---

### Task 1: Update types — wprOverride, StrengthHint, strengthHint fields

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add `wprOverride` to `Player` and `StrengthHint` type and `strengthHint` to both entry types**

Open `lib/types.ts`. Make the following changes:

Add `wprOverride?: number` to the `Player` interface (after the `recentForm` line):

```ts
export interface Player {
  name: string;
  played: number;
  won: number;
  drew: number;
  lost: number;
  timesTeamA: number;
  timesTeamB: number;
  winRate: number;
  qualified: boolean;
  points: number;
  goalkeeper: boolean;
  mentality: Mentality;
  rating: number;
  recentForm: string; // e.g. 'WWDLW' or '--WLW'
  wprOverride?: number; // if set, wprScore returns this directly — used for guests/new players
}
```

Add `StrengthHint` type and update `GuestEntry` and `NewPlayerEntry` (replace the existing interfaces with these):

```ts
export type StrengthHint = 'below' | 'average' | 'above'

export interface GuestEntry {
  type: 'guest'            // runtime discriminant — not persisted to DB
  name: string             // e.g. "Alice +1"
  associatedPlayer: string // e.g. "Alice"
  rating: number           // 1–3, kept for DB backwards compat — no longer drives scoring
  goalkeeper?: boolean     // whether this guest is playing as goalkeeper
  strengthHint: StrengthHint // drives wprOverride at resolution time
}

export interface NewPlayerEntry {
  type: 'new_player'       // runtime discriminant — not persisted to DB
  name: string
  rating: number           // 1–3, kept for DB backwards compat — no longer drives scoring
  mentality: Mentality     // balanced | attacking | defensive | goalkeeper
  goalkeeper?: boolean     // derived: mentality === 'goalkeeper'. Keep for DB backwards compat.
  strengthHint: StrengthHint // drives wprOverride at resolution time
}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

Run: `npx tsc --noEmit`

Expected: zero errors. If you see errors about missing `strengthHint` on existing literals in test files or components, fix them by adding `strengthHint: 'average'` to those object literals — the type is now required.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add wprOverride to Player and strengthHint to GuestEntry/NewPlayerEntry"
```

---

### Task 2: Short-circuit wprScore for wprOverride

**Files:**
- Modify: `lib/utils.ts`
- Create: `lib/__tests__/utils.wpr.test.ts`

- [ ] **Step 1: Write the failing test**

Create `lib/__tests__/utils.wpr.test.ts`:

```ts
import { wprScore } from '@/lib/utils'
import type { Player } from '@/lib/types'

function makePlayer(overrides?: Partial<Player>): Player {
  return {
    name: 'Test',
    played: 10, won: 5, drew: 2, lost: 3,
    timesTeamA: 0, timesTeamB: 0,
    winRate: 0.5, qualified: true, points: 17,
    goalkeeper: false, mentality: 'balanced', rating: 2,
    recentForm: 'WWDLL',
    ...overrides,
  }
}

describe('wprScore — wprOverride short-circuit', () => {
  it('returns wprOverride directly when set, ignoring all other stats', () => {
    const player = makePlayer({ wprOverride: 42 })
    expect(wprScore(player)).toBe(42)
  })

  it('returns wprOverride of 0 correctly (does not fall through)', () => {
    const player = makePlayer({ wprOverride: 0 })
    expect(wprScore(player)).toBe(0)
  })

  it('computes normally when wprOverride is undefined', () => {
    const player = makePlayer() // no wprOverride
    const score = wprScore(player)
    expect(score).toBeGreaterThan(0)
    expect(score).not.toBe(42)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npx jest lib/__tests__/utils.wpr.test.ts --no-coverage`

Expected: FAIL — `wprScore` does not yet short-circuit.

- [ ] **Step 3: Add the short-circuit to wprScore**

In `lib/utils.ts`, add the override check as the first line of `wprScore`:

```ts
export function wprScore(player: Player): number {
  if (player.wprOverride !== undefined) return player.wprOverride

  const PRIOR_GAMES = 5         // shrinkage strength
  // ...rest of existing function unchanged...
```

- [ ] **Step 4: Run test to confirm it passes**

Run: `npx jest lib/__tests__/utils.wpr.test.ts --no-coverage`

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Run full test suite to confirm no regressions**

Run: `npm test -- --no-coverage`

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add lib/utils.ts lib/__tests__/utils.wpr.test.ts
git commit -m "feat: short-circuit wprScore when wprOverride is set"
```

---

### Task 3: Add new player pinning to autoPick

**Files:**
- Modify: `lib/autoPick.ts`
- Modify: `lib/__tests__/autoPick.test.ts`

The `autoPick` function already has `pinnedTeamA` and `pinnedTeamB` arrays built up from GK pinning and guest pair pinning. We add two optional parameters — `newPlayerPinsA` and `newPlayerPinsB` — which name players to prepend to those arrays before the search.

- [ ] **Step 1: Write the failing tests**

Append to the bottom of `lib/__tests__/autoPick.test.ts`:

```ts
// ─── New player alternating distribution ──────────────────────────────────────

describe('autoPick — newPlayerPinsA / newPlayerPinsB', () => {
  it('places a new player pinned to A on Team A in all suggestions', () => {
    const players = [
      makePlayer('Alice'),
      makePlayer('Bob'),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Eve'),
      makePlayer('Frank'),
      makePlayer('Grace'),
      makePlayer('Hank'),
      makePlayer('NewKid'),
      makePlayer('Ivy'),
    ]
    const result = autoPick(players, undefined, ['NewKid'], [])
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.some((p) => p.name === 'NewKid')).toBe(true)
    }
  })

  it('places a new player pinned to B on Team B in all suggestions', () => {
    const players = [
      makePlayer('Alice'),
      makePlayer('Bob'),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Eve'),
      makePlayer('Frank'),
      makePlayer('Grace'),
      makePlayer('Hank'),
      makePlayer('NewKid'),
      makePlayer('Ivy'),
    ]
    const result = autoPick(players, undefined, [], ['NewKid'])
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamB.some((p) => p.name === 'NewKid')).toBe(true)
    }
  })

  it('places two new players on opposite teams in all suggestions', () => {
    const players = [
      makePlayer('Alice'),
      makePlayer('Bob'),
      makePlayer('Carol'),
      makePlayer('Dave'),
      makePlayer('Eve'),
      makePlayer('Frank'),
      makePlayer('Grace'),
      makePlayer('Hank'),
      makePlayer('NewKid1'),
      makePlayer('NewKid2'),
    ]
    const result = autoPick(players, undefined, ['NewKid1'], ['NewKid2'])
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.some((p) => p.name === 'NewKid1')).toBe(true)
      expect(s.teamB.some((p) => p.name === 'NewKid2')).toBe(true)
    }
  })

  it('ignores pins for names not in the player pool (graceful degradation)', () => {
    const players = Array.from({ length: 10 }, (_, i) => makePlayer(`Player ${i + 1}`))
    const result = autoPick(players, undefined, ['Ghost'], [])
    // Should still produce valid suggestions with all 10 players
    expect(result.suggestions.length).toBeGreaterThan(0)
    for (const s of result.suggestions) {
      expect(s.teamA.length + s.teamB.length).toBe(10)
    }
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx jest lib/__tests__/autoPick.test.ts --no-coverage`

Expected: FAIL — `autoPick` does not yet accept `newPlayerPinsA`/`newPlayerPinsB`.

- [ ] **Step 3: Add the new parameters to autoPick**

In `lib/autoPick.ts`, update the function signature and add pin resolution logic. Replace the function signature and the section immediately after `pinnedTeamB` is declared:

```ts
export function autoPick(
  players: Player[],
  pairs?: Array<[string, string]>,
  newPlayerPinsA?: string[],
  newPlayerPinsB?: string[],
): AutoPickResult {
```

Then, after the existing `let searchPool = players.filter((p) => p !== pinnedA && p !== pinnedB)` line and before the pair-pinning loop, add the new player pin resolution:

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

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx jest lib/__tests__/autoPick.test.ts --no-coverage`

Expected: PASS — all autoPick tests (old and new) green.

- [ ] **Step 5: Run full test suite**

Run: `npm test -- --no-coverage`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/autoPick.ts lib/__tests__/autoPick.test.ts
git commit -m "feat: add newPlayerPinsA/newPlayerPinsB to autoPick for even new player distribution"
```

---

### Task 4: leagueMedianWpr, resolvePlayersForAutoPick, and handleAutoPick in NextMatchCard

**Files:**
- Modify: `components/NextMatchCard.tsx`

This task has three parts: (a) add `leagueMedianWpr`, (b) update `resolvePlayersForAutoPick` to inject `wprOverride` from `strengthHint`, (c) update `handleAutoPick` to compute and pass new player pins, and (d) fix backwards-compat when loading saved metadata without `strengthHint`.

- [ ] **Step 1: Add `leagueMedianWpr` and import `wprScore`**

At the top of `components/NextMatchCard.tsx`, `wprScore` is not currently imported. Add it to the existing import from `@/lib/utils`:

```ts
import { autoPick, type AutoPickResult } from '@/lib/autoPick'
import { ewptScore, winProbability, winCopy, wprScore } from '@/lib/utils'
```

Then add `leagueMedianWpr` as a module-level function (add it just before the existing `medianRating` function at line 41):

```ts
/**
 * Computes the median WPR score of all players with 5 or more games played.
 * Used as the default strength for new players and guests when auto-picking.
 * Falls back to 50 if fewer than 3 qualified players exist (very new league).
 */
function leagueMedianWpr(players: Player[]): number {
  const qualified = players.filter((p) => p.played >= 5)
  if (qualified.length < 3) return 50
  const scores = qualified.map((p) => wprScore(p)).sort((a, b) => a - b)
  const mid = Math.floor(scores.length / 2)
  return scores.length % 2 === 0
    ? (scores[mid - 1] + scores[mid]) / 2
    : scores[mid]
}
```

- [ ] **Step 2: Update `resolvePlayersForAutoPick` to inject wprOverride**

The `resolvePlayersForAutoPick` function signature and body currently look like this:

```ts
function resolvePlayersForAutoPick(
  names: string[],
  allPlayers: Player[],
  guests: GuestEntry[],
  newPlayers: NewPlayerEntry[],
): Player[] {
  const lookup = new Map(allPlayers.map((p) => [p.name.toLowerCase(), p]))
  const guestLookup = new Map(guests.map((g) => [g.name.toLowerCase(), g]))
  const newPlayerLookup = new Map(newPlayers.map((p) => [p.name.toLowerCase(), p]))
  const fallbackRating = medianRating(allPlayers)
  ...
```

Replace it entirely with:

```ts
const STRENGTH_OFFSET = 15

function resolvePlayersForAutoPick(
  names: string[],
  allPlayers: Player[],
  guests: GuestEntry[],
  newPlayers: NewPlayerEntry[],
): Player[] {
  const lookup = new Map(allPlayers.map((p) => [p.name.toLowerCase(), p]))
  const guestLookup = new Map(guests.map((g) => [g.name.toLowerCase(), g]))
  const newPlayerLookup = new Map(newPlayers.map((p) => [p.name.toLowerCase(), p]))
  const fallbackRating = medianRating(allPlayers)
  const medianWpr = leagueMedianWpr(allPlayers)

  function hintToWpr(hint: StrengthHint | undefined): number {
    const offset = hint === 'above' ? STRENGTH_OFFSET : hint === 'below' ? -STRENGTH_OFFSET : 0
    return Math.min(100, Math.max(0, medianWpr + offset))
  }

  return names.map((name) => {
    const known = lookup.get(name.toLowerCase())
    if (known) return known

    const guest = guestLookup.get(name.toLowerCase())
    if (guest) {
      return {
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        goalkeeper: guest.goalkeeper ?? false, mentality: 'balanced' as const,
        rating: 2,
        recentForm: '',
        wprOverride: hintToWpr(guest.strengthHint),
      }
    }

    const newPlayer = newPlayerLookup.get(name.toLowerCase())
    if (newPlayer) {
      return {
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        goalkeeper: newPlayer.goalkeeper ?? false, mentality: newPlayer.mentality,
        rating: 2,
        recentForm: '',
        wprOverride: hintToWpr(newPlayer.strengthHint),
      }
    }

    return {
      name,
      played: 0, won: 0, drew: 0, lost: 0,
      timesTeamA: 0, timesTeamB: 0,
      winRate: 0, qualified: false, points: 0,
      goalkeeper: false, mentality: 'balanced' as const,
      rating: fallbackRating,
      recentForm: '',
    }
  })
}
```

Also add `StrengthHint` to the import from `@/lib/types` at the top of the file:

```ts
import type { Week, Player, ScheduledWeek, GuestEntry, NewPlayerEntry, LineupMetadata, Mentality, StrengthHint } from '@/lib/types'
```

- [ ] **Step 3: Update `handleAutoPick` to pass new player pins**

Replace the existing `handleAutoPick` function:

```ts
function handleAutoPick() {
  const resolved = resolvePlayersForAutoPick(squadNames, allPlayers, guestEntries, newPlayerEntries)
  const pairs = guestEntries
    .filter((g) => g.associatedPlayer)
    .map((g) => [g.name, g.associatedPlayer] as [string, string])

  const newPlayerNames = newPlayerEntries.map((p) => p.name)
  const pinsA = newPlayerNames.length >= 2
    ? newPlayerNames.filter((_, i) => i % 2 === 0)
    : undefined
  const pinsB = newPlayerNames.length >= 2
    ? newPlayerNames.filter((_, i) => i % 2 === 1)
    : undefined

  const result = autoPick(resolved, pairs, pinsA, pinsB)
  setAutoPickResult(result)
  setSuggestionIndex(0)
  setIsManuallyEdited(false)
  if (result.suggestions.length > 0) {
    setLocalTeamA(result.suggestions[0].teamA)
    setLocalTeamB(result.suggestions[0].teamB)
  }
}
```

- [ ] **Step 4: Fix backwards-compat when loading saved metadata**

In `NextMatchCard.tsx`, there are two places where saved metadata is loaded into state. Find the block that calls `setGuestEntries(metadata.guests)` and `setNewPlayerEntries(metadata.new_players)` (around line 449). Update it to default `strengthHint` for old entries:

```ts
setGuestEntries(metadata.guests.map((g) => ({
  ...g,
  strengthHint: g.strengthHint ?? 'average',
})))
setNewPlayerEntries(metadata.new_players.map((p) => ({
  ...p,
  strengthHint: p.strengthHint ?? 'average',
})))
```

Also find the second place where guest/new player metadata is loaded from the lineup API response (around line 271–278) and apply the same defaulting:

```ts
guests: ((data.lineup_metadata as any).guests ?? []).map((g: any) => ({
  type: 'guest' as const,
  name: g.name,
  associatedPlayer: g.associatedPlayer,
  rating: g.rating ?? 2,
  goalkeeper: g.goalkeeper ?? false,
  strengthHint: (g.strengthHint ?? 'average') as StrengthHint,
})),
new_players: ((data.lineup_metadata as any).new_players ?? []).map((p: any) => ({
  type: 'new_player' as const,
  name: p.name,
  rating: p.rating ?? 2,
  mentality: p.mentality ?? 'balanced',
  goalkeeper: p.goalkeeper ?? false,
  strengthHint: (p.strengthHint ?? 'average') as StrengthHint,
})),
```

- [ ] **Step 5: Verify TypeScript compiles with no errors**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 6: Run full test suite**

Run: `npm test -- --no-coverage`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: inject league median WPR for new players/guests and alternate-pin new players across teams"
```

---

### Task 5: Replace EyeTestSlider with strength selector in AddPlayerModal

**Files:**
- Modify: `components/AddPlayerModal.tsx`

The slider and `avgRating` prop are removed. Both the guest and new player sub-flows get a three-way `[ Below average | Average | Above average ]` selector. The emitted entry gains `strengthHint` and keeps `rating: 2` for DB compat.

- [ ] **Step 1: Remove avgRating prop and slider state, add strengthHint state**

Replace the entire file content with the following:

```tsx
// components/AddPlayerModal.tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { Player, GuestEntry, NewPlayerEntry, Mentality, StrengthHint } from '@/lib/types'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'

interface Props {
  players: Player[]           // attending players (used for lineup-membership warning check)
  allLeaguePlayers: Player[]  // full league roster (for collision check)
  existingGuests: GuestEntry[] // used to compute +1, +2 suffixes
  onAdd: (entry: GuestEntry | NewPlayerEntry) => void
  onClose: () => void
}

type Step = 'choose' | 'guest' | 'new_player'

const STRENGTH_OPTIONS: { value: StrengthHint; label: string }[] = [
  { value: 'below', label: 'Below average' },
  { value: 'average', label: 'Average' },
  { value: 'above', label: 'Above average' },
]

export function AddPlayerModal({ players, allLeaguePlayers, existingGuests, onAdd, onClose }: Props) {
  const [step, setStep] = useState<Step>('choose')

  // Guest sub-flow state
  const [associatedPlayer, setAssociatedPlayer] = useState('')
  const [guestStrength, setGuestStrength] = useState<StrengthHint>('average')
  const [guestIsGoalkeeper, setGuestIsGoalkeeper] = useState(false)

  // New player sub-flow state
  const [newName, setNewName] = useState('')
  const [newStrength, setNewStrength] = useState<StrengthHint>('average')
  const [nameError, setNameError] = useState<string | null>(null)
  const [newMentality, setNewMentality] = useState<Mentality>('balanced')

  const selectedPlayerInLineup = players.some((p) => p.name === associatedPlayer)
  const showWarning = associatedPlayer && !selectedPlayerInLineup

  function deriveGuestName(base: string): string {
    const existingForPlayer = existingGuests.filter((g) => g.associatedPlayer === base)
    const n = existingForPlayer.length + 1
    return `${base} +${n}`
  }

  function handleAddGuest() {
    if (!associatedPlayer) return
    const name = deriveGuestName(associatedPlayer)
    onAdd({
      type: 'guest',
      name,
      associatedPlayer,
      rating: 2,
      goalkeeper: guestIsGoalkeeper,
      strengthHint: guestStrength,
    })
    onClose()
  }

  function handleAddNewPlayer() {
    const trimmed = newName.trim()
    if (!trimmed) return
    const collision = allLeaguePlayers.some(
      (p) => p.name.toLowerCase() === trimmed.toLowerCase()
    )
    if (collision) {
      setNameError(`A player named "${trimmed}" already exists in this league.`)
      return
    }
    onAdd({
      type: 'new_player',
      name: trimmed,
      rating: 2,
      mentality: newMentality,
      goalkeeper: newMentality === 'goalkeeper',
      strengthHint: newStrength,
    })
    onClose()
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 shadow-xl focus:outline-none">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <Dialog.Title className="text-base font-semibold text-slate-100">
              {step === 'choose' && 'Add Player'}
              {step === 'guest' && 'Add Guest'}
              {step === 'new_player' && 'Add New Player'}
            </Dialog.Title>
            <Dialog.Close
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 text-lg leading-none"
            >
              ✕
            </Dialog.Close>
          </div>

          {/* Step: choose */}
          {step === 'choose' && (
            <>
              <div className="p-5">
                <p className="text-xs text-slate-400 mb-3">Who are you adding?</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('guest')}
                    className="flex-1 flex flex-col items-center gap-1.5 bg-slate-900 border border-slate-600 hover:border-blue-500 rounded-lg p-4 transition-colors"
                  >
                    <span className="text-2xl">👤</span>
                    <span className="text-sm font-semibold text-slate-100">Guest</span>
                    <span className="text-[11px] text-slate-500 text-center leading-tight">A +1 for an existing player</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('new_player')}
                    className="flex-1 flex flex-col items-center gap-1.5 bg-slate-900 border border-slate-600 hover:border-blue-500 rounded-lg p-4 transition-colors"
                  >
                    <span className="text-2xl">✨</span>
                    <span className="text-sm font-semibold text-slate-100">New player</span>
                    <span className="text-[11px] text-slate-500 text-center leading-tight">Add them to the roster</span>
                  </button>
                </div>
              </div>
              <div className="flex justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500"
                >
                  Cancel
                </button>
              </div>
            </>
          )}

          {/* Step: guest */}
          {step === 'guest' && (
            <>
              <div className="p-5 flex flex-col gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Plays with
                  </label>
                  <select
                    name="plays-with"
                    value={associatedPlayer}
                    onChange={(e) => setAssociatedPlayer(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select a player…</option>
                    {allLeaguePlayers.map((p) => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                  </select>
                  {associatedPlayer && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Will appear as <span className="text-slate-300 font-medium">{deriveGuestName(associatedPlayer)}</span> and placed on the same team as {associatedPlayer}.
                    </p>
                  )}
                  {showWarning && (
                    <div className="mt-2 flex gap-2 bg-amber-950 border border-amber-800 rounded p-2 text-[11px] text-amber-400 leading-relaxed">
                      ⚠ {associatedPlayer} isn&apos;t attending this game. Add them to the lineup first, or the guest will be distributed freely by Auto-Pick.
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Strength
                  </label>
                  <div className="flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[11px] font-semibold">
                    {STRENGTH_OPTIONS.map(({ value, label }, i) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setGuestStrength(value)}
                        className={cn(
                          'flex-1 py-2 transition-colors',
                          i < STRENGTH_OPTIONS.length - 1 && 'border-r',
                          value === guestStrength
                            ? 'bg-blue-950 text-blue-300 border-blue-800'
                            : 'text-slate-500 border-slate-700 hover:text-slate-300'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Defaults to Average — change only if you know this player.
                  </p>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      Dedicated goalkeeper
                    </label>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-px">
                      Plays in goal all game, every game.
                    </p>
                  </div>
                  <Toggle enabled={guestIsGoalkeeper} onChange={(v) => setGuestIsGoalkeeper(v)} />
                </div>
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={() => { setStep('choose'); setGuestIsGoalkeeper(false) }}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAddGuest}
                  disabled={!associatedPlayer}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40"
                >
                  Add guest
                </button>
              </div>
            </>
          )}

          {/* Step: new player */}
          {step === 'new_player' && (
            <>
              <div className="p-5 flex flex-col gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Player name
                  </label>
                  <input
                    type="text"
                    name="player-name"
                    value={newName}
                    onChange={(e) => { setNewName(e.target.value); setNameError(null) }}
                    placeholder="Full name"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
                  <p className="text-[11px] text-slate-500 mt-1">
                    They&apos;ll be added to the league roster permanently after confirming during result.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Strength
                  </label>
                  <div className="flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[11px] font-semibold">
                    {STRENGTH_OPTIONS.map(({ value, label }, i) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setNewStrength(value)}
                        className={cn(
                          'flex-1 py-2 transition-colors',
                          i < STRENGTH_OPTIONS.length - 1 && 'border-r',
                          value === newStrength
                            ? 'bg-blue-950 text-blue-300 border-blue-800'
                            : 'text-slate-500 border-slate-700 hover:text-slate-300'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Defaults to Average — change only if you know this player.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Mentality
                  </label>
                  <div className="flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[10px] font-semibold">
                    {(
                      [
                        { value: 'goalkeeper', label: 'GK' },
                        { value: 'defensive',  label: 'DEF' },
                        { value: 'balanced',   label: 'BAL' },
                        { value: 'attacking',  label: 'ATT' },
                      ] as { value: Mentality; label: string }[]
                    ).map(({ value, label }, i) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => { if (value !== newMentality) setNewMentality(value) }}
                        className={cn(
                          'flex-1 py-1.5 transition-colors',
                          i < 3 && 'border-r',
                          value === newMentality
                            ? 'bg-blue-950 text-blue-300 border-blue-800'
                            : 'text-slate-500 border-slate-700 hover:text-slate-300'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    GK = dedicated goalkeeper, plays in goal every game.
                  </p>
                </div>
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={() => { setStep('choose'); setNewMentality('balanced') }}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAddNewPlayer}
                  disabled={!newName.trim()}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40"
                >
                  Add player
                </button>
              </div>
            </>
          )}

        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

- [ ] **Step 2: Remove the avgRating prop from the AddPlayerModal call in NextMatchCard**

In `components/NextMatchCard.tsx`, find the `<AddPlayerModal` JSX block (around line 1008) and remove the `avgRating={avgRating(allPlayers)}` line:

```tsx
{showAddPlayerModal && (
  <AddPlayerModal
    players={resolvePlayersForAutoPick(squadNames, allPlayers, guestEntries, newPlayerEntries)}
    allLeaguePlayers={allPlayers}
    existingGuests={guestEntries}
    onAdd={(entry) => {
```

Also delete the `avgRating` helper function from `NextMatchCard.tsx` (the function at lines 48–52):

```ts
// DELETE this entire function — no longer needed:
function avgRating(players: Player[]): number {
  if (players.length === 0) return 2
  const sum = players.reduce((acc, p) => acc + p.rating, 0)
  return Math.round(sum / players.length)
}
```

- [ ] **Step 3: Verify TypeScript compiles with no errors**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 4: Run full test suite**

Run: `npm test -- --no-coverage`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/AddPlayerModal.tsx components/NextMatchCard.tsx
git commit -m "feat: replace eye-test slider with strength selector in AddPlayerModal"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite one final time**

Run: `npm test -- --no-coverage`

Expected: all tests green with no failures.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`

Expected: zero errors.

- [ ] **Step 3: Verify the fetchers.ts backwards-compat loading**

Open `lib/fetchers.ts` and find where `GuestEntry` and `NewPlayerEntry` objects are constructed from DB data (around lines 127–135). They need `strengthHint` defaulted. Apply the same pattern:

```ts
guests: ((row.lineup_metadata.guests as any[]) ?? []).map((g: any) => ({
  type: 'guest' as const,
  name: g.name,
  associatedPlayer: g.associated_player,  // DB column is snake_case
  rating: g.rating ?? 2,
  goalkeeper: g.goalkeeper ?? false,
  strengthHint: (g.strengthHint ?? 'average') as import('@/lib/types').StrengthHint,
})),
new_players: ((row.lineup_metadata.new_players as any[]) ?? []).map((p: any) => ({
  type: 'new_player' as const,
  name: p.name,
  rating: p.rating ?? 2,
  mentality: (p.mentality as Mentality) ?? (p.goalkeeper ? 'goalkeeper' : 'balanced'),
  goalkeeper: p.goalkeeper ?? false,
  strengthHint: (p.strengthHint ?? 'average') as import('@/lib/types').StrengthHint,
})),
```

- [ ] **Step 4: Run TypeScript check and tests again**

Run: `npx tsc --noEmit && npm test -- --no-coverage`

Expected: zero errors, all tests pass.

- [ ] **Step 5: Final commit**

```bash
git add lib/fetchers.ts
git commit -m "fix: default strengthHint to average when loading legacy lineup metadata from DB"
```
