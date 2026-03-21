# Guest & New Player Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the free-text guest input in the team builder with a structured modal flow for adding guests and new players, extend the result flow with a multi-step rating review and optional roster promotion, and persist guest/new-player metadata in the `weeks` table.

**Architecture:** A `lineup_metadata` JSONB column on `weeks` stores guest associations and new-player ratings so the data survives across sessions. Two new components (`AddPlayerModal`, `ResultModal`) extract complex UI from `NextMatchCard.tsx`. A `promote_roster` SECURITY DEFINER RPC bypasses the admin-only RLS on `player_attributes` for member-triggered roster promotion.

**Tech Stack:** Next.js 14 App Router, TypeScript (strict), Tailwind CSS, Supabase (PostgreSQL + RLS), Radix UI Dialog, `cn()` from `lib/utils.ts`, `lucide-react` for icons.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/20260321000001_guest_new_player_flow.sql` | Create | Add `lineup_metadata` column, update `save_lineup` RPC, add `promote_roster` RPC |
| `lib/types.ts` | Modify | Add `GuestEntry`, `NewPlayerEntry`, `LineupMetadata`; extend `ScheduledWeek` |
| `components/EyeTestSlider.tsx` | Create | Reusable 1–3 rating slider with labels and optional reassurance note |
| `components/AddPlayerModal.tsx` | Create | Two-step modal: choose Guest or New Player, then sub-flow |
| `components/ResultModal.tsx` | Create | Extracted 3-step result flow: pick winner → review players → confirm |
| `components/NextMatchCard.tsx` | Modify | Wire in new components; update state, `handleSaveLineup`, `handleEditLineup`, `resolvePlayersForAutoPick`; remove old guest input |
| `app/api/public/league/[id]/lineup/route.ts` | Modify | Pass `lineup_metadata: null` explicitly in public lineup saves |

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260321000001_guest_new_player_flow.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/20260321000001_guest_new_player_flow.sql

-- 1. Add lineup_metadata column to weeks (nullable, backwards-compatible)
ALTER TABLE weeks ADD COLUMN IF NOT EXISTS lineup_metadata jsonb DEFAULT NULL;

-- 2. Replace save_lineup RPC to accept and store lineup_metadata
CREATE OR REPLACE FUNCTION save_lineup(
  p_game_id        UUID,
  p_season         TEXT,
  p_week           INT,
  p_date           TEXT,
  p_format         TEXT,
  p_team_a         TEXT[],
  p_team_b         TEXT[],
  p_lineup_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_week_id UUID;
BEGIN
  IF NOT can_do_match_entry(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO weeks (game_id, season, week, date, status, format, team_a, team_b, winner, notes, lineup_metadata)
  VALUES (p_game_id, p_season, p_week, p_date, 'scheduled', p_format, to_jsonb(p_team_a), to_jsonb(p_team_b), NULL, NULL, p_lineup_metadata)
  ON CONFLICT (game_id, season, week)
  DO UPDATE SET
    date             = EXCLUDED.date,
    format           = EXCLUDED.format,
    team_a           = EXCLUDED.team_a,
    team_b           = EXCLUDED.team_b,
    status           = 'scheduled',
    lineup_metadata  = EXCLUDED.lineup_metadata
  RETURNING id INTO v_week_id;

  RETURN v_week_id;
END;
$$;

-- 3. Add promote_roster RPC — allows members to write to player_attributes
--    (which is otherwise admin-only via RLS)
CREATE OR REPLACE FUNCTION promote_roster(
  p_game_id UUID,
  p_entries JSONB  -- array of {name: text, rating: int} objects
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_do_match_entry(p_game_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO player_attributes (game_id, name, rating, mentality, goalkeeper)
  SELECT
    p_game_id,
    (e->>'name')::text,
    (e->>'rating')::int,
    'balanced',
    false
  FROM jsonb_array_elements(p_entries) AS e
  ON CONFLICT (game_id, name) DO UPDATE
    SET rating = EXCLUDED.rating;
END;
$$;
```

- [ ] **Step 2: Run the migration in Supabase SQL Editor**

Copy the contents of the migration file into the Supabase SQL Editor for your project and run it. Verify:
- `\d weeks` shows a `lineup_metadata jsonb` column
- `\df save_lineup` shows the updated signature with `p_lineup_metadata`
- `\df promote_roster` shows the new function

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260321000001_guest_new_player_flow.sql
git commit -m "feat: add lineup_metadata column and promote_roster RPC"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add new types and extend `ScheduledWeek`**

Open `lib/types.ts`. Add the following after the existing `ScheduledWeek` interface:

```ts
export interface GuestEntry {
  type: 'guest'            // runtime discriminant — not persisted to DB
  name: string             // e.g. "Alice +1"
  associatedPlayer: string // e.g. "Alice"
  rating: number           // 1–3
}

export interface NewPlayerEntry {
  type: 'new_player'       // runtime discriminant — not persisted to DB
  name: string
  rating: number           // 1–3
}

export interface LineupMetadata {
  guests: GuestEntry[]
  new_players: NewPlayerEntry[]
}
```

Extend `ScheduledWeek`:

```ts
export interface ScheduledWeek {
  id: string
  week: number
  date: string
  format: string | null
  teamA: string[]
  teamB: string[]
  status: 'scheduled' | 'cancelled'
  lineupMetadata?: LineupMetadata | null   // add this field
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors related to the new types.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add GuestEntry, NewPlayerEntry, LineupMetadata types"
```

---

## Task 3: EyeTestSlider component

**Files:**
- Create: `components/EyeTestSlider.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/EyeTestSlider.tsx
'use client'

import { cn } from '@/lib/utils'

interface Props {
  value: number           // 1 | 2 | 3
  onChange: (v: number) => void
  showNote?: boolean      // show reassurance note below slider
}

const LABELS: Record<number, string> = {
  1: 'Below avg',
  2: 'Average',
  3: 'Strong',
}

export function EyeTestSlider({ value, onChange, showNote = false }: Props) {
  const pct = ((value - 1) / 2) * 100

  return (
    <div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={3}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-1 rounded appearance-none cursor-pointer bg-slate-700 accent-blue-500"
        />
        <span className="min-w-[2rem] text-center bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-100">
          {value}
        </span>
      </div>
      <div className="flex justify-between text-[10px] text-slate-600 mt-1">
        <span>1 — Below avg</span>
        <span>2 — Average</span>
        <span>3 — Strong</span>
      </div>
      {showNote && (
        <p className="mt-2 text-[11px] text-slate-500 leading-relaxed bg-slate-900 border border-slate-700/50 rounded p-2">
          <span className="text-slate-400 font-medium">This isn't personal.</span>{' '}
          It's just a starting point to help balance teams. Ratings aren't visible to players
          and will naturally adjust over time based on their form.
        </p>
      )}
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
git add components/EyeTestSlider.tsx
git commit -m "feat: add EyeTestSlider component"
```

---

## Task 4: AddPlayerModal component

**Files:**
- Create: `components/AddPlayerModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/AddPlayerModal.tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import type { Player, GuestEntry, NewPlayerEntry } from '@/lib/types'
import { EyeTestSlider } from '@/components/EyeTestSlider'

interface Props {
  players: Player[]           // current lineup players (for "plays with" dropdown)
  allLeaguePlayers: Player[]  // full league roster (for collision check)
  avgRating: number           // pre-computed average rating to default slider to
  existingGuests: GuestEntry[] // used to compute +1, +2 suffixes
  onAdd: (entry: GuestEntry | NewPlayerEntry) => void
  onClose: () => void
}

type Step = 'choose' | 'guest' | 'new_player'

export function AddPlayerModal({ players, allLeaguePlayers, avgRating, existingGuests, onAdd, onClose }: Props) {
  const [step, setStep] = useState<Step>('choose')

  // Guest sub-flow state
  const [associatedPlayer, setAssociatedPlayer] = useState('')
  const [guestRating, setGuestRating] = useState(avgRating)

  // New player sub-flow state
  const [newName, setNewName] = useState('')
  const [newRating, setNewRating] = useState(avgRating)
  const [nameError, setNameError] = useState<string | null>(null)

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
      rating: guestRating,
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
      rating: newRating,
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
              {step === 'choose' && 'Add player'}
              {step === 'guest' && 'Add guest'}
              {step === 'new_player' && 'Add new player'}
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
                    value={associatedPlayer}
                    onChange={(e) => setAssociatedPlayer(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select a player…</option>
                    {players.map((p) => (
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
                      ⚠ {associatedPlayer} isn't in the current lineup. The guest will be added but can't be pinned to a team until {associatedPlayer} is selected.
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    The Eye Test
                    <span className="ml-2 normal-case text-blue-400 bg-blue-950 border border-blue-800 rounded px-1.5 py-0.5 font-medium">avg: {avgRating}</span>
                  </label>
                  <EyeTestSlider value={guestRating} onChange={setGuestRating} showNote />
                </div>
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500"
                >
                  ← Back
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
                    value={newName}
                    onChange={(e) => { setNewName(e.target.value); setNameError(null) }}
                    placeholder="Full name"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    autoFocus
                  />
                  {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
                  <p className="text-[11px] text-slate-500 mt-1">
                    They'll be added to the league roster permanently after confirming during result.
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    The Eye Test
                    <span className="ml-2 normal-case text-blue-400 bg-blue-950 border border-blue-800 rounded px-1.5 py-0.5 font-medium">avg: {avgRating}</span>
                  </label>
                  <EyeTestSlider value={newRating} onChange={setNewRating} showNote />
                </div>
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4">
                <button
                  type="button"
                  onClick={() => setStep('choose')}
                  className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500"
                >
                  ← Back
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/AddPlayerModal.tsx
git commit -m "feat: add AddPlayerModal component"
```

---

## Task 5: ResultModal component

**Files:**
- Create: `components/ResultModal.tsx`

- [ ] **Step 1: Create the component**

```tsx
// components/ResultModal.tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { Winner, ScheduledWeek, LineupMetadata, Player, GuestEntry } from '@/lib/types'
import { EyeTestSlider } from '@/components/EyeTestSlider'

interface Props {
  scheduledWeek: ScheduledWeek
  lineupMetadata: LineupMetadata | null
  allPlayers: Player[]
  gameId: string
  publicMode: boolean
  onSaved: () => void
  onClose: () => void
}

type ResultStep = 'winner' | 'review' | 'confirm'

interface GuestReviewState {
  name: string              // e.g. "Alice +1"
  rating: number
  addToRoster: boolean
  rosterName: string
  nameError: string | null
}

interface NewPlayerReviewState {
  name: string
  rating: number
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 border-b border-slate-700">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            i < current - 1 ? 'bg-green-500' : i === current - 1 ? 'bg-blue-500' : 'bg-slate-600'
          )}
        />
      ))}
      <span className="ml-1 text-[11px] text-slate-500">{current} of {total}</span>
    </div>
  )
}

export function ResultModal({ scheduledWeek, lineupMetadata, allPlayers, gameId, publicMode, onSaved, onClose }: Props) {
  const guests = lineupMetadata?.guests ?? []
  const newPlayers = lineupMetadata?.new_players ?? []
  const hasReviewStep = guests.length > 0 || newPlayers.length > 0
  const totalSteps = hasReviewStep ? 3 : 1

  const [step, setStep] = useState<ResultStep>('winner')
  const [winner, setWinner] = useState<Winner>(null)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [guestStates, setGuestStates] = useState<GuestReviewState[]>(
    guests.map((g) => ({ name: g.name, rating: g.rating, addToRoster: false, rosterName: '', nameError: null }))
  )
  const [newPlayerStates, setNewPlayerStates] = useState<NewPlayerReviewState[]>(
    newPlayers.map((p) => ({ name: p.name, rating: p.rating }))
  )

  function updateGuestRating(i: number, rating: number) {
    setGuestStates((prev) => prev.map((g, idx) => idx === i ? { ...g, rating } : g))
  }
  function updateGuestRoster(i: number, addToRoster: boolean) {
    setGuestStates((prev) => prev.map((g, idx) => idx === i ? { ...g, addToRoster, nameError: null } : g))
  }
  function updateGuestRosterName(i: number, rosterName: string) {
    setGuestStates((prev) => prev.map((g, idx) => idx === i ? { ...g, rosterName, nameError: null } : g))
  }
  function updateNewPlayerRating(i: number, rating: number) {
    setNewPlayerStates((prev) => prev.map((p, idx) => idx === i ? { ...p, rating } : p))
  }

  function validateReview(): boolean {
    let valid = true
    const updatedGuests = guestStates.map((g) => {
      if (!g.addToRoster) return g
      const trimmed = g.rosterName.trim()
      if (!trimmed) {
        valid = false
        return { ...g, nameError: 'Enter a name to add to the roster.' }
      }
      const collision = allPlayers.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())
      if (collision) {
        valid = false
        return { ...g, nameError: `A player named "${trimmed}" already exists.` }
      }
      return g
    })
    setGuestStates(updatedGuests)
    return valid
  }

  async function handleSave() {
    if (!winner) return
    setSaving(true)
    setError(null)
    try {
      // Step 1: record result
      if (publicMode) {
        const res = await fetch(`/api/public/league/${gameId}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weekId: scheduledWeek.id, winner, notes: notes.trim() || null }),
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? 'Failed to save result')
        }
        // Public mode: no roster promotion
      } else {
        const supabase = createClient()

        // Record result
        const { error: resultErr } = await supabase.rpc('record_result', {
          p_week_id: scheduledWeek.id,
          p_winner: winner,
          p_notes: notes.trim() || null,
        })
        if (resultErr) throw resultErr

        // Roster promotion: new players + converted guests
        const entries = [
          ...newPlayerStates.map((p) => ({ name: p.name, rating: p.rating })),
          ...guestStates
            .filter((g) => g.addToRoster && g.rosterName.trim())
            .map((g) => ({ name: g.rosterName.trim(), rating: g.rating })),
        ]
        if (entries.length > 0) {
          const { error: promoteErr } = await supabase.rpc('promote_roster', {
            p_game_id: gameId,
            p_entries: JSON.stringify(entries),
          })
          if (promoteErr) throw promoteErr
        }
      }

      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save result')
    } finally {
      setSaving(false)
    }
  }

  const currentStepNum = step === 'winner' ? 1 : step === 'review' ? 2 : 3

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 shadow-xl focus:outline-none overflow-hidden">

          {/* Header */}
          <div className="px-5 pt-4 pb-3 border-b border-slate-700">
            <Dialog.Title className="text-base font-semibold text-slate-100">
              Result — Week {scheduledWeek.week}
            </Dialog.Title>
            <Dialog.Description className="text-xs text-slate-400 mt-0.5">
              {scheduledWeek.date}
            </Dialog.Description>
          </div>

          {hasReviewStep && <StepIndicator current={currentStepNum} total={totalSteps} />}

          {/* ── Step: winner ── */}
          {step === 'winner' && (
            <>
              <div className="p-5">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Who won?</p>
                <div className="flex gap-2 mb-4">
                  {(['teamA', 'draw', 'teamB'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setWinner(opt)}
                      className={cn(
                        'flex-1 py-2 rounded border text-sm font-medium transition-colors',
                        opt === 'teamA' && (winner === 'teamA'
                          ? 'bg-blue-900 border-blue-700 text-blue-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-blue-700 hover:text-blue-300'),
                        opt === 'draw' && (winner === 'draw'
                          ? 'bg-slate-700 border-slate-600 text-slate-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'),
                        opt === 'teamB' && (winner === 'teamB'
                          ? 'bg-violet-900 border-violet-700 text-violet-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-violet-700 hover:text-violet-300'),
                      )}
                    >
                      {opt === 'teamA' ? 'Team A' : opt === 'draw' ? 'Draw' : 'Team B'}
                    </button>
                  ))}
                </div>

                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Optional notes (e.g. +3 goals, injuries…)"
                  className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-slate-100 text-xs placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-500 resize-none"
                />
                {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500">
                  Cancel
                </button>
                {hasReviewStep ? (
                  <button
                    type="button"
                    onClick={() => setStep('review')}
                    disabled={!winner}
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !winner}
                    className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Confirm Result'}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Step: review ── */}
          {step === 'review' && (
            <>
              <div className="p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
                <p className="text-xs text-slate-400 -mb-2">How did they actually play?</p>

                {newPlayerStates.map((p, i) => (
                  <div key={p.name} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-sm font-semibold text-slate-100">{p.name}</span>
                      <span className="text-[10px] font-semibold bg-blue-950 border border-blue-800 text-blue-300 rounded-full px-2 py-0.5">New player</span>
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">The Eye Test</p>
                    <EyeTestSlider value={p.rating} onChange={(v) => updateNewPlayerRating(i, v)} />
                  </div>
                ))}

                {guestStates.map((g, i) => (
                  <div key={g.name} className="bg-slate-900 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="text-sm font-semibold text-slate-100">{g.name}</span>
                      <span className="text-[10px] font-semibold bg-slate-800 border border-slate-600 text-slate-400 rounded-full px-2 py-0.5">Guest</span>
                    </div>
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">The Eye Test</p>
                    <EyeTestSlider value={g.rating} onChange={(v) => updateGuestRating(i, v)} />

                    <div className="mt-3 pt-3 border-t border-slate-800">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <div
                          onClick={() => updateGuestRoster(i, !g.addToRoster)}
                          className={cn(
                            'w-8 h-4.5 rounded-full relative transition-colors cursor-pointer flex-shrink-0',
                            g.addToRoster ? 'bg-blue-600' : 'bg-slate-600'
                          )}
                          style={{ height: '18px' }}
                        >
                          <div className={cn(
                            'absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full shadow transition-all',
                            g.addToRoster ? 'left-[18px]' : 'left-0.5'
                          )} />
                        </div>
                        <span className="text-xs text-slate-300">
                          <span className="font-semibold">Add to the roster</span> — they're joining the league
                        </span>
                      </label>
                      {g.addToRoster && (
                        <div className="mt-2">
                          <input
                            type="text"
                            value={g.rosterName}
                            onChange={(e) => updateGuestRosterName(i, e.target.value)}
                            placeholder="Enter their name…"
                            autoFocus
                            className="w-full bg-slate-800 border border-blue-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          {g.nameError && <p className="text-xs text-red-400 mt-1">{g.nameError}</p>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4 border-t border-slate-700 pt-3">
                <button type="button" onClick={() => setStep('winner')} className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500">
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={() => { if (validateReview()) setStep('confirm') }}
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold"
                >
                  Next →
                </button>
              </div>
            </>
          )}

          {/* ── Step: confirm ── */}
          {step === 'confirm' && (
            <>
              <div className="p-5 flex flex-col gap-2">
                <div className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                  <span className="text-slate-400">Winner</span>
                  <span className={cn(
                    'font-semibold',
                    winner === 'teamA' ? 'text-blue-300' : winner === 'teamB' ? 'text-violet-300' : 'text-slate-300'
                  )}>
                    {winner === 'teamA' ? 'Team A' : winner === 'teamB' ? 'Team B' : 'Draw'}
                  </span>
                </div>

                {newPlayerStates.map((p) => (
                  <div key={p.name} className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                    <span className="text-slate-300 font-medium">{p.name}</span>
                    <span className="text-slate-500 text-xs">Added to roster · rating {p.rating}</span>
                  </div>
                ))}

                {guestStates.map((g) => (
                  <div key={g.name} className="flex justify-between items-center bg-slate-900 border border-slate-700 rounded-lg px-3 py-2.5 text-sm">
                    <span className="text-slate-300 font-medium">
                      {g.addToRoster ? `${g.name} → ${g.rosterName.trim()}` : g.name}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {g.addToRoster ? `Added to roster · rating ${g.rating}` : 'Guest only'}
                    </span>
                  </div>
                ))}

                {error && <p className="text-sm text-red-400 mt-1">{error}</p>}
              </div>

              <div className="flex gap-2 justify-end px-5 pb-4 border-t border-slate-700 pt-3">
                <button type="button" onClick={() => setStep('review')} className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500">
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save result'}
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/ResultModal.tsx
git commit -m "feat: add ResultModal component with 3-step result flow"
```

---

## Task 6: Update NextMatchCard.tsx

**Files:**
- Modify: `components/NextMatchCard.tsx`

This is the largest change. Work through it section by section.

### 6a — Update imports and state

- [ ] **Step 1: Update imports at the top of the file**

Add to the import list:
```tsx
import type { GuestEntry, NewPlayerEntry, LineupMetadata } from '@/lib/types'
import { AddPlayerModal } from '@/components/AddPlayerModal'
import { ResultModal } from '@/components/ResultModal'
```

- [ ] **Step 2: Replace guest state declarations**

Find and remove these lines (around line 105–106):
```tsx
const [guestNames, setGuestNames] = useState<string[]>([])
const [guestInput, setGuestInput] = useState('')
```

Replace with:
```tsx
const [guestEntries, setGuestEntries] = useState<GuestEntry[]>([])
const [newPlayerEntries, setNewPlayerEntries] = useState<NewPlayerEntry[]>([])
const [showAddPlayerModal, setShowAddPlayerModal] = useState(false)
```

- [ ] **Step 3: Update showResultModal state — remove winner/notes (now owned by ResultModal)**

Remove these lines (around line 122–126):
```tsx
// Result recording
const [winner, setWinner] = useState<Winner>(null)
const [notes, setNotes] = useState('')
```

- [ ] **Step 4: Update `squadNames` memo**

Find:
```tsx
const squadNames = useMemo(() => [...selectedNames, ...guestNames], [selectedNames, guestNames])
```

Replace with:
```tsx
const squadNames = useMemo(
  () => [
    ...selectedNames,
    ...guestEntries.map((g) => g.name),
    ...newPlayerEntries.map((p) => p.name),
  ],
  [selectedNames, guestEntries, newPlayerEntries]
)
```

- [ ] **Step 5: Add avgRating helper**

After the existing `medianRating` function, add:
```tsx
function avgRating(players: Player[]): number {
  if (players.length === 0) return 2
  const sum = players.reduce((acc, p) => acc + p.rating, 0)
  return Math.round(sum / players.length)
}
```

### 6b — Update resolvePlayersForAutoPick

- [ ] **Step 6: Update `resolvePlayersForAutoPick` to use stored ratings for new players/guests**

Find the existing function and replace it:
```tsx
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
        goalkeeper: false, mentality: 'balanced' as const,
        rating: guest.rating,
        recentForm: '',
      }
    }

    const newPlayer = newPlayerLookup.get(name.toLowerCase())
    if (newPlayer) {
      return {
        name,
        played: 0, won: 0, drew: 0, lost: 0,
        timesTeamA: 0, timesTeamB: 0,
        winRate: 0, qualified: false, points: 0,
        goalkeeper: false, mentality: 'balanced' as const,
        rating: newPlayer.rating,
        recentForm: '',
      }
    }

    // Fallback (should not happen in normal flow)
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

### 6c — Update handleAutoPick, handleSaveLineup, handleEditLineup

- [ ] **Step 7: Update `handleAutoPick` call**

Find:
```tsx
const resolved = resolvePlayersForAutoPick(squadNames, allPlayers)
```
Replace with:
```tsx
const resolved = resolvePlayersForAutoPick(squadNames, allPlayers, guestEntries, newPlayerEntries)
```

Then add guest-pinning post-process after `setAutoPickResult(result)`:

```tsx
function handleAutoPick() {
  const resolved = resolvePlayersForAutoPick(squadNames, allPlayers, guestEntries, newPlayerEntries)
  const result = autoPick(resolved)
  setAutoPickResult(result)
  if (result.suggestions.length > 0) {
    const teamA = [...result.suggestions[0].teamA]
    const teamB = [...result.suggestions[0].teamB]
    // Pin guests to their associated player's team
    const pinnedTeamA = pinGuestsToAssociatedTeam(teamA, teamB, guestEntries)
    setLocalTeamA(pinnedTeamA.teamA)
    setLocalTeamB(pinnedTeamA.teamB)
  }
}
```

Add the pinning helper function before `handleAutoPick`:

```tsx
function pinGuestsToAssociatedTeam(
  teamA: Player[],
  teamB: Player[],
  guests: GuestEntry[],
): { teamA: Player[]; teamB: Player[] } {
  const newA = [...teamA]
  const newB = [...teamB]

  for (const guest of guests) {
    const guestInA = newA.findIndex((p) => p.name === guest.name)
    const guestInB = newB.findIndex((p) => p.name === guest.name)
    const assocInA = newA.findIndex((p) => p.name === guest.associatedPlayer)
    const assocInB = newB.findIndex((p) => p.name === guest.associatedPlayer)

    // Associated player not in either team (not in squad) — leave guest as-is
    if (assocInA === -1 && assocInB === -1) continue

    const guestOnA = guestInA !== -1
    const assocOnA = assocInA !== -1

    // Already on same team — nothing to do
    if (guestOnA === assocOnA) continue

    // Swap guest to associated player's team
    if (assocOnA && guestInB !== -1) {
      // Guest is on B, associated is on A — move guest to A, swap last player from A to B
      const displaced = newA[newA.length - 1]
      newA[newA.length - 1] = newB[guestInB]
      newB[guestInB] = displaced
    } else if (!assocOnA && guestInA !== -1) {
      // Guest is on A, associated is on B — move guest to B, swap last player from B to A
      const displaced = newB[newB.length - 1]
      newB[newB.length - 1] = newA[guestInA]
      newA[guestInA] = displaced
    }
  }

  return { teamA: newA, teamB: newB }
}
```

- [ ] **Step 8: Update `handleSaveLineup` to pass `lineup_metadata`**

In the `handleSaveLineup` function, build the metadata object and pass it in both paths.

After the `const teamA = ...` / `const teamB = ...` lines, add:
```tsx
const lineupMetadata: LineupMetadata = {
  guests: guestEntries.map(({ type, ...rest }) => rest) as any,
  new_players: newPlayerEntries.map(({ type, ...rest }) => rest) as any,
}
```

In the `publicMode` branch, update the fetch body to include it (public route ignores it, but we pass null):
```tsx
body: JSON.stringify({ season, week: saveWeek, date: saveDate, format: format || null, teamA, teamB }),
```
*(unchanged — public route ignores metadata)*

In the Supabase branch, update the RPC call:
```tsx
const { data, error: err } = await supabase.rpc('save_lineup', {
  p_game_id: gameId,
  p_season: season,
  p_week: saveWeek,
  p_date: saveDate,
  p_format: format || null,
  p_team_a: teamA,
  p_team_b: teamB,
  p_lineup_metadata: JSON.stringify(lineupMetadata),
})
```

Update the `setScheduledWeek` call after saving to include `lineupMetadata`:
```tsx
setScheduledWeek({ id: weekId, week: saveWeek, date: saveDate, format, teamA, teamB, status: 'scheduled', lineupMetadata })
```

- [ ] **Step 9: Update `handleEditLineup` to reconstruct guest/new-player state**

Replace the existing function:
```tsx
function handleEditLineup() {
  if (!scheduledWeek) return
  const knownPlayerNames = new Set(allPlayers.map((p) => p.name.toLowerCase()))
  // Only put known players back into selectedNames; guests/new-players come from metadata
  const knownOnly = [...scheduledWeek.teamA, ...scheduledWeek.teamB].filter(
    (name) => knownPlayerNames.has(name.toLowerCase())
  )
  setSelectedNames(knownOnly)

  const metadata = scheduledWeek.lineupMetadata
  if (metadata) {
    setGuestEntries(metadata.guests)
    setNewPlayerEntries(metadata.new_players)
  } else {
    setGuestEntries([])
    setNewPlayerEntries([])
  }

  clearSplit()
  setCardState('building')
}
```

- [ ] **Step 10: Update `handleCancelScheduled` to clear new state**

Find the `setGuestNames([])` line in `handleCancelScheduled` and replace with:
```tsx
setGuestEntries([])
setNewPlayerEntries([])
```

### 6d — Update the week query to fetch lineup_metadata

- [ ] **Step 11: Extend the Supabase select query**

In the `load()` function (around line 222–248), update the `.select()` call:
```tsx
.select('id, week, date, format, team_a, team_b, status, lineup_metadata')
```

Update the `ScheduledWeek` construction block to deserialise `lineup_metadata`:
```tsx
const raw = data
const week: ScheduledWeek = {
  id: raw.id,
  week: raw.week,
  date: raw.date,
  format: raw.format,
  teamA: raw.team_a ?? [],
  teamB: raw.team_b ?? [],
  status: raw.status as 'scheduled' | 'cancelled',
  lineupMetadata: raw.lineup_metadata
    ? {
        guests: (raw.lineup_metadata.guests ?? []).map((g: any) => ({
          type: 'guest' as const,
          name: g.name,
          associatedPlayer: g.associated_player,
          rating: g.rating,
        })),
        new_players: (raw.lineup_metadata.new_players ?? []).map((p: any) => ({
          type: 'new_player' as const,
          name: p.name,
          rating: p.rating,
        })),
      }
    : null,
}
```

### 6e — Update the JSX

- [ ] **Step 12: Replace guest input UI with "Add guest or new player" button**

Search for the existing guest input section (the text input and add button for guestNames). Remove it entirely. In the player pills section, after the player selection pills and the selected guest/new-player pills, add:

```tsx
{/* Guest pills */}
{guestEntries.map((g) => (
  <span
    key={g.name}
    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-slate-600 text-slate-400"
  >
    {g.name}
    <button
      type="button"
      onClick={() => {
        setGuestEntries((prev) => prev.filter((e) => e.name !== g.name))
        clearSplit()
      }}
      className="text-slate-500 hover:text-slate-300 ml-0.5"
    >
      <X size={10} />
    </button>
  </span>
))}

{/* New player pills */}
{newPlayerEntries.map((p) => (
  <span
    key={p.name}
    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-slate-700 border border-slate-600 text-slate-300"
  >
    {p.name}
    <button
      type="button"
      onClick={() => {
        setNewPlayerEntries((prev) => prev.filter((e) => e.name !== p.name))
        clearSplit()
      }}
      className="text-slate-500 hover:text-slate-300 ml-0.5"
    >
      <X size={10} />
    </button>
  </span>
))}

{/* Add guest or new player button */}
<button
  type="button"
  onClick={() => setShowAddPlayerModal(true)}
  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-slate-600 text-slate-500 hover:border-blue-500 hover:text-blue-400 transition-colors"
>
  + Add guest or new player
</button>
```

- [ ] **Step 13: Replace the inline result modal with `<ResultModal />`**

Find the entire `{/* ── Result Game modal ── */}` `<Dialog.Root>` block (lines ~844–916) and remove it.

In the JSX return, add `<ResultModal>` and `<AddPlayerModal>` at the bottom of the fragment, before the closing `</>`:

```tsx
{showAddPlayerModal && (
  <AddPlayerModal
    players={sortedPlayers.filter((p) => selectedNames.includes(p.name))}
    allLeaguePlayers={allPlayers}
    avgRating={avgRating(allPlayers)}
    existingGuests={guestEntries}
    onAdd={(entry) => {
      if (entry.type === 'guest') {
        setGuestEntries((prev) => [...prev, entry as GuestEntry])
      } else {
        setNewPlayerEntries((prev) => [...prev, entry as NewPlayerEntry])
      }
      clearSplit()
    }}
    onClose={() => setShowAddPlayerModal(false)}
  />
)}

{showResultModal && scheduledWeek && (
  <ResultModal
    scheduledWeek={scheduledWeek}
    lineupMetadata={scheduledWeek.lineupMetadata ?? null}
    allPlayers={allPlayers}
    gameId={gameId}
    publicMode={publicMode}
    onSaved={() => {
      setScheduledWeek(null)
      setCardState('idle')
      setShowResultModal(false)
      onResultSaved()
    }}
    onClose={() => setShowResultModal(false)}
  />
)}
```

- [ ] **Step 14: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 15: Commit**

```bash
git add components/NextMatchCard.tsx
git commit -m "feat: wire AddPlayerModal and ResultModal into NextMatchCard"
```

---

## Task 7: Smoke test the full flow

No automated tests exist for this component (it requires Supabase). Manual verification:

- [ ] **Step 1: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Verify lineup builder — adding guests**

1. Navigate to a league with team builder enabled
2. Select some players
3. Click "+ Add guest or new player" → choose "Guest"
4. Select an associated player — verify preview text shows "Alice +1"
5. Adjust the slider — verify it moves and value updates
6. Click "Add guest" — verify a dashed pill appears in the squad
7. Deselect Alice from the player list — verify an amber warning appears on the pill (the warning is shown when building the next lineup or on edit; the pill itself just shows the name)

- [ ] **Step 3: Verify lineup builder — adding new players**

1. Click "+ Add guest or new player" → choose "New player"
2. Enter a name that already exists → verify error shown, confirm blocked
3. Enter a new name, adjust the slider, click "Add player"
4. Verify a solid pill appears with the new player's name

- [ ] **Step 4: Verify auto-pick with guests**

1. Select players + add a guest for Alice
2. Click "Auto-Pick Teams"
3. Verify Alice and her guest end up on the same team

- [ ] **Step 5: Verify result flow — with guests/new players**

1. Save a lineup that includes a guest and a new player
2. Click "Result Game"
3. Verify 3 steps appear: pick winner → review → confirm
4. On step 2: adjust ratings, toggle "Add to roster" on the guest and enter a name
5. Verify step 3 summary is correct
6. Click "Save result" — verify the week disappears and the page refreshes
7. Navigate to Players — verify the new player and converted guest both appear in the roster

- [ ] **Step 6: Verify result flow — no guests/new players**

1. Result a game with a normal lineup (no guests/new players)
2. Verify only 1 step — no review step shown

- [ ] **Step 7: Verify edit lineup**

1. Save a lineup with a guest
2. Click "Edit lineup"
3. Verify the guest pill reappears correctly and Alice is still selected

- [ ] **Step 8: Commit if any fixups were needed**

```bash
git add -p
git commit -m "fix: <describe what you fixed>"
```

---

## Task 8: Final commit and branch cleanup

- [ ] **Step 1: Run TypeScript one more time**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Final commit**

```bash
git add .
git commit -m "feat: guest and new player flow — add modal, result review, roster promotion"
```
