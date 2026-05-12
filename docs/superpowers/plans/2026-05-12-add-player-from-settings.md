# Add Player from Settings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins add a new roster player (name + strength + mentality) directly from the Settings → Players tab via a modal that mirrors the lineup builder's "new player" flow.

**Architecture:**
- Server: new `POST /api/league/[id]/players` handler that calls the existing `promote_roster` Supabase RPC with a single entry. Body validation lives in a pure `parseAddPlayerBody` helper that gets unit-tested.
- Client: extract the existing lineup-builder "new player" form into a shared presentational `NewPlayerForm` component. A new `AddRosterPlayerModal` wraps it for the settings flow. `PlayerRosterPanel` gets a primary "+ Add player" trigger and on-success appends the returned player to local state.

**Tech Stack:** Next.js 14 App Router, TypeScript, Tailwind, `@radix-ui/react-dialog`, Supabase (server client + RPC), Jest (existing setup).

**Spec:** `docs/superpowers/specs/2026-05-12-add-player-from-settings-design.md`

---

## File map

**Create:**
- `__tests__/add-player-body.test.ts` — unit tests for `parseAddPlayerBody`
- `components/NewPlayerForm.tsx` — shared name/strength/mentality form
- `components/AddRosterPlayerModal.tsx` — settings-flow modal wrapping `NewPlayerForm`

**Modify:**
- `lib/playerUtils.ts` — add `parseAddPlayerBody` helper
- `app/api/league/[id]/players/route.ts` — add `POST` handler
- `components/AddPlayerModal.tsx` — replace inline new-player form with `<NewPlayerForm />`
- `components/PlayerRosterPanel.tsx` — add "+ Add player" trigger + modal wiring; fix empty-state early return

---

## Task 1 — `parseAddPlayerBody` helper (TDD)

Pure-logic body parser for the new POST endpoint. Written test-first, mirroring the existing `parsePlayerPatch` / `parseRenameName` pattern in `lib/playerUtils.ts`.

**Files:**
- Create: `__tests__/add-player-body.test.ts`
- Modify: `lib/playerUtils.ts` (append new function + export type)

- [ ] **Step 1: Write the failing test**

Create `__tests__/add-player-body.test.ts`:

```ts
import { parseAddPlayerBody } from '@/lib/playerUtils'

describe('parseAddPlayerBody', () => {
  it('parses a valid body', () => {
    expect(
      parseAddPlayerBody({ name: 'Will', strength: 'average', mentality: 'balanced' })
    ).toEqual({ name: 'Will', strength: 'average', mentality: 'balanced' })
  })

  it('trims the name', () => {
    expect(
      parseAddPlayerBody({ name: '  Will  ', strength: 'above', mentality: 'attacking' })
    ).toEqual({ name: 'Will', strength: 'above', mentality: 'attacking' })
  })

  it('returns null for empty / whitespace-only name', () => {
    expect(parseAddPlayerBody({ name: '', strength: 'average', mentality: 'balanced' })).toBeNull()
    expect(parseAddPlayerBody({ name: '   ', strength: 'average', mentality: 'balanced' })).toBeNull()
  })

  it('returns null for missing or non-string name', () => {
    expect(parseAddPlayerBody({ strength: 'average', mentality: 'balanced' })).toBeNull()
    expect(parseAddPlayerBody({ name: 42, strength: 'average', mentality: 'balanced' })).toBeNull()
  })

  it('returns null for invalid strength', () => {
    expect(parseAddPlayerBody({ name: 'Will', strength: 'great', mentality: 'balanced' })).toBeNull()
    expect(parseAddPlayerBody({ name: 'Will', strength: 2, mentality: 'balanced' })).toBeNull()
    expect(parseAddPlayerBody({ name: 'Will', mentality: 'balanced' })).toBeNull()
  })

  it('returns null for invalid mentality', () => {
    expect(parseAddPlayerBody({ name: 'Will', strength: 'average', mentality: 'sweeper' })).toBeNull()
    expect(parseAddPlayerBody({ name: 'Will', strength: 'average' })).toBeNull()
  })

  it('returns null for non-object body', () => {
    expect(parseAddPlayerBody(null)).toBeNull()
    expect(parseAddPlayerBody('hello')).toBeNull()
    expect(parseAddPlayerBody([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx jest __tests__/add-player-body.test.ts`
Expected: FAIL — `parseAddPlayerBody is not a function` (or similar import error).

- [ ] **Step 3: Implement the helper**

Append to `lib/playerUtils.ts` (place below `parseRenameName`):

```ts
export interface AddPlayerInput {
  name: string
  strength: Strength
  mentality: Mentality
}

/**
 * Validates and parses a POST /api/league/[id]/players body.
 * Returns a typed input object, or null if the body is invalid.
 * Trims the name; rejects empty/whitespace-only.
 */
export function parseAddPlayerBody(body: unknown): AddPlayerInput | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null
  const b = body as Record<string, unknown>

  if (typeof b.name !== 'string') return null
  const name = b.name.trim()
  if (name.length === 0) return null

  if (typeof b.strength !== 'string' || !VALID_STRENGTHS.includes(b.strength as Strength)) return null
  if (typeof b.mentality !== 'string' || !VALID_MENTALITIES.includes(b.mentality as Mentality)) return null

  return {
    name,
    strength: b.strength as Strength,
    mentality: b.mentality as Mentality,
  }
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx jest __tests__/add-player-body.test.ts`
Expected: PASS — 7 passing.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: clean (or unchanged from baseline).

- [ ] **Step 6: Commit**

```bash
git add __tests__/add-player-body.test.ts lib/playerUtils.ts
git commit -m "feat(playerUtils): add parseAddPlayerBody validator"
```

---

## Task 2 — `POST /api/league/[id]/players` endpoint

Wires the parser into a route handler with admin auth, case-insensitive collision check, and a `promote_roster` RPC call. Returns the new `PlayerAttribute` shape so the client can append to local state.

**Files:**
- Modify: `app/api/league/[id]/players/route.ts` (append `POST` export)

- [ ] **Step 1: Add the POST handler**

Update the import block at the top of `app/api/league/[id]/players/route.ts` to add `strengthToRating` to the existing `@/lib/strength` import and add `parseAddPlayerBody`:

```ts
import { createClient } from '@/lib/supabase/server'
import { ratingToStrength, strengthToRating } from '@/lib/strength'
import { parseAddPlayerBody } from '@/lib/playerUtils'
import { NextResponse } from 'next/server'
```

Append the new handler after the existing `GET` export:

```ts
/** POST — create a new roster player. Admin only. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: isAdmin } = await supabase.rpc('is_game_admin', { p_game_id: id })
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = parseAddPlayerBody(body)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const { name, strength, mentality } = parsed

  // Case-insensitive collision check against existing roster
  const { data: existing, error: existingErr } = await supabase
    .from('player_attributes')
    .select('name')
    .eq('game_id', id)
    .ilike('name', name)
    .maybeSingle()

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 })
  }
  if (existing) {
    return NextResponse.json(
      { error: `A player named "${existing.name}" already exists in this league.` },
      { status: 409 }
    )
  }

  // Upsert via promote_roster RPC (same path used by lineup result confirmation)
  const entries = [{
    name,
    rating: strengthToRating(strength),
    mentality,
    goalkeeper: mentality === 'goalkeeper',
  }]

  const { error: rpcErr } = await supabase.rpc('promote_roster', {
    p_game_id: id,
    p_entries: entries,
  })

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  return NextResponse.json({
    name,
    strength,
    mentality,
    played: 0,
    linked_user_id: null,
    linked_display_name: null,
  })
}
```

- [ ] **Step 2: Lint and type-check via build**

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/api/league/[id]/players/route.ts
git commit -m "feat(api): POST /league/[id]/players to create roster players"
```

- [ ] **Step 4: (Optional) Smoke test in localhost**

This step is optional — full manual verification happens in Task 6. If you want to confirm the endpoint in isolation:

1. `npm run dev`
2. Sign in as a league admin in the browser.
3. From the browser devtools console (with cookies attached), POST to the endpoint:
   ```js
   await fetch('/api/league/<LEAGUE_ID>/players', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     credentials: 'include',
     body: JSON.stringify({ name: 'Test Player', strength: 'average', mentality: 'balanced' }),
   }).then(r => r.json())
   ```
4. Expected: 200 with the `PlayerAttribute` shape. Re-running the same request returns 409.
5. Clean up the test player via the Settings → Players UI (or a SQL `DELETE` if no UI exists).

---

## Task 3 — Extract `NewPlayerForm` and refactor `AddPlayerModal`

Pull the lineup-builder modal's "new player" step into a presentational component shared between the lineup flow and the new settings flow. This is a single commit because the refactor is only safe if both halves land together.

`NewPlayerForm` is **purely presentational + local state**. It does not fetch, does not know whether it sits in a modal or anywhere else, and does not know what happens to the values after submit.

**Files:**
- Create: `components/NewPlayerForm.tsx`
- Modify: `components/AddPlayerModal.tsx` (replace the `step === 'new_player'` JSX block; remove the now-redundant local state for `newName`, `newStrength`, `newMentality`, `nameError`)

- [ ] **Step 1: Create `components/NewPlayerForm.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { Mentality, Strength } from '@/lib/types'
import { StrengthPills } from '@/components/ui/StrengthPills'
import { cn } from '@/lib/utils'

const MENTALITY_OPTIONS: { value: Mentality; label: string }[] = [
  { value: 'goalkeeper', label: 'GK' },
  { value: 'defensive',  label: 'DEF' },
  { value: 'balanced',   label: 'BAL' },
  { value: 'attacking',  label: 'ATT' },
]

export interface NewPlayerFormValues {
  name: string
  strength: Strength
  mentality: Mentality
}

interface Props {
  /** Existing names used for client-side case-insensitive collision check. */
  existingNames: string[]
  /** Whether to show the helper text under the name field (lineup-builder shows it; settings does not). */
  showNameHelper?: boolean
  /** External submit-error message (e.g. from a 409 response). */
  submitError?: string | null
  /** Disable inputs + submit while a parent request is in flight. */
  submitting?: boolean
  /** Submit-button label (default: 'Add player'). */
  submitLabel?: string
  /** Cancel-button label (default: 'Cancel'). Pass `null` to hide it. */
  cancelLabel?: string | null
  onSubmit: (values: NewPlayerFormValues) => void
  onCancel: () => void
}

export function NewPlayerForm({
  existingNames,
  showNameHelper = false,
  submitError = null,
  submitting = false,
  submitLabel = 'Add player',
  cancelLabel = 'Cancel',
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState('')
  const [strength, setStrength] = useState<Strength>('average')
  const [mentality, setMentality] = useState<Mentality>('balanced')
  const [nameError, setNameError] = useState<string | null>(null)

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return
    const collision = existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())
    if (collision) {
      setNameError(`A player named "${trimmed}" already exists in this league.`)
      return
    }
    onSubmit({ name: trimmed, strength, mentality })
  }

  return (
    <>
      <div className="p-5 flex flex-col gap-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Player name
          </label>
          <input
            type="text"
            name="player-name"
            value={name}
            onChange={(e) => { setName(e.target.value); setNameError(null) }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="Full name"
            disabled={submitting}
            autoFocus
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
          />
          {nameError && <p className="text-xs text-red-400 mt-1">{nameError}</p>}
          {!nameError && submitError && <p className="text-xs text-red-400 mt-1">{submitError}</p>}
          {showNameHelper && (
            <p className="text-[11px] text-slate-500 mt-1">
              They&apos;ll be added to the league roster permanently after confirming during result.
            </p>
          )}
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Strength
          </label>
          <StrengthPills value={strength} onChange={setStrength} disabled={submitting} />
          <p className="text-[11px] text-slate-500 mt-1">
            Defaults to Average — change only if you know this player.
          </p>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
            Mentality
          </label>
          <div className="flex bg-slate-900 border border-slate-700 rounded-md overflow-hidden text-[10px] font-semibold">
            {MENTALITY_OPTIONS.map(({ value, label }, i) => (
              <button
                key={value}
                type="button"
                disabled={submitting}
                onClick={() => { if (value !== mentality) setMentality(value) }}
                className={cn(
                  'flex-1 py-1.5 transition-colors',
                  i < MENTALITY_OPTIONS.length - 1 && 'border-r',
                  value === mentality
                    ? 'bg-blue-950 text-blue-300 border-blue-800'
                    : 'text-slate-500 border-slate-700 hover:text-slate-300',
                  submitting && 'opacity-50'
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
        {cancelLabel !== null && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded border border-slate-600 text-slate-300 text-sm hover:border-slate-500 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !name.trim()}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-40"
        >
          {submitting ? 'Adding…' : submitLabel}
        </button>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Refactor `AddPlayerModal` to use `NewPlayerForm`**

In `components/AddPlayerModal.tsx`:

1. Add the import:
   ```tsx
   import { NewPlayerForm } from '@/components/NewPlayerForm'
   ```

2. Remove the now-unused new-player local state (lines that declare `newName`, `newStrength`, `nameError`, `newMentality`, and the `handleAddNewPlayer` function).

3. Replace the entire `{step === 'new_player' && (...)}` JSX block with:

   ```tsx
   {step === 'new_player' && (
     <NewPlayerForm
       existingNames={allLeaguePlayers.map((p) => p.name)}
       showNameHelper
       cancelLabel="Back"
       onCancel={() => setStep('choose')}
       onSubmit={({ name, strength, mentality }) => {
         onAdd({ type: 'new_player', name, strength, mentality })
         onClose()
       }}
     />
   )}
   ```

4. Remove imports that are no longer used (e.g. `StrengthPills` and `cn` if they were only used for the new-player block — keep them if the guest block still needs them).

- [ ] **Step 3: Verify the lineup-builder flow still works**

Run: `npm run lint`
Expected: clean.

Run: `npm run build`
Expected: build succeeds.

Manual smoke (optional — full manual pass in Task 6):
1. `npm run dev`
2. Open the lineup builder.
3. Click "Add player" → "New player". Confirm the form looks identical to before (helper text, strength pills, mentality buttons, "Back" button, "Add player" button).
4. Add a test new-player entry; confirm it appears in the lineup with the correct name and that the lineup-result-confirmation flow still persists it (or just confirm the entry shows up — full result-flow regression is out of scope).

- [ ] **Step 4: Commit**

```bash
git add components/NewPlayerForm.tsx components/AddPlayerModal.tsx
git commit -m "refactor(AddPlayerModal): extract shared NewPlayerForm"
```

---

## Task 4 — `AddRosterPlayerModal` component

A thin Radix Dialog that wraps `NewPlayerForm` for the settings flow. Owns the API call, surfacing 409 errors back into the form.

**Files:**
- Create: `components/AddRosterPlayerModal.tsx`

- [ ] **Step 1: Create `components/AddRosterPlayerModal.tsx`**

```tsx
'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import type { PlayerAttribute } from '@/lib/types'
import { NewPlayerForm, type NewPlayerFormValues } from '@/components/NewPlayerForm'

interface Props {
  leagueId: string
  /** Existing player names for client-side collision check. */
  existingNames: string[]
  /** Called with the freshly-created player after a successful POST. */
  onCreated: (player: PlayerAttribute) => void
  onClose: () => void
}

export function AddRosterPlayerModal({ leagueId, existingNames, onCreated, onClose }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  async function handleSubmit(values: NewPlayerFormValues) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/league/${leagueId}/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(values),
      })
      const data = await res.json()
      if (!res.ok) {
        setSubmitError(data?.error ?? 'Failed to add player')
        return
      }
      onCreated(data as PlayerAttribute)
      onClose()
    } catch {
      setSubmitError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !submitting) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 z-[999]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-sm rounded-xl bg-slate-800 border border-slate-700 shadow-xl focus:outline-none">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <Dialog.Title className="text-base font-semibold text-slate-100">Add player</Dialog.Title>
            <Dialog.Close
              onClick={onClose}
              disabled={submitting}
              className="text-slate-500 hover:text-slate-300 text-lg leading-none disabled:opacity-50"
            >
              ✕
            </Dialog.Close>
          </div>
          <NewPlayerForm
            existingNames={existingNames}
            submitting={submitting}
            submitError={submitError}
            onCancel={onClose}
            onSubmit={handleSubmit}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
```

Note: `showNameHelper` is omitted (defaults to `false`), per the spec — settings does not show the lineup-builder helper line.

- [ ] **Step 2: Lint and build**

Run: `npm run lint && npm run build`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add components/AddRosterPlayerModal.tsx
git commit -m "feat(AddRosterPlayerModal): settings-side modal for creating players"
```

---

## Task 5 — Wire button + modal into `PlayerRosterPanel`

Add the primary trigger above the list, mount the modal, fix the empty-roster early return so the button is still reachable when the league has no players, and append the new player to local state on success.

**Files:**
- Modify: `components/PlayerRosterPanel.tsx`

- [ ] **Step 1: Add imports**

At the top of `components/PlayerRosterPanel.tsx`, add:

```tsx
import { AddRosterPlayerModal } from '@/components/AddRosterPlayerModal'
```

- [ ] **Step 2: Add modal state**

Inside `PlayerRosterPanel`, after the existing `useState` declarations, add:

```tsx
const [addOpen, setAddOpen] = useState(false)
```

- [ ] **Step 3: Add an `appendPlayer` helper**

Add this helper inside the component (near the other callbacks):

```tsx
function appendPlayer(player: PlayerAttribute) {
  setPlayers((prev) =>
    [...prev, player].sort((a, b) => a.name.localeCompare(b.name))
  )
}
```

- [ ] **Step 4: Replace the empty-state early return**

The current early return at the top of the render is:

```tsx
if (players.length === 0) {
  return <p className="text-sm text-slate-400">No players in this league yet.</p>
}
```

Replace it with a render that still includes the Add trigger and the modal:

```tsx
if (players.length === 0) {
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-slate-400">No players in this league yet.</p>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
        >
          + Add player
        </button>
      </div>
      {addOpen && (
        <AddRosterPlayerModal
          leagueId={leagueId}
          existingNames={[]}
          onCreated={appendPlayer}
          onClose={() => setAddOpen(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: Add the trigger to the populated render**

In the existing populated render block — currently:

```tsx
return (
  <div className="flex flex-col gap-1.5">
    <div className="bg-sky-950/40 border border-sky-900/40 rounded-lg px-3.5 py-2.5 mb-3.5">
      ...
    </div>
    {players.map((player) => { ... })}
  </div>
)
```

Add the Add-player trigger row above the info banner, and mount the modal at the end. The full updated return becomes:

```tsx
return (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-end mb-2">
      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
      >
        + Add player
      </button>
    </div>

    <div className="bg-sky-950/40 border border-sky-900/40 rounded-lg px-3.5 py-2.5 mb-3.5">
      {/* existing banner content unchanged */}
    </div>

    {players.map((player) => {
      /* existing per-player render unchanged */
    })}

    {addOpen && (
      <AddRosterPlayerModal
        leagueId={leagueId}
        existingNames={players.map((p) => p.name)}
        onCreated={appendPlayer}
        onClose={() => setAddOpen(false)}
      />
    )}
  </div>
)
```

- [ ] **Step 6: Lint and build**

Run: `npm run lint && npm run build`
Expected: both clean.

- [ ] **Step 7: Commit**

```bash
git add components/PlayerRosterPanel.tsx
git commit -m "feat(PlayerRosterPanel): add player from settings tab"
```

---

## Task 6 — Manual verification in localhost

The user explicitly wants to define the UI in localhost. Spin up the dev server, walk through the checklist, and iterate on spacing / wording / button size with the user before declaring done.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts on `http://localhost:3000` (or whichever port Next.js picks).

- [ ] **Step 2: Walk through the manual checklist with the user**

Open the app, sign in as an admin, and navigate to a league's **Settings → Players**. Run through each case below; for each, capture either ✅ or a punch-list item:

1. **Trigger visible** — primary blue "+ Add player" button is right-aligned above the list.
2. **Empty roster** — pick a league with no players (or temporarily clear one in SQL); the button still renders alongside the "No players yet" message.
3. **Happy path** — click button, modal opens. Defaults are Average + BAL. Type a unique name, click "Add player". Modal closes, new player appears alphabetically in the list.
4. **Defaults respected** — expand the new player; strength shows Average, mentality shows BAL.
5. **Goalkeeper path** — add another player with mentality GK. Confirm the row's mentality badge shows GK. (DB-side `goalkeeper` boolean is set via `promote_roster`; not visible in UI but verifiable via SQL if desired.)
6. **Above-average strength** — add a third player with strength Above. Expand and confirm the strength pills show Above selected.
7. **Duplicate name (case-insensitive)** — try to add a player with the same name as an existing one in different case (e.g., "will" if "Will" exists). Inline error appears in modal; modal stays open.
8. **Empty name** — Add button is disabled when the input is empty / whitespace-only.
9. **Cancel** — click Cancel: no write, modal closes.
10. **Esc / backdrop dismiss** — Esc closes modal; clicking the dim backdrop closes modal.
11. **Persistence** — refresh the page; new players still in the list.
12. **Existing edit flows still work** — pick one of the new players, expand, change strength → expect optimistic update + PATCH success; change mentality → same; rename → still works; member-link → still works.
13. **Lineup-builder regression** — open the lineup builder for any league, click "Add player" → "New player". Confirm the inline form (now powered by `NewPlayerForm`) still looks and behaves as before.

- [ ] **Step 3: Iterate**

Note any UI issues raised by the user. Fix them in `NewPlayerForm.tsx`, `AddRosterPlayerModal.tsx`, or `PlayerRosterPanel.tsx`. Re-run `npm run lint && npm run build` after each change. Commit each tweak as a focused follow-up commit (`fix(NewPlayerForm): ...`, `fix(PlayerRosterPanel): ...`).

- [ ] **Step 4: Final lint + build sweep**

Run: `npm run lint && npm run build`
Expected: both clean.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all existing tests pass, plus the new `add-player-body` test added in Task 1.

---

## Out of scope

Explicitly **not** part of this plan (called out in the spec):

- Guest creation from settings.
- Member-linking inside the add-player flow.
- Bulk import.
- Edit/delete of a player from this modal.
- Any DB migration — we reuse the existing `player_attributes` table and `promote_roster` RPC.
